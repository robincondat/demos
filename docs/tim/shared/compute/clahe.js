import { createImage } from "./image.js?v=20261106-science1";

export const CLAHE_DEFAULTS = { clipLimit: 40, tilesX: 8, tilesY: 8 };

// Match OpenCV's reflected extension: if either axis needs padding, both
// axes are extended to the NEXT multiple (even an already divisible axis).
export function claheGrid(width, height, settings) {
  validateCLAHE(settings);
  const { tilesX, tilesY } = settings;
  const extend = width % tilesX !== 0 || height % tilesY !== 0;
  return {
    width,
    height,
    tilesX,
    tilesY,
    tileWidth: (width + (extend ? tilesX - (width % tilesX) : 0)) / tilesX,
    tileHeight: (height + (extend ? tilesY - (height % tilesY) : 0)) / tilesY,
  };
}

export function claheTileAt(grid, x, y) {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return null;
  const column = Math.floor(x / grid.tileWidth),
    row = Math.floor(y / grid.tileHeight);
  const left = column * grid.tileWidth,
    top = row * grid.tileHeight;
  return {
    column,
    row,
    x: left,
    y: top,
    width: Math.min(grid.tileWidth, grid.width - left),
    height: Math.min(grid.tileHeight, grid.height - top),
  };
}

export function validateCLAHE({ clipLimit, tilesX, tilesY }) {
  if (!Number.isFinite(clipLimit) || clipLimit < 0)
    throw Error("clipLimit doit être un nombre positif ou nul.");
  if (![tilesX, tilesY].every((value) => Number.isSafeInteger(value) && value >= 1 && value <= 256))
    throw Error("Le nombre de tuiles doit être un entier entre 1 et 256 sur chaque axe.");
}

// OpenCV CLAHE operates on one channel. RGB mode applies it independently
// to each channel, matching the histogram platform's other transformations.
export function applyCLAHE(image, settings = CLAHE_DEFAULTS, cv = globalThis.cv) {
  validateCLAHE(settings);
  if (
    !(image.data instanceof Uint8Array || image.data instanceof Uint8ClampedArray) ||
    ![1, 3].includes(image.channels)
  )
    throw Error("CLAHE exige une image 8 bits en niveaux de gris ou RGB.");
  let algorithm, src, dst;
  try {
    algorithm = new cv.CLAHE(settings.clipLimit, new cv.Size(settings.tilesX, settings.tilesY));
    src = new cv.Mat(image.height, image.width, cv.CV_8UC1);
    dst = new cv.Mat();
    const data = new Uint8Array(image.data.length);
    for (let c = 0; c < image.channels; c++) {
      for (let i = 0; i < src.data.length; i++) src.data[i] = image.data[i * image.channels + c];
      algorithm.apply(src, dst);
      for (let i = 0; i < dst.data.length; i++) data[i * image.channels + c] = dst.data[i];
    }
    return createImage({ ...image, data, range: { min: 0, max: 255 } });
  } finally {
    dst?.delete();
    src?.delete();
    algorithm?.delete();
  }
}
