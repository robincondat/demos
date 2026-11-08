import { thresholdLUT } from "./threshold.js?v=20261106-science1";
import { createImage } from "./image.js?v=20261106-science1";
import { makeHistogram } from "./histogram.js?v=20261106-science1";

export const METHODS = ["threshold", "window", "stretch", "contrast", "equalize"];

export function histogram(values, channels = 1) {
  return makeHistogram(
    values,
    channels,
    Array.from({ length: channels }, (_, i) => i),
    { min: 0, max: 255 },
  ).series;
}

export function createLUT(method, a = 128, b = 192, counts = null) {
  if (!METHODS.includes(method)) throw Error("Méthode inconnue");
  if (method !== "equalize") {
    if (!Number.isInteger(a) || a < 0 || a > 255)
      throw Error("a doit être un entier entre 0 et 255.");
    if (method !== "threshold" && (!Number.isInteger(b) || b < 0 || b > 255))
      throw Error("b doit être un entier entre 0 et 255.");
    if (["window", "stretch"].includes(method) && a >= b)
      throw Error("a doit être strictement inférieur à b.");
    if (method === "contrast" && (a === 0 || a === 255))
      throw Error("Pour le rehaussement, a doit être compris entre 1 et 254.");
  }
  if (method === "threshold") return thresholdLUT(a);
  const lut = new Uint8Array(256);
  if (method === "equalize") {
    if (!counts || counts.length !== 256) return Uint8Array.from({ length: 256 }, (_, i) => i);
    let total = 0,
      first = -1;
    counts.forEach((count, i) => {
      total += count;
      if (first < 0 && count) first = i;
    });
    const minimum = first < 0 ? 0 : counts[first];
    if (total === minimum) return Uint8Array.from({ length: 256 }, (_, i) => i);
    let cdf = 0;
    for (let i = 0; i < 256; i++) {
      cdf += counts[i];
      lut[i] = Math.max(0, Math.min(255, Math.round((255 * (cdf - minimum)) / (total - minimum))));
    }
    return lut;
  }
  for (let i = 0; i < 256; i++) {
    const value =
      method === "window"
        ? i >= a && i <= b
          ? 255
          : 0
        : method === "stretch"
          ? (255 * (i - a)) / (b - a)
          : i <= a
            ? (b * i) / a
            : b + ((255 - b) * (i - a)) / (255 - a);
    lut[i] = Math.round(Math.max(0, Math.min(255, value)));
  }
  return lut;
}

export function transform(values, channels, method, a, b) {
  const counts = histogram(values, channels);
  const luts = counts.map((bins) => createLUT(method, a, b, bins));
  return { values: Uint8Array.from(values, (value, i) => luts[i % channels][value]), luts };
}

export function transformImage(image, { method, a, b }) {
  if (
    !(image.data instanceof Uint8Array || image.data instanceof Uint8ClampedArray) ||
    ![1, 3].includes(image.channels)
  )
    throw Error("LUT operations require uint8 grayscale or RGB data");
  const result = transform(image.data, image.channels, method, a, b);
  return {
    image: createImage({ ...image, data: result.values, range: { min: 0, max: 255 } }),
    luts: result.luts,
  };
}
