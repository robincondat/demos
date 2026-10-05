const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";
let pyodidePromise;
async function initialize() {
  importScripts(`${PYODIDE_URL}pyodide.js`);
  const pyodide = await loadPyodide({ indexURL: PYODIDE_URL });
  await pyodide.loadPackage(["numpy", "scipy"]);
  const source = await fetch("./scientific.py?v=20261004d").then((response) => response.text());
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
    payload.signals.forEach((signal, index) => { if (signal.wavBytes) pyodide.globals.set(`wav_${index}`, signal.wavBytes); });
    const result = await pyodide.runPythonAsync(`
import json
import js
import io
from scipy.io import wavfile
from pyodide.ffi import to_js
_payload = json.loads(payload_json)
for _index, _signal in enumerate(_payload["signals"]):
    if _signal["definition"] == "wav":
        _wav_value = globals()[f"wav_{_index}"]
        # Selon la version de Pyodide, un TypedArray devient soit un JsProxy,
        # soit directement une vue Python du tampon. Les deux cas sont valides.
        if hasattr(_wav_value, "to_py"):
            _wav_value = _wav_value.to_py()
        _wav_rate, _wav_samples = wavfile.read(io.BytesIO(bytes(_wav_value)))
        if _wav_samples.ndim > 1:
            _wav_samples = _wav_samples.astype(np.float64).mean(axis=1)
        _signal["samples"] = np.asarray(_wav_samples).reshape(-1)
        _signal["sourceSampleRate"] = float(_wav_rate)
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
