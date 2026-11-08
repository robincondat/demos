// Returned matrices belong to the caller; inputs are never modified.
export function prepareMat(rgba, { mode = "RGB", float = true } = {}, cv = globalThis.cv) {
  const base = new cv.Mat();
  let output,
    transferred = false;
  try {
    cv.cvtColor(rgba, base, mode === "Grayscale" ? cv.COLOR_RGBA2GRAY : cv.COLOR_RGBA2RGB);
    if (!float) {
      transferred = true;
      return base;
    }
    output = new cv.Mat();
    base.convertTo(output, cv.CV_32F);
    return output;
  } catch (error) {
    output?.delete();
    throw error;
  } finally {
    if (!transferred) base.delete();
  }
}

export function matRange(mat, cv = globalThis.cv) {
  const channels = new cv.MatVector();
  let min = Infinity,
    max = -Infinity;
  try {
    cv.split(mat, channels);
    for (let i = 0; i < channels.size(); i++) {
      const channel = channels.get(i);
      try {
        const range = cv.minMaxLoc(channel);
        min = Math.min(min, range.minVal);
        max = Math.max(max, range.maxVal);
      } finally {
        channel.delete();
      }
    }
    return { min, max };
  } finally {
    channels.delete();
  }
}

export function displayMat(mat, { min, max }, cv = globalThis.cv) {
  const result = new cv.Mat();
  try {
    mat.convertTo(result, cv.CV_8U, 255 / (max - min), (-min * 255) / (max - min));
    return result;
  } catch (error) {
    result.delete();
    throw error;
  }
}
