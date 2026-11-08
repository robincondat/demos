const markup = `  <template id="signalTemplate">
    <details class="signal-card">
      <summary>
        <i class="signal-color"></i><strong data-summary-code>S1</strong>
        <label class="visibility-toggle" title="Afficher ce signal"><input data-field="visible" type="checkbox" checked /><span>Afficher</span></label>
      </summary>
      <div class="signal-card-content">
        <div class="signal-card-heading"><input class="signal-name-input" data-field="name" type="text" aria-label="Nom du signal" title="Modifier le nom du signal" placeholder="Nom du signal" /><button class="remove-signal" type="button" aria-label="Supprimer ce signal">×</button></div>
        <button class="secondary-button equation-button" data-equation-button type="button">Saisir l’équation</button>
        <div class="equation-formula" data-equation-formula hidden></div>
        <div class="period-formula" data-period-formula hidden></div>
        <div class="equation-parameters two-fields" data-equation-parameters hidden></div>
        <label class="field full sampling-rate-field"><span>Fréquence d’échantillonnage</span><div class="input-unit"><input data-field="sampleRate" type="number" min="0.001" step="1" value="1000" /><span>Hz</span></div></label>
        <div class="two-fields interval-fields"><label class="field"><span>Début du signal</span><div class="input-unit"><input data-field="start" type="number" step="0.01" value="0" /><span>s</span></div></label><label class="field"><span>Fin du signal</span><div class="input-unit"><input data-field="end" type="number" step="0.01" value="1" /><span>s</span></div></label></div>
      </div>
    </details>
  </template>`;
export function mountSignalTemplate({ visibility = false, document = globalThis.document } = {}) {
  let template = document.getElementById("signalTemplate");
  if (!template) {
    document.body.insertAdjacentHTML("beforeend", markup);
    template = document.getElementById("signalTemplate");
  }
  if (!visibility) template.content.querySelector(".visibility-toggle")?.remove();
  return template;
}
