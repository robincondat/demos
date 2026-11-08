import {
  createDisplayControls,
  resolveDisplaySettings,
} from "../../shared/scripts/display-controls.js?v=20261106-ui2";
import { mountImageComponents } from "../../shared/scripts/image-components.js?v=20261106-histlayout";
import {
  downloadCanvas,
  bindImageCursor,
} from "../../shared/scripts/image-actions.js?v=20261106-ui2";
import { dataRange, fromRGBA } from "../../shared/compute/image.js?v=20261106-science1";
import { renderImage } from "../../shared/scripts/image-display.js?v=20261106-science1";
import { createImageApplication } from "../../shared/scripts/image-application.js?v=20261106-controller1";
import { createSyncedViewer } from "../../shared/scripts/viewer.js?v=20261106-science1";
import { createAnalysisView } from "../../shared/scripts/analysis.js?v=20261106-clahe-local";
import { transformImage, createLUT } from "../../shared/compute/lut.js?v=20261106-science1";
import {
  applyCLAHE,
  validateCLAHE,
  CLAHE_DEFAULTS,
} from "../../shared/compute/clahe.js?v=20261106-clahe-local";
import { loadOpenCV } from "../../shared/scripts/opencv-runtime.js?v=20261106-science1";
import { renderHistogram, renderLUT } from "./plots.js?v=20261106-histcurves";
import { sidebar } from "./controls.js?v=20261108-histlayout";
import { createCLAHEExplorer } from "./clahe-explorer.js?v=20261106-histlayout";

mountImageComponents();

document.querySelector(".workbench").innerHTML = sidebar;
const $ = (id) => document.getElementById(id);
let explorer = null;
const viewer = createSyncedViewer({
  stages: [$("originalStage"), $("resultStage")],
  canvases: [$("originalCanvas"), $("resultCanvas")],
  zoomLabel: $("zoomLabel"),
  zoomSlider: $("zoomSlider"),
  fitButton: $("fitView"),
  onViewChange: () => explorer?.refresh(),
});
const analysis = createAnalysisView(
  Object.fromEntries(
    [
      "infoDimensions",
      "infoType",
      "infoOriginalRange",
      "infoFileSize",
      "cursorPosition",
      "cursorOriginal",
      "cursorResult",
      "cursorDifference",
      "originalHistogram",
      "resultHistogram",
      "originalHistogramRange",
      "resultHistogramRange",
    ].map((id) => [id, $(id)]),
  ),
  { renderHistogram },
);
explorer = createCLAHEExplorer({
  stages: [$("originalStage"), $("resultStage")],
  canvases: [$("originalCanvas"), $("resultCanvas")],
  viewer,
  analysis,
  title: document.querySelector(".large-histograms > h2"),
});
const fixedRange = { min: 0, max: 255, resolvedMin: 0, resolvedMax: 255 };
const defaults = () => ({
  threshold: { a: 128, b: 192 },
  window: { a: 64, b: 192 },
  stretch: { a: 64, b: 192 },
  contrast: { a: 128, b: 192 },
  equalize: { a: 0, b: 255 },
  clahe: { ...CLAHE_DEFAULTS },
});
let parameters = defaults(),
  source = null,
  prepared = null,
  resultImage = null,
  activeLUTs = null,
  sourceFile = null;
