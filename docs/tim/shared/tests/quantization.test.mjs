import { test } from "node:test";
import assert from "node:assert/strict";
import { createImage } from "../compute/image.js";
import { quantizeUniform } from "../compute/quantization.js";
import { sampledSize, subsampleImage } from "../compute/sampling.js";
import { quantizeColors } from "../compute/color-quantization.js";
const gray = (data) =>
  createImage({ width: data.length, height: 1, channels: 1, data: new Uint8Array(data) });

test("A single RGB pixel keeps its exact color with K-means, without calling native clustering", async () => {
  const image = createImage({
    width: 1,
    height: 1,
    channels: 3,
    data: new Uint8Array([0, 17, 34]),
  });
  const result = await quantizeColors(image, { colors: 256 }, {});
  assert.deepEqual([...result.image.data], [0, 17, 34]);
  assert.deepEqual(result.palette, [[0, 17, 34]]);
  assert.notEqual(result.image.data, image.data);
});
test("Uniform quantization retains both endpoints, including exactly two levels", () => {
  assert.deepEqual(
    [...quantizeUniform(gray([0, 64, 127, 128, 200, 255]), { levels: 2 }).image.data],
    [0, 0, 0, 0, 0, 255],
  );
  const source = gray(Array.from({ length: 256 }, (_, i) => i));
  for (const levels of [2, 4, 8, 16, 32, 64, 128, 256]) {
    const out = quantizeUniform(source, { levels }).image;
    assert.equal(new Set(out.data).size, levels);
    assert.equal(out.data[0], 0);
    assert.equal(out.data[255], 255);
  }
  assert.deepEqual(
    [...source.data],
    Array.from({ length: 256 }, (_, i) => i),
  );
});
test("Image range quantization handles constant images and RGB bounds independently", () => {
  assert.deepEqual(
    [...quantizeUniform(gray([42, 42]), { levels: 2, range: "image" }).image.data],
    [42, 42],
  );
  assert.deepEqual(
    [...quantizeUniform(gray([20, 30, 40]), { levels: 2, range: "image" }).image.data],
    [20, 20, 40],
  );
  const image = createImage({
    width: 2,
    height: 1,
    channels: 3,
    data: new Uint8Array([10, 20, 30, 100, 150, 200]),
  });
  assert.deepEqual(
    [...quantizeUniform(image, { levels: 2, range: "image" }).image.data],
    [10, 20, 30, 100, 150, 200],
  );
  for (const levels of [0, 1, 2.5, 257, NaN])
    assert.throws(() => quantizeUniform(image, { levels }));
});
test("Sampling floors odd dimensions like the TP resize and never produces a zero-sized image", () => {
  assert.deepEqual(sampledSize(9, 7, 1), { width: 4, height: 3 });
  assert.deepEqual(sampledSize(9, 7, 0), { width: 9, height: 7 });
  assert.deepEqual(sampledSize(1, 1, 8), { width: 1, height: 1 });
  assert.throws(() => sampledSize(9, 7, -1));
});

test("Slicing retains the first pixel and every factor-th row/column, including odd dimensions", () => {
  for (const channels of [1, 3]) {
    const image = createImage({
      width: 5,
      height: 3,
      channels,
      data: Uint8Array.from({ length: 15 * channels }, (_, i) => i),
    });
    const result = subsampleImage(image, { exponent: 1 });
    const expected = [];
    for (const pixel of [0, 2, 4, 10, 12, 14])
      for (let c = 0; c < channels; c++) expected.push(image.data[pixel * channels + c]);
    assert.equal(result.width, 3);
    assert.equal(result.height, 2);
    assert.deepEqual([...result.data], expected);
    assert.deepEqual(
      [...subsampleImage(image, { exponent: 8 }).data],
      [...image.data.slice(0, channels)],
    );
  }
});
