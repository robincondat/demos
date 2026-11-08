import { prepareMat, matRange, displayMat } from "../compute/opencv-image.js?v=20261106-ui2";
import { resolveDisplaySettings } from "./display-controls.js?v=20261106-ui2";

export function canvasIsGrayscale(canvas) {
  const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < data.length; i += 4)
    if (data[i] !== data[i + 1] || data[i] !== data[i + 2]) return false;
  return true;
}

export function readCanvasImage(canvas, options, cv = globalThis.cv) {
  const rgba = cv.imread(canvas);
  try {
    return prepareMat(rgba, options, cv);
  } finally {
    rgba.delete();
  }
}

export function readCanvasImages(canvas, cv = globalThis.cv) {
  const rgba = cv.imread(canvas);
  let gray, rgb;
  try {
    gray = prepareMat(rgba, { mode: "Grayscale" }, cv);
    rgb = prepareMat(rgba, { mode: "RGB" }, cv);
    return { gray, rgb };
  } catch (error) {
    gray?.delete();
    rgb?.delete();
    throw error;
  } finally {
    rgba.delete();
  }
}

export function makeDisplayImage(mat, settings, cv = globalThis.cv) {
  return displayMat(
    mat,
    resolveDisplaySettings(settings, () => matRange(mat, cv)),
    cv,
  );
}
