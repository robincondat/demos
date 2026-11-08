// Classic-worker runtime shared by TDS platforms. Entry points supply only URLs
// and the scientific modules required by their Python adapter.
function createScientificWorker({ sharedURL, engineURL, modules }) {
  const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";

  async function readSource(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Cannot load Python source: ${url}`);
    return response.text();
  }

  async function initialize() {
    importScripts(`${PYODIDE_URL}pyodide.js`);
    const pyodide = await loadPyodide({ indexURL: PYODIDE_URL });
    await pyodide.loadPackage(["numpy", "scipy"]);
    pyodide.runPython(
      await readSource(new URL("scripts/tds_wav.py?v=20261106-tds3", sharedURL).href),
    );
    for (const name of modules) {
      const code = await readSource(
        new URL(`compute/${name}.py?v=20261106-tds3`, sharedURL).href,
      );
      pyodide.runPython(`import sys, types
_module = types.ModuleType(${JSON.stringify(name)})
sys.modules[${JSON.stringify(name)}] = _module
exec(${JSON.stringify(code)}, _module.__dict__)
`);
    }
    pyodide.runPython(await readSource(engineURL));
    postMessage({ type: "ready" });
    return pyodide;
  }

  function errorMessage(error) {
    return String(error.message || error).split("\n").filter(Boolean).at(-1);
  }

  // Retain initialization failures for requests arriving later, without emitting
  // an unhandled rejected promise or attempting to use an undefined runtime.
  const ready = initialize().then(
    (runtime) => ({ runtime }),
    (error) => {
      postMessage({ type: "error", message: errorMessage(error) });
      return { error };
    },
  );

  async function compute(data) {
    let result;
    try {
      const state = await ready;
      if (state.error) throw state.error;
      const pyodide = state.runtime;
      const payload = data.payload;
      pyodide.globals.set(
        "payload_json",
        JSON.stringify(payload, (key, value) => (key === "wavBytes" ? undefined : value)),
      );
      pyodide.globals.set(
        "wav_indexes_json",
        JSON.stringify(payload.signals.flatMap((signal, index) => (signal.wavBytes ? [index] : []))),
      );
      payload.signals.forEach((signal, index) => {
        if (signal.wavBytes) pyodide.globals.set(`wav_${index}`, signal.wavBytes);
      });
      result = await pyodide.runPythonAsync(`
import json
import js
from pyodide.ffi import to_js
_payload = json.loads(payload_json)
_wav_indexes = set(json.loads(wav_indexes_json))
if callable(globals().get("validate_payload")):
    validate_payload(_payload)
prepare_wav_signals(_payload, {index: globals()[f"wav_{index}"] for index in _wav_indexes})
_result = compute(_payload)
to_js(_result, dict_converter=js.Object.fromEntries)
`);
      postMessage({ type: "result", id: data.id, result });
    } catch (error) {
      postMessage({ type: "error", id: data.id, message: errorMessage(error) });
    } finally {
      result?.destroy?.();
    }
  }

  // Pyodide and its globals are shared within the worker: never overlap calls.
  let pending = Promise.resolve();
  self.onmessage = ({ data }) => {
    if (data.type !== "compute") return;
    pending = pending.then(() => compute(data));
    return pending;
  };
  return ready;
}
