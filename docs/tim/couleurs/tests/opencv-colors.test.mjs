import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OPENCV_SPACES, convertWithOpenCV, loadColorRuntime } from '../scripts/opencv-colors.js';
import { SPACES, convertedView, convertRGB } from '../scripts/colors.js';

test('Lab, HLS et XYZ disposent des quatre vues et des codes OpenCV attendus', () => {
  assert.deepEqual(OPENCV_SPACES, { lab: 'COLOR_RGB2Lab', hls: 'COLOR_RGB2HLS', xyz: 'COLOR_RGB2XYZ' });
  for (const space of Object.keys(OPENCV_SPACES)) {
    assert.equal(SPACES[space].views.length, 4);
    assert.throws(() => convertRGB(Uint8ClampedArray.of(0, 0, 0, 255), space), /OpenCV/);
    const image = { space, channels: 3, data: Uint8Array.of(60, 128, 255), labels: SPACES[space].labels };
    assert.equal(convertedView(image, 'stack').data, image.data);
    assert.equal(convertedView(image, '0').max, space === 'hls' ? 180 : 255);
    assert.equal(convertedView(image, '1').max, 255);
  }
});

test('La conversion utilise RGBA→RGB puis le bon code et copie avant libération', () => {
  for (const space of Object.keys(OPENCV_SPACES)) {
    const mats = [], codes = [];
    class Mat {
      constructor(data = []) { this.data = Uint8Array.from(data); this.deleted = false; mats.push(this); }
      delete() { this.deleted = true; this.data.fill(0); }
    }
    const runtime = { Mat, CV_8UC4: 4, COLOR_RGBA2RGB: 1, COLOR_RGB2Lab: 44, COLOR_RGB2HLS: 53, COLOR_RGB2XYZ: 33,
      matFromArray(h, w, type, data) { assert.equal(h, 1); assert.equal(w, 1); assert.equal(type, 4); return new Mat(data); },
      cvtColor(input, output, code) { codes.push(code); output.data = Uint8Array.of(10, 20, 30); } };
    const result = convertWithOpenCV({ width: 1, height: 1, data: Uint8ClampedArray.of(255, 0, 0, 255) }, space, runtime);
    assert.deepEqual(codes, [1, runtime[OPENCV_SPACES[space]]]);
    assert.deepEqual([...result.data], [10, 20, 30]); assert(mats.every(mat => mat.deleted));
  }
});

test('Les matrices sont aussi libérées si OpenCV échoue', () => {
  let deleted = 0;
  class Mat { delete() { deleted++; } }
  const runtime = { Mat, COLOR_RGB2Lab: 44, matFromArray: () => new Mat(), cvtColor() { throw Error('conversion failed'); } };
  assert.throws(() => convertWithOpenCV({ width: 1, height: 1, data: [] }, 'lab', runtime));
  assert.equal(deleted, 3);
});

test('Un moteur Emscripten déjà prêt est renvoyé sans assimiler son thenable', async () => {
  const previous = globalThis.cv;
  const runtime = { Mat() {}, then() { throw Error('Assimilation interdite'); } };
  try { globalThis.cv = runtime; assert.equal((await loadColorRuntime()).runtime, runtime); }
  finally { globalThis.cv = previous; }
});
