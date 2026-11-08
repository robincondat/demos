import { test } from "node:test";
import assert from "node:assert/strict";
import { createImage } from "../compute/image.js";
import { thresholdLUT, thresholdValues, binarizeMat } from "../compute/threshold.js";
import { createLUT, transformImage } from "../compute/lut.js";

test("Histogram and morphology thresholding use the same LUT, including inversion and endpoints", () => {
  const source = Uint8Array.from({ length: 256 }, (_, i) => i);
  for (const cutoff of [0, 1, 127, 254, 255]) {
    const lut = createLUT("threshold", cutoff);
    assert.deepEqual(lut, thresholdLUT(cutoff));
    const normal = thresholdValues(source, cutoff),
      inverse = thresholdValues(source, cutoff, { invert: true });
    for (let i = 0; i < 256; i++) {
      assert.equal(normal[i], i > cutoff ? 255 : 0);
      assert.equal(normal[i] + inverse[i], 255);
    }
  }
  assert.throws(() => thresholdLUT(256));
  assert.throws(() => thresholdValues(new Float32Array([300]), 128));
});

test("Image LUT transformations preserve geometry and source pixels", () => {
  const image = createImage({
    width: 2,
    height: 1,
    channels: 3,
    data: new Uint8Array([0, 64, 128, 192, 255, 100]),
    range: { min: 0, max: 255 },
  });
  const before = [...image.data];
  const result = transformImage(image, { method: "stretch", a: 64, b: 192 });
  assert.equal(result.image.width, 2);
  assert.equal(result.image.height, 1);
  assert.equal(result.image.channels, 3);
  assert.notEqual(result.image.data, image.data);
  assert.deepEqual([...image.data], before);
  assert.deepEqual(result.image.range, { min: 0, max: 255 });
  assert.throws(() =>
    transformImage(createImage({ ...image, data: Float32Array.from(image.data) }), {
      method: "threshold",
      a: 128,
    }),
  );
});

test("The native binarization adapter is independent of Canvas and runtime globals", () => {
  const runtime = {
    CV_8U: 0,
    CV_8UC1: 0,
    matFromArray: (rows, cols, type, data) => ({ rows, cols, type, data }),
  };
  const source = {
    rows: 1,
    cols: 3,
    channels: () => 1,
    depth: () => 0,
    data: Uint8Array.of(0, 128, 255),
  };
  const output = binarizeMat(source, 128, { invert: true }, runtime);
  assert.deepEqual([...output.data], [255, 255, 0]);
  assert.deepEqual([...source.data], [0, 128, 255]);
  assert.throws(() => binarizeMat({ ...source, channels: () => 3 }, 128, {}, runtime));
});
