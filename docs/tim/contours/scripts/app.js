import { createDisplayControls } from "../../shared/scripts/display-controls.js?v=20261106-ui2";
import {
  canvasIsGrayscale,
  readCanvasImages,
  makeDisplayImage,
} from "../../shared/scripts/opencv-image.js?v=20261106-ui2";
import { mountImageComponents } from "../../shared/scripts/image-components.js?v=20261106-ui2";
import {
  downloadCanvas,
  bindImageCursor,
} from "../../shared/scripts/image-actions.js?v=20261106-ui2";
import { loadOpenCV } from "../../shared/scripts/opencv-runtime.js?v=20261106-science1";
import {
  createImageApplication,
  copyImageCanvas,
} from "../../shared/scripts/image-application.js?v=20261106-controller1";
import { createSyncedViewer } from "../../shared/scripts/viewer.js?v=20261106-science1";
import { createAnalysisView } from "../../shared/scripts/analysis.js?v=20261106-histcurves";
import {
  runPipeline,
  deletePipeline,
  kernelsFor,
} from "../../shared/compute/contours.js?v=20261106-science1";
import { byId, collectElements } from "./ui.js";

mountImageComponents();

let cvReady = false,
  imageReady = false,
  workingMode = "RGB",
  pipeline = null,
  lastResult = null;
const els = collectElements();
const viewer = createSyncedViewer({
  stages: [els.originalStage, els.resultStage],
  canvases: [els.originalCanvas, els.resultCanvas],
  zoomLabel: byId("zoomLabel"),
  zoomSlider: byId("zoomSlider"),
  fitButton: byId("fitView"),
});
const analysis = createAnalysisView({
  infoDimensions: byId("infoDimensions"),
  infoType: byId("infoType"),
  infoOriginalRange: byId("infoOriginalRange"),
  infoFileSize: byId("infoFileSize"),
  cursorPosition: byId("cursorPosition"),
  cursorOriginal: byId("cursorOriginal"),
  cursorResult: byId("cursorResult"),
  cursorDifference: byId("cursorDifference"),
  originalHistogram: byId("originalHistogram"),
  resultHistogram: byId("resultHistogram"),
  originalHistogramRange: byId("originalHistogramRange"),
  resultHistogramRange: byId("resultHistogramRange"),
});
const integer = (input, fallback = 0) =>
  Number.isFinite(Number.parseInt(input.value, 10)) ? Number.parseInt(input.value, 10) : fallback;
const number = (input, fallback = 0) =>
  Number.isFinite(Number.parseFloat(input.value)) ? Number.parseFloat(input.value) : fallback;

