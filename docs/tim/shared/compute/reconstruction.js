import { convertRGB } from "./color-spaces.js?v=20261106-science1";
import { fromRGBA } from "./image.js?v=20261106-science1";

const clamp = (value, max) => Math.max(0, Math.min(max, value));

export function reduceArea(data, width, height) {
  const w = Math.ceil(width / 2),
    h = Math.ceil(height / 2),
    out = new Uint8Array(w * h);
  const sx = width / w,
    sy = height / h;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const left = x * sx,
        right = (x + 1) * sx,
        top = y * sy,
        bottom = (y + 1) * sy;
      let sum = 0;
      for (let j = Math.floor(top); j < Math.min(height, Math.ceil(bottom)); j++) {
        const dy = Math.min(bottom, j + 1) - Math.max(top, j);
        for (let i = Math.floor(left); i < Math.min(width, Math.ceil(right)); i++)
          sum += data[j * width + i] * dy * (Math.min(right, i + 1) - Math.max(left, i));
      }
      out[y * w + x] = Math.round(sum / (sx * sy));
    }
  return { data: out, width: w, height: h };
}

export function enlargeLinear(reduced, width, height) {
  const { data, width: w, height: h } = reduced,
    out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const fy = clamp(((y + 0.5) * h) / height - 0.5, h - 1),
      y0 = Math.floor(fy),
      y1 = Math.min(h - 1, y0 + 1),
      dy = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = clamp(((x + 0.5) * w) / width - 0.5, w - 1),
        x0 = Math.floor(fx),
        x1 = Math.min(w - 1, x0 + 1),
        dx = fx - x0;
      out[y * width + x] = Math.round(
        (1 - dy) * ((1 - dx) * data[y0 * w + x0] + dx * data[y0 * w + x1]) +
          dy * ((1 - dx) * data[y1 * w + x0] + dx * data[y1 * w + x1]),
      );
    }
  }
  return out;
}

export function reconstructChannels(data, width, height, channels = [0, 1, 2]) {
  const output = data.slice(),
    plane = new Uint8Array(width * height);
  for (const channel of channels) {
    for (let p = 0; p < plane.length; p++) plane[p] = data[p * 3 + channel];
    const rebuilt = enlargeLinear(reduceArea(plane, width, height), width, height);
    for (let p = 0; p < plane.length; p++) output[p * 3 + channel] = rebuilt[p];
  }
  return output;
}

export function ycbcrToRGB(data) {
  const rgb = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 3) {
    const y = data[i] / 255,
      cb = data[i + 1] / 255,
      cr = data[i + 2] / 255;
    const r = (cr - 0.5) / 0.713 + y,
      b = (cb - 0.5) / 0.564 + y,
      g = (y - 0.299 * r - 0.114 * b) / 0.587;
    rgb[i] = Math.floor(clamp(r, 1) * 255);
    rgb[i + 1] = Math.floor(clamp(g, 1) * 255);
    rgb[i + 2] = Math.floor(clamp(b, 1) * 255);
  }
  return rgb;
}

export function reconstructionView(rgba, width, height, mode) {
  let data;
  if (mode === "reduced-rgb")
    data = reconstructChannels(fromRGBA({ data: rgba, width, height }).data, width, height);
  else if (mode === "reduced-chroma")
    data = ycbcrToRGB(reconstructChannels(convertRGB(rgba, "ycbcr").data, width, height, [1, 2]));
  else throw Error("Reconstruction inconnue.");
  return { data, channels: 3, labels: ["R", "G", "B"], max: 255 };
}
