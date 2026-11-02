export const ALL_HSV = { hMin: 0, hMax: 180, sMin: 0, sMax: 255, vMin: 0, vMax: 255 };

export function selectHSV(hsv, bounds) {
  for (const key of Object.keys(ALL_HSV)) {
    const max = key.startsWith('h') ? 180 : 255;
    if (!Number.isInteger(bounds[key]) || bounds[key] < 0 || bounds[key] > max) throw Error(`${key[0].toUpperCase()} : les seuils doivent être des entiers entre 0 et ${max}.`);
  }
  if (bounds.sMin > bounds.sMax || bounds.vMin > bounds.vMax) throw Error('Pour S et V, le minimum doit être inférieur ou égal au maximum.');
  const mask = new Uint8Array(hsv.length / 3); let count = 0;
  for (let i = 0, p = 0; i < hsv.length; i += 3, p++) {
    const h = hsv[i], s = hsv[i + 1], v = hsv[i + 2];
    const hue = bounds.hMin <= bounds.hMax ? h >= bounds.hMin && h <= bounds.hMax : h >= bounds.hMin || h <= bounds.hMax;
    if (hue && s >= bounds.sMin && s <= bounds.sMax && v >= bounds.vMin && v <= bounds.vMax) { mask[p] = 1; count++; }
  }
  return { mask, count };
}

export function selectionView(rgba, mask, binary = false) {
  const data = new Uint8Array(rgba.length / 4 * 3);
  for (let i = 0; i < mask.length; i++) if (mask[i]) {
    for (let c = 0; c < 3; c++) data[i * 3 + c] = binary ? 255 : rgba[i * 4 + c];
  }
  return { data, channels: 3, labels: binary ? ['Masque', 'Masque', 'Masque'] : ['R', 'G', 'B'], max: 255 };
}
