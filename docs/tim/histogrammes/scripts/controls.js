export const sidebar = `
  <div class="section-title"><h2>Transformation</h2></div>
  <fieldset class="filter-options histogram-methods"><legend class="sr-only">Méthode</legend>
    <label><input type="radio" name="method" value="threshold" checked /><span><b>Binarisation</b></span></label>
    <label><input type="radio" name="method" value="window" /><span><b>Fenêtre d’extraction</b></span></label>
    <label><input type="radio" name="method" value="stretch" /><span><b>Expansion de la dynamique</b></span></label>
    <label><input type="radio" name="method" value="contrast" /><span><b>Rehaussement de contraste</b></span></label>
    <label><input type="radio" name="method" value="equalize" /><span><b>Égalisation d’histogramme</b></span></label>
    <label><input type="radio" name="method" value="clahe" /><span><b>CLAHE</b></span></label>
  </fieldset>
  <div class="histogram-parameters" id="parameters"><div class="two-fields">
    <label class="field"><span id="aLabel">Seuil a</span><input id="parameterA" type="number" min="0" max="255" step="1" value="128" /></label>
    <label class="field" id="bField" hidden><span id="bLabel">b</span><input id="parameterB" type="number" min="0" max="255" step="1" value="192" /></label>
  </div></div>
  <div class="histogram-parameters clahe-parameters" id="claheParameters" hidden>
    <label class="field"><span>Limite de contraste (clipLimit)</span><input id="clipLimit" type="number" min="0" step="any" value="40" aria-describedby="clipLimitHelp" /></label>
    <p class="parameter-help" id="clipLimitHelp">Une valeur faible limite davantage le contraste. À 0, la limitation est désactivée.</p>
    <div class="two-fields">
      <label class="field"><span>Tuiles horizontales</span><input id="tilesX" type="number" min="1" max="256" step="1" value="8" /></label>
      <label class="field"><span>Tuiles verticales</span><input id="tilesY" type="number" min="1" max="256" step="1" value="8" /></label>
    </div>
  </div>
  <p class="validation" id="parameterError" role="alert"></p>
  <label class="field"><span>Mode de traitement</span><select id="colorMode"><option value="gray">Niveaux de gris</option><option value="rgb">RGB — par canal</option></select></label>
  <details class="lut-section" id="lutDetails"><summary>Table de correspondance (LUT)</summary><p class="lut-label">Valeur de sortie en fonction de l’entrée</p><canvas id="lutCanvas" width="300" height="230" aria-label="Courbe de la LUT"></canvas></details>
  <button id="resetButton" class="secondary-button reset-button" type="button">Réinitialiser</button>
`;
