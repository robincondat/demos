import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { readWavMetadata, decodeWav } from "../scripts/tds-wav.js";
import { decodeWav as fourierWav } from "../scripts/tds-signals/signals.js";
import { decodeWav as convolutionWav } from "../scripts/tds-signals/signals.js";

function fixture({ channels = 1, rate = 44100, frames = 3, bits = 16, junk = false } = {}) {
  const extra = junk ? 10 : 0,
    size = (frames * channels * bits) / 8;
  const buffer = new ArrayBuffer(44 + extra + size),
    view = new DataView(buffer);
  const str = (offset, text) =>
    [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  str(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, (rate * channels * bits) / 8, true);
  view.setUint16(32, (channels * bits) / 8, true);
  view.setUint16(34, bits, true);
  if (junk) {
    str(36, "JUNK");
    view.setUint32(40, 1, true);
  }
  str(36 + extra, "data");
  view.setUint32(40 + extra, size, true);
  return buffer;
}

test("Métadonnées natives : mono, stéréo et bloc accessoire avec padding impair", () => {
  for (const channels of [1, 2]) {
    const info = readWavMetadata(fixture({ channels, junk: true }));
    assert.equal(info.channels, channels);
    assert.equal(info.frameCount, 3);
    assert.equal(info.sampleRate, 44100);
    assert.equal(info.duration, 3 / 44100);
    assert.equal(info.bitsPerSample, 16);
  }
});

test("Fichiers invalides et tronqués : erreur explicite", () => {
  assert.throws(() => readWavMetadata(new ArrayBuffer(10)));
  assert.throws(() => readWavMetadata(fixture().slice(0, 45)));
  const invalid = fixture();
  new DataView(invalid).setUint16(22, 0, true);
  assert.throws(() => readWavMetadata(invalid));
});

test("Les deux plateformes utilisent le même lecteur et conservent les octets", async () => {
  assert.equal(fourierWav, convolutionWav);
  const buffer = fixture(),
    result = await decodeWav({ name: "Test.WAV", arrayBuffer: async () => buffer });
  assert.equal(result.wavName, "Test.WAV");
  assert.deepEqual(result.wavBytes, new Uint8Array(buffer));
});

for (const platform of ["fourier", "convolution", "correlation", "signaux", "filtrage"]) {
  test(`${platform} : le worker charge le lecteur commun avant son moteur`, async () => {
    const url = new URL(`../../${platform}/scripts/scientific-worker.js`, import.meta.url);
    const loaded = [],
      executed = [],
      messages = [],
      globals = new Map();
    const pyodide = {
      loadPackage: async () => {},
      globals,
      runPython: (source) => executed.push(source),
      runPythonAsync: async (source) => {
        assert(source.includes("prepare_wav_signals(_payload,"));
        return { destroy() {} };
      },
    };
    const context = {
      importScripts(ref) {
        if (ref.startsWith("https:")) return;
        vm.runInContext(readFileSync(new URL(ref, url), "utf8"), sandbox);
      },
      loadPyodide: async () => pyodide,
      self: { location: { href: url.href } },
      URL,
      postMessage: (message) => messages.push(message),
      fetch: async (ref) => {
        const target = new URL(ref, url);
        loaded.push(target.pathname);
        return { ok: true, text: () => readFile(target, "utf8") };
      },
    };
    const sandbox = vm.createContext(context);
    vm.runInContext(await readFile(url, "utf8"), sandbox);
    await vm.runInContext("pyodidePromise", sandbox);
    assert(loaded[0].endsWith("/shared/scripts/tds_wav.py"));
    assert(executed[0].includes("def prepare_wav_signals"));
    assert(executed.at(-1).includes("def compute"));
    for (const module of platform === "signaux" ? ["tds_signals"] : ["tds_signals", platform === "filtrage" ? "tds_filtering" : `tds_${platform}`]) {
      assert(loaded.some((path) => path.endsWith(`/shared/compute/${module}.py`)));
      assert(executed.some((source) => source.includes(`types.ModuleType("${module}")`)));
    }
    assert.equal(messages[0].type, "ready");
    const wavBytes = new Uint8Array(fixture());
    await context.self.onmessage({
      data: { type: "compute", id: 1, payload: { signals: [{ definition: "wav", wavBytes }] } },
    });
    assert.equal(globals.get("wav_0"), wavBytes);
    assert(!globals.get("payload_json").includes("wavBytes"));
    assert.equal(messages.at(-1).type, "result");
  });
}
