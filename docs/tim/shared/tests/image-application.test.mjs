import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createImageApplication,
  createLatestTaskController,
} from "../scripts/image-application.js";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

test("Only the latest decoded image is committed, including after a stale failure", async () => {
  const pending = new Map(),
    images = [],
    errors = [],
    ended = [];
  const app = createImageApplication({
    createCanvas: () => ({}),
    decode(file) {
      const value = deferred();
      pending.set(file, value);
      return value.promise;
    },
    onImage: ({ file }) => images.push(file),
    onLoadError: (error) => errors.push(error.message),
    onLoadEnd: () => ended.push(true),
  });
  const first = app.load("first"),
    second = app.load("second");
  pending.get("second").resolve({});
  await second;
  pending.get("first").reject(new Error("obsolete"));
  await first;
  assert.deepEqual(images, ["second"]);
  assert.deepEqual(errors, []);
  assert.equal(ended.length, 1);
});

test("Loading errors recover on the next image", async () => {
  const errors = [],
    images = [],
    busy = [];
  const app = createImageApplication({
    createCanvas: () => ({}),
    decode: async (file) => {
      if (file === "bad") throw new Error("decode");
      return {};
    },
    onImage: ({ file }) => images.push(file),
    onLoadError: (e) => errors.push(e.message),
    onBusy: (value) => busy.push(value),
  });
  await app.load("bad");
  await app.load("good");
  assert.deepEqual(errors, ["decode"]);
  assert.deepEqual(images, ["good"]);
  assert.equal(busy.at(-1), false);
});

test("Debouncing cancels previous parameters and disposal cancels queued work", async () => {
  const values = [],
    controller = createLatestTaskController({ delay: 5 });
  controller.schedule(() => values.push(1));
  controller.schedule(() => values.push(2));
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(values, [2]);
  controller.schedule(() => values.push(3));
  controller.invalidate();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(values, [2]);
});

test("An asynchronous calculation can reject obsolete results", async () => {
  const pending = deferred(),
    values = [];
  const controller = createLatestTaskController();
  const first = controller.run(async ({ current }) => {
    await pending.promise;
    if (current()) values.push("old");
  });
  await controller.run(() => values.push("new"));
  pending.resolve();
  await first;
  assert.deepEqual(values, ["new"]);
});

test("Rendering does not cancel an asynchronous conversion; busy covers both lanes", async () => {
  const previousRAF = globalThis.requestAnimationFrame,
    previousCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  globalThis.cancelAnimationFrame = clearTimeout;
  try {
    const pending = deferred(),
      values = [],
      busy = [];
    const app = createImageApplication({ onBusy: (value) => busy.push(value), onImage() {} });
    const conversion = app.run(async ({ current }) => {
      await pending.promise;
      if (current()) values.push("converted");
    });
    await app.render(() => values.push("rendered"));
    assert.equal(busy.at(-1), true);
    pending.resolve();
    await conversion;
    assert.deepEqual(values, ["rendered", "converted"]);
    assert.equal(busy.at(-1), false);
    const cancelled = app.render(() => values.push("cancelled"));
    app.dispose();
    await cancelled;
    assert.equal(values.includes("cancelled"), false);
  } finally {
    globalThis.requestAnimationFrame = previousRAF;
    globalThis.cancelAnimationFrame = previousCancel;
  }
});

test("A new image invalidates an outstanding conversion", async () => {
  const pending = deferred(),
    values = [];
  const app = createImageApplication({
    createCanvas: () => ({}),
    decode: async () => ({}),
    onImage: () => values.push("image"),
  });
  const conversion = app.run(async ({ current }) => {
    await pending.promise;
    if (current()) values.push("stale");
  });
  await app.load("new");
  pending.resolve();
  await conversion;
  assert.deepEqual(values, ["image"]);
});
