import { createImage } from "./image.js?v=20261106-science1";

export function quantizeUniform(image, { levels = 8, range = "fixed" } = {}) {
  if (!Number.isInteger(levels) || levels < 2 || levels > 256)
    throw Error("Le nombre de niveaux doit être un entier entre 2 et 256.");
  if (!["fixed", "image"].includes(range)) throw Error("Plage de quantification inconnue.");
  const bounds = Array.from({ length: image.channels }, () => ({
    min: range === "fixed" ? 0 : 255,
    max: range === "fixed" ? 255 : 0,
  }));
  if (range === "image")
    for (let i = 0; i < image.data.length; i++) {
      const bound = bounds[i % image.channels];
      bound.min = Math.min(bound.min, image.data[i]);
      bound.max = Math.max(bound.max, image.data[i]);
    }
  const data = new Uint8Array(image.data.length);
  const luts = bounds.map(({ min, max }) => {
    const lut = new Uint8Array(256).fill(min),
      step = (max - min) / (levels - 1);
    for (let n = 0; n < levels; n++) {
      const threshold = Math.floor(min + step * n);
      lut.fill(threshold, threshold);
    }
    return lut;
  });
  for (let i = 0; i < data.length; i++) {
    data[i] = luts[i % image.channels][image.data[i]];
  }
  return {
    image: createImage({ ...image, data }),
    steps: bounds.map(({ min, max }) => (max - min) / (levels - 1)),
  };
}
