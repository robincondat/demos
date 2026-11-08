import { binarizeMat } from "../../shared/compute/threshold.js?v=20261106-science1";
import { readCanvasImage } from "../../shared/scripts/opencv-image.js?v=20261106-ui2";
export function binarize(canvas, threshold, invert) {
  const gray = readCanvasImage(canvas, { mode: "Grayscale", float: false });
  try {
    return binarizeMat(gray, threshold, { invert });
  } finally {
    gray.delete();
  }
}
