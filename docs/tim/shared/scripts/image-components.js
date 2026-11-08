const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
const entries = (rows) =>
  rows.map(([label, id]) => `<div><dt>${escape(label)}</dt><dd id="${id}">—</dd></div>`).join("");

// Templates are mounted synchronously before apps collect their DOM references.
// Layout stays in each page; only the actual reusable panels live here.
export function imageComponentHTML(type, options = {}, slots = {}) {
  const kind = options.kind ?? "original",
    result = kind === "result";
  if (!["original", "result"].includes(kind)) throw Error("Type de panneau image invalide");
  switch (type) {
    case "upload":
      return `<section class="upload-row${options.metadata === "visible" ? " has-file-meta" : ""}" aria-label="Chargement de l’image">
      <label class="file-button" for="imageInput"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 16V4m0 0L7 9m5-5 5 5M5 14v5h14v-5"></path></svg>Charger une image</label>
      <input id="imageInput" type="file" accept=".jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff,.pbm,.pgm,.ppm,image/jpeg,image/png,image/webp,image/bmp,image/tiff">
      ${options.metadata === "none" ? "" : `<div class="file-meta" ${options.metadata === "visible" ? "" : "hidden"}><strong id="fileName">Aucune image chargée</strong><span id="imageMeta">JPEG, PNG, WebP, BMP, TIFF, PBM, PGM ou PPM</span></div>`}
      <button id="downloadButton" class="secondary-button" type="button" disabled>${escape(options.downloadLabel ?? "Télécharger le résultat")}</button></section>`;
    case "image-panel":
      return `<article class="image-panel"><div class="panel-heading">
      ${slots.heading ?? `<h2>${escape(options.title ?? (result ? "Image traitée" : "Image originale"))}</h2>`}
      <span id="${kind}Badge" hidden>—</span></div>
      <div class="canvas-stage empty" id="${kind}Stage"><canvas id="${kind}Canvas"></canvas>${slots.extra ?? ""}
      <div class="empty-state"><p>${escape(options.empty ?? (result ? "Le résultat apparaîtra ici" : "Chargez une image pour commencer"))}</p></div>
      ${result ? '<div class="processing" id="processing" hidden>Calcul…</div>' : ""}</div></article>`;
    case "display-settings":
      return `<div class="display-settings" aria-labelledby="${kind}DisplayTitle">
      <div class="display-settings-heading"><strong id="${kind}DisplayTitle">Affichage de l’image ${result ? "traitée" : "originale"}</strong>
      <label class="check compact-check"><input id="${kind}AutoRange" type="checkbox" ${options.auto === "true" ? "checked" : ""}><span>Normalisation min–max</span></label></div>
      <div class="display-range-fields"><label class="field"><span>Valeur noire</span><input id="${kind}DisplayMin" type="number" step="any" value="0"></label>
      <span class="range-arrow" aria-hidden="true">→</span><label class="field"><span>Valeur blanche</span><input id="${kind}DisplayMax" type="number" step="any" value="255"></label></div>
      <p class="validation display-validation" id="${kind}DisplayRangeError" role="alert"></p></div>`;
    case "navigation":
      return `<div class="view-toolbar" aria-label="Navigation synchronisée dans les images">
      <div class="view-toolbar-heading"><strong ${options.sync === "true" ? 'id="navigationTitle"' : ""}>Navigation</strong>
      ${options.sync === "true" ? '<label class="check sync-choice"><input id="syncNavigation" type="checkbox" checked><span>Navigation synchronisée</span></label>' : ""}</div>
      <div class="zoom-controls"><input id="zoomSlider" type="range" min="0" max="1000" step="1" value="384" aria-label="Niveau de zoom" disabled>
      <output id="zoomLabel" for="zoomSlider" aria-live="polite">100 %</output><button id="fitView" type="button" disabled>Ajuster</button></div></div>`;
    case "information":
      return `<article class="analysis-panel image-information"><h2>Informations sur l’image</h2><dl>${entries(
        [
          ["Dimensions", "infoDimensions"],
          ["Type", "infoType"],
          [options.rangeLabel ?? "Plage originale", "infoOriginalRange"],
          ["Taille du fichier", "infoFileSize"],
        ],
      )}</dl></article>`;
    case "cursor":
      return `<article class="analysis-panel cursor-information"><h2>Valeurs sous le curseur</h2><dl>${entries(
        [
          ["Position", "cursorPosition"],
          [options.originalLabel ?? "Originale", "cursorOriginal"],
          ["Traitée", "cursorResult"],
          [options.differenceLabel ?? "Différence", "cursorDifference"],
        ],
      )}</dl></article>`;
    case "histograms":
      return `<article class="analysis-panel histogram-panel${options.large === "true" ? " large-histograms" : ""}"><h2>Histogrammes</h2><div class="histograms">${["original", "result"].map((k) => `<figure><figcaption>${k === "original" ? "Originale" : "Traitée"} <span id="${k}HistogramRange">—</span></figcaption><canvas id="${k}Histogram" width="360" height="${options.large === "true" ? 320 : 120}"></canvas></figure>`).join("")}</div></article>`;
    default:
      throw Error(`Composant TIM inconnu : ${type}`);
  }
}

export function mountImageComponents(root = document) {
  for (const placeholder of root.querySelectorAll("template[data-tim-component]")) {
    const slots = Object.fromEntries(
      [...placeholder.content.querySelectorAll("template[data-slot]")].map((slot) => [
        slot.dataset.slot,
        slot.innerHTML,
      ]),
    );
    const fragment = placeholder.ownerDocument.createElement("template");
    fragment.innerHTML = imageComponentHTML(
      placeholder.dataset.timComponent,
      placeholder.dataset,
      slots,
    );
    mountImageComponents(fragment.content);
    placeholder.replaceWith(fragment.content);
  }
}
