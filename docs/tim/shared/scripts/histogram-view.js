const palette = ["#e34b5f", "#20a56b", "#2384bd", "#52667f"];
const histogramViews = new WeakMap();

function histogramView(canvas) {
  if (histogramViews.has(canvas)) return histogramViews.get(canvas);
  const tooltip = canvas.ownerDocument.createElement("output");
  tooltip.className = "histogram-tooltip";
  tooltip.hidden = true;
  canvas.after(tooltip);
  const state = { tooltip, pointer: null, histogram: null, mode: null };
  histogramViews.set(canvas, state);
  function redraw() {
    renderHistogram(canvas, state.histogram, state.mode, state.options);
  }
  canvas.addEventListener("pointermove", (event) => {
    state.pointer = { x: event.clientX, y: event.clientY };
    redraw();
  });
  for (const type of ["pointerleave", "pointercancel"])
    canvas.addEventListener(type, () => {
      state.pointer = null;
      redraw();
    });
  return state;
}

function axes(canvas, peak, label, verticalLabel, histogram, compact) {
  const ratio = globalThis.devicePixelRatio || 1;
  const width = Math.max(220, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(compact ? 80 : 180, Math.round(canvas.clientHeight * ratio));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const left = (compact ? 48 : 70) * ratio,
    top = 12 * ratio,
    right = width - 12 * ratio,
    bottom = height - (compact ? 24 : 34) * ratio;
  const minimum = histogram.min,
    span = histogram.max - histogram.min || 1;
  const x = (value) => left + ((right - left) * (value - minimum)) / span;
  const y = (value) => bottom - ((bottom - top) * value) / peak;
  ctx.clearRect(0, 0, width, height);
  ctx.font = `${10 * ratio}px system-ui`;
  for (let i = 0; i <= 4; i++) {
    const value = Number((minimum + (i * span) / 4).toPrecision(5)),
      count = (peak * i) / 4;
    ctx.strokeStyle = "#dfe6ee";
    ctx.lineWidth = ratio;
    ctx.beginPath();
    ctx.moveTo(x(value), top);
    ctx.lineTo(x(value), bottom);
    ctx.moveTo(left, y(count));
    ctx.lineTo(right, y(count));
    ctx.stroke();
    ctx.fillStyle = "#65758c";
    ctx.textAlign = "center";
    ctx.fillText(value, x(value), bottom + 16 * ratio);
    ctx.textAlign = "right";
    ctx.fillText(Math.round(count).toLocaleString("fr-FR"), left - 6 * ratio, y(count) + 3 * ratio);
  }
  ctx.fillStyle = "#65758c";
  ctx.textAlign = "center";
  if (!compact) ctx.fillText(label, (left + right) / 2, height - 3 * ratio);
  ctx.save();
  ctx.translate(12 * ratio, (top + bottom) / 2);
  ctx.rotate(-Math.PI / 2);
  if (!compact) ctx.fillText(verticalLabel, 0, 0);
  ctx.restore();
  return { ctx, x, y, ratio };
}

export function renderHistogram(canvas, histogram, mode, options = {}) {
  const compact = options.compact ?? true;
  if (compact) {
    const previous = histogramViews.get(canvas);
    if (previous) {
      previous.pointer = null;
      previous.tooltip.hidden = true;
    }
    const ratio = globalThis.devicePixelRatio || 1;
    const width = Math.max(220, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(100, Math.round(canvas.clientHeight * ratio));
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = "#d8e1ec";
    ctx.lineWidth = ratio;
    ctx.beginPath();
    ctx.moveTo(0, height - 0.5);
    ctx.lineTo(width, height - 0.5);
    ctx.stroke();
    let peak = 1;
    for (const series of histogram.series) for (const count of series) peak = Math.max(peak, count);
    drawCurves(
      ctx,
      histogram,
      mode,
      ratio,
      (index) => (histogram.bins === 1 ? width / 2 : (index / (histogram.bins - 1)) * (width - 1)),
      (count) => height - 2 - (count / peak) * (height - 8),
    );
    return;
  }
  const state = histogramView(canvas);
  state.histogram = histogram;
  state.options = options;
  state.mode = mode;
  let peak = 1;
  for (const series of histogram.series) for (const value of series) peak = Math.max(peak, value);
  peak = Math.ceil(peak / 4) * 4;
  const { ctx, x, y, ratio } = axes(
    canvas,
    peak,
    "Niveau de gris / intensité",
    "Effectif",
    histogram,
    compact,
  );
  const axisMin = histogram.min,
    axisMax = histogram.max === histogram.min ? histogram.min + 1 : histogram.max;
  const binValue = (index) =>
    histogram.exactIntegers
      ? Math.ceil(histogram.min) + index
      : histogram.min + ((index + 0.5) * (histogram.max - histogram.min)) / histogram.bins;
  drawCurves(ctx, histogram, mode, ratio, (index) => x(binValue(index)), y);
  state.tooltip.hidden = true;
  if (!state.pointer) return;
  const rect = canvas.getBoundingClientRect();
  const px = ((state.pointer.x - rect.left) * canvas.width) / rect.width;
  const py = ((state.pointer.y - rect.top) * canvas.height) / rect.height;
  if (px < x(axisMin) || px > x(axisMax) || py < y(peak) || py > y(0)) return;
  const level = axisMin + ((px - x(axisMin)) / (x(axisMax) - x(axisMin))) * (axisMax - axisMin);
  const bin = Math.max(
    0,
    Math.min(
      histogram.bins - 1,
      histogram.exactIntegers
        ? Math.round(level) - Math.ceil(histogram.min)
        : Math.floor(((level - axisMin) / (axisMax - axisMin)) * histogram.bins),
    ),
  );
  ctx.strokeStyle = "#7564c9";
  ctx.lineWidth = ratio;
  ctx.setLineDash([4 * ratio, 4 * ratio]);
  ctx.beginPath();
  ctx.moveTo(x(binValue(bin)), y(0));
  ctx.lineTo(x(binValue(bin)), y(peak));
  ctx.stroke();
  ctx.setLineDash([]);
  const counts = histogram.series.map(
    (series, c) =>
      `${mode === "Grayscale" ? "Effectif" : (histogram.labels || ["R", "V", "B", "A"])[c]} : ${series[bin].toLocaleString("fr-FR")}`,
  );
  state.tooltip.textContent = `Intensité : ${Number(binValue(bin).toPrecision(6))}\n${counts.join("\n")}`;
  state.tooltip.hidden = false;
  const parent = canvas.parentElement.getBoundingClientRect();
  const left = state.pointer.x - parent.left + 12;
  const top = state.pointer.y - parent.top + 12;
  state.tooltip.style.left = `${Math.max(0, Math.min(left, parent.width - state.tooltip.offsetWidth))}px`;
  state.tooltip.style.top = `${Math.max(0, Math.min(top, parent.height - state.tooltip.offsetHeight))}px`;
}

function drawCurves(ctx, histogram, mode, ratio, x, y) {
  histogram.series.forEach((series, channel) => {
    ctx.beginPath();
    ctx.strokeStyle = mode === "Grayscale" ? "#52667f" : palette[channel];
    ctx.lineWidth = Math.max(1.2, ratio);
    ctx.globalAlpha = mode === "Grayscale" ? 1 : 0.78;
    for (let index = 0; index < series.length; index++) {
      if (index === 0) ctx.moveTo(x(index), y(series[index]));
      else ctx.lineTo(x(index), y(series[index]));
    }
    // A single occupied bin still needs a visible mark rather than a zero-length path.
    if (series.length === 1) ctx.lineTo(x(0) + ratio, y(series[0]));
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
}
