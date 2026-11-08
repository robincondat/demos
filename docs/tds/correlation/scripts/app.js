import { createPairSignalApp } from "../../shared/scripts/pair-signal-app.js?v=20261106-tds3";
import { createCorrelationInspector } from "./correlation-inspector.js?v=20261106-tds3";

const method = () => document.querySelector('input[name="correlationMethod"]:checked').value;
function refreshMethod() {
  const zncc = method() === "zncc";
  const normalize = document.getElementById("normalizeByStep");
  normalize.disabled = zncc;
  normalize.closest("label").hidden = zncc;
  document.getElementById("znccDescription").hidden = !zncc;
}

createPairSignalApp({
  workerURL: "./scripts/scientific-worker.js?v=20261106-tds3",
  resultKey: "correlation",
  errorKey: "correlationError",
  operationLabel: () => (method() === "zncc" ? "ZNCC" : "Corrélation"),
  outputAxis: "Retard (s)",
  emptyMessage: "Définissez les deux signaux pour calculer leur corrélation.",
  descriptions: {
    full: "Corrélation complète : N + M − 1 échantillons. Tous les retards sont explorés, avec un prolongement par zéro.",
    same: "Partie centrale de la corrélation complète : N échantillons, soit la taille du signal A (convention SciPy).",
    valid:
      "Recouvrements complets uniquement : |N − M| + 1 échantillons, sans contribution du prolongement par zéro.",
  },
  createInspector: createCorrelationInspector,
  outputOptions: (result) => (result.method === "zncc" ? { yRange: [-1, 1] } : {}),
  extraPayload: () => ({ method: method() }),
  setupControls({ schedule }) {
    document.querySelectorAll('input[name="correlationMethod"]').forEach((input) => {
      input.addEventListener("change", () => {
        refreshMethod();
        schedule();
      });
    });
    refreshMethod();
  },
  resetControls() {
    document.querySelector('input[name="correlationMethod"][value="classic"]').checked = true;
    refreshMethod();
  },
});
