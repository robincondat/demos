const byte = (value) => Math.max(0, Math.min(255, value));
const roundEven = (value) => {
  const floor = Math.floor(value);
  return value - floor === 0.5 ? floor + (floor % 2) : Math.round(value);
};

export const COLOR_SPACES = {
  cmyk: {
    name: "CMYK",
    labels: ["C", "M", "Y", "K"],
  },
  ycbcr: {
    name: "YCbCr",
    labels: ["Y", "Cb", "Cr"],
  },
  hsv: {
    name: "HSV",
    labels: ["H", "S", "V"],
  },
  lab: {
    name: "Lab",
    labels: ["L*", "a*", "b*"],
  },
  hls: {
    name: "HLS",
    labels: ["H", "L", "S"],
  },
  xyz: {
    name: "XYZ",
    labels: ["X", "Y", "Z"],
  },
};

// Conventions du TP : CMYK soustractif simplifié, ordre Y/Cb/Cr et H/2.
export function convertRGB(rgba, space) {
  if (!COLOR_SPACES[space]) throw Error("Espace de couleurs inconnu.");
  if (["lab", "hls", "xyz"].includes(space)) throw Error("Cet espace utilise le moteur OpenCV.");
  const channels = COLOR_SPACES[space].labels.length,
    data = new Uint8Array((rgba.length / 4) * channels);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p += channels) {
    const R = rgba[i],
      G = rgba[i + 1],
      B = rgba[i + 2];
    if (space === "cmyk") {
      const max = Math.max(R, G, B);
      data[p] = max - R;
      data[p + 1] = max - G;
      data[p + 2] = max - B;
      data[p + 3] = 255 - max;
    } else if (space === "ycbcr") {
      const r = R / 255,
        g = G / 255,
        b = B / 255,
        y = 0.299 * r + 0.587 * g + 0.114 * b;
      data[p] = Math.floor(byte(255 * y));
      data[p + 1] = Math.floor(byte(255 * (0.564 * (b - y) + 0.5)));
      data[p + 2] = Math.floor(byte(255 * (0.713 * (r - y) + 0.5)));
    } else {
      const r = R / 255,
        g = G / 255,
        b = B / 255,
        max = Math.max(r, g, b),
        min = Math.min(r, g, b),
        delta = max - min;
      let h = 0;
      if (delta) {
        if (max === r) {
          h = (60 * (g - b)) / delta;
          if (h < 0) h += 360;
        } else if (max === g) h = (60 * (b - r)) / delta + 120;
        else h = (60 * (r - g)) / delta + 240;
      }
      data[p] = roundEven(h / 2);
      data[p + 1] = roundEven((max ? 1 - min / max : 0) * 255);
      data[p + 2] = roundEven(max * 255);
    }
  }
  return { data, channels, labels: COLOR_SPACES[space].labels, space };
}
