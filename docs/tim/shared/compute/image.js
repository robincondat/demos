// Scientific pixels are independent of canvas display pixels. Buffers are borrowed
// by default; use copyImage or the default OpenCV adapter before deleting a Mat.
export function createImage(
  { width, height, channels, data, colorSpace, range = null },
  { copy = false } = {},
) {
  if (
    ![width, height, channels].every(Number.isSafeInteger) ||
    width < 1 ||
    height < 1 ||
    channels < 1 ||
    channels > 4
  ) {
    throw Error("Dimensions ou nombre de canaux invalides");
  }
  if (
    !ArrayBuffer.isView(data) ||
    data instanceof DataView ||
    typeof data[0] !== "number" ||
    data.length !== width * height * channels
  ) {
    throw Error("Le tableau de pixels ne correspond pas aux dimensions de l’image");
  }
  if (
    range &&
    (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.max <= range.min)
  ) {
    throw Error("Plage théorique invalide");
  }
  return {
    width,
    height,
    channels,
    data: copy ? data.slice() : data,
    colorSpace: colorSpace || (channels === 1 ? "gray" : channels === 4 ? "rgba" : "rgb"),
    range: range ? { ...range } : null,
  };
}

export function copyImage(image) {
  return createImage(image, { copy: true });
}

export function fromRGBA({ width, height, data }, { mode = "rgb" } = {}) {
  if (!["rgb", "gray", "rgba"].includes(mode)) throw Error("Mode de conversion inconnu");
  createImage({ width, height, channels: 4, data });
  const channels = mode === "gray" ? 1 : mode === "rgba" ? 4 : 3;
  const pixels = new Uint8Array(width * height * channels);
  for (let i = 0, j = 0; i < data.length; i += 4) {
    if (channels === 1)
      pixels[j++] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    else for (let c = 0; c < channels; c++) pixels[j++] = data[i + c];
  }
  return createImage({
    width,
    height,
    channels,
    data: pixels,
    colorSpace: mode,
    range: { min: 0, max: 255 },
  });
}

export function fromOpenCV(mat, { colorSpace, range = null, copy = true } = {}) {
  const property = ["data", "data8S", "data16U", "data16S", "data32S", "data32F", "data64F"][
    mat.depth()
  ];
  if (!property) throw Error("Type OpenCV non pris en charge");
  return createImage(
    {
      width: mat.cols,
      height: mat.rows,
      channels: mat.channels(),
      data: mat[property],
      colorSpace,
      range,
    },
    { copy },
  );
}

export function pixelAt(image, x, y) {
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= image.width ||
    y >= image.height
  )
    return null;
  const start = (y * image.width + x) * image.channels;
  return Array.from(image.data.subarray(start, start + image.channels));
}

export function dataRange(image) {
  let min = Infinity,
    max = -Infinity;
  for (let i = 0; i < image.data.length; i++) {
    if (image.channels === 4 && i % 4 === 3) continue;
    const value = image.data[i];
    if (Number.isFinite(value)) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  return Number.isFinite(min) ? { min, max } : { min: 0, max: 0 };
}
