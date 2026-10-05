export const palette = ["#168665", "#e07a2d", "#7564c9", "#d34d72", "#2384bd", "#7d9130"];
export function makeSignal(existingCodes = [], overrides = {}) {
  const used = new Set(existingCodes), index = Array.from({ length: used.size + 1 }, (_, position) => position + 1).find((value) => !used.has(`S${value}`)), code = `S${index}`;
  return {
    id: crypto.randomUUID(), code, visible: true, definition: "function",
    type: "sine", frequency: 10, sampleRate: 1000, amplitude: 1,
    offset: 0, delay: 0, gateStart: 0.25, gateEnd: 0.75,
    start: 0, end: 1, expression: "", wavBytes: null, wavName: "",
    ...overrides,
  };
}
const chunkName = (view, offset) =>
  String.fromCharCode(...new Uint8Array(view.buffer, offset, 4));
function readWavMetadata(buffer) {
  const view = new DataView(buffer);
  if (
    view.byteLength < 44 ||
    chunkName(view, 0) !== "RIFF" ||
    chunkName(view, 8) !== "WAVE"
  )
    throw new Error("Ce fichier n’est pas un WAV RIFF valide.");
  let offset = 12, format = null, dataSize = null;
  while (offset + 8 <= view.byteLength) {
    const name = chunkName(view, offset),
      size = view.getUint32(offset + 4, true),
      content = offset + 8;
    if (content + size > view.byteLength)
      throw new Error("Le fichier WAV est tronqué.");
    if (name === "fmt " && size >= 16)
      format = {
        channels: view.getUint16(content + 2, true),
        sampleRate: view.getUint32(content + 4, true),
        blockAlign: view.getUint16(content + 12, true),
      };
    else if (name === "data") dataSize = size;
    offset = content + size + (size % 2);
  }
  if (!format || dataSize == null || !format.sampleRate || !format.blockAlign)
    throw new Error("Les blocs fmt et data du WAV sont invalides.");
  return {
    sampleRate: format.sampleRate,
    duration: dataSize / format.blockAlign / format.sampleRate,
  };
}
export async function decodeWav(file) {
  const buffer = await file.arrayBuffer(), metadata = readWavMetadata(buffer);
  return {
    ...metadata,
    wavBytes: new Uint8Array(buffer),
    wavName: file.name,
  };
}
