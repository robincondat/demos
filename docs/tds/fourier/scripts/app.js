import { createChart } from "./chart.js?v=20261005";
import { decodeWav, makeSignal, palette } from "./signals.js";
const byId = (id) => document.getElementById(id);
const elements = Object.fromEntries(["signalList","addSignal","signalError","fftPoints","frequencyResolution","nyquistFrequency","significantPhaseOnly","resetButton","signalTemplate"].map((id) => [id, byId(id)]));
const timeChart = createChart({ stage: byId("timeStage"), canvas: byId("timeChart"), tooltip: byId("timeTooltip"), xLabel: "Temps (s)", yLabel: () => "Amplitude" });
const amplitudeChart = createChart({ stage: byId("amplitudeStage"), canvas: byId("amplitudeChart"), tooltip: byId("amplitudeTooltip"), xLabel: "Fréquence (Hz)", yLabel: () => "Amplitude" });
const phaseChart = createChart({ stage: byId("phaseStage"), canvas: byId("phaseChart"), tooltip: byId("phaseTooltip"), xLabel: "Fréquence (Hz)", yLabel: () => "Phase (rad)" });
const worker = new Worker("./scripts/scientific-worker.js?v=20261005b");
let signals = [], updateTimer = null, requestId = 0, pythonReady = false, lastResult = null;
const numeric = (input, fallback = 0) => {
  const value = input ? Number(input.value) : Number.NaN;
  return Number.isFinite(value) ? value : fallback;
};
const schedule = () => { clearTimeout(updateTimer); updateTimer = setTimeout(update, 80); };
function updateCardVisibility(card, signal) {
  card.querySelector(".function-definition").hidden = signal.definition !== "function";
  card.querySelector(".wav-definition").hidden = signal.definition !== "wav";
  card.querySelector(".combination-definition").hidden = signal.definition !== "combination";
  card.querySelector(".periodic-fields").hidden = !["sine", "cosine", "square", "triangle"].includes(signal.type);
  card.querySelector(".gate-fields").hidden = signal.type !== "gate";
}
function closeOtherCards(opened) { elements.signalList.querySelectorAll(".signal-card").forEach((card) => { if (card !== opened) card.open = false; }); }
function bindField(card, signal, field) {
  card.querySelectorAll(`[data-field="${field}"]`).forEach((input) => {
    if (input.type === "checkbox") input.checked = Boolean(signal[field]); else input.value = signal[field] ?? "";
    input.addEventListener("input", () => {
      signal[field] = input.type === "checkbox" ? input.checked : input.type === "number" ? numeric(input) : input.value;
      if (field === "definition" || field === "type") updateCardVisibility(card, signal);
      card.querySelectorAll(`[data-field="${field}"]`).forEach((peer) => { if (peer !== input) peer.value = input.value; });
      schedule();
    });
  });
}
function renderSignals(openId = null) {
  elements.signalList.replaceChildren(...signals.map((signal, index) => {
    const card = elements.signalTemplate.content.firstElementChild.cloneNode(true); card.dataset.id = signal.id; card.style.setProperty("--signal-color", palette[index % palette.length]); card.open = signal.id === openId;
    const combinationOption = card.querySelector(
      '[data-field="definition"] option[value="combination"]',
    );
    combinationOption.disabled = index === 0;
    if (index === 0 && signal.definition === "combination")
      signal.definition = "function";
    for (const field of ["visible","definition","type","frequency","delay","gateStart","gateEnd","sampleRate","amplitude","offset","expression","start","end"]) bindField(card, signal, field);
    card.querySelector("[data-summary-code]").textContent = signal.code; card.querySelector("[data-card-code]").textContent = signal.code;
    const available = signals.slice(0, index).map(({ code }) => code); card.querySelector("[data-expression-help]").textContent = available.length ? `Signaux disponibles : ${available.join(", ")}. Opérateurs : +, −, * et parenthèses.` : "Aucun signal précédent n’est disponible pour cette combinaison.";
    const visibility = card.querySelector(".visibility-toggle"); visibility.addEventListener("click", (event) => event.stopPropagation());
    card.addEventListener("toggle", () => { if (card.open) closeOtherCards(card); });
    card.querySelector(".remove-signal").addEventListener("click", () => { signals = signals.filter(({ id }) => id !== signal.id); renderSignals(); schedule(); });
    const fileInput = card.querySelector('[data-field="wavFile"]'); card.querySelector("[data-wav-name]").textContent = signal.wavName || "Aucun fichier chargé";
    fileInput.addEventListener("change", async () => { const [file] = fileInput.files; if (!file) return; elements.signalError.textContent = "Décodage du fichier WAV…"; try { Object.assign(signal, await decodeWav(file), { definition: "wav" }); signal.end = signal.start + signal.duration; renderSignals(signal.id); schedule(); } catch (error) { elements.signalError.textContent = `Impossible de lire ce fichier WAV : ${error.message}`; } });
    updateCardVisibility(card, signal); return card;
  }));
}
function payload() { return { signals }; }
function clearSignalResults() {
  lastResult = null;
  timeChart.setData([]);
  amplitudeChart.setData([]);
  phaseChart.setData([]);
  byId("timeEmpty").hidden = false;
  elements.fftPoints.textContent =
    elements.frequencyResolution.textContent =
      "—";
}
function update() {
  try {
    const data = payload(); elements.signalError.textContent = "";
    if (!pythonReady) return;
    if (!signals.length) { clearSignalResults(); elements.nyquistFrequency.textContent = "—"; return; }
    const invalidCombination = signals.findIndex(
      (signal, index) =>
        signal.definition === "combination" &&
        (index === 0 || !signal.expression.trim()),
    );
    if (invalidCombination >= 0) {
      throw new Error(
        `${signals[invalidCombination].code} : indiquez une expression utilisant un signal précédent.`,
      );
    }
    worker.postMessage({ type: "compute", id: ++requestId, payload: data });
  } catch (error) { elements.signalError.textContent = error.message; }
}
function rangeLabel(values, suffix = "") {
  if (!values.length) return "—"; const min = Math.min(...values), max = Math.max(...values), text = min === max ? min.toLocaleString("fr-FR") : `${min.toLocaleString("fr-FR")}–${max.toLocaleString("fr-FR")}`; return `${text}${suffix}`;
}
function display(result) {
  const visible = signals.map((signal, index) => ({ signal, data: result.signals[index], index })).filter(({ signal }) => signal.visible);
  timeChart.setData(visible.map(({ signal, data, index }) => ({ x: data.times, y: data.values, label: signal.code, color: palette[index % palette.length], width: 1.7 })));
  amplitudeChart.setData(visible.map(({ signal, data, index }) => ({ x: data.frequencies, y: data.amplitudes, label: signal.code, color: palette[index % palette.length], width: 1.6 })));
  phaseChart.setData(visible.map(({ signal, data, index }) => ({ x: data.frequencies, y: elements.significantPhaseOnly.checked ? data.significantPhases : data.phases, label: signal.code, color: palette[index % palette.length], width: 1.35 })));
  byId("timeEmpty").hidden = visible.length > 0;
  elements.fftPoints.textContent = rangeLabel(visible.map(({ data }) => data.values.length)); elements.frequencyResolution.textContent = rangeLabel(visible.map(({ data }) => Number(data.resolution.toPrecision(6))), " Hz"); elements.nyquistFrequency.textContent = rangeLabel(visible.map(({ data }) => Number(data.nyquist.toPrecision(8))), " Hz");
}
worker.addEventListener("message", ({ data }) => {
  if (data.type === "ready") {
    pythonReady = true;
    update();
  } else if (data.type === "error" && (data.id == null || data.id === requestId)) {
    elements.signalError.textContent = data.message;
  } else if (data.type === "result" && data.id === requestId) {
    lastResult = data.result;
    display(data.result);
  }
});
elements.significantPhaseOnly.addEventListener("change", () => { if (lastResult) display(lastResult); });
elements.addSignal.addEventListener("click", () => { const signal = makeSignal(signals.map(({ code }) => code)); signals.push(signal); renderSignals(signal.id); schedule(); });
elements.resetButton.addEventListener("click", () => { signals = []; renderSignals(); update(); });
elements.resetButton.click();
