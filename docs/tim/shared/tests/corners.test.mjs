import { test } from "node:test";
import assert from "node:assert/strict";
import { createImage } from "../compute/image.js";
import { CORNER_DEFAULTS, validateCornerSettings, cornerCandidates } from "../compute/corners.js";
import { refineCorners } from "../compute/corner-refinement.js";

test("Thresholding selects strict positive responses and handles empty detections", () => {
  const make = (data) =>
    createImage({ width: data.length, height: 1, channels: 1, data: new Float64Array(data) });
  const candidates = cornerCandidates(make([-10, 0, 1, 10]), 0.1);
  assert.deepEqual([...candidates.mask.data], [0, 0, 0, 255]);
  assert.equal(candidates.count, 1);
  assert.equal(cornerCandidates(make([0, 0]), 0.01).count, 0);
  assert.equal(cornerCandidates(make([-2, -1]), 0.01).count, 0);
});
test("Corner parameters validate active options only", () => {
  validateCornerSettings(CORNER_DEFAULTS);
  validateCornerSettings({
    ...CORNER_DEFAULTS,
    method: "shi",
    k: NaN,
    preBlur: false,
    blurSize: NaN,
  });
  for (const changed of [
    { blockSize: 2 },
    { quality: 0 },
    { quality: 2 },
    { minDistance: -1 },
    { k: 0 },
    { maxCorners: 1.5 },
  ])
    assert.throws(() => validateCornerSettings({ ...CORNER_DEFAULTS, ...changed }));
});
test("Subpixel refinement preserves fractional coordinates and converges to a checkerboard intersection", async () => {
  const image = createImage({
    width: 40,
    height: 40,
    channels: 1,
    data: Uint8Array.from(
      { length: 1600 },
      (_, i) => ((Math.floor(i / 40 / 8) + Math.floor((i % 40) / 8)) % 2) * 255,
    ),
  });
  const points = [{ x: 8, y: 8, score: 100 }];
  const [refined] = await refineCorners(image, points);
  assert.ok(Math.abs(refined.x - 7.5) < 0.001);
  assert.ok(Math.abs(refined.y - 7.5) < 0.001);
  assert.equal(points[0].x, 8);
  const constant = { ...image, data: new Uint8Array(1600).fill(42) };
  assert.deepEqual(await refineCorners(constant, points), points);
  await assert.rejects(refineCorners(image, points, { current: () => false }), /remplacé/);
  await assert.rejects(refineCorners(image, points, { radius: 0 }), /voisinage/);
});
