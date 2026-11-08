import { createImage, fromRGBA } from "../compute/image.js";
import { displayPixels } from "../scripts/image-display.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLUT, transform, histogram } from "../compute/lut.js";

test("Binarisation et extraction respectent les seuils", () => {
  const lut = createLUT("threshold", 128);
  assert.equal(lut[128], 0);
  assert.equal(lut[129], 255);
  const window = createLUT("window", 64, 192);
  assert.deepEqual([window[63], window[64], window[192], window[193]], [0, 255, 255, 0]);
});

test("Expansion sature les bornes et rehaussement passe par le point de contrôle", () => {
  const stretch = createLUT("stretch", 64, 192);
  assert.deepEqual(
    [stretch[0], stretch[64], stretch[128], stretch[192], stretch[255]],
    [0, 0, 128, 255, 255],
  );
  const contrast = createLUT("contrast", 128, 192);
  assert.deepEqual([contrast[0], contrast[128], contrast[255]], [0, 192, 255]);
  assert(contrast.every((value, i) => i === 0 || value >= contrast[i - 1]));
});

test("Égalisation utilise le CDF corrigé et préserve une image constante", () => {
  const values = new Uint8Array([50, 50, 100, 200]);
  const result = transform(values, 1, "equalize");
  assert.deepEqual([...result.values], [0, 0, 128, 255]);
  assert.deepEqual([...values], [50, 50, 100, 200]);
  assert.deepEqual([...transform(new Uint8Array([80, 80]), 1, "equalize").values], [80, 80]);
  const counts = histogram(result.values)[0];
  assert.equal(
    counts.reduce((a, b) => a + b, 0),
    4,
  );
});

test("RGB utilise une LUT par canal et les histogrammes conservent les effectifs", () => {
  const values = new Uint8Array([0, 50, 100, 20, 50, 200]);
  const result = transform(values, 3, "equalize");
  assert.equal(result.luts.length, 3);
  assert.deepEqual([...result.values], [0, 50, 0, 255, 50, 255]);
  for (const channel of histogram(result.values, 3))
    assert.equal(
      channel.reduce((a, b) => a + b, 0),
      2,
    );
});

test("Conversion et réglages visuels ne modifient pas les intensités analysées", () => {
  const source = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
  assert.deepEqual(
    [...fromRGBA({ width: 2, height: 1, data: source }, { mode: "gray" }).data],
    [76, 150],
  );
  assert.deepEqual(
    [...fromRGBA({ width: 2, height: 1, data: source }).data],
    [255, 0, 0, 0, 255, 0],
  );
  const values = new Uint8Array([64, 128, 192]);
  const before = [...values];
  assert.deepEqual(
    [
      ...displayPixels(createImage({ width: 3, height: 1, channels: 1, data: values }), {
        min: 64,
        max: 192,
      }),
    ],
    [0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255],
  );
  assert.deepEqual([...values], before);
});

test("Paramètres invalides rejetés", () => {
  for (const args of [
    ["threshold", NaN],
    ["threshold", 256],
    ["window", 192, 64],
    ["stretch", 100, 100],
    ["contrast", 0, 100],
    ["contrast", 128, -1],
    ["unknown", 1, 2],
  ])
    assert.throws(() => createLUT(...args));
});
