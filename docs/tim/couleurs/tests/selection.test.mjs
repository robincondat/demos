import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_HSV, selectHSV, selectionView } from "../../shared/compute/hsv-selection.js?v=20261106-science1";
import { selectColorRepresentatives, cloudTrace } from '../scripts/clouds.js';

test('Seuils inclusifs H/S/V et intervalle H traversant le rouge du TP', () => {
  const hsv = Uint8Array.of(0, 100, 100, 10, 40, 40, 130, 255, 255, 180, 40, 40, 60, 255, 255, 0, 39, 200, 0, 200, 39);
  const result = selectHSV(hsv, { ...ALL_HSV, hMin: 130, hMax: 10, sMin: 40, vMin: 40 });
  assert.deepEqual([...result.mask], [1, 1, 1, 1, 0, 0, 0]); assert.equal(result.count, 4);
  assert.equal(selectHSV(hsv, ALL_HSV).count, 7);
});

test('Les vues de sélection gardent les pixels RGB ou produisent le masque binaire', () => {
  const rgba = Uint8ClampedArray.of(255, 0, 0, 255, 0, 255, 0, 255);
  const mask = Uint8Array.of(1, 0);
  assert.deepEqual([...selectionView(rgba, mask).data], [255, 0, 0, 0, 0, 0]);
  assert.deepEqual([...selectionView(rgba, mask, true).data], [255, 255, 255, 0, 0, 0]);
  assert.equal(rgba[5], 255);
});

test('Le masque filtre avant regroupement et toutes les vues utilisent les couleurs retenues', () => {
  const rgba = Uint8ClampedArray.of(255, 0, 0, 255, 0, 255, 0, 255, 254, 0, 0, 255);
  const chosen = selectColorRepresentatives(rgba, 1, Uint8Array.of(0, 0, 1));
  assert.deepEqual([...chosen.indices], [2]);
  for (const mode of ['rgb', 'hsv', 'hsv-top']) {
    const trace = cloudTrace(rgba, chosen.indices, mode);
    assert.deepEqual(trace.marker.color, ['rgb(254,0,0)']);
    assert.equal(trace.marker.size, mode === 'hsv-top' ? 4 : 2);
  }
  assert.equal(selectColorRepresentatives(rgba, 1, Uint8Array.of(0, 0, 0)).indices.length, 0);
  // Le chemin quantifié doit lui aussi ignorer les couleurs rejetées.
  const quantized = selectColorRepresentatives(rgba, 1, Uint8Array.of(1, 0, 1));
  assert.equal(quantized.occurrences[0], 2); assert.notEqual(quantized.indices[0], 1);
});

test('Seuils invalides et sélection vide sont gérés explicitement', () => {
  const hsv = Uint8Array.of(0, 255, 255);
  assert.throws(() => selectHSV(hsv, { ...ALL_HSV, sMin: 200, sMax: 100 }));
  assert.throws(() => selectHSV(hsv, { ...ALL_HSV, hMin: NaN }));
  assert.throws(() => selectHSV(hsv, { ...ALL_HSV, hMax: 360 }));
  assert.equal(selectHSV(hsv, { ...ALL_HSV, hMin: 20, hMax: 40 }).count, 0);
});
