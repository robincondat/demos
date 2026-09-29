import { createChart } from "./chart.js";
import { transform } from "./fft.js";
import { decodeWav, makeSignal, palette, resetSignalSequence, synthesize } from "./signals.js";
const byId = (id) => document.getElementById(id);
const elements = Object.fromEntries(["samplePeriod","duration","samplingInfo","signalList","addSignal","wavInput","signalError","removeMean","logAmplitude","fftPoints","frequencyResolution","nyquistFrequency","signalSummary","amplitudeSummary","phaseSummary","resetButton","signalTemplate"].map((id) => [id, byId(id)]));
const timeChart = createChart({ stage: byId("timeStage"), canvas: byId("timeChart"), tooltip: byId("timeTooltip"), xLabel: "Temps (s)", yLabel: () => "Amplitude" });
const amplitudeChart = createChart({ stage: byId("amplitudeStage"), canvas: byId("amplitudeChart"), tooltip: byId("amplitudeTooltip"), xLabel: "Fréquence (Hz)", yLabel: () => elements.logAmplitude.checked ? "Amplitude (dB)" : "Amplitude" });
const phaseChart = createChart({ stage: byId("phaseStage"), canvas: byId("phaseChart"), tooltip: byId("phaseTooltip"), xLabel: "Fréquence (Hz)", yLabel: () => "Phase (rad)" });
let signals = [], updateTimer = null;
const numeric = (input, fallback = 0) => Number.isFinite(Number(input.value)) ? Number(input.value) : fallback;
function transformType() { return document.querySelector('input[name="transform"]:checked').value; }
function schedule() { clearTimeout(updateTimer); updateTimer = setTimeout(update, 45); }
function updateCardVisibility(card, signal) {
  const periodic = ["sine", "cosine", "square", "triangle"].includes(signal.type), gate = signal.type === "gate", wav = signal.type === "wav";
  card.querySelector(".periodic-fields").hidden = !periodic && !wav;
  card.querySelector('[data-field="frequency"]').closest(".field").hidden = wav;
  card.querySelector(".timing-fields").hidden = periodic || wav;
  card.querySelector(".gate-width").hidden = !gate;
}
function renderSignals() {
  elements.signalList.replaceChildren(...signals.map((signal, index) => {
    const card = elements.signalTemplate.content.firstElementChild.cloneNode(true); card.dataset.id = signal.id; card.style.setProperty("--signal-color", palette[index % palette.length]);
    const type = card.querySelector('[data-field="type"]');
    if (signal.type === "wav") { const option = document.createElement("option"); option.value = "wav"; option.textContent = "Fichier WAV"; type.append(option); type.disabled = true; }
    for (const field of ["name","type","frequency","amplitude","start","width"]) { const input = card.querySelector(`[data-field="${field}"]`); input.value = signal[field] ?? ""; input.addEventListener("input", () => { signal[field] = input.type === "number" ? numeric(input) : input.value; if (field === "type") updateCardVisibility(card, signal); schedule(); }); }
    card.querySelector(".remove-signal").addEventListener("click", () => { signals = signals.filter(({ id }) => id !== signal.id); renderSignals(); schedule(); });
    updateCardVisibility(card, signal); return card;
  }));
}
function samplingGrid() {
  const period = numeric(elements.samplePeriod, 1) / 1000, duration = numeric(elements.duration, 1), count = Math.floor(duration / period) + 1;
  if (!(period > 0) || !(duration > 0)) throw new Error("Le temps d’échantillonnage et la durée doivent être positifs.");
  if (count > 131072) throw new Error("Cette grille dépasse 131 072 échantillons. Augmentez le temps d’échantillonnage ou réduisez la durée.");
  return { period, duration, count, sampleRate: 1 / period, times: Float64Array.from({ length: count }, (_, index) => index * period) };
}
function update() {
  try {
    const grid = samplingGrid(); elements.signalError.textContent = ""; elements.samplingInfo.textContent = `${grid.count.toLocaleString("fr-FR")} échantillons · fₑ = ${Number(grid.sampleRate.toPrecision(6))} Hz`;
    if (!signals.length) { timeChart.setData([]); amplitudeChart.setData([]); phaseChart.setData([]); byId("timeEmpty").hidden = false; return; }
    const components = signals.map((signal) => synthesize(signal, grid.times)), sum = new Float64Array(grid.count);
    components.forEach((values) => values.forEach((value, index) => { sum[index] += value; }));
    const timeSeries = components.map((values, index) => ({ x: grid.times, y: values, label: signals[index].name, color: palette[index % palette.length], width: signals.length === 1 ? 1.8 : 1.05 }));
    if (signals.length > 1) timeSeries.push({ x: grid.times, y: sum, label: "Somme", color: "#173b35", width: 2.2 });
    timeChart.setData(timeSeries); byId("timeEmpty").hidden = true;
    const spectrum = transform(sum, grid.sampleRate, { type: transformType(), removeMean: elements.removeMean.checked, decibels: elements.logAmplitude.checked });
    amplitudeChart.setData([{ x: spectrum.frequencies, y: spectrum.amplitudes, label: "Amplitude", color: "#168665", width: 1.7 }]);
    phaseChart.setData([{ x: spectrum.frequencies, y: spectrum.phases, label: "Phase", color: "#7564c9", width: 1.45 }]);
    elements.signalSummary.textContent = `${signals.length} composante${signals.length > 1 ? "s" : ""} · ${grid.duration} s`;
    elements.amplitudeSummary.textContent = elements.logAmplitude.checked ? "dB" : "Amplitude linéaire"; elements.phaseSummary.textContent = transformType().toUpperCase();
    elements.fftPoints.textContent = spectrum.size.toLocaleString("fr-FR"); elements.frequencyResolution.textContent = `${Number(spectrum.resolution.toPrecision(5))} Hz`; elements.nyquistFrequency.textContent = `${Number((grid.sampleRate / 2).toPrecision(6))} Hz`;
  } catch (error) { elements.signalError.textContent = error.message; }
}
function addSignal() { signals.push(makeSignal()); renderSignals(); schedule(); }
elements.addSignal.addEventListener("click", addSignal);
elements.wavInput.addEventListener("change", async (event) => { const [file] = event.target.files; if (!file) return; elements.signalError.textContent = "Décodage du fichier WAV…"; try { const signal = await decodeWav(file); signals.push(signal); elements.samplePeriod.value = Number((1000 / signal.sampleRate).toPrecision(8)); elements.duration.value = Number(signal.duration.toPrecision(7)); renderSignals(); schedule(); } catch (error) { elements.signalError.textContent = `Impossible de lire ce fichier WAV : ${error.message}`; } finally { event.target.value = ""; } });
[elements.samplePeriod, elements.duration, elements.removeMean, elements.logAmplitude].forEach((control) => control.addEventListener("input", schedule)); document.querySelectorAll('input[name="transform"]').forEach((control) => control.addEventListener("change", schedule));
elements.resetButton.addEventListener("click", () => { resetSignalSequence(); signals = [makeSignal({ name: "Sinus 10 Hz" })]; elements.samplePeriod.value = 1; elements.duration.value = 1; elements.removeMean.checked = false; elements.logAmplitude.checked = false; document.querySelector('input[name="transform"][value="rfft"]').checked = true; renderSignals(); update(); });
elements.resetButton.click();
