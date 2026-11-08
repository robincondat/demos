import { createDisplayControls } from "../../shared/scripts/display-controls.js?v=20261106-ui2";
import {
  canvasIsGrayscale,
  readCanvasImage,
  makeDisplayImage,
} from "../../shared/scripts/opencv-image.js?v=20261106-ui2";
import { mountImageComponents } from "../../shared/scripts/image-components.js?v=20261106-ui2";
import {
  downloadCanvas,
  bindImageCursor,
  renderBorderPreview,
} from "../../shared/scripts/image-actions.js?v=20261106-ui2";
import { loadOpenCV } from "../../shared/scripts/opencv-runtime.js?v=20261106-science1";
import { applyFilter } from "../../shared/compute/spatial-filters.js?v=20261106-science1";
import {
  resizeKernel,
  readKernel,
  setIdentity,
  normalizeKernel,
  enableKernelTableEditing,
} from "./kernel.js";
import {
  createImageApplication,
  copyImageCanvas,
} from "../../shared/scripts/image-application.js?v=20261106-controller1";
import { createSyncedViewer } from "../../shared/scripts/viewer.js?v=20261106-science1";
import { createAnalysisView } from "../../shared/scripts/analysis.js?v=20261106-histcurves";
import { byId, collectElements } from "./ui.js";

mountImageComponents();

let cvReady = false,
  imageReady = false,
  kernelInputs = [],
  workingMode = "RGB",
  imageDescription = "",
  lastResult = null;