function readImages() {
  return readCanvasImages(els.sourceCanvas);
}
const displayControls = Object.fromEntries(
  ["original", "result"].map((kind) => [kind, createDisplayControls(kind)]),
);
function displayRange(kind) {
  return displayControls[kind].read();
}
function renderOriginal() {
  const range = displayRange("original");
  if (!cvReady || !imageReady || !range.valid) return;
  const { gray, rgb } = readImages(),
    mat = workingMode === "Grayscale" ? gray : rgb;
  let display;
  try {
    display = makeDisplayImage(mat, range);
    cv.imshow(els.originalCanvas, display);
    analysis.setSourceDisplay(els.sourceCanvas, range);
  } finally {
    gray.delete();
    rgb.delete();
    display?.delete();
  }
}
function settings() {
  return {
    gaussianEnabled: els.gaussianEnabled.checked,
    gaussianSize: integer(els.gaussianSize, 5),
    gaussianSigma: Math.max(0, number(els.gaussianSigma, 1.4)),
    method: els.method.value,
    derivativeSize: integer(els.derivativeSize, 3),
    laplacianSize: integer(els.laplacianSize, 3),
    laplacianConnectivity: integer(els.laplacianConnectivity, 4),
    dogSize: integer(els.dogSize, 5),
    dogSigma1: Math.max(0.1, number(els.dogSigma1, 1)),
    dogSigma2: Math.max(0.1, number(els.dogSigma2, 2)),
    gradientThreshold: integer(els.gradientThreshold, 80),
    zeroCrossingMode: els.zeroCrossingMode.value,
    zeroThresholdDifference: Math.max(0, number(els.zeroThresholdDifference, 20)),
    zeroThresholdMin: number(els.zeroThresholdMin),
    zeroThresholdMax: number(els.zeroThresholdMax),
    cannyLow: integer(els.cannyLow, 50),
    cannyHigh: integer(els.cannyHigh, 150),
    cannyAperture: integer(els.cannyAperture, 3),
    cannyL2: els.cannyL2.checked,
    retrievalMode: els.retrievalMode.value,
    approximationMode: els.approximationMode.value,
    drawContours: els.drawContours.checked,
  };
}
function validate(s) {
  let error = "";
  if (s.gaussianSize < 1 || s.gaussianSize > 31 || s.gaussianSize % 2 === 0)
    error = "Le noyau gaussien doit être impair et compris entre 1 et 31.";
  else if (s.method === "dog" && s.dogSigma2 <= s.dogSigma1)
    error = "Pour la DoG, σ₂ doit être strictement supérieur à σ₁.";
  else if (s.method === "canny" && s.cannyHigh <= s.cannyLow)
    error = "Le seuil haut de Canny doit être supérieur au seuil bas.";
  els.parameterError.textContent = error;
  return !error;
}
function updateMethodInterface() {
  const method = els.method.value,
    first = method === "sobel" || method === "prewitt",
    second = method === "laplacian" || method === "dog";
  els.firstOrderSettings.hidden = !first;
  els.laplacianSettings.hidden = method !== "laplacian";
  els.dogSettings.hidden = method !== "dog";
  els.cannySettings.hidden = method !== "canny";
  els.thresholdSettings.hidden = !first;
  els.zeroCrossingSettings.hidden = !second;
  els.cannyThresholdSettings.hidden = method !== "canny";
  els.postTreatmentTitle.textContent = first
    ? "Normalisation et seuillage"
    : second
      ? "Détection des passages par zéro"
      : "Double seuillage et hystérésis";
  updateKernelPreview();
  updateZeroInterface();
  schedule();
}
function updateZeroInterface() {
  els.simpleZeroSettings.hidden = els.zeroCrossingMode.value !== "simple";
}
function formatKernelValue(value) {
  if (Math.abs(value) < 1e-10) return "0";
  if (Number.isInteger(value)) return String(value);
  return Number(value.toPrecision(3)).toString();
}
function updateKernelPreview() {
  const kernels = kernelsFor(settings());
  els.kernelPreview.hidden = kernels.length === 0;
  els.kernelPreviewContent.replaceChildren(
    ...kernels.map((kernel) => {
      const figure = document.createElement("figure"),
        caption = document.createElement("figcaption"),
        grid = document.createElement("div");
      caption.textContent = kernel.label;
      grid.className = "kernel-preview-grid";
      grid.style.setProperty("--kernel-size", kernel.size);
      grid.append(
        ...kernel.values.map((value) => {
          const cell = document.createElement("span");
          cell.textContent = formatKernelValue(value);
          cell.title = String(value);
          return cell;
        }),
      );
      figure.append(caption, grid);
      return figure;
    }),
  );
}
const retrievalDescriptions = {
  external: "Conserve uniquement les contours extérieurs. Les contours imbriqués sont ignorés.",
  list: "Conserve tous les contours sans reconstruire leurs relations parent-enfant.",
  ccomp: "Organise les contours sur deux niveaux : contours extérieurs puis trous.",
  tree: "Reconstruit toute la hiérarchie des contours imbriqués.",
};
const approximationDescriptions = {
  simple:
    "Compresse les segments droits en ne gardant que leurs extrémités. Recommandé dans la plupart des cas.",
  none: "Conserve chaque pixel du contour : résultat plus détaillé mais plus volumineux.",
  tc89l1: "Réduit les points avec l’algorithme de Teh–Chin et la mesure L1.",
  tc89kcos: "Réduit les points avec Teh–Chin en privilégiant la courbure du contour.",
};
function updateContourExplanations() {
  els.retrievalExplanation.textContent = retrievalDescriptions[els.retrievalMode.value];
  els.approximationExplanation.textContent = approximationDescriptions[els.approximationMode.value];
}
function updateResultOptions() {
  const previous = els.resultView.value,
    options = [...pipeline.images.values()];
  els.resultView.replaceChildren(
    ...options.map(({ key, label }) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = label;
      return option;
    }),
  );
  els.resultView.value = pipeline.images.has(previous)
    ? previous
    : pipeline.images.has("amplitude")
      ? "amplitude"
      : pipeline.images.has("response")
        ? "response"
        : "binary";
}
function renderSelected() {
  if (!pipeline) return;
  const selected = pipeline.images.get(els.resultView.value);
  if (!selected) return;
  const range = displayRange("result");
  if (!range.valid) return;
  let display;
  try {
    display = makeDisplayImage(selected.mat, range);
    cv.imshow(els.resultCanvas, display);
    lastResult = selected;
    analysis.setResult(selected.mat, range, selected.mode);
    els.resultBadge.textContent = `${selected.mat.cols} × ${selected.mat.rows} px · ${selected.mode} float32`;
  } finally {
    display?.delete();
  }
}
function schedule() {
  application.schedule(calculate);
}
function calculate() {
  const s = settings();
  if (!cvReady || !imageReady || !validate(s)) return;
  const start = performance.now();
  let gray, rgb;
  try {
    ({ gray, rgb } = readImages());
    const next = runPipeline(gray, rgb, s);
    deletePipeline(pipeline);
    pipeline = next;
    updateResultOptions();
    renderSelected();
    els.contourCount.textContent = `${pipeline.contourCount} contour${pipeline.contourCount > 1 ? "s" : ""} détecté${pipeline.contourCount > 1 ? "s" : ""}.`;
    els.timing.textContent = `Calcul : ${Math.round(performance.now() - start)} ms`;
    els.downloadButton.disabled = false;
  } finally {
    gray?.delete();
    rgb?.delete();
  }
}
const application = createImageApplication({
  delay: 70,
  frame: true,
  onBusy: (busy) => {
    els.processing.hidden = !busy;
  },
  onError: (error) => {
    els.timing.textContent = `Erreur : ${error.message}`;
    console.error(error);
  },
  onLoadStart(file) {
    imageReady = false;
    deletePipeline(pipeline);
    pipeline = null;
    lastResult = null;
    analysis.clearCursor();
    els.downloadButton.disabled = true;
    els.fileName.textContent = file.name;
    els.imageMeta.textContent = "Décodage de l’image…";
  },
  onImage({ file, canvas, decoded }) {
    copyImageCanvas(els.sourceCanvas, canvas);
    workingMode = canvasIsGrayscale(els.sourceCanvas) ? "Grayscale" : "RGB";
    els.originalCanvas.width = decoded.width;
    els.originalCanvas.height = decoded.height;
    els.imageMeta.textContent = `${decoded.width} × ${decoded.height} px · ${((decoded.width * decoded.height) / 1e6).toFixed(1)} Mpx · ${decoded.format}${decoded.detail || ""} · ${workingMode}`;
    els.originalBadge.textContent = `${decoded.width} × ${decoded.height} px · ${workingMode} float32`;
    els.originalStage.classList.remove("empty");
    els.resultStage.classList.remove("empty");
    viewer.setImageSize(decoded.width, decoded.height);
    analysis.setSource(els.sourceCanvas, workingMode, {
      width: decoded.width,
      height: decoded.height,
      fileSize: file.size,
    });
    imageReady = true;
    els.resultView.disabled = false;
    renderOriginal();
    schedule();
  },
  onLoadError(error) {
    els.imageMeta.textContent = error.message;
    els.timing.textContent = "Chargement impossible";
    console.error(error);
  },
  onLoadEnd() {
    els.imageInput.value = "";
  },
});
function drawImage(file) {
  return application.load(file);
}

