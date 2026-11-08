import {
  createComputationController,
  validateSignalParameters,
} from "./computation-controller.js?v=20261106-tds3";
import { mountSignalTemplate } from "./tds-signals/signal-template.js?v=20261106-tds3";
import { createSignalCards } from "./tds-signals/signal-cards.js?v=20261106-tds3";
import {
  decodeWav,
  makeSignal,
  palette,
  signalName,
} from "./tds-signals/signals.js?v=20261106-tds3";
import { createEquationEditor } from "./tds-signals/equation-editor.js?v=20261106-tds3";

export function createSignalListApp({
  workerURL,
  displayResult,
  clearView,
  extraPayload = () => ({}),
  onReset = () => {},
  single = false,
}) {
  const byId = (id) => document.getElementById(id);
  mountSignalTemplate({ visibility: true });
  const elements = Object.fromEntries(
    [
      "signalList",
      "createSignal",
      "loadWav",
      "wavInput",
      "signalError",
      "resetButton",
      "signalTemplate",
    ].map((id) => [id, byId(id)]),
  );
  let signals = [],
    lastResult = null;
  let wavImportVersion = 0;
  const numeric = (input, fallback = 0) => {
    const value = input ? Number(input.value) : Number.NaN;
    return Number.isFinite(value) ? value : fallback;
  };
  const computation = createComputationController({
    workerURL,
    onReady: update,
    onResult(result) {
      lastResult = result;
      display(result);
    },
    onError(message) {
      clearSignalResults();
      elements.signalError.textContent = message;
    },
  });
  const schedule = () => computation.schedule(update);
  const equationEditor = createEquationEditor({
    signals: () => signals,
    onSave(signal) {
      renderSignals(signal.id);
      schedule();
    },
  });
  function closeOtherCards(opened) {
    elements.signalList.querySelectorAll(".signal-card").forEach((card) => {
      if (card !== opened) card.open = false;
    });
  }
  function renderSignals(openId = null) {
    elements.createSignal.closest(".signal-actions").hidden = single && signals.length > 0;
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
      onRename() {
        if (lastResult && lastResult.signals.length === signals.length) display(lastResult);
      },
    });
    elements.signalList.replaceChildren(
      ...signals.map((signal, index) => {
        const card = elements.signalTemplate.content.firstElementChild.cloneNode(true);
        card.dataset.id = signal.id;
        card.style.setProperty("--signal-color", palette[index % palette.length]);
        card.open = signal.id === openId;
        cards.populate(card, signal, index, ["visible", "name", "sampleRate", "start", "end"]);
        const visibility = card.querySelector(".visibility-toggle");
        visibility.addEventListener("click", (event) => event.stopPropagation());
        card.addEventListener("toggle", () => {
          if (card.open) closeOtherCards(card);
        });
        card.querySelector(".remove-signal").addEventListener("click", () => {
          signals = signals.filter(({ id }) => id !== signal.id);
          renderSignals();
          schedule();
        });
        return card;
      }),
    );
  }
  function payload() {
    return { signals, ...extraPayload() };
  }
  function clearSignalResults() {
    lastResult = null;
    clearView();
  }
  function update() {
    try {
      const data = payload();
      elements.signalError.textContent = "";
      if (!computation.ready) return;
      if (!signals.length) {
        clearSignalResults();
        return;
      }
      validateSignalParameters(signals);
      computation.submit(data);
    } catch (error) {
      clearSignalResults();
      elements.signalError.textContent = error.message;
    }
  }
  function display(result) {
    displayResult(result, signals);
  }
  elements.createSignal.addEventListener("click", () => {
    if (single && signals.length) return;
    const signal = makeSignal([...signals.map(({ code }) => code), ...signals.map(signalName)]);
    signals.push(signal);
    renderSignals(signal.id);
    schedule();
  });
  elements.loadWav.addEventListener("click", () => elements.wavInput.click());
  elements.wavInput.addEventListener("change", async () => {
    const [file] = elements.wavInput.files;
    if (!file || (single && signals.length)) return;
    const version = ++wavImportVersion;
    elements.loadWav.disabled = true;
    elements.signalError.textContent = "Décodage du fichier WAV…";
    try {
      const decoded = await decodeWav(file);
      if (version !== wavImportVersion) return;
      if (single && signals.length) return;
      if (!(decoded.duration > 0)) throw new Error("Le fichier WAV ne contient aucun échantillon.");
      const signal = makeSignal(
        signals.map(({ code }) => code),
        {
          ...decoded,
          name: decoded.wavName.replace(/\.wav$/i, ""),
          definition: "wav",
          start: 0,
          end: decoded.duration,
        },
      );
      const originalName = signal.name;
      let suffix = 2;
      while (signals.some((item) => signalName(item) === signal.name))
        signal.name = `${originalName}_${suffix++}`;
      signals.push(signal);
      renderSignals(signal.id);
      schedule();
    } catch (error) {
      if (version === wavImportVersion)
        elements.signalError.textContent = `Impossible de lire ce fichier WAV : ${error.message}`;
    } finally {
      if (version === wavImportVersion) {
        elements.wavInput.value = "";
        elements.loadWav.disabled = false;
      }
    }
  });
  elements.resetButton.addEventListener("click", () => {
    computation.invalidate();
    ++wavImportVersion;
    elements.wavInput.value = "";
    elements.loadWav.disabled = false;
    signals = [];
    equationEditor.close();
    onReset();
    clearSignalResults();
    renderSignals();
    update();
  });
  elements.resetButton.click();

  return {
    schedule,
    invalidate() {
      computation.invalidate();
      lastResult = null;
    },
    update,
    redisplay() {
      if (lastResult) display(lastResult);
    },
  };
}
