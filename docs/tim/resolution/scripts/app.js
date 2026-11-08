import { mountImageComponents } from "../../shared/scripts/image-components.js?v=20261106-histlayout";
import { createImageApplication } from "../../shared/scripts/image-application.js?v=20261106-controller1";
import { createImageViewer } from "../../shared/scripts/viewer.js?v=20261106-science1";
import {
  createDisplayControls,
  resolveDisplaySettings,
} from "../../shared/scripts/display-controls.js?v=20261106-ui2";
import { renderImage } from "../../shared/scripts/image-display.js?v=20261106-science1";
import { createAnalysisView } from "../../shared/scripts/analysis.js?v=20261106-clahe-local";
import { createPixelInspector } from "../../shared/scripts/image-information.js?v=20261106-science1";
import {
  bindImageCursor,
  downloadCanvas,
} from "../../shared/scripts/image-actions.js?v=20261106-ui2";
import { loadOpenCV } from "../../shared/scripts/opencv-runtime.js?v=20261106-science1";
import { fromRGBA, dataRange, pixelAt } from "../../shared/compute/image.js?v=20261106-science1";
import { resizeImage, subsampleImage } from "../../shared/compute/sampling.js?v=20261108-quant2";
import { quantizeUniform } from "../../shared/compute/quantization.js?v=20261108-quant3";
import { quantizeColors } from "../../shared/compute/color-quantization.js?v=20261108-quant1";

mountImageComponents();
const $ = (id) => document.getElementById(id),
  kinds = ["original", "result"];
const elements = (ids) => Object.fromEntries(ids.map((id) => [id, $(id)]));
const analysis = createAnalysisView(
  elements([
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
  ]),
);
const inspector = createPixelInspector(
  elements(["cursorPosition", "cursorOriginal", "cursorResult", "cursorDifference"]),
);
const display = Object.fromEntries(kinds.map((kind) => [kind, createDisplayControls(kind)]));
const viewers = {};
for (const kind of kinds)
  viewers[kind] = createImageViewer({
    stages: [$(kind + "Stage")],
    canvases: [$(kind + "Canvas")],
    zoomLabel: kind === "original" ? $("zoomLabel") : document.createElement("output"),
    zoomSlider: kind === "original" ? $("zoomSlider") : document.createElement("input"),
    fitButton: kind === "original" ? $("fitView") : document.createElement("button"),
    onViewChange: (view) => viewers[kind === "original" ? "result" : "original"]?.setView(view),
  });
const fixedRange = { min: 0, max: 255, resolvedMin: 0, resolvedMax: 255 };
let rgba = null,
  original = null,
  result = null,
  sourceFile = null,
  ready = false;
let appliedSampling = null,
  displayMode = "gray";
const operation = () => document.querySelector('[name="operation"]:checked').value;
const method = () => document.querySelector('[name="quantization"]:checked').value;
const mode = () =>
  operation() === "quantization" && method() === "kmeans" ? "rgb" : $("colorMode").value;
