export const palette = ["#168665", "#e07a2d", "#7564c9", "#d34d72", "#2384bd", "#7d9130"];
let sequence = 1;
export function makeSignal(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    name: `Signal ${sequence++}`,
    type: "sine",
    operation: "add",
    frequency: 10,
    amplitude: 1,
    offset: 0,
    delay: 0,
    start: 0.25,
    end: 0.75,
    samples: null,
    sampleRate: null,
    ...overrides,
  };
}
export function resetSignalSequence() { sequence = 1; }
export async function decodeWav(file) {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer()),
      mono = new Float32Array(buffer.length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) mono[i] += data[i] / buffer.numberOfChannels;
    }
    return makeSignal({
      name: file.name.replace(/\.wav$/i, ""),
      type: "wav",
      amplitude: 1,
      samples: mono,
      sampleRate: buffer.sampleRate,
      duration: buffer.duration,
    });
  } finally {
    await context.close();
  }
}
