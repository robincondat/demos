import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectColorRepresentatives, cloudTrace, cloudLayout, MAX_CLOUD_POINTS } from '../scripts/clouds.js';

test('Le recensement conserve chaque couleur distincte, même rare, une seule fois', () => {
  assert.equal(MAX_CLOUD_POINTS, 50000);
  const rgba = new Uint8ClampedArray(100001 * 4);
  for (let i = 0; i < rgba.length; i += 4) { rgba[i] = 255; rgba[i + 3] = 255; }
  rgba.set([0, 0, 255, 255], 400000);
  const selected = selectColorRepresentatives(rgba);
  assert.equal(selected.bits, 8); assert.equal(selected.indices.length, 2);
  assert.deepEqual([...selected.occurrences], [1, 100000]);
  assert.deepEqual([...selected.indices], [100000, 0]);
  assert.equal(selectColorRepresentatives(new Uint8ClampedArray()).indices.length, 0);
});

test('La vue de dessus utilise un cercle et des axes de même échelle', () => {
  const rgba = Uint8ClampedArray.of(255, 0, 0, 255, 0, 50, 0, 255);
  const trace = cloudTrace(rgba, Uint32Array.of(0, 1), 'hsv-top');
  assert.equal(trace.type, 'scattergl'); assert.equal(trace.z, undefined);
  assert.deepEqual([...trace.x], [1, 0]); assert.deepEqual([...trace.y], [0, 0]);
  assert.equal(trace.marker.color[1], 'rgb(0,50,0)');
  const layout = cloudLayout('hsv-top', 'image');
  assert.equal(layout.yaxis.scaleanchor, 'x'); assert.equal(layout.yaxis.scaleratio, 1);
  assert.equal(layout.shapes[0].type, 'circle'); assert.equal(layout.shapes[0].x0, -1);
});

test('Au-delà du plafond, les cellules gardent des couleurs réelles sans doublons', () => {
  const rgba = new Uint8ClampedArray(100000 * 4);
  for (let i = 0; i < 100000; i++) rgba.set([i >> 16, (i >> 8) & 255, i & 255, 255], i * 4);
  const a = selectColorRepresentatives(rgba), b = selectColorRepresentatives(rgba);
  assert.deepEqual(a.indices, b.indices); assert(a.bits < 8); assert(a.indices.length <= 50000);
  assert.equal([...a.occurrences].reduce((sum, n) => sum + n, 0), 100000);
  const colors = [...a.indices].map(i => [...rgba.slice(i * 4, i * 4 + 3)].join(','));
  assert.equal(new Set(colors).size, colors.length);
  const rgb = cloudTrace(rgba, a.indices, 'rgb'), hsv = cloudTrace(rgba, a.indices, 'hsv');
  assert.deepEqual(rgb.marker.color, hsv.marker.color); assert.equal(rgb.marker.size, 2); assert.equal(hsv.marker.size, 2);
});

test('Le représentant est proche de la moyenne mais appartient bien à l’image', () => {
  const rgba = Uint8ClampedArray.of(0, 0, 0, 255, 100, 100, 100, 255, 255, 255, 255, 255);
  const selected = selectColorRepresentatives(rgba, 1);
  assert.deepEqual([...selected.indices], [1]); assert.deepEqual([...selected.occurrences], [3]);
});

test('Coordonnées RGB et couleurs suivent les pixels tirés', () => {
  const rgba = Uint8ClampedArray.of(255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255);
  const indices = Uint32Array.of(0, 2), trace = cloudTrace(rgba, indices, 'rgb');
  assert.deepEqual([...trace.x], [255, 0]); assert.deepEqual([...trace.y], [0, 0]); assert.deepEqual([...trace.z], [0, 255]);
  assert.deepEqual(trace.marker.color, ['rgb(255,0,0)', 'rgb(0,0,255)']); assert.equal(trace.customdata, indices);
});

test('Le nuage HSV forme le cône V·S avec H en degrés, sans changer les couleurs', () => {
  const rgba = Uint8ClampedArray.of(255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 128, 128, 128, 255, 0, 0, 0, 255);
  const trace = cloudTrace(rgba, Uint32Array.of(0, 1, 2, 3, 4), 'hsv');
  assert.equal(trace.x[0], 1); assert.equal(trace.y[0], 0); assert.equal(trace.z[0], 1);
  assert(Math.abs(trace.x[1] + 0.5) < 1e-6); assert(Math.abs(trace.y[1] - Math.sqrt(3) / 2) < 1e-6);
  assert(Math.abs(trace.x[2] + 0.5) < 1e-6); assert(Math.abs(trace.y[2] + Math.sqrt(3) / 2) < 1e-6);
  assert.equal(trace.x[3], 0); assert.equal(trace.y[3], 0); assert(Math.abs(trace.z[3] - 128 / 255) < 1e-6);
  assert.equal(trace.z[4], 0); assert.equal(trace.marker.color[1], 'rgb(0,255,0)');
  const scene = cloudLayout('hsv', 'source').scene;
  assert.deepEqual(scene.xaxis.range, [-1, 1]); assert.deepEqual(scene.zaxis.range, [0, 1]); assert.equal(scene.aspectmode, 'cube');
});