const els = collectElements();
const viewer = createSyncedViewer({
  stages: [els.originalStage, els.resultStage],
  canvases: [els.original, els.result],
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

// ---------------------------------------------------------------------------
// Lecture et validation des paramètres
// ---------------------------------------------------------------------------

function selectedFilter() {
  return document.querySelector('input[name="filter"]:checked').value;
}
function n(input, fallback = 1) {
  const v = Number.parseInt(input.value, 10);
  return Number.isFinite(v) ? v : fallback;
}
function dimensions() {
  const filter = selectedFilter(),
    width = n(els.width),
    height = filter === "median" ? width : n(els.height);
  return { width, height };
}
function validate() {
  const filter = selectedFilter(),
    { width, height } = dimensions();
  let error = "";
  if (width < 1 || height < 1 || width > 31 || height > 31)
    error = "Les dimensions doivent être comprises entre 1 et 31.";
  else if ((filter === "median" || filter === "gaussian") && (width % 2 === 0 || height % 2 === 0))
    error = "Ce filtre exige des dimensions impaires.";
  else if (filter === "median" && width < 3)
    error = "Le filtre médian exige une taille impaire supérieure ou égale à 3.";
  els.dimensionError.textContent = filter === "convolution" ? "" : error;
  els.kernelDialogDimensionError.textContent = filter === "convolution" ? error : "";
  return !error;
}
const displayControls = Object.fromEntries(
  ["original", "result"].map((kind) => [kind, createDisplayControls(kind)]),
);
function displayRange(kind) {
  return displayControls[kind].read();
}
// ---------------------------------------------------------------------------
// Conversion OpenCV et rendu des images
// ---------------------------------------------------------------------------

function readWorkingImage() {
  return readCanvasImage(els.source, { mode: workingMode });
}
function renderOriginal() {
  const range = displayRange("original");
  if (!cvReady || !imageReady || !range.valid) return;
  let src, display;
  try {
    src = readWorkingImage();
    display = makeDisplayImage(src, range);
    cv.imshow(els.original, display);
    analysis.setSourceDisplay(els.source, range);
  } finally {
    src?.delete();
    display?.delete();
  }
}
function settings() {
  const { width, height } = dimensions();
  return {
    filter: selectedFilter(),
    width,
    height,
    borderType: els.border.value,
    borderValue: Math.max(0, Math.min(255, n(els.borderValue, 0))),
    sigmaX: Math.max(0, Number(els.sigmaX.value) || 0),
    sigmaY: els.linkSigma.checked
      ? Math.max(0, Number(els.sigmaX.value) || 0)
      : Math.max(0, Number(els.sigmaY.value) || 0),
    kernel: readKernel(kernelInputs),
  };
}

// ---------------------------------------------------------------------------
// Chaîne de traitement
// ---------------------------------------------------------------------------

function schedule() {
  application.schedule(calculate);
}
function processImage() {
  return application.run(calculate);
}
function calculate() {
  const range = displayRange("result");
  if (!cvReady || !imageReady || !validate() || !range.valid) return;

  const start = performance.now();
  let src, dst, display;
  try {
    src = readWorkingImage();
    dst = applyFilter(src, settings());
    display = makeDisplayImage(dst, range);
    cv.imshow(els.result, display);
    lastResult?.delete();
    lastResult = dst;
    dst = null;
    analysis.setResult(lastResult, range);
    els.resultBadge.textContent = `${lastResult.cols} × ${lastResult.rows} px · ${workingMode} float32`;
    els.timing.textContent = `Calcul : ${Math.round(performance.now() - start)} ms · ${workingMode} float32`;
    els.download.disabled = false;
  } finally {
    src?.delete();
    dst?.delete();
    display?.delete();
  }
}
const application = createImageApplication({
  delay: 75,
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
    lastResult?.delete();
    lastResult = null;
    analysis.clearCursor();
    els.download.disabled = true;
    els.fileName.textContent = file.name;
    els.imageMeta.textContent = "Décodage de l’image…";
  },
  onImage({ file, canvas, decoded }) {
    copyImageCanvas(els.source, canvas);
    workingMode = canvasIsGrayscale(els.source) ? "Grayscale" : "RGB";
    els.original.width = decoded.width;
    els.original.height = decoded.height;
    const megapixels = ((decoded.width * decoded.height) / 1e6).toFixed(1);
    imageDescription = `${decoded.width} × ${decoded.height} px · ${megapixels} Mpx · ${decoded.format}${decoded.detail || ""} · ${workingMode}`;
    els.imageMeta.textContent = imageDescription;
    els.originalBadge.textContent = `${decoded.width} × ${decoded.height} px · ${workingMode} float32`;
    els.originalStage.classList.remove("empty");
    els.resultStage.classList.remove("empty");
    viewer.setImageSize(decoded.width, decoded.height);
    analysis.setSource(els.source, workingMode, {
      width: decoded.width,
      height: decoded.height,
      fileSize: file.size,
    });
    imageReady = true;
    renderOriginal();
    schedule();
  },
  onLoadError(error) {
    els.imageMeta.textContent = error.message;
    els.timing.textContent = "Chargement impossible";
    console.error(error);
  },
  onLoadEnd() {
    els.input.value = "";
  },
});
function drawImage(file) {
  return application.load(file);
}

// ---------------------------------------------------------------------------
// Éditeur du noyau et contrôles du filtre
// ---------------------------------------------------------------------------

function rebuildKernel(preserve = true) {
  const old = preserve ? readKernel(kernelInputs) : [];
  const { width, height } = dimensions();
  kernelInputs = resizeKernel(els.grid, width, height, old);
  kernelInputs.forEach((input) =>
    input.addEventListener("input", () => {
      updateKernelSum();
      schedule();
    }),
  );
  updateKernelSum();
}
function updateKernelSum() {
  const value = Number(
      readKernel(kernelInputs)
        .reduce((a, b) => a + b, 0)
        .toPrecision(7),
    ),
    { width, height } = dimensions();
  els.sum.textContent = els.inlineSum.textContent = value;
  els.kernelShape.textContent = `${width} × ${height}`;
  els.kernelError.textContent = "";
}
function updateBorderDemo() {
  renderBorderPreview({
    preview: els.borderDemo,
    valueField: els.borderValueField,
    border: els.border.value,
    value: els.borderValue.value,
  });
}
function updateMode() {
  const filter = selectedFilter(),
    median = filter === "median",
    gaussian = filter === "gaussian",
    convolution = filter === "convolution",
    labels = {
      mean: ["Paramètres du filtre moyenneur", "Lissage uniforme par moyenne locale."],
      median: ["Paramètres du filtre médian", "Remplacement par la médiane du voisinage."],
      gaussian: [
        "Paramètres du filtre gaussien",
        "Lissage pondéré par une distribution gaussienne.",
      ],
      convolution: ["Paramètres de convolution", "Application d’un noyau personnalisé."],
    };
  els.parameterPanel.dataset.filter = filter;
  [els.parameterTitle.textContent, els.parameterDescription.textContent] = labels[filter];
  els.kernelSizeSection.hidden = convolution;
  els.widthLabel.textContent = median ? "Largeur / hauteur" : "Largeur";
  els.heightField.hidden = median;
  els.dimensionSeparator.hidden = median;
  els.gaussian.hidden = !gaussian;
  els.convolution.hidden = !convolution;
  els.hint.textContent = median
    ? "Le noyau médian est carré et impair."
    : gaussian
      ? "Largeur et hauteur doivent être impaires."
      : "Toutes les dimensions positives sont acceptées.";
  if (median && n(els.width) < 3) els.width.value = 3;
  if ((gaussian || median) && n(els.width) % 2 === 0) els.width.value = n(els.width) + 1;
  if (gaussian && n(els.height) % 2 === 0) els.height.value = n(els.height) + 1;
  if (convolution) {
    els.convolutionWidth.value = els.width.value;
    els.convolutionHeight.value = els.height.value;
    rebuildKernel();
  }
  validate();
  schedule();
}
function reset() {
  document.querySelector('input[name="filter"][value="mean"]').checked = true;
  els.width.value = 3;
  els.height.value = 3;
  els.border.value = "reflect101";
  els.borderValue.value = 0;
  els.sigmaX.value = 1;
  els.sigmaY.value = 1;
  els.originalDisplayMin.value = 0;
  els.originalDisplayMax.value = 255;
  els.resultDisplayMin.value = 0;
  els.resultDisplayMax.value = 255;
  els.originalAutoRange.checked = false;
  els.resultAutoRange.checked = false;
  displayRange("original");
  displayRange("result");
  els.linkSigma.checked = true;
  els.sigmaY.disabled = true;
  updateBorderDemo();
  updateMode();
  rebuildKernel(false);
  renderOriginal();
}

// ---------------------------------------------------------------------------
// Branchement des événements de l'interface
// ---------------------------------------------------------------------------

loadOpenCV()
  .then(() => {
    cvReady = true;
    byId("runtimeDot").parentElement.classList.add("ready");
    els.runtime.textContent = "OpenCV pr\u00eat";
    renderOriginal();
    schedule();
  })
  .catch((error) => {
    els.runtime.textContent = error.message;
    els.dimensionError.textContent = error.message;
  });
els.input.addEventListener("change", (e) => {
  const [file] = e.target.files;
  if (file) drawImage(file);
});
document
  .querySelectorAll('input[name="filter"]')
  .forEach((i) => i.addEventListener("change", updateMode));
[els.width, els.height].forEach((input) =>
  input.addEventListener("input", () => {
    if (selectedFilter() === "convolution") rebuildKernel();
    validate();
    schedule();
  }),
);
[els.border, els.borderValue, els.sigmaX, els.sigmaY].forEach((input) =>
  input.addEventListener("input", () => {
    if (input === els.border || input === els.borderValue) updateBorderDemo();
    if (input === els.sigmaX && els.linkSigma.checked) els.sigmaY.value = els.sigmaX.value;
    schedule();
  }),
);
els.linkSigma.addEventListener("change", () => {
  els.sigmaY.disabled = els.linkSigma.checked;
  if (els.linkSigma.checked) els.sigmaY.value = els.sigmaX.value;
  schedule();
});
byId("normalizeKernel").addEventListener("click", () => {
  if (!normalizeKernel(kernelInputs)) {
    els.kernelError.textContent = "Impossible de normaliser : la somme du noyau est nulle.";
    return;
  }
  updateKernelSum();
  schedule();
});
byId("identityKernel").addEventListener("click", () => {
  const { width, height } = dimensions();
  setIdentity(kernelInputs, width, height);
  updateKernelSum();
  schedule();
});
byId("resetButton").addEventListener("click", reset);
els.download.addEventListener("click", () => downloadCanvas(els.result, "image-filtree.png"));
function updateConvolutionDimensions() {
  const width = Number.parseInt(els.convolutionWidth.value, 10),
    height = Number.parseInt(els.convolutionHeight.value, 10),
    valid =
      Number.isInteger(width) &&
      Number.isInteger(height) &&
      width >= 1 &&
      height >= 1 &&
      width <= 31 &&
      height <= 31;
  if (!valid) {
    els.kernelDialogDimensionError.textContent =
      "Les dimensions doivent être comprises entre 1 et 31.";
    return;
  }
  els.width.value = width;
  els.height.value = height;
  rebuildKernel();
  validate();
  schedule();
}
[els.convolutionWidth, els.convolutionHeight].forEach((input) =>
  input.addEventListener("input", updateConvolutionDimensions),
);
enableKernelTableEditing(els.grid, () => {
  updateKernelSum();
  schedule();
});
byId("openKernelEditor").addEventListener("click", () => {
  els.convolutionWidth.value = els.width.value;
  els.convolutionHeight.value = els.height.value;
  els.kernelDialog.showModal();
  requestAnimationFrame(() => {
    kernelInputs[0]?.focus();
    kernelInputs[0]?.select();
  });
});
byId("closeKernelDialog").addEventListener("click", () => els.kernelDialog.close());
byId("closeKernelDialogIcon").addEventListener("click", () => els.kernelDialog.close());
els.kernelDialog.addEventListener("click", (event) => {
  if (event.target === els.kernelDialog) els.kernelDialog.close();
});
displayControls.original.bind(renderOriginal);
displayControls.result.bind(schedule);

displayRange("original");
displayRange("result");
bindImageCursor({
  stages: [els.originalStage, els.resultStage],
  viewer,
  enabled: () => imageReady && !!lastResult,
  onPoint: ({ x, y }) => analysis.setCursor(x, y, els.source, lastResult),
  clear: () => analysis.clearCursor(),
});
updateBorderDemo();
rebuildKernel(false);
updateMode();
