import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../scripts/scientific-worker.js", import.meta.url), "utf8");

function fixture({ initializeError, missingSource = false, run } = {}) {
  const messages = [], globals = new Map();
  let destroyed = 0;
  const runtime = {
    globals,
    loadPackage: async () => {},
    runPython() {},
    runPythonAsync: async () => {
      if (run) await run(globals);
      return { destroy() { destroyed++; } };
    },
  };
  const context = vm.createContext({
    URL, self: {}, importScripts() {},
    loadPyodide: async () => {
      if (initializeError) throw initializeError;
      return runtime;
    },
    fetch: async () => ({ ok: !missingSource, text: async () => "# Python source" }),
    postMessage: (message) => messages.push(message),
  });
  vm.runInContext(source, context);
  const ready = vm.runInContext(`createScientificWorker({
    sharedURL: "https://example.test/tds/shared/",
    engineURL: "https://example.test/tds/demo/scripts/scientific.py",
    modules: ["tds_signals"]
  })`, context);
  return { ready, messages, destroyed: () => destroyed,
    compute: (id) => context.self.onmessage({ data: { type: "compute", id, payload: { signals: [] } } }),
  };
}

test("Initialization errors are reported and retained for subsequent requests", async () => {
  const f = fixture({ initializeError: new Error("Runtime unavailable") });
  await f.ready;
  assert.equal(f.messages[0].type, "error");
  await f.compute(7);
  assert.equal(f.messages[1].id, 7);
  assert.equal(f.messages[1].message, "Runtime unavailable");
});

test("Missing Python sources prevent readiness", async () => {
  const f = fixture({ missingSource: true });
  await f.ready;
  assert.equal(f.messages[0].type, "error");
  assert.match(f.messages[0].message, /Cannot load Python source/);
  assert(!f.messages.some((message) => message.type === "ready"));
});

test("Requests arriving during initialization run sequentially", async () => {
  let active = 0, peak = 0, calls = 0;
  const f = fixture({ run: async () => {
    calls++;
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
  } });
  await Promise.all([f.compute(1), f.compute(2), f.compute(3)]);
  assert.equal(calls, 3);
  assert.equal(peak, 1);
  assert.deepEqual(f.messages.filter((m) => m.type === "result").map((m) => m.id), [1, 2, 3]);
  assert.equal(f.destroyed(), 3);
});

test("A computation error keeps its request id and does not block the next request", async () => {
  let calls = 0;
  const f = fixture({ run: async () => {
    if (++calls === 1) throw new Error("Traceback\nValueError: invalid signal");
  } });
  await Promise.all([f.compute(4), f.compute(5)]);
  assert.equal(f.messages[1].id, 4);
  assert.equal(f.messages[1].message, "ValueError: invalid signal");
  assert.equal(f.messages[2].type, "result");
  assert.equal(f.messages[2].id, 5);
  assert.equal(f.destroyed(), 1);
});
