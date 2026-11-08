import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createComputationController,
  validateSignalParameters,
} from "../scripts/computation-controller.js";

function fixture() {
  let worker;
  globalThis.Worker = class {
    constructor() {
      worker = this;
      this.handlers = {};
      this.messages = [];
    }
    addEventListener(type, handler) {
      this.handlers[type] = handler;
    }
    postMessage(message) {
      this.messages.push(message);
    }
  };
  const results = [],
    errors = [];
  const controller = createComputationController({
    workerURL: "worker.js",
    delay: 1,
    onReady() {},
    onResult: (result) => results.push(result),
    onError: (error) => errors.push(error),
  });
  return {
    controller,
    worker,
    results,
    errors,
    message(data) {
      worker.handlers.message({ data });
    },
  };
}

test("Only the latest result or error is delivered, including after reset", () => {
  const f = fixture();
  f.controller.submit({ signals: [] });
  assert.equal(f.worker.messages.length, 0);
  f.message({ type: "ready" });
  f.controller.submit({ value: 1 });
  const old = f.worker.messages.at(-1).id;
  f.controller.submit({ value: 2 });
  const current = f.worker.messages.at(-1).id;
  f.message({ type: "result", id: old, result: 1 });
  f.message({ type: "error", id: old, message: "old error" });
  f.message({ type: "result", id: current, result: 2 });
  assert.deepEqual(f.results, [2]);
  assert.deepEqual(f.errors, []);
  f.controller.invalidate();
  f.message({ type: "result", id: current, result: 3 });
  assert.deepEqual(f.results, [2]);
});

test("Scheduling debounces changes and reset cancels a pending update", async () => {
  const f = fixture();
  let calls = 0;
  f.controller.schedule(() => calls++);
  f.controller.schedule(() => calls++);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(calls, 1);
  f.controller.schedule(() => calls++);
  f.controller.invalidate();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(calls, 1);
});

test("Worker failures report an error and stop submitting requests", () => {
  const f = fixture();
  f.message({ type: "ready" });
  f.worker.handlers.error();
  assert.equal(f.controller.ready, false);
  f.controller.submit({});
  assert.equal(f.worker.messages.length, 0);
  assert.equal(f.errors.length, 1);
});

test("Both controller types validate temporal values and undefined parameters", () => {
  const signal = { code: "S1", start: 0, end: 1, sampleRate: 1000, variables: { f: 10 } };
  validateSignalParameters([signal]);
  assert.throws(() => validateSignalParameters([{ ...signal, start: NaN }]));
  assert.throws(() => validateSignalParameters([{ ...signal, variables: { f: null } }]));
});
