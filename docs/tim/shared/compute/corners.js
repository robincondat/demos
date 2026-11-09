import { createImage, fromOpenCV } from "./image.js?v=20261106-science1";

export const CORNER_DEFAULTS = {
  method: "harris",
  preBlur: false,
  blurSize: 3,
  blockSize: 3,
  k: 0.04,
  quality: 0.01,
  minDistance: 5,
  maxCorners: 0,
};

export function validateCornerSettings(s) {
  if (!["harris", "shi"].includes(s.method)) throw Error("Détecteur inconnu.");
  for (const [label, value] of [
    ["Le voisinage", s.blockSize],
    ...(s.preBlur ? [["Le lissage", s.blurSize]] : []),
  ])
    if (!Number.isInteger(value) || value < 1 || value > 31 || value % 2 !== 1)
      throw Error(`${label} exige une taille impaire entre 1 et 31.`);
  if (!Number.isFinite(s.quality) || s.quality <= 0 || s.quality > 1)
    throw Error("Le seuil relatif doit être compris entre 0 exclu et 1 inclus.");
  if (s.method === "harris" && (!Number.isFinite(s.k) || s.k <= 0 || s.k >= 0.25))
    throw Error("k doit être compris entre 0 et 0,25 exclus.");
  if (!Number.isInteger(s.minDistance) || s.minDistance < 0 || s.minDistance > 200)
    throw Error("La distance doit être un entier entre 0 et 200.");
  if (!Number.isInteger(s.maxCorners) || s.maxCorners < 0 || s.maxCorners > 100000)
    throw Error("Le nombre maximal de coins doit être un entier entre 0 et 100 000.");
}

export function cornerCandidates(image, quality) {
  let max = 0;
  for (const value of image.data) max = Math.max(max, value);
  const threshold = image.data instanceof Float32Array ? Math.fround(quality * max) : quality * max;
  const data = new Uint8Array(image.data.length);
  let count = 0;
  for (let i = 0; i < data.length; i++)
    if (image.data[i] > threshold) {
      data[i] = 255;
      count++;
    }
  return {
    mask: createImage({ ...image, data, range: { min: 0, max: 255 } }),
    count,
    threshold,
  };
}

export function detectCorners(image, settings = CORNER_DEFAULTS, cv = globalThis.cv) {
  const s = { ...CORNER_DEFAULTS, ...settings };
  validateCornerSettings(s);
  if (image.channels !== 1) throw Error("La détection attend une image en niveaux de gris.");
  const allocated = [];
  const mat = () => {
    const value = new cv.Mat();
    allocated.push(value);
    return value;
  };
  const array = (data, type) => {
    const value = cv.matFromArray(image.height, image.width, type, data);
    allocated.push(value);
    return value;
  };
  try {
    const input = array(image.data, cv.CV_8UC1),
      prepared = mat();
    input.copyTo(prepared);
    const smooth = mat();
    if (s.preBlur)
      cv.GaussianBlur(
        prepared,
        smooth,
        new cv.Size(s.blurSize, s.blurSize),
        0,
        0,
        cv.BORDER_REFLECT_101,
      );
    else prepared.copyTo(smooth);
    const ix = mat(),
      iy = mat();
    const depth = cv.CV_32F;
    const scale = 1 / (4 * s.blockSize * 255);
    cv.Sobel(smooth, ix, depth, 1, 0, 3, scale, 0, cv.BORDER_REFLECT_101);
    cv.Sobel(smooth, iy, depth, 0, 1, 3, scale, 0, cv.BORDER_REFLECT_101);
    const products = [],
      size = new cv.Size(s.blockSize, s.blockSize);
    for (const [a, b] of [
      [ix, ix],
      [ix, iy],
      [iy, iy],
    ]) {
      const product = mat(),
        sum = mat();
      cv.multiply(a, b, product);
      cv.boxFilter(product, sum, -1, size, new cv.Point(-1, -1), false, cv.BORDER_REFLECT_101);
      products.push(sum);
    }
    const views = Object.fromEntries(
      [
        ["smooth", smooth],
        ["ix", ix],
        ["iy", iy],
        ["sxx", products[0]],
        ["sxy", products[1]],
        ["syy", products[2]],
      ].map(([key, value]) => [key, fromOpenCV(value)]),
    );
    const nativeScore = mat();
    if (s.method === "harris")
      cv.cornerHarris(smooth, nativeScore, s.blockSize, 3, s.k, cv.BORDER_REFLECT_101);
    else cv.cornerMinEigenVal(smooth, nativeScore, s.blockSize, 3, cv.BORDER_REFLECT_101);
    const score = fromOpenCV(nativeScore);
    const corners = mat(),
      mask = mat();
    cv.goodFeaturesToTrack(
      smooth,
      corners,
      s.maxCorners,
      s.quality,
      s.minDistance,
      mask,
      s.blockSize,
      s.method === "harris",
      s.k,
    );
    const points = Array.from({ length: corners.rows }, (_, i) => {
      const x = corners.data32F[2 * i],
        y = corners.data32F[2 * i + 1];
      return { x, y, score: score.data[Math.round(y) * image.width + Math.round(x)] };
    });
    const candidates = cornerCandidates(score, s.quality);
    return {
      views: { ...views, score, mask: candidates.mask },
      points,
      candidateCount: candidates.count,
      threshold: candidates.threshold,
    };
  } finally {
    for (const value of allocated.reverse()) value.delete();
  }
}
