import { dataRange } from "../compute/image.js?v=20261106-science1";

export function resolveDisplayRange(
  image,
  { min = image.range?.min ?? 0, max = image.range?.max ?? 255, auto = false } = {},
) {
  if (auto) {
    ({ min, max } = dataRange(image));
    if (min === max) max = min + 1;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min)
    throw Error("Plage d’affichage invalide");
  return { min, max };
}

export function displayPixels(image, options) {
  if (![1, 3, 4].includes(image.channels))
    throw Error("L’affichage exige une image gris, RGB ou RGBA");
  const { min, max } = resolveDisplayRange(image, options);
  const rgba = new Uint8ClampedArray(image.width * image.height * 4);
  for (let i = 0, j = 0; i < image.data.length; i += image.channels, j += 4) {
    for (let c = 0; c < 3; c++)
      rgba[j + c] = (255 * (image.data[i + (image.channels === 1 ? 0 : c)] - min)) / (max - min);
    rgba[j + 3] = image.channels === 4 ? image.data[i + 3] : 255;
  }
  return rgba;
}

export function renderImage(canvas, image, options) {
  const pixels = displayPixels(image, options);
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  const frame = context.createImageData(image.width, image.height);
  frame.data.set(pixels);
  context.putImageData(frame, 0, 0);
}
