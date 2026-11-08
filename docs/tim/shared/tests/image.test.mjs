import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createImage,
  copyImage,
  fromRGBA,
  fromOpenCV,
  pixelAt,
  dataRange,
} from "../compute/image.js";
import { displayPixels, resolveDisplayRange } from "../scripts/image-display.js";

test("Images preserve scientific values, channels and buffer ownership", () => {
  const data = new Float32Array([-20, 15, 400, 0, 1, 2]);
  const image = createImage({ width: 2, height: 1, channels: 3, data });
  assert.equal(image.data, data);
  assert.deepEqual(pixelAt(image, 0, 0), [-20, 15, 400]);
  assert.equal(pixelAt(image, 2, 0), null);
  const copy = copyImage(image);
  data[0] = -100;
  assert.equal(copy.data[0], -20);
  assert.deepEqual(dataRange(image), { min: -100, max: 400 });
  assert.throws(() => createImage({ width: 2, height: 1, channels: 3, data: new Uint8Array(2) }));
});

test("RGBA conversion preserves Histogrammes rounding and channel order", () => {
  const source = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([255, 0, 0, 128, 0, 255, 0, 255]),
  };
  assert.deepEqual([...fromRGBA(source, { mode: "gray" }).data], [76, 150]);
  assert.deepEqual([...fromRGBA(source).data], [255, 0, 0, 0, 255, 0]);
  assert.deepEqual([...fromRGBA(source, { mode: "rgba" }).data], [...source.data]);
});

test("Display mapping leaves scientific pixels unchanged and supports float ranges", () => {
  const image = createImage({
    width: 3,
    height: 1,
    channels: 1,
    data: new Float32Array([-10, 0, 10]),
  });
  const before = [...image.data];
  assert.deepEqual(resolveDisplayRange(image, { auto: true }), { min: -10, max: 10 });
  assert.deepEqual(
    [...displayPixels(image, { auto: true })],
    [0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255],
  );
  assert.deepEqual([...image.data], before);
  assert.throws(() => resolveDisplayRange(image, { min: 10, max: 0 }));
  const flat = createImage({ width: 2, height: 1, channels: 1, data: new Uint8Array([80, 80]) });
  assert.deepEqual(resolveDisplayRange(flat, { auto: true }), { min: 80, max: 81 });
});

test("OpenCV adapters copy pixels by default and can borrow synchronously", () => {
  const mat = {
    cols: 2,
    rows: 1,
    channels: () => 1,
    depth: () => 5,
    data32F: new Float32Array([-2, 300]),
  };
  const own = fromOpenCV(mat),
    borrowed = fromOpenCV(mat, { copy: false });
  mat.data32F.fill(0);
  assert.deepEqual([...own.data], [-2, 300]);
  assert.deepEqual([...borrowed.data], [0, 0]);
});

test("RGBA display preserves alpha without using it for automatic intensity range", () => {
  const image = createImage({
    width: 1,
    height: 1,
    channels: 4,
    data: new Uint8Array([10, 20, 30, 200]),
  });
  assert.deepEqual(dataRange(image), { min: 10, max: 30 });
  assert.equal(displayPixels(image)[3], 200);
});
