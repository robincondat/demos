import { createImage } from "./image.js?v=20261106-science1";

export function subsampleImage(image, { exponent = 1 } = {}) {
  sampledSize(image.width, image.height, exponent);
  const factor = 2 ** exponent;
  const width = Math.ceil(image.width / factor),
    height = Math.ceil(image.height / factor);
  const data = new image.data.constructor(width * height * image.channels);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const source = (y * factor * image.width + x * factor) * image.channels;
      data.set(
        image.data.subarray(source, source + image.channels),
        (y * width + x) * image.channels,
      );
    }
  return createImage({ ...image, width, height, data });
}

export function sampledSize(width, height, exponent) {
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 12)
    throw Error("Le facteur doit être une puissance de 2 entre 1 et 4096.");
  const factor = 2 ** exponent;
  return {
    width: Math.max(1, Math.floor(width / factor)),
    height: Math.max(1, Math.floor(height / factor)),
  };
}

export function resizeImage(
  image,
  { exponent = 0, interpolation = "linear" } = {},
  cv = globalThis.cv,
) {
  const size = sampledSize(image.width, image.height, exponent);
  if (!exponent) return image;
  const modes = { nearest: cv.INTER_NEAREST, linear: cv.INTER_LINEAR, area: cv.INTER_AREA };
  if (!(interpolation in modes)) throw Error("Interpolation inconnue.");
  let src, dst;
  try {
    src = cv.matFromArray(
      image.height,
      image.width,
      image.channels === 1 ? cv.CV_8UC1 : cv.CV_8UC3,
      image.data,
    );
    dst = new cv.Mat();
    cv.resize(src, dst, new cv.Size(size.width, size.height), 0, 0, modes[interpolation]);
    return createImage({ ...image, ...size, data: new Uint8Array(dst.data) });
  } finally {
    dst?.delete();
    src?.delete();
  }
}
