const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const colors = {
  gray: "#52667f",
  red: "#e34b5f",
  green: "#20a56b",
  blue: "#187ddd",
};

function nice(value) {
  if (!Number.isFinite(value)) return "—";
  return Number(value.toPrecision(6)).toString();
}

function dataRange(data, channels, offsets) {
  let min = Infinity,
    max = -Infinity;
  for (let i = 0; i < data.length; i += channels)
    for (const offset of offsets) {
      const value = data[i + offset];
      if (Number.isFinite(value)) {
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    }
  return Number.isFinite(min) ? { min, max } : { min: 0, max: 0 };
}

function makeHistogram(data, channels, offsets, range) {
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

function sourceData(canvas) {
  return canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height)
    .data;
}
function offsets(mode) {
  return mode === "Grayscale" ? [0] : [0, 1, 2];
}
function sourceHistogram(canvas, mode, range) {
  return makeHistogram(sourceData(canvas), 4, offsets(mode), range);
}
function matHistogram(mat, mode, range) {
  return makeHistogram(mat.data32F, mat.channels(), offsets(mode), range);
}
function sourceRange(canvas, mode) {
  return dataRange(sourceData(canvas), 4, offsets(mode));
}

function drawHistogram(canvas, histogram, mode) {
  const width = Math.max(
      220,
      Math.round(canvas.clientWidth * devicePixelRatio),
    ),
    height = Math.max(100, Math.round(canvas.clientHeight * devicePixelRatio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "#d8e1ec";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height - 0.5);
  ctx.lineTo(width, height - 0.5);
  ctx.stroke();
  let peak = 1;
  histogram.series.forEach((series) =>
    series.forEach((value) => {
      peak = Math.max(peak, value);
    }),
  );
  const palette =
    mode === "Grayscale"
      ? [colors.gray]
      : [colors.red, colors.green, colors.blue];
  histogram.series.forEach((series, index) => {
    ctx.beginPath();
    ctx.strokeStyle = palette[index];
    ctx.lineWidth = Math.max(1.2, devicePixelRatio);
    ctx.globalAlpha = mode === "Grayscale" ? 1 : 0.78;
    for (let bin = 0; bin < series.length; bin++) {
      const x =
          series.length === 1
            ? width / 2
            : (bin / (series.length - 1)) * (width - 1),
        y = height - 2 - (series[bin] / peak) * (height - 8);
      if (bin === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

function pixelText(values) {
  return values.length === 1
    ? nice(values[0])
    : `R ${nice(values[0])} · V ${nice(values[1])} · B ${nice(values[2])}`;
}
function differenceText(source, result) {
  const comparableSource =
    source.length === result.length
      ? source
      : source.length === 1
        ? Array(result.length).fill(source[0])
        : null;
  return comparableSource
    ? pixelText(result.map((value, index) => value - comparableSource[index]))
    : "—";
}

export function createAnalysisView(ids) {
  let sourceStats = null,
    resultStats = null,
    mode = "RGB",
    resultMode = "RGB",
    sourceVersion = 0,
    sourceKey = "";
  const redraw = () => {
    if (sourceStats) drawHistogram(ids.originalHistogram, sourceStats, mode);
    if (resultStats)
      drawHistogram(ids.resultHistogram, resultStats, resultMode);
  };
  const clear = (canvas) =>
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  const rangeLabel = (stats) =>
    `[${nice(stats.min)}, ${nice(stats.max)}] · ${stats.bins} classe${stats.bins > 1 ? "s" : ""}${stats.exactIntegers ? "" : " regroupées"}`;
  new ResizeObserver(redraw).observe(ids.originalHistogram.parentElement);
  return {
    setSource(canvas, nextMode, { width, height, fileSize }) {
      mode = nextMode;
      resultMode = nextMode;
      sourceVersion++;
      sourceKey = "";
      sourceStats = null;
      resultStats = null;
      clear(ids.originalHistogram);
      clear(ids.resultHistogram);
      const rawRange = sourceRange(canvas, mode);
      ids.infoDimensions.textContent = `${width} × ${height} px`;
      ids.infoType.textContent =
        mode === "Grayscale" ? "Niveaux de gris · float32" : "RGB · float32";
      ids.infoOriginalRange.textContent = `[${nice(rawRange.min)}, ${nice(rawRange.max)}]`;
      ids.infoFileSize.textContent =
        fileSize < 1048576
          ? `${(fileSize / 1024).toFixed(1)} Ko`
          : `${(fileSize / 1048576).toFixed(1)} Mo`;
      ids.originalHistogramRange.textContent = "—";
      ids.resultHistogramRange.textContent = "—";
      redraw();
    },
    setSourceDisplay(canvas, range) {
      const key = `${sourceVersion}|${range.resolvedMin}|${range.resolvedMax}`;
      if (key === sourceKey) return;
      sourceKey = key;
      sourceStats = sourceHistogram(canvas, mode, range);
      ids.originalHistogramRange.textContent = rangeLabel(sourceStats);
      redraw();
    },
    setResult(mat, range, nextMode = mode) {
      resultMode = nextMode;
      resultStats = matHistogram(mat, resultMode, range);
      ids.resultHistogramRange.textContent = rangeLabel(resultStats);
      redraw();
    },
    setCursor(x, y, sourceCanvas, resultMat, nextResultMode = resultMode) {
      if (!resultMat) return;
      const sourceData = sourceCanvas
        .getContext("2d")
        .getImageData(x, y, 1, 1).data;
      const source =
          mode === "Grayscale"
            ? [sourceData[0]]
            : [sourceData[0], sourceData[1], sourceData[2]],
        channels = resultMat.channels(),
        base = (y * resultMat.cols + x) * channels,
        result = Array.from(resultMat.data32F.slice(base, base + channels));
      resultMode = nextResultMode;
      ids.cursorPosition.textContent = `x : ${x} · y : ${y}`;
      ids.cursorOriginal.textContent = pixelText(source);
      ids.cursorResult.textContent = pixelText(result);
      ids.cursorDifference.textContent = differenceText(source, result);
    },
    clearCursor() {
      ids.cursorPosition.textContent =
        ids.cursorOriginal.textContent =
        ids.cursorResult.textContent =
        ids.cursorDifference.textContent =
          "—";
    },
  };
}
