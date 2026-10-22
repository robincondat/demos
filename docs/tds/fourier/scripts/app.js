import { createChart } from "./chart.js?v=20261021-curves2";
import { decodeWav, makeSignal, palette, signalName } from "./signals.js?v=20261019-help1";
import { parseEquation, parsePiecewise, renderFormula, renameSignal } from "./equations.js?v=20261019-help1";
import { createEquationEditor } from "./equation-editor.js?v=20261019-help1";
const byId = (id) => document.getElementById(id);
const elements = Object.fromEntries(["signalList","createSignal","loadWav","wavInput","signalError","fftPoints","frequencyResolution","nyquistFrequency","resetButton","signalTemplate","transformTitle","spectrumTitle"].map((id) => [id, byId(id)]));
const timeChart = createChart({ stage: byId("timeStage"), canvas: byId("timeChart"), tooltip: byId("timeTooltip"), xLabel: "Temps (s)", yLabel: () => "Amplitude" });
const spectrumType = () => document.querySelector('input[name="spectrum"]:checked').value;
const transformType = () => document.querySelector('input[name="transform"]:checked').value;
const spectrumChart = createChart({ stage: byId("spectrumStage"), canvas: byId("spectrumChart"), tooltip: byId("spectrumTooltip"), xLabel: "Fréquence (Hz)", yLabel: () => spectrumType() === "phase" ? "Phase (rad)" : "Amplitude" });
const worker = new Worker("./scripts/scientific-worker.js?v=20261019-dirac1");
let signals = [], updateTimer = null, requestId = 0, pythonReady = false, lastResult = null;
let wavImportVersion = 0;
const numeric = (input, fallback = 0) => {
  const value = input ? Number(input.value) : Number.NaN;
  return Number.isFinite(value) ? value : fallback;
};
const schedule = () => { clearTimeout(updateTimer); ++requestId; updateTimer = setTimeout(update, 80); };
const equationEditor = createEquationEditor({ signals: () => signals, onSave(signal) { renderSignals(signal.id); schedule(); } });
function closeOtherCards(opened) { elements.signalList.querySelectorAll(".signal-card").forEach((card) => { if (card !== opened) card.open = false; }); }
function renderSignalFormula(card, signal, index) {
  const formula = card.querySelector("[data-equation-formula]");
  formula.hidden = !signal.equationLatex || signal.definition === "wav";
  if (formula.hidden) return;
  try {
    const parsed = signal.equationMode === "cases" ? parsePiecewise(signal.equationCases, signal.equationOtherwise, signals.slice(0, index)) : parseEquation(signal.expression, signals.slice(0, index));
    signal.equationLatex = parsed.latex;
  } catch { /* Conserver l'affichage précédent si une référence a été supprimée. */ }
  renderFormula(formula, signal.equationLatex);
}
function bindField(card, signal, field) {
  card.querySelectorAll(`[data-field="${field}"]`).forEach((input) => {
    if (input.type === "checkbox") input.checked = Boolean(signal[field]); else input.value = signal[field] ?? "";
    input.addEventListener("input", () => {
      if (field === "name") {
        try { renameSignal(signals, signal, input.value); input.setCustomValidity(""); }
        catch (error) { input.setCustomValidity(error.message); return; }
        const name = signalName(signal);
        card.querySelector("[data-summary-code]").textContent = name;
        card.querySelector("[data-summary-code]").title = name;
        const identifier = card.querySelector("[data-card-code]");
        if (identifier) identifier.textContent = name;
        [...elements.signalList.children].forEach((item, index) => renderSignalFormula(item, signals[index], index));
        if (lastResult && lastResult.signals.length === signals.length) display(lastResult);
      } else signal[field] = input.type === "checkbox" ? input.checked : input.type === "number" ? numeric(input) : input.value;
      card.querySelectorAll(`[data-field="${field}"]`).forEach((peer) => { if (peer !== input) peer.value = input.value; });
      schedule();
    });
    if (field === "name") input.addEventListener("change", () => input.reportValidity());
  });
}
function renderSignals(openId = null) {
  elements.signalList.replaceChildren(...signals.map((signal, index) => {
    const card = elements.signalTemplate.content.firstElementChild.cloneNode(true); card.dataset.id = signal.id; card.style.setProperty("--signal-color", palette[index % palette.length]); card.open = signal.id === openId;
    signal.name ??= signalName(signal);
    const equationButton = card.querySelector("[data-equation-button]");
    equationButton.hidden = signal.definition === "wav";
    equationButton.textContent = signal.expression ? "Modifier l’équation" : "Saisir l’équation";
    equationButton.addEventListener("click", () => equationEditor.open(signal));
    renderSignalFormula(card, signal, index);
    const periodFormula = card.querySelector("[data-period-formula]");
    periodFormula.hidden = !signal.periodic?.enabled || signal.definition === "wav";
    if (!periodFormula.hidden) renderFormula(periodFormula, `${signal.periodic.expression.trim() === "T" ? "\\text{Période }T" : `T=${signal.periodic.latex}\\,\\mathrm{s}`}\\quad ${signal.periodic.origin === "centered" ? "[-T/2,T/2[" : "[0,T["}`);
    const parameters = card.querySelector("[data-equation-parameters]");
    parameters.hidden = signal.definition === "wav" || !Object.keys(signal.variables || {}).length;
    for (const [name, value] of Object.entries(signal.variables || {})) {
      const label = document.createElement("label"), title = document.createElement("span"), input = document.createElement("input");
      label.className = "field"; title.textContent = name;
      input.type = "number"; input.step = "any"; input.value = value ?? ""; input.setAttribute("aria-label", `Paramètre ${name}`);
      input.addEventListener("input", () => { signal.variables[name] = input.value.trim() ? Number(input.value) : null; schedule(); });
      label.append(title, input); parameters.append(label);
    }
    for (const field of ["visible","name","sampleRate","start","end"]) bindField(card, signal, field);
    const name = signalName(signal);
    card.querySelector("[data-summary-code]").textContent = name;
    card.querySelector("[data-summary-code]").title = name;
    const identifier = card.querySelector("[data-card-code]");
    if (identifier) identifier.textContent = name;
    const visibility = card.querySelector(".visibility-toggle"); visibility.addEventListener("click", (event) => event.stopPropagation());
    card.addEventListener("toggle", () => { if (card.open) closeOtherCards(card); });
    card.querySelector(".remove-signal").addEventListener("click", () => { signals = signals.filter(({ id }) => id !== signal.id); renderSignals(); schedule(); });
    return card;
  }));
}
function payload() { return { signals, transform: transformType() }; }
function clearSignalResults() {
  lastResult = null;
  timeChart.setData([]);
  spectrumChart.setData([]);
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
    for (const signal of signals) {
      for (const [name, value] of Object.entries(signal.variables || {})) {
        if (value === null || !Number.isFinite(value)) throw new Error(`${signalName(signal)} : saisissez une valeur pour ${name}.`);
      }
    }
    worker.postMessage({ type: "compute", id: ++requestId, payload: data });
  } catch (error) { clearSignalResults(); elements.signalError.textContent = error.message; }
}
function rangeLabel(values, suffix = "") {
  if (!values.length) return "—"; const min = Math.min(...values), max = Math.max(...values), text = min === max ? min.toLocaleString("fr-FR") : `${min.toLocaleString("fr-FR")}–${max.toLocaleString("fr-FR")}`; return `${text}${suffix}`;
}
function display(result) {
  const visible = signals.map((signal, index) => ({ signal, data: result.signals[index], index })).filter(({ signal }) => signal.visible);
  timeChart.setData(visible.map(({ signal, data, index }) => ({ x: data.times, y: data.values, label: signalName(signal), color: palette[index % palette.length], width: 1.7 })));
  const phase = spectrumType() === "phase";
  elements.spectrumTitle.textContent = phase ? "Spectre de phase" : "Spectre d’amplitude";
  spectrumChart.setData(visible.map(({ signal, data, index }) => ({ x: data.frequencies, y: phase ? data.phases : data.amplitudes, label: signalName(signal), color: palette[index % palette.length], width: phase ? 1.35 : 1.6 })));
  byId("timeEmpty").hidden = visible.length > 0;
  elements.fftPoints.textContent = rangeLabel(visible.map(({ data }) => data.frequencies.length)); elements.frequencyResolution.textContent = rangeLabel(visible.map(({ data }) => Number(data.resolution.toPrecision(6))), " Hz"); elements.nyquistFrequency.textContent = rangeLabel(visible.map(({ data }) => Number(data.nyquist.toPrecision(8))), " Hz");
}
worker.addEventListener("message", ({ data }) => {
  if (data.type === "ready") {
    pythonReady = true;
    update();
  } else if (data.type === "error" && (data.id == null || data.id === requestId)) {
    clearSignalResults();
    elements.signalError.textContent = data.message;
  } else if (data.type === "result" && data.id === requestId) {
    lastResult = data.result;
    display(data.result);
  }
});
document.querySelectorAll('input[name="spectrum"]').forEach(input => input.addEventListener("change", () => {
  elements.spectrumTitle.textContent = spectrumType() === "phase" ? "Spectre de phase" : "Spectre d’amplitude";
  if (lastResult) display(lastResult); else spectrumChart.setData([]);
}));
document.querySelectorAll('input[name="transform"]').forEach(input => input.addEventListener("change", () => {
  ++requestId;
  clearSignalResults();
  elements.transformTitle.textContent = `Informations ${transformType().toUpperCase()}`;
  update();
}));
elements.createSignal.addEventListener("click", () => { const signal = makeSignal([...signals.map(({ code }) => code), ...signals.map(signalName)]); signals.push(signal); renderSignals(signal.id); schedule(); });
elements.loadWav.addEventListener("click", () => elements.wavInput.click());
elements.wavInput.addEventListener("change", async () => {
  const [file] = elements.wavInput.files;
  if (!file) return;
  const version = ++wavImportVersion;
  elements.loadWav.disabled = true;
  elements.signalError.textContent = "Décodage du fichier WAV…";
  try {
    const decoded = await decodeWav(file);
    if (version !== wavImportVersion) return;
    if (!(decoded.duration > 0)) throw new Error("Le fichier WAV ne contient aucun échantillon.");
    const signal = makeSignal(signals.map(({ code }) => code), {
      ...decoded, name: decoded.wavName.replace(/\.wav$/i, ""), definition: "wav", start: 0, end: decoded.duration,
    });
    const originalName = signal.name;
    let suffix = 2;
    while (signals.some(item => signalName(item) === signal.name)) signal.name = `${originalName}_${suffix++}`;
    signals.push(signal);
    renderSignals(signal.id);
    schedule();
  } catch (error) {
    if (version === wavImportVersion) elements.signalError.textContent = `Impossible de lire ce fichier WAV : ${error.message}`;
  } finally {
    if (version === wavImportVersion) {
      elements.wavInput.value = "";
      elements.loadWav.disabled = false;
    }
  }
});
elements.resetButton.addEventListener("click", () => {
  clearTimeout(updateTimer); ++requestId;
  ++wavImportVersion;
  elements.wavInput.value = "";
  elements.loadWav.disabled = false;
  signals = [];
  equationEditor.close();
  document.querySelector('input[name="transform"][value="rfft"]').checked = true;
  document.querySelector('input[name="spectrum"][value="amplitude"]').checked = true;
  elements.transformTitle.textContent = "Informations RFFT";
  elements.spectrumTitle.textContent = "Spectre d’amplitude";
  clearSignalResults(); elements.nyquistFrequency.textContent = "—";
  renderSignals(); update();
});
elements.resetButton.click();