function reset() {
  Object.assign(els.gaussianEnabled, { checked: true });
  els.gaussianSize.value = 5;
  els.gaussianSigma.value = 1.4;
  els.method.value = "sobel";
  els.derivativeSize.value = 3;
  els.laplacianSize.value = 3;
  els.laplacianConnectivity.value = 4;
  els.dogSize.value = 5;
  els.dogSigma1.value = 1;
  els.dogSigma2.value = 2;
  els.gradientThreshold.value = 80;
  els.zeroCrossingMode.value = "simple";
  els.zeroThresholdDifference.value = 20;
  els.zeroThresholdMin.value = 0;
  els.zeroThresholdMax.value = 0;
  els.cannyLow.value = 50;
  els.cannyHigh.value = 150;
  els.cannyAperture.value = 3;
  els.cannyL2.checked = true;
  els.retrievalMode.value = "external";
  els.approximationMode.value = "simple";
  els.drawContours.checked = true;
  els.originalDisplayMin.value = 0;
  els.originalDisplayMax.value = 255;
  els.resultDisplayMin.value = 0;
  els.resultDisplayMax.value = 255;
  els.originalAutoRange.checked = false;
  els.resultAutoRange.checked = true;
  els.gaussianSettings.hidden = false;
  els.gradientThresholdValue.value = 80;
  updateMethodInterface();
  renderOriginal();
}
loadOpenCV()
  .then(() => {
    cvReady = true;
    byId("runtimeDot").parentElement.classList.add("ready");
    els.runtimeText.textContent = "OpenCV pr\u00eat";
    renderOriginal();
    schedule();
  })
  .catch((error) => {
    els.runtimeText.textContent = error.message;
    els.parameterError.textContent = error.message;
  });
