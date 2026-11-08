import { COLOR_SPACES } from "../../shared/compute/color-spaces.js?v=20261106-science1";
const byte = (value) => Math.max(0, Math.min(255, value));

export const SPACES = {
  cmyk: {
    ...COLOR_SPACES.cmyk,
    views: [
      ["c", "C — Cyan"],
      ["m", "M — Magenta"],
      ["y", "Y — Jaune"],
      ["k", "K — Noir"],
      ["c-gray", "C — Niveaux de gris"],
      ["m-gray", "M — Niveaux de gris"],
      ["y-gray", "Y — Niveaux de gris"],
      ["k-gray", "K — Niveaux de gris"],
    ],
  },
  ycbcr: {
    ...COLOR_SPACES.ycbcr,
    views: [
      ["stack", "YCbCr"],
      ["0", "Y — Luminance"],
      ["1", "Cb — Chrominance bleue"],
      ["2", "Cr — Chrominance rouge"],
    ],
  },
  hsv: {
    ...COLOR_SPACES.hsv,
    views: [
      ["stack", "HSV"],
      ["0", "H — Teinte"],
      ["1", "S — Saturation"],
      ["2", "V — Valeur"],
    ],
  },
  lab: {
    ...COLOR_SPACES.lab,
    views: [
      ["stack", "Lab"],
      ["0", "L* — Clarté"],
      ["1", "a* — Axe vert / rouge"],
      ["2", "b* — Axe bleu / jaune"],
    ],
  },
  hls: {
    ...COLOR_SPACES.hls,
    views: [
      ["stack", "HLS"],
      ["0", "H — Teinte"],
      ["1", "L — Luminosité"],
      ["2", "S — Saturation"],
    ],
  },
  xyz: {
    ...COLOR_SPACES.xyz,
    views: [
      ["stack", "XYZ"],
      ["0", "X"],
      ["1", "Y"],
      ["2", "Z"],
    ],
  },
};

export function originalView(rgba, selection = "rgb") {
  if (selection.endsWith("-gray")) {
    const channel = ["r-gray", "g-gray", "b-gray"].indexOf(selection),
      data = new Uint8Array(rgba.length / 4);
    if (channel < 0) throw Error("Vue inconnue.");
    for (let p = 0; p < data.length; p++) data[p] = rgba[p * 4 + channel];
    return { data, channels: 1, labels: [["R", "G", "B"][channel]], max: 255 };
  }
  const data = new Uint8Array((rgba.length / 4) * 3),
    selected = ["r", "g", "b"].indexOf(selection);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p += 3)
    for (let c = 0; c < 3; c++) data[p + c] = selected < 0 || selected === c ? rgba[i + c] : 0;
  return { data, channels: 3, labels: ["R", "G", "B"], max: 255 };
}

export function convertedView(converted, selection) {
  const { data: raw, channels, space } = converted;
  if (space !== "cmyk") {
    if (selection === "stack")
      return { data: raw, channels: 3, labels: converted.labels, max: 255 };
    const channel = Number(selection);
    if (!Number.isInteger(channel) || channel < 0 || channel > 2) throw Error("Vue inconnue.");
    const data = new Uint8Array(raw.length / 3);
    for (let p = 0; p < data.length; p++) data[p] = raw[p * 3 + channel];
    return {
      data,
      channels: 1,
      labels: [converted.labels[channel]],
      max: ["hsv", "hls"].includes(space) && channel === 0 ? 180 : 255,
    };
  }
  if (selection.endsWith("-gray")) {
    const channel = ["c-gray", "m-gray", "y-gray", "k-gray"].indexOf(selection),
      data = new Uint8Array(raw.length / 4);
    if (channel < 0) throw Error("Vue inconnue.");
    for (let p = 0; p < data.length; p++) data[p] = raw[p * 4 + channel];
    return { data, channels: 1, labels: [converted.labels[channel]], max: 255 };
  }
  if (!["c", "m", "y", "k", "rgb"].includes(selection)) throw Error("Vue inconnue.");
  const data = new Uint8Array((raw.length / channels) * 3);
  for (let i = 0, p = 0; i < raw.length; i += 4, p += 3) {
    data[p] = data[p + 1] = data[p + 2] = 255;
    if (selection === "rgb")
      for (let c = 0; c < 3; c++) data[p + c] = byte(255 - raw[i + 3] - raw[i + c]);
    else if (selection === "k") data[p] = data[p + 1] = data[p + 2] = 255 - raw[i + 3];
    else {
      const c = ["c", "m", "y"].indexOf(selection);
      data[p + c] = 255 - raw[i + c];
    }
  }
  return { data, channels: 3, labels: ["R", "G", "B"], max: 255 };
}

export function displayPixels(view, { min, max, auto }) {
  if (auto) {
    min = Infinity;
    max = -Infinity;
    for (const value of view.data) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || (!auto && max <= min))
    throw Error("La valeur blanche doit être supérieure à la valeur noire.");
  // Une image uniforme reste uniforme, sans division par zéro.
  const span = max - min || 1,
    rgba = new Uint8ClampedArray((view.data.length / view.channels) * 4);
  for (let p = 0, i = 0; p < view.data.length; p += view.channels, i += 4) {
    for (let c = 0; c < 3; c++)
      rgba[i + c] = Math.round(
        byte(((view.data[p + (view.channels === 1 ? 0 : c)] - min) * 255) / span),
      );
    rgba[i + 3] = 255;
  }
  return { rgba, min, max };
}
