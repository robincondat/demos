const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function makeHistogram(data, channels, offsets, range) {
  if (
    !Number.isInteger(channels) ||
    channels < 1 ||
    channels > 4 ||
    data.length % channels ||
    !offsets.length ||
    offsets.some((offset) => !Number.isInteger(offset) || offset < 0 || offset >= channels)
  ) {
    throw Error("Canaux d’histogramme invalides");
  }
  if (
    !Number.isFinite(range.resolvedMin ?? range.min) ||
    !Number.isFinite(range.resolvedMax ?? range.max) ||
    (range.resolvedMax ?? range.max) < (range.resolvedMin ?? range.min)
  )
    throw Error("Plage d’histogramme invalide");
  const min = range.resolvedMin ?? range.min,
    max = range.resolvedMax ?? range.max,
    firstInteger = Math.ceil(min),
    lastInteger = Math.floor(max),
    integerCount = Math.max(1, lastInteger - firstInteger + 1),
    exactIntegers = integerCount <= 4096,
    bins = exactIntegers ? integerCount : 4096,
    span = max - min || 1,
    series = offsets.map(() => new Uint32Array(bins));
  for (let i = 0; i < data.length; i += channels)
    offsets.forEach((offset, index) => {
      const value = data[i + offset];
      if (!Number.isFinite(value)) return;
      const clipped = clamp(value, min, max),
        bin = exactIntegers
          ? clamp(Math.floor(clipped + 0.5) - firstInteger, 0, bins - 1)
          : clamp(Math.floor(((clipped - min) / span) * bins), 0, bins - 1);
      series[index][bin]++;
    });
  return { min, max, series, bins, exactIntegers };
}
