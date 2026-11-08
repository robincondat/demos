import { renderHistogram as drawHistogram } from "../../shared/scripts/histogram-view.js?v=20261106-histcurves";
export function renderHistogram(canvas, histogram, mode) {
  drawHistogram(canvas, histogram, mode, { compact: false });
}
const palette = ["#e34b5f", "#20a56b", "#2384bd"];
function axes(canvas, peak, label, verticalLabel) {
  const ratio = globalThis.devicePixelRatio || 1;
  const width = Math.max(220, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(180, Math.round(canvas.clientHeight * ratio));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const left = 70 * ratio,
    top = 12 * ratio,
    right = width - 12 * ratio,
    bottom = height - 34 * ratio;
  const x = (value) => left + ((right - left) * value) / 255;
  const y = (value) => bottom - ((bottom - top) * value) / peak;
  ctx.clearRect(0, 0, width, height);
  ctx.font = `${10 * ratio}px system-ui`;
  for (let i = 0; i <= 4; i++) {
    const value = Math.round((i * 255) / 4),
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
  ctx.fillText(label, (left + right) / 2, height - 3 * ratio);
  ctx.save();
  ctx.translate(12 * ratio, (top + bottom) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(verticalLabel, 0, 0);
  ctx.restore();
  return { ctx, x, y, ratio };
}

export function renderLUT(canvas, luts) {
  const { ctx, x, y, ratio } = axes(canvas, 255, "Entrée (0–255)", "Sortie");
  ctx.setLineDash([4 * ratio, 4 * ratio]);
  ctx.strokeStyle = "#b6c1cd";
  ctx.beginPath();
  ctx.moveTo(x(0), y(0));
  ctx.lineTo(x(255), y(255));
  ctx.stroke();
  ctx.setLineDash([]);
  luts.forEach((lut, c) => {
    ctx.strokeStyle = luts.length === 1 ? "#168665" : palette[c];
    ctx.lineWidth = 2 * ratio;
    ctx.beginPath();
    lut.forEach((value, i) => {
      if (i === 0) ctx.moveTo(x(i), y(value));
      else ctx.lineTo(x(i), y(value));
    });
    ctx.stroke();
  });
}
