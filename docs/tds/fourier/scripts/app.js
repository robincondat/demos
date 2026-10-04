import { createChart } from "./chart.js";
import { decodeWav, makeSignal, palette, resetSignalSequence } from "./signals.js";
const byId = (id) => document.getElementById(id);
const elements = Object.fromEntries(["samplePeriod","sampleRate","samplingInfo","pythonStatus","signalList","addSignal","signalError","fftPoints","frequencyResolution","nyquistFrequency","signalSummary","amplitudeSummary","phaseSummary","resetButton","signalTemplate"].map((id) => [id, byId(id)]));
const timeChart = createChart({ stage: byId("timeStage"), canvas: byId("timeChart"), tooltip: byId("timeTooltip"), xLabel: "Temps (s)", yLabel: () => "Amplitude" });
const amplitudeChart = createChart({ stage: byId("amplitudeStage"), canvas: byId("amplitudeChart"), tooltip: byId("amplitudeTooltip"), xLabel: "Fréquence (Hz)", yLabel: () => "Amplitude" });
const phaseChart = createChart({ stage: byId("phaseStage"), canvas: byId("phaseChart"), tooltip: byId("phaseTooltip"), xLabel: "Fréquence (Hz)", yLabel: () => "Phase (rad)" });
const worker = new Worker("./scripts/scientific-worker.js?v=20261004");
let signals = [], updateTimer = null, requestId = 0, pythonReady = false, syncingSampling = false;
const numeric = (input, fallback = 0) => {
  const value = input ? Number(input.value) : Number.NaN;
  return Number.isFinite(value) ? value : fallback;
};
const transformType = () =>
  document.querySelector('input[name="transform"]:checked')?.value ?? "rfft";