els.imageInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) drawImage(file);
});
els.method.addEventListener("change", updateMethodInterface);
els.zeroCrossingMode.addEventListener("change", () => {
  updateZeroInterface();
  schedule();
});
els.gaussianEnabled.addEventListener("change", () => {
  els.gaussianSettings.hidden = !els.gaussianEnabled.checked;
  schedule();
});
els.gradientThreshold.addEventListener("input", () => {
  els.gradientThresholdValue.value = els.gradientThreshold.value;
  schedule();
});
document
  .querySelectorAll(".contour-workbench input, .contour-workbench select")
  .forEach((control) => {
    if (
      ![els.method, els.zeroCrossingMode, els.gaussianEnabled, els.gradientThreshold].includes(
        control,
      )
    )
      control.addEventListener("input", () => {
        updateKernelPreview();
        updateContourExplanations();
        schedule();
      });
  });
document.querySelectorAll(".pipeline-step").forEach((section) =>
  section.addEventListener("toggle", () => {
    if (!section.open) return;
    document.querySelectorAll(".pipeline-step").forEach((other) => {
      if (other !== section) other.open = false;
    });
  }),
);
els.resultView.addEventListener("change", renderSelected);
byId("resetButton").addEventListener("click", reset);
displayControls.original.bind(renderOriginal);
displayControls.result.bind(renderSelected);

els.downloadButton.addEventListener("click", () =>
  downloadCanvas(els.resultCanvas, `contours-${els.resultView.value}.png`),
);
bindImageCursor({
  stages: [els.originalStage, els.resultStage],
  viewer,
  enabled: () => imageReady && !!lastResult,
  onPoint: ({ x, y }) =>
    analysis.setCursor(x, y, els.sourceCanvas, lastResult.mat, lastResult.mode),
  clear: () => analysis.clearCursor(),
});
displayRange("original");
displayRange("result");
updateContourExplanations();
updateMethodInterface();
