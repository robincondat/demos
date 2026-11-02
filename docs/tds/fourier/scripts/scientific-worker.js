const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";
let pyodidePromise;
async function initialize() {
  importScripts(`${PYODIDE_URL}pyodide.js`);
  const pyodide = await loadPyodide({ indexURL: PYODIDE_URL });
  await pyodide.loadPackage(["numpy", "scipy"]);
  const wavResponse = await fetch("../../../shared/scripts/tds_wav.py?v=20261022-wav1");
  if (!wavResponse.ok) throw new Error("Cannot load shared WAV reader");
  pyodide.runPython(await wavResponse.text());
  const source = await fetch("./scientific.py?v=20261019-dirac1").then((response) => response.text());
  pyodide.runPython(source);
  postMessage({ type: "ready" });
  return pyodide;
}
pyodidePromise = initialize().catch((error) => postMessage({ type: "error", message: error.message }));
self.onmessage = async ({ data }) => {
  if (data.type !== "compute") return;
  try {
    const pyodide = await pyodidePromise;
    const payload = data.payload;
    pyodide.globals.set("payload_json", JSON.stringify(payload, (key, value) => key === "wavBytes" ? undefined : value));
    pyodide.globals.set("wav_indexes_json", JSON.stringify(payload.signals.flatMap((signal, index) => signal.wavBytes ? [index] : [])));
    payload.signals.forEach((signal, index) => { if (signal.wavBytes) pyodide.globals.set(`wav_${index}`, signal.wavBytes); });
    const result = await pyodide.runPythonAsync(`
import json
import js
from pyodide.ffi import to_js
_payload = json.loads(payload_json)
_wav_indexes = set(json.loads(wav_indexes_json))
prepare_wav_signals(_payload, {index: globals()[f"wav_{index}"] for index in _wav_indexes})
_result = compute(_payload)
to_js(_result, dict_converter=js.Object.fromEntries)
`);
    postMessage({ type: "result", id: data.id, result });
    result.destroy?.();
  } catch (error) {
    const lines = String(error.message || error).split("\n").filter(Boolean);
    postMessage({ type: "error", id: data.id, message: lines.at(-1) });
  }
};
