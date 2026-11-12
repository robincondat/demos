import { createImage, fromOpenCV } from "./image.js?v=20261106-science1";

export const CORNER_DEFAULTS = {
  method: "harris",
  blockSize: 3,
  k: 0.04,
  quality: 0.01,
  minDistance: 7,
  maxCorners: 0,
};

export function validateCornerSettings(s) {
  if (!["harris", "shi"].includes(s.method)) throw Error("Détecteur inconnu.");
  for (const [label, value] of [
    ["Le voisinage", s.blockSize],
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

export function cornerNMS(score, candidates, minDistance, maxCorners = 0) {
  const { width, height } = score;
  const data = new Uint8Array(width * height), maxima = [];
  // Premier filtrage du TP : maxima 3 × 3, égalités conservées, bord exclu.
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (!candidates.data[i]) continue;
      let maximum = true;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (score.data[i + dy * width + dx] > score.data[i]) maximum = false;
      if (maximum) {
        data[i] = 255;
        maxima.push({ x, y, score: score.data[i] });
      }
    }
  // Deuxième filtrage : tri décroissant et exclusion euclidienne stricte.
  const points = [], cells = new Map(), cellSize = Math.max(1, minDistance);
  for (const point of [...maxima].sort((a, b) => b.score - a.score)) {
    const cx = Math.floor(point.x / cellSize), cy = Math.floor(point.y / cellSize);
    let close = false;
    for (let dy = -1; dy <= 1 && !close; dy++)
      for (let dx = -1; dx <= 1 && !close; dx++)
        close = (cells.get(`${cx + dx},${cy + dy}`) || []).some(
          (other) => (point.x - other.x) ** 2 + (point.y - other.y) ** 2 < minDistance ** 2,
        );
    if (close) continue;
    points.push(point);
    const key = `${cx},${cy}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(point);
    if (maxCorners && points.length >= maxCorners) break;
  }
  return { maxima, points, maximaMask: createImage({ ...score, data, range: { min: 0, max: 255 } }) };
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
    const input = array(image.data, cv.CV_8UC1);
    const ix = mat(),
      iy = mat();
    const depth = cv.CV_64F;
    const scale = 1 / (4 * 255);
    cv.Sobel(input, ix, depth, 1, 0, 3, scale, 0, cv.BORDER_REFLECT_101);
    cv.Sobel(input, iy, depth, 0, 1, 3, scale, 0, cv.BORDER_REFLECT_101);
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
      cv.boxFilter(product, sum, -1, size, new cv.Point(-1, -1), true, cv.BORDER_REFLECT_101);
      products.push(sum);
    }
    const views = Object.fromEntries(
      [
        ["ix", ix],
        ["iy", iy],
        ["sxx", products[0]],
        ["sxy", products[1]],
        ["syy", products[2]],
      ].map(([key, value]) => [key, fromOpenCV(value)]),
    );
    const values = new Float64Array(image.width * image.height);
    for (let i = 0; i < values.length; i++) {
      const a = views.sxx.data[i], b = views.sxy.data[i], c = views.syy.data[i];
      const trace = a + c, det = a * c - b * b;
      values[i] = s.method === "harris" ? det - s.k * trace ** 2
        : (trace - Math.sqrt(Math.max(trace ** 2 - 4 * det, 0))) / 2;
    }
    const score = createImage({ ...image, data: values, range: null });
    const candidates = cornerCandidates(score, s.quality);
    const nms = cornerNMS(score, candidates.mask, s.minDistance, s.maxCorners);
    const thresholded = createImage({ ...score, data: Float64Array.from(values,
      (value, i) => candidates.mask.data[i] ? value : 0) });
    return {
      views: { ...views, score, thresholded, mask: candidates.mask, maximaMask: nms.maximaMask },
      points: nms.points,
      maxima: nms.maxima,
      candidateCount: candidates.count,
      threshold: candidates.threshold,
    };
  } finally {
    for (const value of allocated.reverse()) value.delete();
  }
}
