const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const format = (value) => {
  const absolute = Math.abs(value);
  if (absolute && (absolute >= 1e4 || absolute < 1e-3)) return value.toExponential(3);
  return Number(value.toPrecision(5)).toString();
};

/**
 * Réduit une série dense sans perdre ses extrema locaux.
 *
 * Un échantillonnage régulier par pas peut entièrement sauter une raie FFT
 * étroite. Chaque colonne conserve donc les indices de son minimum et de son
 * maximum, dans leur ordre temporel/fréquentiel d'origine.
 */
export function peakPreservingIndices(values, start, end, targetBuckets) {
  const count = Math.max(0, end - start),
    buckets = Math.max(1, Math.floor(targetBuckets));
  if (count <= buckets * 2)
    return Array.from({ length: count }, (_, index) => start + index);
  const indices = [];
  for (let bucket = 0; bucket < buckets; bucket++) {
    const from = start + Math.floor((bucket * count) / buckets),
      to = start + Math.floor(((bucket + 1) * count) / buckets);
    if (from >= to) continue;
    let minIndex = from,
      maxIndex = from;
    for (let index = from + 1; index < to; index++) {
      if (values[index] < values[minIndex]) minIndex = index;
      if (values[index] > values[maxIndex]) maxIndex = index;
    }
    const first = Math.min(minIndex, maxIndex),
      second = Math.max(minIndex, maxIndex);
    if (indices.at(-1) !== first) indices.push(first);
    if (second !== first) indices.push(second);
  }
  return indices;
}

