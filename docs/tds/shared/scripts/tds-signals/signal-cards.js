import { signalName } from "./signals.js?v=20261106-tds3";
import {
  parseEquation,
  parsePiecewise,
  renderFormula,
  renameSignal,
} from "./equations.js?v=20261106-tds3";
export function createSignalCards({
  signals,
  equationEditor,
  schedule,
  numeric,
  refreshFormulas,
  onRename = () => {},
}) {
  function renderSignalFormula(card, signal, index) {
    const formula = card.querySelector("[data-equation-formula]");
    formula.hidden = !signal.equationLatex || signal.definition === "wav";
    if (formula.hidden) return;
    try {
      const parsed =
        signal.equationMode === "cases"
          ? parsePiecewise(signal.equationCases, signal.equationOtherwise, signals.slice(0, index))
          : parseEquation(signal.expression, signals.slice(0, index));
      signal.equationLatex = parsed.latex;
    } catch {
      /* Conserver l'affichage précédent si une référence a été supprimée. */
    }
    renderFormula(formula, signal.equationLatex);
  }
  function bindField(card, signal, field) {
    card.querySelectorAll(`[data-field="${field}"]`).forEach((input) => {
      if (input.type === "checkbox") input.checked = Boolean(signal[field]);
      else input.value = signal[field] ?? "";
      input.addEventListener("input", () => {
        if (field === "name") {
          try {
            renameSignal(signals, signal, input.value);
            input.setCustomValidity("");
          } catch (error) {
            input.setCustomValidity(error.message);
            return;
          }
          const name = signalName(signal);
          card.querySelector("[data-summary-code]").textContent = name;
          card.querySelector("[data-summary-code]").title = name;
          const identifier = card.querySelector("[data-card-code]");
          if (identifier) identifier.textContent = name;
          refreshFormulas();
          onRename(signal);
        } else
          signal[field] =
            input.type === "checkbox"
              ? input.checked
              : input.type === "number"
                ? numeric(input)
                : input.value;
        card.querySelectorAll(`[data-field="${field}"]`).forEach((peer) => {
          if (peer !== input) peer.value = input.value;
        });
        schedule();
      });
      if (field === "name") input.addEventListener("change", () => input.reportValidity());
    });
  }

  function populate(card, signal, index, fields = ["name", "sampleRate", "start", "end"]) {
    signal.name ??= signalName(signal);
    const equationButton = card.querySelector("[data-equation-button]");
    equationButton.hidden = signal.definition === "wav";
    equationButton.textContent = signal.expression ? "Modifier l’équation" : "Saisir l’équation";
    equationButton.addEventListener("click", () => equationEditor.open(signal));
    renderSignalFormula(card, signal, index);
    const periodFormula = card.querySelector("[data-period-formula]");
    periodFormula.hidden = !signal.periodic?.enabled || signal.definition === "wav";
    if (!periodFormula.hidden)
      renderFormula(
        periodFormula,
        `${signal.periodic.expression.trim() === "T" ? "\\text{Période }T" : `T=${signal.periodic.latex}\\,\\mathrm{s}`}\\quad ${signal.periodic.origin === "centered" ? "[-T/2,T/2[" : "[0,T["}`,
      );
    const parameters = card.querySelector("[data-equation-parameters]");
    parameters.hidden = signal.definition === "wav" || !Object.keys(signal.variables || {}).length;
    for (const [name, value] of Object.entries(signal.variables || {})) {
      const label = document.createElement("label"),
        title = document.createElement("span"),
        input = document.createElement("input");
      label.className = "field";
      title.textContent = name;
      input.type = "number";
      input.step = "any";
      input.value = value ?? "";
      input.setAttribute("aria-label", `Paramètre ${name}`);
      input.addEventListener("input", () => {
        signal.variables[name] = input.value.trim() ? Number(input.value) : null;
        schedule();
      });
      label.append(title, input);
      parameters.append(label);
    }
    for (const field of fields) bindField(card, signal, field);
    const name = signalName(signal);
    card.querySelector("[data-summary-code]").textContent = name;
    card.querySelector("[data-summary-code]").title = name;
    const identifier = card.querySelector("[data-card-code]");
    if (identifier) identifier.textContent = name;
  }
  return { populate, renderSignalFormula };
}
