function nextPowerOfTwo(value) {
  return 2 ** Math.ceil(Math.log2(Math.max(2, value)));
}

function radix2(realInput) {
  const size = nextPowerOfTwo(realInput.length), real = new Float64Array(size), imag = new Float64Array(size);
  real.set(realInput.subarray(0, size));
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [real[i], real[j]] = [real[j], real[i]]; [imag[i], imag[j]] = [imag[j], imag[i]]; }
  }
  for (let length = 2; length <= size; length <<= 1) {
    const angle = (-2 * Math.PI) / length, half = length >> 1;
    for (let start = 0; start < size; start += length) for (let offset = 0; offset < half; offset++) {
      const cos = Math.cos(angle * offset), sin = Math.sin(angle * offset), even = start + offset, odd = even + half;
      const oddReal = real[odd] * cos - imag[odd] * sin, oddImag = real[odd] * sin + imag[odd] * cos;
      real[odd] = real[even] - oddReal; imag[odd] = imag[even] - oddImag;
      real[even] += oddReal; imag[even] += oddImag;
    }
  }
  return { real, imag, size };
}

export function transform(samples, sampleRate, { type = "rfft", removeMean = false, decibels = false } = {}) {
  const input = Float64Array.from(samples), count = input.length;
  if (removeMean && count) {
    const mean = input.reduce((sum, value) => sum + value, 0) / count;
    for (let i = 0; i < count; i++) input[i] -= mean;
  }
  const { real, imag, size } = radix2(input), frequencies = [], amplitudes = [], phases = [];
  const add = (bin, frequency, scale) => {
    const magnitude = Math.hypot(real[bin], imag[bin]) * scale;
    frequencies.push(frequency);
    amplitudes.push(decibels ? 20 * Math.log10(Math.max(magnitude, 1e-12)) : magnitude);
    phases.push(magnitude < 1e-10 ? 0 : Math.atan2(imag[bin], real[bin]));
  };
  if (type === "rfft") {
    for (let bin = 0; bin <= size / 2; bin++) add(bin, (bin * sampleRate) / size, bin === 0 || bin === size / 2 ? 1 / count : 2 / count);
  } else {
    for (let shifted = 0; shifted < size; shifted++) {
      const signedBin = shifted - size / 2, bin = (signedBin + size) % size;
      add(bin, (signedBin * sampleRate) / size, 1 / count);
    }
  }
  return { frequencies, amplitudes, phases, size, resolution: sampleRate / size };
}
