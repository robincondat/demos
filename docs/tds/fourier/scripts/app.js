import { createChart } from "./chart.js";
import { decodeWav, makeSignal, palette, resetSignalSequence } from "./signals.js";
const byId = (id) => document.getElementById(id);
const elements = Object.fromEntries(["samplePeriod","duration","samplingInfo","pythonStatus","signalList","addSignal","wavInput","signalError","fftPoints","frequencyResolution","nyquistFrequency","signalSummary","amplitudeSummary","phaseSummary","resetButton","signalTemplate"].map((id) => [id, byId(id)]));
const timeChart = createChart({ stage: byId("timeStage"), canvas: byId("timeChart"), tooltip: byId("timeTooltip"), xLabel: "Temps (s)", yLabel: () => "Amplitude" });
const amplitudeChart = createChart({ stage: byId("amplitudeStage"), canvas: byId("amplitudeChart"), tooltip: byId("amplitudeTooltip"), xLabel: "Fréquence (Hz)", yLabel: () => "Amplitude" });
const phaseChart = createChart({ stage: byId("phaseStage"), canvas: byId("phaseChart"), tooltip: byId("phaseTooltip"), xLabel: "Fréquence (Hz)", yLabel: () => "Phase (rad)" });
const worker = new Worker("./scripts/scientific-worker.js");
let signals = [], updateTimer = null, requestId = 0, pythonReady = false;
const numeric = (input, fallback = 0) => Number.isFinite(Number(input.value)) ? Number(input.value) : fallback;
const transformType = () => document.querySelector('input[name="transform"]:checked').value;
const schedule = () => { clearTimeout(updateTimer); updateTimer = setTimeout(update, 80); };
function updateCardVisibility(card, signal) {
  const periodic = ["sine", "cosine", "square", "triangle"].includes(signal.type), gate = signal.type === "gate", wav = signal.type === "wav";
  card.querySelector(".periodic-fields").hidden = !periodic;
  card.querySelector(".timing-fields").hidden = periodic || wav;
  card.querySelector(".gate-end").hidden = !gate;
  card.querySelector('[data-field="type"]').disabled = wav;
}
function closeOtherCards(opened) { elements.signalList.querySelectorAll(".signal-card").forEach((card) => { if (card !== opened) card.open = false; }); }
function renderSignals(openId = null) {
  elements.signalList.replaceChildren(...signals.map((signal, index) => {
    const card = elements.signalTemplate.content.firstElementChild.cloneNode(true); card.dataset.id = signal.id; card.style.setProperty("--signal-color", palette[index % palette.length]); card.open = signal.id === openId;
    const type = card.querySelector('[data-field="type"]');
    if (signal.type === "wav") { const option = document.createElement("option"); option.value = "wav"; option.textContent = "Fichier WAV"; type.append(option); }
    const operation = card.querySelector('[data-field="operation"]'); operation.disabled = index === 0; if (index === 0) operation.value = "add";
    for (const field of ["name","type","operation","frequency","delay","amplitude","offset","start","end"]) {
      const input = card.querySelector(`[data-field="${field}"]`); input.value = signal[field] ?? "";
      input.addEventListener("input", () => { signal[field] = input.type === "number" ? numeric(input) : input.value; card.querySelector("[data-summary-name]").textContent = signal.name; card.querySelector("[data-summary-operation]").textContent = index ? (signal.operation === "multiply" ? "×" : "+") : "Base"; if (field === "type") updateCardVisibility(card, signal); schedule(); });
    }
    card.querySelector("[data-summary-name]").textContent = signal.name; card.querySelector("[data-summary-operation]").textContent = index ? (signal.operation === "multiply" ? "×" : "+") : "Base";
    card.addEventListener("toggle", () => { if (card.open) closeOtherCards(card); });
    card.querySelector(".remove-signal").addEventListener("click", () => { signals = signals.filter(({ id }) => id !== signal.id); renderSignals(); schedule(); });
    updateCardVisibility(card, signal); return card;
  }));
}
function payload() {
  const samplePeriod = numeric(elements.samplePeriod, 1) / 1000, duration = numeric(elements.duration, 1);
  if (!(samplePeriod > 0) || !(duration > 0)) throw new Error("Le temps d’échantillonnage et la durée doivent être positifs.");
  return { samplePeriod, duration, transform: transformType(), signals };
}
function update() {
  try {
    const data = payload(), count = Math.ceil(data.duration / data.samplePeriod);
    elements.signalError.textContent = ""; elements.samplingInfo.textContent = `${count.toLocaleString("fr-FR")} échantillons · fₑ = ${Number((1 / data.samplePeriod).toPrecision(7))} Hz`;
    if (!pythonReady) { elements.pythonStatus.textContent = "Initialisation du moteur scientifique Python…"; return; }
    elements.pythonStatus.textContent = "Calcul NumPy en cours…"; worker.postMessage({ type: "compute", id: ++requestId, payload: data });
  } catch (error) { elements.signalError.textContent = error.message; }
}
function display(result) {
  const componentSeries = result.components.map((values, index) => ({ x: result.times, y: values, label: signals[index]?.name ?? `Signal ${index + 1}`, color: palette[index % palette.length], width: signals.length === 1 ? 1.8 : 1.05 }));
  if (signals.length > 1) componentSeries.push({ x: result.times, y: result.combined, label: "Résultat", color: "#173b35", width: 2.2 });
  timeChart.setData(componentSeries); byId("timeEmpty").hidden = signals.length > 0;
  amplitudeChart.setData(signals.length ? [{ x: result.frequencies, y: result.amplitudes, label: "Amplitude", color: "#168665", width: 1.7 }] : []);
  phaseChart.setData(signals.length ? [{ x: result.frequencies, y: result.phases, label: "Phase", color: "#7564c9", width: 1.45 }] : []);
  elements.signalSummary.textContent = signals.length ? `${signals.length} composante${signals.length > 1 ? "s" : ""}` : "—"; elements.amplitudeSummary.textContent = signals.length ? "Amplitude linéaire" : "—"; elements.phaseSummary.textContent = signals.length ? transformType().toUpperCase() : "—";
  elements.fftPoints.textContent = signals.length ? result.combined.length.toLocaleString("fr-FR") : "—"; elements.frequencyResolution.textContent = signals.length ? `${Number(result.resolution.toPrecision(6))} Hz` : "—"; elements.nyquistFrequency.textContent = `${Number(result.nyquist.toPrecision(7))} Hz`;
}
worker.addEventListener("message", ({ data }) => {
  if (data.type === "ready") { pythonReady = true; elements.pythonStatus.textContent = "NumPy prêt"; update(); }
  else if (data.type === "error") { elements.pythonStatus.textContent = "Moteur Python indisponible"; elements.signalError.textContent = data.message; }
  else if (data.type === "result" && data.id === requestId) { elements.pythonStatus.textContent = "NumPy prêt"; display(data.result); }
});
elements.addSignal.addEventListener("click", () => { const signal = makeSignal(); signals.push(signal); renderSignals(signal.id); schedule(); });
elements.wavInput.addEventListener("change", async (event) => { const [file] = event.target.files; if (!file) return; elements.signalError.textContent = "Décodage du fichier WAV…"; try { const signal = await decodeWav(file); signals.push(signal); elements.samplePeriod.value = Number((1000 / signal.sampleRate).toPrecision(8)); elements.duration.value = Number(signal.duration.toPrecision(7)); renderSignals(signal.id); schedule(); } catch (error) { elements.signalError.textContent = `Impossible de lire ce fichier WAV : ${error.message}`; } finally { event.target.value = ""; } });
[elements.samplePeriod, elements.duration].forEach((control) => control.addEventListener("input", schedule)); document.querySelectorAll('input[name="transform"]').forEach((control) => control.addEventListener("change", schedule));
elements.resetButton.addEventListener("click", () => { resetSignalSequence(); signals = []; elements.samplePeriod.value = 1; elements.duration.value = 1; document.querySelector('input[name="transform"][value="rfft"]').checked = true; renderSignals(); update(); });
elements.resetButton.click();
