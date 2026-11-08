import {
  createComputationController,
  validateSignalParameters,
} from "./computation-controller.js?v=20261106-tds3";
import { mountSignalTemplate } from "./tds-signals/signal-template.js?v=20261106-tds3";
import { createSignalCards } from "./tds-signals/signal-cards.js?v=20261106-tds3";
import { createChart } from "./chart.js?v=20261106-tds3";
import { createMemoryWarning } from "./memory-warning.js?v=20261106-tds3";
import {
  decodeWav,
  makeSignal,
  palette,
  signalName,
} from "./tds-signals/signals.js?v=20261106-tds3";
import { createEquationEditor } from "./tds-signals/equation-editor.js?v=20261106-tds3";

export function createPairSignalApp({
  workerURL,
  resultKey,
  errorKey,
  operationLabel,
  emptyMessage,
  descriptions,
  createInspector,
  outputAxis = "Temps (s)",
  extraPayload = () => ({}),
  setupControls = () => {},
  resetControls = () => {},
  outputOptions = () => ({}),
}) {
  const byId = (id) => document.getElementById(id);
  const slots = ["input", "impulse"];
  mountSignalTemplate({ visibility: false });
  const elements = { signalTemplate: byId("signalTemplate"), signalError: byId("signalError") };
  const charts = Object.fromEntries(
    [...slots, "output"].map((slot) => [
      slot,
      createChart({
        stage: byId(slot + "Stage"),
        canvas: byId(slot + "Chart"),
        tooltip: byId(slot + "Tooltip"),
        xLabel: slot === "impulse" ? "τ (s)" : slot === "output" ? outputAxis : "Temps (s)",
        yLabel: () => "Amplitude",
        onPointerTime:
          slot !== "input"
            ? (time) => {
                charts.output.setCursor(time);
                charts.impulse.setCursor(time);
                if (time !== null) inspector.hoverTime(time);
              }
            : undefined,
      }),
    ]),
  );
  const inspector = createInspector({
    chart: charts.impulse,
    stage: byId("impulseStage"),
  });
  charts.output.onViewChange((view) => charts.impulse.setView(view));
  charts.impulse.onViewChange((view) => charts.output.setView(view));
  let signals = [];
  const importsInProgress = { input: 0, impulse: 0 },
    busy = { input: false, impulse: false };
  const mode = () => document.querySelector('input[name="mode"]:checked').value;
  const memoryWarning = createMemoryWarning((message) => window.confirm(message));
  const numeric = (input) =>
    input.value.trim() !== "" && Number.isFinite(Number(input.value)) ? Number(input.value) : NaN;
  const computation = createComputationController({
    workerURL,
    onReady() {
      byId("engineStatus").textContent = "";
      update();
    },
    onResult(result) {
      display(result);
      byId("engineStatus").textContent = "";
    },
    onError(message) {
      clearResults();
      elements.signalError.textContent = message;
      byId("engineStatus").textContent = "";
    },
    onSchedule: clearOutput,
  });
  const schedule = () => computation.schedule(update);
  const equationEditor = createEquationEditor({
    signals: () => signals,
    onSave(signal) {
      renderSignals(signal.id);
      schedule();
    },
  });
  function refreshActions() {
    for (const slot of slots) {
      const filled = signals.some((signal) => signal.slot === slot);
      byId(slot + "Actions").hidden = filled;
      document
        .querySelectorAll('[data-create="' + slot + '"], [data-load="' + slot + '"]')
        .forEach((button) => (button.disabled = filled || busy[slot]));
    }
  }
  function clearOutput() {
    inspector.clear();
    charts.output.setData([]);
    byId("outputEmpty").hidden = false;
    byId("outputEmpty").textContent = emptyMessage;
  }
  function clearResults() {
    for (const slot of slots) {
      charts[slot].setData([]);
      byId(slot + "Empty").hidden = false;
    }
    clearOutput();
  }
  function renderSignals(openId = null) {
    const cards = createSignalCards({
      signals,
      equationEditor,
      schedule,
      numeric,
      refreshFormulas() {
        [...document.querySelectorAll(".signal-card")].forEach((card, index) =>
          cards.renderSignalFormula(card, signals[index], index),
        );
      },
    });
    for (const slot of slots) byId(`${slot}List`).replaceChildren();
    signals.forEach((signal, index) => {
      const card = elements.signalTemplate.content.firstElementChild.cloneNode(true);
      card.dataset.id = signal.id;
      card.style.setProperty("--signal-color", palette[slots.indexOf(signal.slot)]);
      card.open = signal.id === openId;
      cards.populate(card, signal, index);
      card.querySelector(".remove-signal").addEventListener("click", () => {
        signals = signals.filter(({ id }) => id !== signal.id);
        renderSignals();
        schedule();
      });
      byId(`${signal.slot}List`).append(card);
    });
    refreshActions();
  }

  function updateMode() {
    byId("modeDescription").textContent =
      descriptions[mode()] + " N et M désignent les nombres d’échantillons des deux signaux.";
  }
  function update() {
    elements.signalError.textContent = "";
    if (!signals.length) {
      clearResults();
      return;
    }
    if (!computation.ready) return;
    try {
      validateSignalParameters(signals);
      if (!memoryWarning.check(signals)) {
        byId("engineStatus").textContent = "Calcul annulé.";
        return;
      }
      byId("engineStatus").textContent = "Calcul en cours…";
      computation.submit({
        signals,
        mode: mode(),
        normalize: byId("normalizeByStep").checked,
        ...extraPayload(),
      });
    } catch (error) {
      clearResults();
      elements.signalError.textContent = error.message;
      byId("engineStatus").textContent = "";
    }
  }
  function display(result) {
    const sources = slots.flatMap((slot, index) => {
      const data = result.signals.find((item) => item.slot === slot),
        signal = signals.find((item) => item.slot === slot);
      return data
        ? [
            {
              x: data.times,
              y: data.values,
              label: signalName(signal),
              color: palette[index],
              width: 1.7,
            },
          ]
        : [];
    });
    charts.input.setData(sources);
    byId("inputEmpty").hidden = sources.length > 0;
    const data = result[resultKey];
    charts.output.setData(
      data
        ? [
            {
              x: data.times,
              y: data.values,
              label: typeof operationLabel === "function" ? operationLabel() : operationLabel,
              color: palette[2],
              width: 1.7,
            },
          ]
        : [],
      outputOptions(result),
    );
    byId("outputEmpty").hidden = Boolean(data);
    byId("outputEmpty").textContent = result[errorKey] || emptyMessage;
    elements.signalError.textContent = result[errorKey] || "";
    inspector.setResult(result, signals.find((signal) => signal.slot === "input")?.sampleRate);
    if (data) {
      const shared = [data.times[0], data.times[data.times.length - 1]];
      if (shared[1] === shared[0])
        shared[1] += 1 / signals.find((signal) => signal.slot === "input").sampleRate;
      inspector.setDomain(shared);
      charts.output.setDomain(shared);
      charts.impulse.setDomain(shared);
    }
  }
  function addSignal(slot, overrides = {}) {
    if (signals.some((signal) => signal.slot === slot)) return;
    const signal = makeSignal(
      signals.map((signal) => signal.code),
      { name: slot === "input" ? "A" : "B", slot, ...overrides },
    );
    const original = signal.name;
    let suffix = 2;
    while (signals.some((item) => signalName(item) === signal.name))
      signal.name = original + "_" + suffix++;
    signals.push(signal);
    signals.sort((a, b) => slots.indexOf(a.slot) - slots.indexOf(b.slot));
    renderSignals(signal.id);
    schedule();
  }
  for (const slot of slots) {
    document.querySelector('[data-create="' + slot + '"]').addEventListener("click", () => {
      if (!busy[slot]) {
        byId(slot + "Error").textContent = "";
        addSignal(slot);
      }
    });
    document
      .querySelector('[data-load="' + slot + '"]')
      .addEventListener("click", () => byId(slot + "Wav").click());
    byId(slot + "Wav").addEventListener("change", async () => {
      const [file] = byId(slot + "Wav").files;
      if (!file || signals.some((signal) => signal.slot === slot) || busy[slot]) return;
      const version = ++importsInProgress[slot];
      busy[slot] = true;
      refreshActions();
      byId(slot + "Error").textContent = "Décodage du fichier WAV…";
      try {
        const decoded = await decodeWav(file);
        if (version !== importsInProgress[slot]) return;
        if (!(decoded.duration > 0)) throw Error("Le fichier WAV ne contient aucun échantillon.");
        addSignal(slot, {
          ...decoded,
          name: decoded.wavName.replace(/\.wav$/i, ""),
          definition: "wav",
          start: 0,
          end: decoded.duration,
        });
        byId(slot + "Error").textContent = "";
      } catch (error) {
        if (version === importsInProgress[slot])
          byId(slot + "Error").textContent = "Impossible de lire ce fichier WAV : " + error.message;
      } finally {
        if (version === importsInProgress[slot]) {
          busy[slot] = false;
          byId(slot + "Wav").value = "";
          refreshActions();
        }
      }
    });
  }
  document.querySelectorAll('input[name="mode"]').forEach((input) =>
    input.addEventListener("change", () => {
      updateMode();
      schedule();
    }),
  );
  byId("normalizeByStep").addEventListener("change", schedule);
  byId("resetButton").addEventListener("click", () => {
    computation.invalidate();
    equationEditor.close();
    signals = [];
    memoryWarning.reset();
    byId("normalizeByStep").checked = false;
    resetControls();
    for (const slot of slots) {
      ++importsInProgress[slot];
      busy[slot] = false;
      byId(slot + "Wav").value = "";
      byId(slot + "Error").textContent = "";
    }
    document.querySelector('input[name="mode"][value="full"]').checked = true;
    updateMode();
    renderSignals();
    clearResults();
    elements.signalError.textContent = "";
    if (computation.ready) byId("engineStatus").textContent = "";
  });
  setupControls({ schedule, updateMode });
  updateMode();
  renderSignals();
  clearResults();
}
