export const palette = ["#168665", "#e07a2d", "#7564c9", "#d34d72", "#2384bd", "#7d9130"];
export function makeSignal(existingCodes = [], overrides = {}) {
  const used = new Set(existingCodes), index = Array.from({ length: used.size + 1 }, (_, position) => position + 1).find((value) => !used.has(`S${value}`)), code = `S${index}`;
  return {
    id: crypto.randomUUID(), code, visible: true, definition: "function",
    type: "sine", frequency: 10, sampleRate: 1000, amplitude: 1,
    offset: 0, delay: 0, start: 0, end: 1, expression: "",
    samples: null, sourceSampleRate: null, wavName: "", ...overrides,
  };
}
const text = (view, offset, length) => String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + offset, length));
function decodePcmWav(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 44 || text(view, 0, 4) !== "RIFF" || text(view, 8, 4) !== "WAVE") throw new Error("Ce fichier n’est pas un WAV RIFF valide.");
  let offset = 12, format = null, dataOffset = -1, dataSize = 0;
  while (offset + 8 <= view.byteLength) {
    const id = text(view, offset, 4), size = view.getUint32(offset + 4, true), content = offset + 8;
    if (content + size > view.byteLength) throw new Error("Le fichier WAV est tronqué.");
    if (id === "fmt ") {
      let audioFormat = view.getUint16(content, true);
      if (audioFormat === 0xfffe && size >= 40) audioFormat = view.getUint16(content + 24, true);
      format = { audioFormat, channels: view.getUint16(content + 2, true), sampleRate: view.getUint32(content + 4, true), blockAlign: view.getUint16(content + 12, true), bits: view.getUint16(content + 14, true) };
    } else if (id === "data") { dataOffset = content; dataSize = size; }
    offset = content + size + (size % 2);
  }
  if (!format || dataOffset < 0) throw new Error("Les blocs fmt et data du WAV sont requis.");
  if (![1, 3].includes(format.audioFormat)) return null;
  const bytes = format.bits / 8,
    supported = format.audioFormat === 3
      ? format.bits === 32 || format.bits === 64
      : [8, 16, 24, 32].includes(format.bits);
  if (!supported || !format.channels || format.blockAlign < bytes * format.channels) throw new Error("Ce format PCM WAV n’est pas pris en charge.");
  const frames = Math.floor(dataSize / format.blockAlign), mono = new Float64Array(frames);
  const sample = (position) => {
    if (format.audioFormat === 3) return format.bits === 32 ? view.getFloat32(position, true) : view.getFloat64(position, true);
    if (format.bits === 8) return view.getUint8(position);
    if (format.bits === 16) return view.getInt16(position, true);
    if (format.bits === 24) { const value = view.getUint8(position) | (view.getUint8(position + 1) << 8) | (view.getUint8(position + 2) << 16); return value & 0x800000 ? value - 0x1000000 : value; }
    return view.getInt32(position, true);
  };
  for (let frame = 0; frame < frames; frame++) {
    let sum = 0; const base = dataOffset + frame * format.blockAlign;
    for (let channel = 0; channel < format.channels; channel++) sum += sample(base + channel * bytes);
    mono[frame] = sum / format.channels;
  }
  return { samples: mono, sampleRate: format.sampleRate, sourceSampleRate: format.sampleRate, duration: frames / format.sampleRate, wavName: "", encoding: format.audioFormat === 3 ? `float${format.bits}` : `PCM int${format.bits}` };
}
export async function decodeWav(file) {
  const buffer = await file.arrayBuffer(), pcm = decodePcmWav(buffer);
  if (pcm) return { ...pcm, wavName: file.name };
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(buffer.slice(0)), mono = new Float64Array(audio.length);
    for (let channel = 0; channel < audio.numberOfChannels; channel++) {
      const data = audio.getChannelData(channel);
      for (let index = 0; index < data.length; index++) mono[index] += data[index] / audio.numberOfChannels;
    }
    return { samples: mono, sampleRate: audio.sampleRate, sourceSampleRate: audio.sampleRate, duration: audio.duration, wavName: file.name, encoding: "audio décodé (amplitude flottante)" };
  } finally { await context.close(); }
}
