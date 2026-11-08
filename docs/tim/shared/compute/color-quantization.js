import { createImage } from "./image.js?v=20261106-science1";

// Like the TP, cluster in OpenCV's uint8 Lab space, then convert the palette
// back to RGB. Training is bounded; every output pixel is assigned to a center.
export async function quantizeColors(
  image,
  { colors = 8, current = () => true } = {},
  cv = globalThis.cv,
) {
  if (image.channels !== 3) throw Error("K-means attend une image RGB.");
  if (!Number.isInteger(colors) || colors < 2 || colors > 256)
    throw Error("Le nombre de couleurs doit être compris entre 2 et 256.");
  // OpenCV interprets a one-row single-channel matrix as scalar samples.
  // A one-pixel image already has its optimal one-color palette.
  if (image.width * image.height === 1)
    return {
      image: createImage({ ...image, data: new Uint8Array(image.data) }),
      palette: [Array.from(image.data)],
      sampleCount: 1,
    };
  let rgb, lab, samples, labels, centers, labPalette, rgbPalette;
  try {
    const count = image.width * image.height,
      sampleCount = Math.min(count, 20000),
      k = Math.min(colors, sampleCount);
    rgb = cv.matFromArray(image.height, image.width, cv.CV_8UC3, image.data);
    lab = new cv.Mat();
    cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab);
    samples = new cv.Mat(sampleCount, 3, cv.CV_32FC1);
    const trainingValues = samples.data32F,
      labValues = lab.data;
    let seed = 123456789;
    for (let i = 0; i < sampleCount; i++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      const index = Math.min(
        count - 1,
        Math.floor(((i + (seed >>> 0) / 4294967296) * count) / sampleCount),
      );
      for (let c = 0; c < 3; c++) trainingValues[3 * i + c] = labValues[3 * index + c];
    }
    labels = new cv.Mat();
    centers = new cv.Mat();
    cv.setRNGSeed(42);
    cv.kmeans(
      samples,
      k,
      labels,
      new cv.TermCriteria(cv.TERM_CRITERIA_EPS + cv.TERM_CRITERIA_MAX_ITER, 30, 0.2),
      1,
      cv.KMEANS_PP_CENTERS,
      centers,
    );
    labPalette = cv.matFromArray(
      1,
      k,
      cv.CV_8UC3,
      Uint8Array.from(centers.data32F, (value) => Math.floor(Math.max(0, Math.min(255, value)))),
    );
    rgbPalette = new cv.Mat();
    cv.cvtColor(labPalette, rgbPalette, cv.COLOR_Lab2RGB);
    // Owned buffers stay valid if another calculation grows the WASM heap
    // while this asynchronous assignment yields to the interface.
    const features = new Uint8Array(lab.data);
    const centroids = new Float32Array(centers.data32F);
    const paletteValues = new Uint8Array(rgbPalette.data);
    const data = new Uint8Array(image.data.length);
    for (let i = 0; i < count; i++) {
      if (i % 8192 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (!current()) throw new Error("Calcul remplacé.");
      }
      let best = 0,
        distance = Infinity;
      for (let center = 0; center < k; center++) {
        let squared = 0;
        for (let c = 0; c < 3; c++)
          squared += (features[3 * i + c] - centroids[3 * center + c]) ** 2;
        if (squared < distance) {
          distance = squared;
          best = center;
        }
      }
      for (let c = 0; c < 3; c++) data[3 * i + c] = paletteValues[3 * best + c];
    }
    const palette = Array.from({ length: k }, (_, i) =>
      Array.from(paletteValues.slice(3 * i, 3 * i + 3)),
    );
    return {
      image: createImage({ ...image, data }),
      palette: [...new Map(palette.map((color) => [color.join(), color])).values()],
      sampleCount,
    };
  } finally {
    for (const mat of [rgbPalette, labPalette, centers, labels, samples, lab, rgb]) mat?.delete();
  }
}