export function createChart({ stage, canvas, tooltip, xLabel, yLabel }) {
  let series = [], fullMin = 0, fullMax = 1, viewMin = 0, viewMax = 1, drag = null;
  const margins = { left: 62, right: 18, top: 18, bottom: 42 };
  function setData(nextSeries) {
    series = nextSeries.filter(({ x, y }) => x.length && y.length);
    if (series.length) {
      fullMin = Math.min(...series.map(({ x }) => x[0])); fullMax = Math.max(...series.map(({ x }) => x[x.length - 1]));
      if (fullMin === fullMax) fullMax = fullMin + 1;
    }
    fit();
  }
  function visibleYRange() {
    let min = Infinity, max = -Infinity;
    for (const item of series) for (let i = lowerBound(item.x, viewMin); i < item.x.length && item.x[i] <= viewMax; i++) { min = Math.min(min, item.y[i]); max = Math.max(max, item.y[i]); }
    if (!Number.isFinite(min)) return [-1, 1];
    if (min === max) { const padding = Math.abs(min) * .1 || 1; return [min - padding, max + padding]; }
    const padding = (max - min) * .08; return [min - padding, max + padding];
  }
  function lowerBound(values, target) { let low = 0, high = values.length; while (low < high) { const middle = (low + high) >> 1; if (values[middle] < target) low = middle + 1; else high = middle; } return low; }
  function resize() {
    const ratio = devicePixelRatio || 1, width = Math.max(320, stage.clientWidth), height = Math.max(210, stage.clientHeight);
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); canvas.style.width = `${width}px`; canvas.style.height = `${height}px`; }
    return { ratio, width, height };
  }
  function render() {
    const { ratio, width, height } = resize(), context = canvas.getContext("2d"); context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
    const plotWidth = width - margins.left - margins.right, plotHeight = height - margins.top - margins.bottom, [yMin, yMax] = visibleYRange();
    context.fillStyle = "#fff"; context.fillRect(0, 0, width, height); context.font = "11px Inter, system-ui, sans-serif"; context.lineWidth = 1;
    for (let index = 0; index <= 5; index++) {
      const x = margins.left + (plotWidth * index) / 5, xValue = viewMin + ((viewMax - viewMin) * index) / 5;
      context.strokeStyle = "#e4eaf1"; context.beginPath(); context.moveTo(x, margins.top); context.lineTo(x, margins.top + plotHeight); context.stroke(); context.fillStyle = "#65758c"; context.textAlign = "center"; context.fillText(format(xValue), x, height - 19);
      const y = margins.top + (plotHeight * index) / 5, yValue = yMax - ((yMax - yMin) * index) / 5;
      context.strokeStyle = "#e4eaf1"; context.beginPath(); context.moveTo(margins.left, y); context.lineTo(width - margins.right, y); context.stroke(); context.textAlign = "right"; context.fillText(format(yValue), margins.left - 8, y + 4);
    }
    const mapX = (value) => margins.left + ((value - viewMin) / (viewMax - viewMin)) * plotWidth, mapY = (value) => margins.top + ((yMax - value) / (yMax - yMin)) * plotHeight;
    context.save(); context.beginPath(); context.rect(margins.left, margins.top, plotWidth, plotHeight); context.clip();
    for (const item of series) {
      const start = Math.max(0, lowerBound(item.x, viewMin) - 1),
        end = Math.min(item.x.length, lowerBound(item.x, viewMax) + 1),
        visibleIndices = peakPreservingIndices(item.y, start, end, plotWidth);
      context.beginPath(); context.strokeStyle = item.color; context.lineWidth = item.width || 1.5;
      visibleIndices.forEach((index, position) => {
        const x = mapX(item.x[index]), y = mapY(item.y[index]);
        if (position === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    }
    context.restore(); context.strokeStyle = "#aebac9"; context.strokeRect(margins.left + .5, margins.top + .5, plotWidth, plotHeight);
    context.fillStyle = "#43536a"; context.textAlign = "center"; context.fillText(xLabel, margins.left + plotWidth / 2, height - 3); context.save(); context.translate(13, margins.top + plotHeight / 2); context.rotate(-Math.PI / 2); context.fillText(yLabel(), 0, 0); context.restore();
  }
  function fit() { viewMin = fullMin; viewMax = fullMax; tooltip.hidden = true; render(); }
  function pointerX(event) { const rect = stage.getBoundingClientRect(), plotWidth = rect.width - margins.left - margins.right; return viewMin + clamp((event.clientX - rect.left - margins.left) / plotWidth, 0, 1) * (viewMax - viewMin); }
  stage.addEventListener("wheel", (event) => { if (!series.length) return; event.preventDefault(); const anchor = pointerX(event), factor = Math.exp(event.deltaY * .0015), span = clamp((viewMax - viewMin) * factor, (fullMax - fullMin) / 1000, fullMax - fullMin); viewMin = clamp(anchor - ((anchor - viewMin) / (viewMax - viewMin)) * span, fullMin, fullMax - span); viewMax = viewMin + span; render(); }, { passive: false });
  stage.addEventListener("pointerdown", (event) => { if (event.button !== 0 || !series.length) return; stage.setPointerCapture(event.pointerId); drag = { x: event.clientX, min: viewMin, max: viewMax }; stage.classList.add("dragging"); });
  stage.addEventListener("pointermove", (event) => {
    if (drag) { const plotWidth = stage.clientWidth - margins.left - margins.right, shift = ((event.clientX - drag.x) / plotWidth) * (drag.max - drag.min), span = drag.max - drag.min; viewMin = clamp(drag.min - shift, fullMin, fullMax - span); viewMax = viewMin + span; tooltip.hidden = true; render(); return; }
    if (!series.length) return; const value = pointerX(event), rect = stage.getBoundingClientRect(), rows = series.map((item) => { const index = clamp(lowerBound(item.x, value), 0, item.x.length - 1), previous = Math.max(0, index - 1), nearest = Math.abs(item.x[previous] - value) < Math.abs(item.x[index] - value) ? previous : index; return { label: item.label, color: item.color, x: item.x[nearest], y: item.y[nearest] }; });
    tooltip.innerHTML = `<strong>${xLabel} : ${format(rows[0].x)}</strong>${rows.map((row) => `<span><i style="background:${row.color}"></i>${row.label} : ${format(row.y)}</span>`).join("")}`; tooltip.hidden = false; tooltip.style.left = `${clamp(event.clientX - rect.left + 14, 8, rect.width - tooltip.offsetWidth - 8)}px`; tooltip.style.top = `${clamp(event.clientY - rect.top + 14, 8, rect.height - tooltip.offsetHeight - 8)}px`;
  });
  const end = () => { drag = null; stage.classList.remove("dragging"); };
  stage.addEventListener("pointerup", end); stage.addEventListener("pointercancel", end); stage.addEventListener("pointerleave", () => { if (!drag) tooltip.hidden = true; }); stage.addEventListener("dblclick", fit); new ResizeObserver(render).observe(stage);
  return { setData, render, fit };
}
