export const palette = ["#168665", "#e07a2d", "#7564c9", "#d34d72", "#2384bd", "#7d9130"];
let sequence = 1;
export function makeSignal(overrides = {}) {
  return { id: crypto.randomUUID(), name: `Signal ${sequence++}`, type: "sine", frequency: 10, amplitude: 1, start: .25, width: .5, samples: null, sampleRate: null, ...overrides };
}
export function resetSignalSequence() { sequence = 1; }
export function synthesize(signal, times) {
  if (signal.type === "wav") return resample(signal, times);
  const { amplitude, frequency, start, width } = signal;
  return Float64Array.from(times, (time) => {
    const phase = 2 * Math.PI * frequency * time;
    if (signal.type === "sine") return amplitude * Math.sin(phase);
    if (signal.type === "cosine") return amplitude * Math.cos(phase);
    if (signal.type === "square") return amplitude * (Math.sin(phase) >= 0 ? 1 : -1);
    if (signal.type === "triangle") return amplitude * (2 / Math.PI) * Math.asin(Math.sin(phase));
    if (signal.type === "gate") return time >= start && time < start + width ? amplitude : 0;
    return time >= start ? amplitude : 0;
  });
}
function resample(signal, times) {
  const result = new Float64Array(times.length), source = signal.samples, rate = signal.sampleRate;
  for (let i = 0; i < times.length; i++) {
    const position = times[i] * rate, left = Math.floor(position), fraction = position - left;
    if (left >= source.length) break;
    result[i] = signal.amplitude * (source[left] * (1 - fraction) + (source[left + 1] ?? source[left]) * fraction);
  }
  return result;
}
export async function decodeWav(file) {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer()), mono = new Float32Array(buffer.length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) mono[i] += data[i] / buffer.numberOfChannels;
    }
    return makeSignal({ name: file.name.replace(/\.wav$/i, ""), type: "wav", amplitude: 1, samples: mono, sampleRate: buffer.sampleRate, duration: buffer.duration });
  } finally { await context.close(); }
}
