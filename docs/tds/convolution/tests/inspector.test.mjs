import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reflectedTimes, convolutionProducts, signalYRange, createConvolutionInspector } from '../scripts/convolution-inspector.js';

test('Un temps survolé sélectionne le résultat le plus proche et déplace le signal B', async () => {
  globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
  globalThis.cancelAnimationFrame = clearTimeout;
  const panel = new EventTarget(); panel.open = true;
  const chart = { setData(series) { this.series = series; } };
  const stage = { closest: () => panel, querySelector: () => ({ hidden: true }) };
  const inspector = createConvolutionInspector({ chart, stage });
  inspector.setResult({ signals: [{ slot: 'input', times: [0, 1], values: [1, 2] }, { slot: 'impulse', times: [0, 1], values: [3, 4] }], convolution: { times: [0, 1, 2], values: [3, 10, 8] } }, 1);
  inspector.hoverTime(1.8);
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.deepEqual([...chart.series[2].x], [1, 2]);
  assert.deepEqual([...chart.series[0].y], [0, 8]);
  inspector.clear();
});

test('L’échelle suit les deux signaux sans multiplier leurs amplitudes', () => {
  assert.deepEqual(signalYRange([0, 10], [0, 20]), [0, 21.6]);
  assert.deepEqual(signalYRange([-2, 0], [1, 3]), [-2.4, 3.4]);
  assert.deepEqual(signalYRange([0], [0]), [-1, 1]);
});

test('L’aire colorée représente le produit signé au bon décalage', () => {
  const buffer = new Float64Array(3);
  assert.deepEqual([...convolutionProducts([1, -2, 3], [2, -1], 1, buffer)], [-1, -4, 0]);
  assert.deepEqual([...convolutionProducts([1, -2, 3], [2, -1], 2, buffer)], [0, 2, 6]);
  assert.deepEqual([...convolutionProducts([1, -2, 3], [2, -1], 0, buffer)], [2, 0, 0]);
});

test('La réponse est retournée et décalée sur un axe croissant, même avec une origine non nulle', () => {
  assert.deepEqual([...reflectedTimes([-0.5, -0.25, 0], 0.75)], [0.75, 1, 1.25]);
  assert.deepEqual([...reflectedTimes([0.25, 0.5], -0.5)], [-1, -0.75]);
});

test('Le tampon est réutilisé sans altérer les temps d’origine', () => {
  const times = [0, 0.5, 1], buffer = new Float64Array(3);
  assert.equal(reflectedTimes(times, 1, buffer), buffer);
  assert.deepEqual([...buffer], [0, 0.5, 1]);
  reflectedTimes(times, 2, buffer);
  assert.deepEqual([...buffer], [1, 1.5, 2]);
  assert.deepEqual(times, [0, 0.5, 1]);
});
