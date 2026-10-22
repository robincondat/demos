export function reflectedTimes(times, time, target = new Float64Array(times.length)) {
  for (let j = 0; j < times.length; j++) target[j] = time - times[times.length - 1 - j];
  return target;
}

export function convolutionProducts(x, h, n, target = new Float64Array(x.length)) {
  target.fill(0);
  for (let k = Math.max(0, n - h.length + 1); k <= Math.min(x.length - 1, n); k++) target[k] = x[k] * h[n - k];
  return target;
}

export function signalYRange(a, b) {
  let min = 0, max = 0;
  for (const values of [a, b]) for (const value of values) { min = Math.min(min, value); max = Math.max(max, value); }
  if (min === max) return [-1, 1];
  const padding = (max - min) * 0.08;
  return [min < 0 ? min - padding : 0, max > 0 ? max + padding : 0];
}

export function createConvolutionInspector({ chart, stage }) {
  const panel = stage.closest('details'), empty = stage.querySelector('.chart-empty');
  let result = null, selected = 0, frame = null, pending = 0, flippedTimes, flippedValues, products, sampleRate, domain, yRange, first = true;
  const interactive = () => panel.open;
  function cancel() { if (frame !== null) cancelAnimationFrame(frame); frame = null; }
  function draw() {
    const h = result?.signals.find(item => item.slot === 'impulse');
    if (!interactive()) return;
    const x = result?.signals.find(item => item.slot === 'input'), output = result?.convolution;
    empty.hidden = Boolean(x && h && output);
    if (!empty.hidden) { chart.setData([]); empty.textContent = result?.convolutionError || 'Définissez les deux signaux pour visualiser la convolution.'; return; }
    reflectedTimes(h.times, output.times[selected], flippedTimes);
    const n = Math.round((output.times[selected] - x.times[0] - h.times[0]) * sampleRate);
    convolutionProducts(x.values, h.values, n, products);
    chart.setData([
      { x: x.times, y: products, label: 'A(τ) B(t − τ)', color: '#64748b', signedFill: true, samplePeriod: 1 / sampleRate },
      { x: x.times, y: x.values, label: 'A(τ)', color: '#168665', width: 1.8 },
      { x: flippedTimes, y: flippedValues, label: 'B(t − τ)', color: '#e07a2d', width: 1.8 },
    ], { domain, yRange, preserveView: !first });
    first = false;
  }
  panel.addEventListener('toggle', () => { cancel(); if (panel.open) draw(); });
  return {
    hoverTime(time) {
      const times = result?.convolution?.times;
      if (!times?.length) return;
      let low = 0, high = times.length;
      while (low < high) { const middle = (low + high) >> 1; if (times[middle] < time) low = middle + 1; else high = middle; }
      const next = Math.min(low, times.length - 1), previous = Math.max(0, next - 1);
      this.hover(Math.abs(times[previous] - time) < Math.abs(times[next] - time) ? previous : next);
    },
    setDomain(next) { domain = next; first = false; },
    hover(index) {
      if (!result?.convolution) return;
      pending = Math.max(0, Math.min(result.convolution.times.length - 1, index));
      if (pending === selected) { cancel(); return; }
      if (frame === null) frame = requestAnimationFrame(() => { frame = null; selected = pending; if (interactive()) draw(); });
    },
    clear() { cancel(); result = null; flippedTimes = flippedValues = products = null; first = true; chart.setData([]); empty.hidden = false; draw(); },
    setResult(next, rate) {
      cancel(); result = next; first = true;
      const x = next.signals.find(item => item.slot === 'input'), h = next.signals.find(item => item.slot === 'impulse');
      if (x && h && next.convolution) {
        sampleRate = rate; products = new Float64Array(x.values.length);
        selected = Math.floor((next.convolution.times.length - 1) / 2);
        flippedTimes = new Float64Array(h.times.length); flippedValues = Float64Array.from(h.values).reverse();
        domain = [next.convolution.times[0], next.convolution.times[next.convolution.times.length - 1]];
        if (domain[0] === domain[1]) domain[1] += 1 / rate;
        yRange = signalYRange(x.values, h.values);
      }
      draw();
    },
  };
}
