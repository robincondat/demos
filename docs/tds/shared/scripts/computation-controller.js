import { signalName } from "./tds-signals/signals.js?v=20261106-tds3";

export function validateSignalParameters(signals) {
  for (const signal of signals) {
    for (const [field, label] of Object.entries({
      sampleRate: "la fréquence d’échantillonnage",
      start: "le début",
      end: "la fin",
    })) {
      if (!Number.isFinite(signal[field]))
        throw Error(`${signalName(signal)} : saisissez une valeur valide pour ${label}.`);
    }
    for (const [name, value] of Object.entries(signal.variables || {})) {
      if (value === null || !Number.isFinite(value))
        throw Error(`${signalName(signal)} : saisissez une valeur pour ${name}.`);
    }
  }
}

export function createComputationController({
  workerURL,
  onReady,
  onResult,
  onError,
  onSchedule = () => {},
  delay = 80,
}) {
  const worker = new Worker(workerURL);
  let ready = false,
    requestId = 0,
    timer = null;
  function invalidate() {
    clearTimeout(timer);
    timer = null;
    ++requestId;
  }
  worker.addEventListener("message", ({ data }) => {
    if (data.type === "ready") {
      ready = true;
      onReady();
    } else if (data.type === "result" && data.id === requestId) onResult(data.result);
    else if (data.type === "error" && (data.id == null || data.id === requestId))
      onError(data.message);
  });
  worker.addEventListener("error", () => {
    ready = false;
    invalidate();
    onError("Le moteur de calcul n’a pas pu démarrer. Rechargez la page.");
  });
  return {
    get ready() {
      return ready;
    },
    invalidate,
    schedule(update) {
      invalidate();
      onSchedule();
      timer = setTimeout(() => {
        timer = null;
        update();
      }, delay);
    },
    submit(payload) {
      if (ready) worker.postMessage({ type: "compute", id: ++requestId, payload });
    },
  };
}
