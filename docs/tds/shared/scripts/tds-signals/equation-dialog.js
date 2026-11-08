const markup = `  <dialog id="equationDialog" class="equation-dialog" aria-labelledby="equationDialogTitle">
    <div class="equation-dialog-heading"><h2 id="equationDialogTitle">Équation du signal</h2><div class="equation-heading-actions"><button id="toggleFunctionCatalog" class="secondary-button catalog-toggle" type="button" aria-expanded="false" aria-controls="functionCatalog">ƒx Fonctions</button><button id="closeEquation" class="dialog-close-icon" type="button" aria-label="Fermer">×</button></div></div>
    <div class="equation-dialog-content">
      <fieldset class="filter-options equation-mode-options"><legend class="sr-only">Mode de définition</legend>
        <label><input type="radio" name="equationMode" value="single" checked /><span><b>Expression unique</b></span></label>
        <label><input type="radio" name="equationMode" value="cases" /><span><b>Définition par cas</b></span></label>
      </fieldset>
      <section id="functionCatalog" class="function-catalog" aria-label="Catalogue des fonctions" hidden>
        <div class="catalog-search-row"><input id="catalogSearch" type="search" placeholder="Rechercher une fonction, une constante…" aria-label="Rechercher dans le catalogue" /><select id="catalogCategory" aria-label="Catégorie du catalogue"><option value="">Toutes les catégories</option></select><button id="closeFunctionCatalog" class="dialog-close-icon" type="button" aria-label="Fermer le catalogue">×</button></div>
        <div id="catalogResults" class="catalog-results"></div><p id="catalogEmpty" hidden>Aucun résultat.</p>
      </section>
      <div id="singleEquationPanel"><label class="field full"><span>Équation en fonction de t</span><textarea id="equationInput" rows="3" spellcheck="false" placeholder="A * cos(2*pi*f0*t)"></textarea></label></div>
      <div id="piecewiseEquationPanel" hidden>
        <div class="piecewise-editor">
          <svg class="piecewise-brace" viewBox="0 0 20 100" preserveAspectRatio="none" aria-hidden="true"><path d="M18 1 C8 1 8 5 8 14 L8 40 C8 47 5 50 1 50 C5 50 8 53 8 60 L8 86 C8 95 8 99 18 99" /></svg>
          <div class="piecewise-lines"><div id="equationCases"></div>
            <div class="piecewise-row otherwise-row"><label class="field"><span class="sr-only">Expression sinon</span><input id="equationOtherwise" type="text" value="0" spellcheck="false" aria-label="Expression sinon" /></label><span class="case-keyword">sinon</span></div>
          </div>
        </div>
        <button id="addEquationCase" class="secondary-button" type="button">+ Ajouter un cas</button>
        <p class="piecewise-hint">Conditions libres, par exemple <code>0 &lt;= t &lt; T/2</code> ou <code>t &lt; 0 ou t &gt; 1</code>. La première condition satisfaite s’applique.</p>
      </div>
      <section class="periodic-settings">
        <label class="check"><input id="periodicEnabled" type="checkbox" /><span>Périodique</span></label>
        <div id="periodicOptions" hidden>
          <label class="period-field"><span>T =</span><input id="periodExpression" type="text" value="T" spellcheck="false" placeholder="T ou 1/f0" aria-label="Période T en secondes" /><span>s</span></label>
          <fieldset class="filter-options period-origin-options"><legend class="sr-only">Intervalle du motif</legend>
            <label><input type="radio" name="periodOrigin" value="zero" checked /><span><b>[0, T[</b></span></label>
            <label><input type="radio" name="periodOrigin" value="centered" /><span><b>[−T/2, T/2[</b></span></label>
          </fieldset>
        </div>
      </section>
      <div class="function-context-slot"><div id="functionContext" class="function-context" role="status" aria-live="polite" hidden></div></div>
      <div class="equation-preview" id="equationPreview" aria-label="Aperçu de l’équation" aria-live="polite"></div>
      <p class="validation" id="equationError" role="alert"></p>
      <div class="equation-variable-hint" id="equationVariables" aria-label="Paramètres à définir"></div>
      <section id="equationReferenceSection"><h3>Signaux disponibles</h3><div id="equationReferences" class="equation-shortcuts"></div></section>
    </div>
    <div class="equation-dialog-footer"><button id="cancelEquation" class="secondary-button" type="button">Annuler</button><button id="saveEquation" class="file-button" type="button" disabled>Appliquer l’équation</button></div>
  </dialog>`;
export function mountEquationDialog(document = globalThis.document) {
  if (!document.getElementById("equationDialog"))
    document.body.insertAdjacentHTML("beforeend", markup);
  return document.getElementById("equationDialog");
}
