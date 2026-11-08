import { createSlidingInspector } from "../../shared/scripts/sliding-inspector.js?v=20261106-tds3";

export function shiftedTimes(times, lag, target = new Float64Array(times.length)) {
  for (let j = 0; j < times.length; j++) target[j] = times[j] + lag;
  return target;
}

export function correlationProducts(a, b, lag, target = new Float64Array(a.length)) {
  target.fill(0);
  for (let k = Math.max(0, lag); k < Math.min(a.length, b.length + lag); k++) {
    target[k] = a[k] * b[k - lag];
  }
  return target;
}

export function createCorrelationInspector(options) {
  return createSlidingInspector({
    ...options,
    resultKey: "correlation",
    errorKey: "correlationError",
    emptyMessage: "Définissez les deux signaux pour visualiser la corrélation.",
    shiftTimes: shiftedTimes,
    shiftValues: (values) => values,
    product: correlationProducts,
    sampleIndex: (lag, a, b, rate) => Math.round((lag - a.times[0] + b.times[0]) * rate),
    productLabel: "A(τ) B(τ − retard)",
    signalLabel: "B(τ − retard)",
  });
}
