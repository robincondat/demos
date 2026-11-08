import { createImage } from "./image.js?v=20261106-science1";

export function extractImageRegion(image, { x, y, width, height }) {
  if (
    ![x, y, width, height].every(Number.isSafeInteger) ||
    x < 0 ||
    y < 0 ||
    width < 1 ||
    height < 1 ||
    x + width > image.width ||
    y + height > image.height
  )
    throw Error("La région doit être incluse dans l’image.");
  const data = new image.data.constructor(width * height * image.channels);
  const rowLength = width * image.channels;
  for (let row = 0; row < height; row++) {
    const start = ((y + row) * image.width + x) * image.channels;
    data.set(image.data.subarray(start, start + rowLength), row * rowLength);
  }
  return createImage({ ...image, width, height, data });
}
