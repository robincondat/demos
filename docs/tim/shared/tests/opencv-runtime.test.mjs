import { test } from "node:test";
import assert from "node:assert/strict";
import { createOpenCVLoader, OPENCV_URL } from "../scripts/opencv-runtime.js";

function fixture(timeoutMs = 1000) {
  const scripts = [];
  const scope = {
    document: {
      createElement: () => ({
        remove() {
          this.removed = true;
        },
      }),
      head: {
        append(script) {
          scripts.push(script);
        },
      },
    },
  };
  return { scope, scripts, load: createOpenCVLoader({ scope, timeoutMs }) };
}

test("Ready thenables are wrapped without Promise assimilation", async () => {
  const runtime = {
    Mat() {},
    then() {
      throw Error("Unexpected assimilation");
    },
  };
  assert.equal((await createOpenCVLoader({ scope: { cv: runtime } })()).runtime, runtime);
});

test("Concurrent consumers share one script and preserve the initialization hook", async () => {
  const f = fixture();
  let calls = 0;
  const previous = () => calls++;
  f.scope.Module = { onRuntimeInitialized: previous };
  const first = f.load(),
    second = f.load();
  assert.equal(first, second);
  assert.equal(f.scripts.length, 1);
  assert.equal(f.scripts[0].src, OPENCV_URL);
  f.scope.cv = { Mat() {} };
  f.scope.Module.onRuntimeInitialized();
  assert.equal((await first).runtime, f.scope.cv);
  assert.equal((await second).runtime, f.scope.cv);
  assert.equal(calls, 1);
  assert.equal(f.scope.Module.onRuntimeInitialized, previous);
});

test("A pending Emscripten thenable is observed without loading a second runtime", async () => {
  const f = fixture();
  let resolve;
  f.scope.cv = {
    then(fn) {
      resolve = fn;
    },
  };
  const promise = f.load();
  assert.equal(f.scripts.length, 0);
  const runtime = {
    Mat() {},
    then() {
      throw Error("Must not assimilate");
    },
  };
  resolve(runtime);
  assert.equal((await promise).runtime, runtime);
  assert.equal(f.scope.cv, runtime);
});

test("Network failures and timeouts reject and permit a fresh attempt", async () => {
  const f = fixture();
  const first = f.load();
  f.scripts[0].onerror();
  await assert.rejects(first, /OpenCV/);
  assert.equal(f.scripts[0].removed, true);
  const second = f.load();
  assert.equal(f.scripts.length, 2);
  f.scope.cv = { Mat() {} };
  f.scripts[1].onload();
  await second;
  const timed = fixture(5);
  await assert.rejects(timed.load(), /OpenCV/);
  assert.equal(timed.scripts[0].removed, true);
});

test("A rejected existing runtime can also be retried", async () => {
  const f = fixture();
  f.scope.cv = {
    then(ok, fail) {
      fail();
    },
  };
  await assert.rejects(f.load(), /OpenCV/);
  assert.equal(f.scope.cv, undefined);
  const retry = f.load();
  assert.equal(f.scripts.length, 1);
  f.scope.cv = { Mat() {} };
  f.scripts[0].onload();
  await retry;
});