const schedule = () => { clearTimeout(updateTimer); updateTimer = setTimeout(update, 80); };
function updateCardVisibility(card, signal) {
  card.querySelector(".function-definition").hidden = signal.definition !== "function";
  card.querySelector(".wav-definition").hidden = signal.definition !== "wav";
  card.querySelector(".combination-definition").hidden = signal.definition !== "combination";
  card.querySelector(".periodic-fields").hidden = !["sine", "cosine", "square", "triangle"].includes(signal.type);
}
function closeOtherCards(opened) { elements.signalList.querySelectorAll(".signal-card").forEach((card) => { if (card !== opened) card.open = false; }); }
function bindField(card, signal, field) {
  card.querySelectorAll(`[data-field="${field}"]`).forEach((input) => {
    if (input.type === "checkbox") input.checked = Boolean(signal[field]); else input.value = signal[field] ?? "";
    input.addEventListener("input", () => {
      signal[field] = input.type === "checkbox" ? input.checked : input.type === "number" ? numeric(input) : input.value;
      if (field === "name") card.querySelector("[data-summary-name]").textContent = signal.name;
      if (field === "definition" || field === "type") updateCardVisibility(card, signal);
      card.querySelectorAll(`[data-field="${field}"]`).forEach((peer) => { if (peer !== input) peer.value = input.value; });
      schedule();
    });
  });
}
function renderSignals(openId = null) {
  elements.signalList.replaceChildren(...signals.map((signal, index) => {
    const card = elements.signalTemplate.content.firstElementChild.cloneNode(true); card.dataset.id = signal.id; card.style.setProperty("--signal-color", palette[index % palette.length]); card.open = signal.id === openId;
    for (const field of ["visible","name","definition","type","frequency","delay","amplitude","offset","expression","start","end"]) bindField(card, signal, field);
    card.querySelector("[data-summary-name]").textContent = signal.name; card.querySelector("[data-summary-code]").textContent = signal.code;
    const available = signals.slice(0, index).map(({ code, name }) => `${code} (${name})`); card.querySelector("[data-expression-help]").textContent = available.length ? `Signaux disponibles : ${available.join(", ")}. Opérateurs : +, −, * et parenthèses.` : "Aucun signal précédent n’est disponible pour cette combinaison.";
    const visibility = card.querySelector(".visibility-toggle"); visibility.addEventListener("click", (event) => event.stopPropagation());
    card.addEventListener("toggle", () => { if (card.open) closeOtherCards(card); });
    card.querySelector(".remove-signal").addEventListener("click", () => { signals = signals.filter(({ id }) => id !== signal.id); renderSignals(); schedule(); });
    const fileInput = card.querySelector('[data-field="wavFile"]'); card.querySelector("[data-wav-name]").textContent = signal.wavName || "Aucun fichier chargé";
    fileInput.addEventListener("change", async () => { const [file] = fileInput.files; if (!file) return; elements.signalError.textContent = "Décodage du fichier WAV…"; try { Object.assign(signal, await decodeWav(file), { definition: "wav" }); signal.end = signal.start + signal.duration; renderSignals(signal.id); schedule(); } catch (error) { elements.signalError.textContent = `Impossible de lire ce fichier WAV : ${error.message}`; } });
    updateCardVisibility(card, signal); return card;
  }));
}
function payload() {
  const samplePeriod = numeric(elements.samplePeriod, 1) / 1000;
  if (!(samplePeriod > 0)) throw new Error("Le temps d’échantillonnage doit être strictement positif.");
  return { samplePeriod, transform: transformType(), signals };
}
function clearSignalResults() {
  timeChart.setData([]);
  amplitudeChart.setData([]);
  phaseChart.setData([]);
  byId("timeEmpty").hidden = false;
  elements.signalSummary.textContent =
    elements.amplitudeSummary.textContent =
    elements.phaseSummary.textContent =
    elements.fftPoints.textContent =
    elements.frequencyResolution.textContent =
      "—";
}
function update() {
  try {
    const data = payload(); elements.signalError.textContent = ""; elements.samplingInfo.textContent = `Tₑ = ${Number((data.samplePeriod * 1000).toPrecision(8))} ms · fₑ = ${Number((1 / data.samplePeriod).toPrecision(8))} Hz`;
    if (!pythonReady) { elements.pythonStatus.textContent = "Initialisation du moteur scientifique Python…"; return; }
    if (!signals.length) {
      clearSignalResults();
      elements.nyquistFrequency.textContent = `${Number(
        (1 / (2 * data.samplePeriod)).toPrecision(8),
      )} Hz`;
      elements.pythonStatus.textContent = "NumPy prêt";
      return;
    }
    elements.pythonStatus.textContent = "Calcul NumPy en cours…"; worker.postMessage({ type: "compute", id: ++requestId, payload: data });
  } catch (error) { elements.signalError.textContent = error.message; }
}
function rangeLabel(values, suffix = "") {
  if (!values.length) return "—"; const min = Math.min(...values), max = Math.max(...values), text = min === max ? min.toLocaleString("fr-FR") : `${min.toLocaleString("fr-FR")}–${max.toLocaleString("fr-FR")}`; return `${text}${suffix}`;
}
function display(result) {
  const visible = signals.map((signal, index) => ({ signal, data: result.signals[index], index })).filter(({ signal }) => signal.visible);
  timeChart.setData(visible.map(({ signal, data, index }) => ({ x: data.times, y: data.values, label: signal.name, color: palette[index % palette.length], width: 1.7 })));
  amplitudeChart.setData(visible.map(({ signal, data, index }) => ({ x: data.frequencies, y: data.amplitudes, label: signal.name, color: palette[index % palette.length], width: 1.6 })));
  phaseChart.setData(visible.map(({ signal, data, index }) => ({ x: data.frequencies, y: data.phases, label: signal.name, color: palette[index % palette.length], width: 1.35 })));
  byId("timeEmpty").hidden = visible.length > 0; const label = `${visible.length}/${signals.length} signal${signals.length > 1 ? "aux" : ""} affiché${visible.length > 1 ? "s" : ""}`;
  elements.signalSummary.textContent = signals.length ? label : "—"; elements.amplitudeSummary.textContent = visible.length ? label : "—"; elements.phaseSummary.textContent = visible.length ? `${transformType().toUpperCase()} · ${label}` : "—";
  elements.fftPoints.textContent = rangeLabel(visible.map(({ data }) => data.values.length)); elements.frequencyResolution.textContent = rangeLabel(visible.map(({ data }) => Number(data.resolution.toPrecision(6))), " Hz"); elements.nyquistFrequency.textContent = `${Number(result.nyquist.toPrecision(8))} Hz`;
}
worker.addEventListener("message", ({ data }) => { if (data.type === "ready") { pythonReady = true; elements.pythonStatus.textContent = "NumPy prêt"; update(); } else if (data.type === "error") { elements.pythonStatus.textContent = "Moteur Python indisponible"; elements.signalError.textContent = data.message; } else if (data.type === "result" && data.id === requestId) { elements.pythonStatus.textContent = "NumPy prêt"; display(data.result); } });
elements.addSignal.addEventListener("click", () => { const signal = makeSignal(); signals.push(signal); renderSignals(signal.id); schedule(); });
elements.samplePeriod.addEventListener("input", () => { if (syncingSampling) return; syncingSampling = true; const milliseconds = numeric(elements.samplePeriod); if (milliseconds > 0) elements.sampleRate.value = Number((1000 / milliseconds).toPrecision(10)); syncingSampling = false; schedule(); });
elements.sampleRate.addEventListener("input", () => { if (syncingSampling) return; syncingSampling = true; const rate = numeric(elements.sampleRate); if (rate > 0) elements.samplePeriod.value = Number((1000 / rate).toPrecision(10)); syncingSampling = false; schedule(); });
document.querySelectorAll('input[name="transform"]').forEach((control) => control.addEventListener("change", schedule));
elements.resetButton.addEventListener("click", () => { resetSignalSequence(); signals = []; elements.samplePeriod.value = 1; elements.sampleRate.value = 1000; document.querySelector('input[name="transform"][value="rfft"]').checked = true; renderSignals(); update(); });
elements.resetButton.click();
