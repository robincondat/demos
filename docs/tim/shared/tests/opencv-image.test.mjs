import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareMat, displayMat, matRange } from "../compute/opencv-image.js";
import { readCanvasImages } from "../scripts/opencv-image.js";

function runtime(fail = "") {
  const allocated = [];
  class Mat {
    constructor() {
      allocated.push(this);
      this.deleted = false;
    }
    delete() {
      assert.equal(this.deleted, false);
      this.deleted = true;
    }
    convertTo(dst, depth, scale, offset) {
      if (fail === "convert") throw Error("convert");
      dst.values = [depth, scale, offset];
    }
  }
  const cv = {
    Mat,
    CV_32F: 5,
    CV_8U: 0,
    COLOR_RGBA2GRAY: 11,
    COLOR_RGBA2RGB: 12,
    cvtColor(src, dst, mode) {
      if (fail === "color") throw Error("color");
      dst.mode = mode;
    },
    imread: () => new Mat(),
  };
  return { cv, allocated };
}

test("Native preparation transfers exactly one output and releases intermediate matrices", () => {
  for (const float of [true, false]) {
    const { cv, allocated } = runtime();
    const input = {},
      output = prepareMat(input, { mode: "Grayscale", float }, cv);
    assert.equal(allocated.filter((mat) => !mat.deleted).length, 1);
    if (float) assert.equal(output.values[0], cv.CV_32F);
    else assert.equal(output.mode, cv.COLOR_RGBA2GRAY);
    output.delete();
    assert.ok(allocated.every((mat) => mat.deleted));
  }
});

test("Preparation and display release all allocations when OpenCV throws", () => {
  for (const fail of ["color", "convert"]) {
    const { cv, allocated } = runtime(fail);
    assert.throws(() => prepareMat({}, { float: fail !== "color" }, cv), new RegExp(fail));
    assert.ok(allocated.every((mat) => mat.deleted));
  }
  const { cv, allocated } = runtime("convert");
  assert.throws(() => displayMat(new cv.Mat(), { min: 0, max: 255 }, cv), /convert/);
  assert.equal(allocated[0].deleted, false);
  assert.equal(allocated[1].deleted, true);
});

test("Reading both working images shares a single source and returns owned gray/RGB outputs", () => {
  const { cv, allocated } = runtime();
  const images = readCanvasImages({}, cv);
  assert.equal(allocated.filter((mat) => !mat.deleted).length, 2);
  images.gray.delete();
  images.rgb.delete();
  assert.ok(allocated.every((mat) => mat.deleted));
});

test("Multichannel ranges inspect every channel and release split matrices", () => {
  const { cv, allocated } = runtime();
  cv.MatVector = class {
    delete() {
      this.deleted = true;
    }
    size() {
      return 3;
    }
    get(i) {
      const m = new cv.Mat();
      m.index = i;
      return m;
    }
  };
  cv.split = () => {};
  cv.minMaxLoc = (mat) =>
    [
      { minVal: 1, maxVal: 5 },
      { minVal: -2, maxVal: 3 },
      { minVal: 0, maxVal: 255 },
    ][mat.index];
  assert.deepEqual(matRange({}, cv), { min: -2, max: 255 });
  assert.ok(allocated.every((mat) => mat.deleted));
});
