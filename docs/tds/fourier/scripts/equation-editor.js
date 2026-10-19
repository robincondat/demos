import { parseEquation, parsePiecewise, parsePeriod, renderFormula, referenceName, referenceText } from "./equations.js?v=20261019-help1";
import { signalName, palette } from "./signals.js?v=20261019-help1";
import { colorizeInput } from "./syntax-colors.js?v=20261019-help1";
import { createEquationHelp } from "./equation-help.js?v=20261019-help1";

export function createEquationEditor({ signals, onSave }) {
  const $ = id => document.getElementById(id), dialog = $("equationDialog");
  let active = null, parsed = null, focusedInput = null, parsedPeriod = null;
  const help = createEquationHelp({ dialog, input: () => focusedInput, previous, insert });
  const mode = () => document.querySelector('input[name="equationMode"]:checked').value;
  const rows = () => [...$("equationCases").children].map(row => ({ expression: row.querySelector("[data-case-value]").value, condition: row.querySelector("[data-case-condition]").value }));
  const highlights = new Set();
  function highlight(input) { highlights.add(colorizeInput(input, previous)); }
  [$("equationInput"), $("equationOtherwise"), $("periodExpression")].forEach(highlight);
  function refreshColors() {
    for (const item of highlights) {
      if (item.input.isConnected) item.refresh(); else { item.destroy(); highlights.delete(item); }
    }
  }
  function updateRowButtons() {
    const items = [...$("equationCases").children];
    items.forEach((row, index) => {
      row.querySelector("[data-case-value]").setAttribute("aria-label", `Expression du cas ${index + 1}`);
      row.querySelector("[data-case-condition]").setAttribute("aria-label", `Condition du cas ${index + 1}`);
      row.querySelector("button").disabled = items.length === 1;
      row.querySelector("button").setAttribute("aria-label", `Supprimer le cas ${index + 1}`);
    });
    $("addEquationCase").disabled = items.length >= 32;
  }
  function addRow({ expression = "", condition = "" } = {}) {
    const row = document.createElement("div"); row.className = "piecewise-row";
    const value = document.createElement("input"), keyword = document.createElement("span"), test = document.createElement("input"), remove = document.createElement("button");
    value.type = test.type = "text"; value.spellcheck = test.spellcheck = false;
    value.dataset.caseValue = ""; test.dataset.caseCondition = "";
    value.value = expression; test.value = condition; value.placeholder = "A"; test.placeholder = "0 <= t < T/2";
    keyword.className = "case-keyword"; keyword.textContent = "si";
    remove.type = "button"; remove.className = "case-remove"; remove.textContent = "×";
    remove.addEventListener("click", () => { row.remove(); updateRowButtons(); preview(); });
    row.append(value, keyword, test, remove); $("equationCases").append(row);
    highlight(value); highlight(test); updateRowButtons();
    return value;
  }
  function updateMode() {
    $("singleEquationPanel").hidden = mode() !== "single";
    $("piecewiseEquationPanel").hidden = mode() !== "cases";
    focusedInput = mode() === "single" ? $("equationInput") : $("equationCases").querySelector("input");
    preview();
  }
  function previous() { return signals().slice(0, signals().findIndex(signal => signal.id === active?.id)); }
  function preview() {
    parsed = null; parsedPeriod = null; $("equationError").textContent = ""; $("saveEquation").disabled = true;
    $("periodicOptions").hidden = !$("periodicEnabled").checked;
    refreshColors();
    try {
      parsed = mode() === "cases" ? parsePiecewise(rows(), $("equationOtherwise").value, previous()) : parseEquation($("equationInput").value, previous());
      if ($("periodicEnabled").checked) {
        parsedPeriod = parsePeriod($("periodExpression").value);
        parsed.variables = [...new Set([...parsed.variables, ...parsedPeriod.variables])];
      }
      renderFormula($("equationPreview"), parsed.latex);
      $("equationVariables").replaceChildren(...parsed.variables.map(name => {
        const chip = document.createElement("span"); chip.className = "parameter-chip"; chip.textContent = name; chip.title = "Paramètre à définir dans la fiche du signal"; return chip;
      }));
      $("saveEquation").disabled = false;
    } catch (error) {
      parsed = null; parsedPeriod = null;
      $("equationPreview").replaceChildren(); $("equationVariables").textContent = "";
      $("equationError").textContent = error.message;
    }
  }
  $("equationInput").addEventListener("input", preview);
  $("equationCases").addEventListener("input", preview);
  $("equationOtherwise").addEventListener("input", preview);
  $("periodicEnabled").addEventListener("change", preview);
  $("periodExpression").addEventListener("input", preview);
  document.querySelectorAll('input[name="periodOrigin"]').forEach(input => input.addEventListener("change", preview));
  dialog.addEventListener("focusin", event => {
    if (event.target.matches("#equationInput, #equationOtherwise, #periodExpression, [data-case-value], [data-case-condition]")) { focusedInput = event.target; help.refresh(); }
  });
  document.querySelectorAll('input[name="equationMode"]').forEach(input => input.addEventListener("change", updateMode));
  $("addEquationCase").addEventListener("click", () => { addRow().focus(); preview(); });
  function close() { dialog.close(); active = null; }
  $("cancelEquation").addEventListener("click", close);
  $("closeEquation").addEventListener("click", close);
  dialog.addEventListener("close", () => { active = null; });
  $("saveEquation").addEventListener("click", () => {
    if (!active) return;
    preview(); if (!parsed) return;
    const signal = signals().find(signal => signal.id === active.id);
    if (!signal) { close(); return; }
    const oldVariables = signal.variables || {};
    Object.assign(signal, { expression: parsed.expression, equationTree: parsed.tree, equationLatex: parsed.latex,
      equationMode: mode(), equationCases: rows(), equationOtherwise: $("equationOtherwise").value, equationSingleExpression: $("equationInput").value,
      periodic: { enabled: $("periodicEnabled").checked, expression: $("periodExpression").value, origin: document.querySelector('input[name="periodOrigin"]:checked').value,
        tree: parsedPeriod?.tree || null, latex: parsedPeriod?.latex || "" },
      variables: Object.fromEntries(parsed.variables.map(name => [name, oldVariables[name] ?? 1])) });
    close(); onSave(signal);
  });
  // Les boutons d'aide insèrent leur fonction au curseur sans effacer la saisie.
  function insert(text) {
    const input = focusedInput?.isConnected ? focusedInput : (mode() === "single" ? $("equationInput") : $("equationCases").querySelector("input"));
    const start = input.selectionStart;
    input.setRangeText(text, start, input.selectionEnd, "end"); input.focus();
    const argument = text.indexOf("(t");
    if (argument >= 0) input.setSelectionRange(start + argument + 1, start + argument + 2);
    preview();
    help.refresh();
  }
  return {
    open(signal) {
      help.reset();
      active = signal; $("equationDialogTitle").textContent = `Équation — ${signalName(signal)}`;
      const savedMode = signal.equationMode || "single";
      document.querySelector(`input[name="equationMode"][value="${savedMode}"]`).checked = true;
      $("equationInput").value = signal.equationSingleExpression ?? (savedMode === "single" ? signal.expression || "" : "");
      $("equationCases").replaceChildren();
      (signal.equationCases?.length ? signal.equationCases : [{ expression: $("equationInput").value, condition: "" }]).forEach(addRow);
      $("equationOtherwise").value = signal.equationOtherwise ?? "0";
      $("periodicEnabled").checked = Boolean(signal.periodic?.enabled);
      $("periodExpression").value = signal.periodic?.expression ?? "T";
      document.querySelector(`input[name="periodOrigin"][value="${signal.periodic?.origin === "centered" ? "centered" : "zero"}"]`).checked = true;
      const refs = previous();
      $("equationReferences").replaceChildren(...refs.map((signal, index) => {
        const button = document.createElement("button"); button.type = "button"; button.className = "reference-button";
        button.textContent = referenceName(signal);
        button.title = `Insérer ${referenceText(signal)}`;
        button.style.setProperty("--reference-color", palette[index % palette.length]);
        button.addEventListener("click", () => {
          insert(referenceText(signal));
        });
        return button;
      }));
      $("equationReferenceSection").hidden = !refs.length;
      dialog.showModal();
      updateMode();
      if (signal.expression) preview(); else { parsed = null; $("equationError").textContent = ""; $("equationPreview").replaceChildren(); $("equationVariables").textContent = ""; $("saveEquation").disabled = true; }
      focusedInput.focus();
    }, close,
  };
}
