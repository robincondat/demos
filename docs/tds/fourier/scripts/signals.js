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
export async function decodeWav(file) {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer()), mono = new Float32Array(buffer.length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < data.length; index++) mono[index] += data[index] / buffer.numberOfChannels;
    }
    return { samples: mono, sampleRate: buffer.sampleRate, sourceSampleRate: buffer.sampleRate, duration: buffer.duration, wavName: file.name };
  } finally { await context.close(); }
}
