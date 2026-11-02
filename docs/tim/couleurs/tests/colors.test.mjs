import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertRGB, convertedView, originalView, displayPixels } from '../scripts/colors.js';

const rgba = pixels => Uint8ClampedArray.from(pixels.flatMap(pixel => [...pixel, 255]));

test('Les composantes grises RGB et CMYK conservent les valeurs natives sans inversion', () => {
  const input = rgba([[128, 64, 32], [0, 0, 0]]);
  for (const [view, expected] of [['r-gray', [128, 0]], ['g-gray', [64, 0]], ['b-gray', [32, 0]]]) {
    const result = originalView(input, view); assert.equal(result.channels, 1); assert.deepEqual([...result.data], expected);
  }
  const converted = convertRGB(input, 'cmyk');
  for (const [view, expected] of [['c-gray', [0, 0]], ['m-gray', [64, 0]], ['y-gray', [96, 0]], ['k-gray', [127, 255]]]) {
    const result = convertedView(converted, view); assert.equal(result.channels, 1); assert.deepEqual([...result.data], expected);
  }
  assert.equal(convertedView(converted, 'k').data[3], 0);
});

test('Les vues R/G/B mettent les deux autres canaux à zéro', () => {
  const input = rgba([[12, 34, 56], [255, 128, 64]]);
  assert.deepEqual([...originalView(input, 'r').data], [12, 0, 0, 255, 0, 0]);
  assert.deepEqual([...originalView(input, 'g').data], [0, 34, 0, 0, 128, 0]);
  assert.deepEqual([...originalView(input, 'b').data], [0, 0, 56, 0, 0, 64]);
});

test('CMYK : convention du TP, encres sur fond blanc et reconstruction exacte', () => {
  const input = rgba([[255, 0, 0], [0, 0, 0], [128, 64, 32], [255, 255, 255]]);
  const converted = convertRGB(input, 'cmyk');
  assert.deepEqual([...converted.data], [0, 255, 255, 0, 0, 0, 0, 255, 0, 64, 96, 127, 0, 0, 0, 0]);
  assert.deepEqual([...convertedView(converted, 'rgb').data], [...originalView(input).data]);
  assert.deepEqual([...convertedView(converted, 'c').data.slice(0, 3)], [255, 255, 255]);
  assert.deepEqual([...convertedView(converted, 'm').data.slice(0, 3)], [255, 0, 255]);
  assert.deepEqual([...convertedView(converted, 'k').data.slice(3, 6)], [0, 0, 0]);
});

test('YCbCr : ordre Y/Cb/Cr, troncature uint8 et canaux empilés sans reconversion', () => {
  const converted = convertRGB(rgba([[255, 0, 0], [0, 0, 0], [255, 255, 255]]), 'ycbcr');
  assert.deepEqual([...converted.data.slice(0, 6)], [76, 84, 254, 0, 127, 127]);
  assert.equal(convertedView(converted, 'stack').data, converted.data);
  assert.deepEqual([...convertedView(converted, '1').data], [84, 127, 127]);
});

test('HSV : H/2, achromatiques, gris H affiché sur [0,180]', () => {
  const converted = convertRGB(rgba([[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 0, 0], [128, 128, 128]]), 'hsv');
  assert.deepEqual([...converted.data], [0, 255, 255, 60, 255, 255, 120, 255, 255, 30, 255, 255, 0, 0, 0, 0, 0, 128]);
  const view = convertedView(converted, '0');
  assert.equal(view.max, 180);
  assert.deepEqual([...displayPixels(view, { min: 0, max: 180 }).rgba.slice(4, 7)], [85, 85, 85]);
});

test('Plages invalides, image uniforme et absence de mutation des données', () => {
  const view = { data: Uint8Array.from([42, 42]), channels: 1 };
  assert.throws(() => displayPixels(view, { min: 100, max: 20 }));
  const result = displayPixels(view, { auto: true });
  assert.deepEqual([...result.rgba], [0, 0, 0, 255, 0, 0, 0, 255]);
  assert.deepEqual([...view.data], [42, 42]);
});
