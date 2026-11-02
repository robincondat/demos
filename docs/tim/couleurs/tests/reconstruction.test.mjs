import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduceArea, enlargeLinear, reconstructChannels, reconstructionView } from '../scripts/reconstruction.js';

test('La réduction moyenne les blocs 2×2 et gère les dimensions impaires', () => {
  assert.deepEqual([...reduceArea(Uint8Array.of(0, 20, 40, 60), 2, 2).data], [30]);
  const reduced = reduceArea(new Uint8Array(15).fill(70), 5, 3);
  assert.equal(reduced.width, 3); assert.equal(reduced.height, 2); assert(reduced.data.every(value => value === 70));
  assert.equal(reduceArea(Uint8Array.of(200), 1, 1).data[0], 200);
});

test('La reconstruction bilinéaire retrouve la taille et conserve une image uniforme', () => {
  const out = enlargeLinear({ data: Uint8Array.of(0, 100), width: 2, height: 1 }, 4, 1);
  assert.deepEqual([...out], [0, 25, 75, 100]);
  assert.deepEqual([...enlargeLinear({ data: Uint8Array.of(50), width: 1, height: 1 }, 2, 2)], [50, 50, 50, 50]);
});

test('La réduction Cb/Cr conserve exactement Y', () => {
  const ycbcr = Uint8Array.of(0, 0, 0, 80, 255, 255, 160, 0, 255, 255, 255, 0);
  const out = reconstructChannels(ycbcr, 2, 2, [1, 2]);
  assert.deepEqual([out[0], out[3], out[6], out[9]], [0, 80, 160, 255]);
  assert.deepEqual([...ycbcr], [0, 0, 0, 80, 255, 255, 160, 0, 255, 255, 255, 0]);
});

test('Les deux vues retournent une image RGB aux dimensions originales', () => {
  const rgba = Uint8ClampedArray.of(255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255);
  for (const mode of ['reduced-rgb', 'reduced-chroma']) {
    const view = reconstructionView(rgba, 2, 2, mode);
    assert.equal(view.data.length, 12); assert.equal(view.channels, 3); assert.equal(view.max, 255);
  }
  assert(reconstructionView(rgba, 2, 2, 'reduced-rgb').data.every(value => value === 128));
  assert.throws(() => reconstructionView(rgba, 2, 2, 'invalid'));
});
