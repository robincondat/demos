export const ALL_HSV = { hMin: 0, hMax: 180, sMin: 0, sMax: 255, vMin: 0, vMax: 255 };

export function selectHSV(hsv, bounds) {
  for (const key of Object.keys(ALL_HSV)) {
    const max = key.startsWith("h") ? 180 : 255;
    if (!Number.isInteger(bounds[key]) || bounds[key] < 0 || bounds[key] > max)
      throw Error(
        `${key[0].toUpperCase()} : les seuils doivent être des entiers entre 0 et ${max}.`,
      );
  }
  if (bounds.sMin > bounds.sMax || bounds.vMin > bounds.vMax)
    throw Error("Pour S et V, le minimum doit être inférieur ou égal au maximum.");
  const mask = new Uint8Array(hsv.length / 3);
  let count = 0;
  for (let i = 0, p = 0; i < hsv.length; i += 3, p++) {
    const h = hsv[i],
      s = hsv[i + 1],
      v = hsv[i + 2];
    const hue =
      bounds.hMin <= bounds.hMax
        ? h >= bounds.hMin && h <= bounds.hMax
        : h >= bounds.hMin || h <= bounds.hMax;
    if (hue && s >= bounds.sMin && s <= bounds.sMax && v >= bounds.vMin && v <= bounds.vMax) {
      mask[p] = 1;
      count++;
    }
  }
  return { mask, count };
}

export function selectionView(rgba, mask, binary = false) {
  const data = new Uint8Array((rgba.length / 4) * 3);
  for (let i = 0; i < mask.length; i++)
    if (mask[i]) {
      for (let c = 0; c < 3; c++) data[i * 3 + c] = binary ? 255 : rgba[i * 4 + c];
    }
  return {
    data,
    channels: 3,
    labels: binary ? ["Masque", "Masque", "Masque"] : ["R", "G", "B"],
    max: 255,
  };
}

// Décalage en degrés ; le masque reste défini sur l’image originale.
export function shiftSelectedHue(rgba, mask, degrees) {
  const data = new Uint8Array((rgba.length / 4) * 3);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    const rgb = [rgba[i], rgba[i + 1], rgba[i + 2]];
    const max = Math.max(...rgb), min = Math.min(...rgb), delta = max - min;
    if (mask[p] && delta && degrees % 360) {
      let h = max === rgb[0] ? (rgb[1] - rgb[2]) / delta
        : max === rgb[1] ? (rgb[2] - rgb[0]) / delta + 2
        : (rgb[0] - rgb[1]) / delta + 4;
      h = ((h + degrees / 60) % 6 + 6) % 6;
      const x = delta * (1 - Math.abs(h % 2 - 1));
      const sectors = [[delta, x, 0], [x, delta, 0], [0, delta, x],
        [0, x, delta], [x, 0, delta], [delta, 0, x]];
      for (let c = 0; c < 3; c++) rgb[c] = Math.round(sectors[Math.floor(h)][c] + min);
    }
    data.set(rgb, p * 3);
  }
  return { data, channels: 3, labels: ["R", "G", "B"], max: 255 };
}
