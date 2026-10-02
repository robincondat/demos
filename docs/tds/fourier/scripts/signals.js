export const palette = ["#168665", "#e07a2d", "#7564c9", "#d34d72", "#2384bd", "#7d9130"];
let sequence = 1;
export function makeSignal(overrides = {}) {
  const code = `S${sequence++}`;
  return {
    id: crypto.randomUUID(), code, name: `Signal ${code.slice(1)}`, visible: true,
    definition: "function", type: "sine", frequency: 10, amplitude: 1,
    offset: 0, delay: 0, start: 0, end: 1, expression: "",
    samples: null, sampleRate: null, wavName: "", ...overrides,
  };
}
export function resetSignalSequence() { sequence = 1; }
export async function decodeWav(file) {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer()), mono = new Float32Array(buffer.length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < data.length; index++) mono[index] += data[index] / buffer.numberOfChannels;
    }
    return { samples: mono, sampleRate: buffer.sampleRate, duration: buffer.duration, name: file.name.replace(/\.wav$/i, ""), wavName: file.name };
  } finally { await context.close(); }
}