function controls() {
  if (mode() !== displayMode) {
    displayMode = mode();
    for (const kind of kinds) {
      $(kind + "AutoRange").checked = displayMode === "gray";
      $(kind + "DisplayMin").value = "0";
      $(kind + "DisplayMax").value = "255";
      display[kind].read();
    }
  }
  const sampling = operation() === "sampling";
  $("samplingSettings").hidden = !sampling;
  $("quantizationMethods").hidden = sampling;
  $("uniformSettings").hidden = sampling || method() !== "uniform";
  $("kmeansSettings").hidden = sampling || method() !== "kmeans";
  $("modeField").hidden = !sampling && method() === "kmeans";
  const descriptions = {
    slice:
      "Conserve une ligne et une colonne sur 2, 4, 8… depuis le premier pixel, sans calcul de moyenne : img[::facteur, ::facteur].",
    nearest:
      "Redimensionne l’image en copiant le pixel d’origine le plus proche, sans mélanger les valeurs.",
    linear: "Calcule chaque nouveau pixel par une moyenne pondérée des quatre pixels voisins.",
    area: "Calcule les nouveaux pixels en moyennant les surfaces couvertes dans l’image d’origine, pour limiter le repliement.",
  };
  $("samplingDescription").textContent = descriptions[$("interpolation").value];
}
function render() {
  if (!original || !result || !ready) return;
  let valid = true;
  for (const kind of kinds) {
    const image = kind === "original" ? original : result,
      settings = display[kind].read();
    if (!settings.valid) {
      valid = false;
      continue;
    }
    renderImage(
      $(kind + "Canvas"),
      image,
      resolveDisplaySettings(settings, () => dataRange(image)),
    );
  }
  $("downloadButton").disabled = !valid;
}
async function calculate({ current }) {
  controls();
  ready = false;
  inspector.clear();
  $("palette").replaceChildren();
  $("parameterError").textContent = "";
  $("downloadButton").disabled = true;
  if (!rgba) return;
  const sampling = operation() === "sampling",
    selected = sampling ? "sampling" : method(),
    imageMode = mode(),
    exponent = Number($("samplingFactor").value);
  const base = fromRGBA(rgba, { mode: imageMode });
  const settings = {
    exponent,
    interpolation: $("interpolation").value,
    levels: $("levels").value.trim() === "" ? NaN : Number($("levels").value),
    range: "image",
    colors: Number($("colors").value),
  };
  let cv;
  if ((sampling && exponent && settings.interpolation !== "slice") || selected === "kmeans") {
    const loaded = await loadOpenCV();
    if (!current()) return;
    cv = loaded.runtime;
  }
  let output = sampling
      ? settings.interpolation === "slice"
        ? subsampleImage(base, settings)
        : resizeImage(base, settings, cv)
      : base,
    palette = [];
  if (selected === "uniform") output = quantizeUniform(output, settings).image;
  else if (selected === "kmeans") {
    const quantized = await quantizeColors(output, { colors: settings.colors, current }, cv);
    if (!current()) return;
    output = quantized.image;
    palette = quantized.palette;
  }
  if (!current()) return;
  original = base;
  result = output;
  appliedSampling = sampling ? settings : null;
  ready = true;
  const view = viewers.original.getView();
  viewers.result.setImageSize(result.width, result.height);
  viewers.original.setView(view);
  viewers.result.setView(view);
  const imageModeLabel = original.channels === 1 ? "Grayscale" : "RGB";
  analysis.setSource(original, imageModeLabel, {
    width: original.width,
    height: original.height,
    fileSize: sourceFile.size,
    type: original.channels === 1 ? "Niveaux de gris · 8 bits" : "RGB · 8 bits par canal",
  });
  analysis.setSourceDisplay(original, fixedRange);
  analysis.setResult(result, fixedRange, imageModeLabel);
  for (const kind of kinds) {
    const image = kind === "original" ? original : result;
    $(kind + "Badge").hidden = false;
    $(kind + "Badge").textContent = `${image.width} × ${image.height} px`;
    $(kind + "Stage").classList.remove("empty");
  }
  for (const color of palette) {
    const swatch = document.createElement("span");
    swatch.className = "palette-color";
    swatch.style.backgroundColor = `rgb(${color.join(",")})`;
    swatch.title = `RGB (${color.join(", ")})`;
    $("palette").append(swatch);
  }
  render();
}
const application = createImageApplication({
  delay: 100,
  frame: true,
  onBusy: (busy) => {
    $("processing").hidden = !busy;
  },
  onError: (error) => {
    ready = false;
    $("parameterError").textContent = error.message;
    $("downloadButton").disabled = true;
  },
  onLoadStart() {
    ready = false;
    $("downloadButton").disabled = true;
    inspector.clear();
  },
  onImage({ file, canvas }) {
    rgba = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    sourceFile = file;
    viewers.original.setImageSize(rgba.width, rgba.height);
    application.run(calculate);
  },
  onLoadError: (error) => {
    $("parameterError").textContent = error.message;
  },
  onLoadEnd: () => {
    $("imageInput").value = "";
  },
});
$("imageInput").addEventListener("change", () => {
  const file = $("imageInput").files[0];
  if (file) application.load(file);
});
document.querySelectorAll(".workbench input, .workbench select").forEach((input) =>
  input.addEventListener("input", () => {
    controls();
    ready = false;
    $("downloadButton").disabled = true;
    application.schedule(calculate);
  }),
);
for (const settings of Object.values(display)) settings.bind(render);
bindImageCursor({
  stages: kinds.map((kind) => $(kind + "Stage")),
  viewer: (stage) => viewers[stage.id.replace("Stage", "")],
  enabled: () => ready,
  onPoint(point, stage) {
    const isOriginal = stage.id === "originalStage",
      hovered = isOriginal ? original : result;
    const locate = (image) => ({
      x: Math.min(image.width - 1, Math.floor(((point.x + 0.5) * image.width) / hovered.width)),
      y: Math.min(image.height - 1, Math.floor(((point.y + 0.5) * image.height) / hovered.height)),
    });
    let a = locate(original),
      b = locate(result);
    if (appliedSampling?.interpolation === "slice") {
      const factor = 2 ** appliedSampling.exponent;
      if (isOriginal) {
        a = point;
        b = { x: Math.floor(point.x / factor), y: Math.floor(point.y / factor) };
      } else {
        b = point;
        a = { x: point.x * factor, y: point.y * factor };
      }
    }
    inspector.show({
      x: point.x,
      y: point.y,
      source: Array.from(pixelAt(original, a.x, a.y)),
      result: Array.from(pixelAt(result, b.x, b.y)),
    });
    $("cursorPosition").textContent = `Originale (${a.x}, ${a.y}) · Traitée (${b.x}, ${b.y})`;
  },
  clear: () => inspector.clear(),
});
$("downloadButton").addEventListener("click", () =>
  downloadCanvas($("resultCanvas"), "echantillonnage-quantification.png"),
);
$("resetButton").addEventListener("click", () => {
  $("samplingFactor").value = "1";
  $("interpolation").value = "slice";
  $("colorMode").value = "gray";
  $("levels").value = "8";
  $("colors").value = "8";
  document.querySelector('[name="operation"][value="quantization"]').checked = true;
  document.querySelector('[name="quantization"][value="uniform"]').checked = true;
  for (const kind of kinds) {
    $(kind + "DisplayMin").value = "0";
    $(kind + "DisplayMax").value = "255";
    $(kind + "AutoRange").checked = true;
    display[kind].read();
  }
  viewers.original.fit();
  application.run(calculate);
});
controls();
for (const settings of Object.values(display)) settings.read();