const method = () => document.querySelector('input[name="method"]:checked').value;
const mode = () => $("colorMode").value;
function controls() {
  const name = method(),
    values = parameters[name];
  $("parameterA").value = values.a;
  $("parameterB").value = values.b;
  $("parameters").hidden = name === "equalize" || name === "clahe";
  $("claheParameters").hidden = name !== "clahe";
  $("lutDetails").hidden = name === "clahe";
  document.querySelectorAll(".tile-visibility").forEach((label) => {
    label.hidden = name !== "clahe";
  });
  for (const key of ["clipLimit", "tilesX", "tilesY"]) $(key).value = parameters.clahe[key];
  $("bField").hidden = name === "threshold";
  $("aLabel").textContent =
    name === "contrast" ? "a — entrée" : name === "threshold" ? "Seuil a" : "Borne a";
  $("bLabel").textContent = name === "contrast" ? "b — sortie" : "Borne b";
  $("parameterA").min = name === "contrast" ? 1 : 0;
  $("parameterA").max = name === "contrast" ? 254 : 255;
}
const displayControls = Object.fromEntries(
  ["original", "result"].map((kind) => [kind, createDisplayControls(kind)]),
);
function range(kind, image) {
  const settings = displayControls[kind].read();
  return settings.valid ? resolveDisplaySettings(settings, () => dataRange(image)) : null;
}
function renderImages() {
  if (!prepared || !resultImage) return;
  let valid = true;
  for (const [kind, values] of [
    ["original", prepared],
    ["result", resultImage],
  ]) {
    const limits = range(kind, values);
    if (!limits) {
      valid = false;
      continue;
    }
    renderImage($(kind + "Canvas"), kind === "original" ? prepared : resultImage, limits);
  }
  $("downloadButton").disabled = !valid;
}
function update() {
  return application.run(calculate);
}
async function calculate({ current }) {
  explorer.reset();
  $("parameterError").textContent = "";
  const selected = method(),
    image = prepared;
  const settings = { ...parameters[selected] };
  const { a, b } = settings;
  if (selected === "clahe") {
    activeLUTs = null;
    $("downloadButton").disabled = true;
    validateCLAHE(settings);
    if (!image) return;
    const { runtime } = await loadOpenCV();
    if (!current() || prepared !== image) return;
    resultImage = applyCLAHE(image, settings, runtime);
  } else {
    if (!prepared) {
      activeLUTs = [createLUT(selected, a, b)];
      renderLUT($("lutCanvas"), activeLUTs);
      return;
    }
    ({ image: resultImage, luts: activeLUTs } = transformImage(prepared, {
      method: selected,
      a,
      b,
    }));
  }
  renderImages();
  analysis.setResult(resultImage, fixedRange, mode() === "gray" ? "Grayscale" : "RGB");
  if (selected === "clahe") explorer.setImages(image, resultImage, settings);
  if (activeLUTs) renderLUT($("lutCanvas"), activeLUTs);
}
function prepareSource() {
  explorer.reset();
  if (!source) return;
  prepared = fromRGBA(source, { mode: mode() });
  const description = mode() === "gray" ? "Grayscale" : "RGB";
  analysis.setSource(prepared, description, {
    width: source.width,
    height: source.height,
    fileSize: sourceFile.size,
    type: mode() === "gray" ? "Niveaux de gris · 8 bits" : "RGB · 8 bits par canal",
  });
  analysis.setSourceDisplay(prepared, fixedRange);
  analysis.clearCursor();
  update();
}
const application = createImageApplication({
  delay: 50,
  onError(error) {
    explorer.reset();
    $("parameterError").textContent = error.message;
    $("downloadButton").disabled = true;
  },
  onBusy: (busy) => {
    $("processing").hidden = !busy;
  },
  onLoadStart() {
    explorer.reset();
    $("downloadButton").disabled = true;
  },
  onImage({ file, canvas }) {
    source = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    sourceFile = file;
    for (const name of ["original", "result"]) $(name + "Stage").classList.remove("empty");
    prepareSource();
    viewer.setImageSize(source.width, source.height);
  },
  onLoadError(error) {
    $("parameterError").textContent = error.message;
  },
  onLoadEnd() {
    $("imageInput").value = "";
  },
});
$("imageInput").addEventListener("change", () => {
  const file = $("imageInput").files[0];
  if (file) application.load(file);
});

document.querySelectorAll('input[name="method"]').forEach((input) =>
  input.addEventListener("change", () => {
    controls();
    update();
  }),
);
for (const [id, key] of [
  ["parameterA", "a"],
  ["parameterB", "b"],
])
  $(id).addEventListener("input", () => {
    parameters[method()][key] = $(id).value.trim() === "" ? NaN : Number($(id).value);
    application.schedule(calculate);
  });
for (const control of Object.values(displayControls)) control.bind(renderImages);
for (const [index, kind] of ["original", "result"].entries())
  $(kind + "ShowTiles").addEventListener("change", () =>
    explorer.setGridVisible(index, $(kind + "ShowTiles").checked),
  );
for (const key of ["clipLimit", "tilesX", "tilesY"])
  $(key).addEventListener("input", () => {
    parameters.clahe[key] = $(key).value.trim() === "" ? NaN : Number($(key).value);
    application.schedule(calculate);
  });
$("colorMode").addEventListener("change", prepareSource);
$("resetButton").addEventListener("click", () => {
  parameters = defaults();
  for (const [index, kind] of ["original", "result"].entries()) {
    $(kind + "ShowTiles").checked = true;
    explorer.setGridVisible(index, true);
  }
  document.querySelector('[name="method"][value="threshold"]').checked = true;
  $("colorMode").value = "gray";
  for (const kind of ["original", "result"]) {
    $(kind + "DisplayMin").value = 0;
    $(kind + "DisplayMax").value = 255;
    $(kind + "AutoRange").checked = false;
  }
  controls();
  if (source) {
    prepareSource();
    viewer.fit();
  } else update();
});
bindImageCursor({
  stages: [$("originalStage"), $("resultStage")],
  viewer,
  enabled: () => !!prepared && !!resultImage,
  onPoint: ({ x, y }) => analysis.setCursor(x, y, prepared, resultImage),
  clear: () => analysis.clearCursor(),
});
$("downloadButton").addEventListener("click", () =>
  downloadCanvas($("resultCanvas"), "histogramme-resultat.png"),
);
new ResizeObserver(() => {
  if (activeLUTs) renderLUT($("lutCanvas"), activeLUTs);
}).observe($("lutCanvas").parentElement);
controls();
update();

$("lutDetails").addEventListener("toggle", () => {
  if ($("lutDetails").open && activeLUTs) renderLUT($("lutCanvas"), activeLUTs);
});
