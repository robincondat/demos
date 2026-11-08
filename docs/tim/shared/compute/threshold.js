export function thresholdLUT(cutoff, { invert = false } = {}) {
  if (!Number.isInteger(cutoff) || cutoff < 0 || cutoff > 255)
    throw Error("Le seuil doit être un entier entre 0 et 255");
  return Uint8Array.from({ length: 256 }, (_, i) => (i > cutoff !== invert ? 255 : 0));
}

export function thresholdValues(values, cutoff, options) {
  if (!(values instanceof Uint8Array || values instanceof Uint8ClampedArray))
    throw Error("Le seuillage LUT exige des valeurs 8 bits");
  const lut = thresholdLUT(cutoff, options);
  return Uint8Array.from(values, (value) => lut[value]);
}

// The caller owns the returned Mat. Grayscale conversion remains explicit so
// OpenCV rounding is not silently replaced by the JavaScript RGB convention.
export function binarizeMat(source, cutoff, { invert = false } = {}, runtime = globalThis.cv) {
  if (source.channels() !== 1 || source.depth() !== runtime.CV_8U)
    throw Error("La binarisation exige une image grise 8 bits");
  return runtime.matFromArray(
    source.rows,
    source.cols,
    runtime.CV_8UC1,
    thresholdValues(source.data, cutoff, { invert }),
  );
}
