import { applyFilter } from "./filters.js";
import {
  resizeKernel,
  readKernel,
  setIdentity,
  normalizeKernel,
  enableKernelTableEditing,
} from "./kernel.js";
import { drawFileToCanvas } from "../../../shared/scripts/image-loaders.js";
import { createSyncedViewer } from "../../../shared/scripts/viewer.js";
import { createAnalysisView } from "../../../shared/scripts/analysis.js";
import { byId, collectElements } from "./ui.js";

let cvReady = false,
  imageReady = false,
  kernelInputs = [],
  timer = null,
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
  else if (
    (filter === "median" || filter === "gaussian") &&
    (width % 2 === 0 || height % 2 === 0)
  )
    error = "Ce filtre exige des dimensions impaires.";
  else if (filter === "median" && width < 3)
    error =
      "Le filtre médian exige une taille impaire supérieure ou égale à 3.";
  els.dimensionError.textContent = filter === "convolution" ? "" : error;
  els.kernelDialogDimensionError.textContent =
    filter === "convolution" ? error : "";
  return !error;
}
function displayRange(kind) {
  const minInput = els[`${kind}DisplayMin`],
    maxInput = els[`${kind}DisplayMax`],
    auto = els[`${kind}AutoRange`].checked,
    error = els[`${kind}DisplayRangeError`],
    min = Number.parseFloat(minInput.value),
    max = Number.parseFloat(maxInput.value),
    valid = auto || (Number.isFinite(min) && Number.isFinite(max) && max > min);
  minInput.disabled = auto;
  maxInput.disabled = auto;
  error.textContent = valid
    ? ""
    : "La valeur blanche doit être strictement supérieure à la valeur noire.";
  return { min, max, auto, valid, error };
}

// ---------------------------------------------------------------------------
// Conversion OpenCV et rendu des images
// ---------------------------------------------------------------------------

function canvasIsGrayscale(canvas) {
  const data = canvas
    .getContext("2d")
    .getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 0; i < data.length; i += 4)
    if (data[i] !== data[i + 1] || data[i] !== data[i + 2]) return false;
  return true;
}
function readWorkingImage() {
  const rgba = cv.imread(els.source),
    base = new cv.Mat(),
    floatImage = new cv.Mat();
  try {
    cv.cvtColor(
      rgba,
      base,
      workingMode === "Grayscale" ? cv.COLOR_RGBA2GRAY : cv.COLOR_RGBA2RGB,
    );
    base.convertTo(floatImage, cv.CV_32F);
    return floatImage;
  } finally {
    rgba.delete();
    base.delete();
  }
}
function matRange(mat) {
  const channels = new cv.MatVector();
  cv.split(mat, channels);
  let min = Infinity,
    max = -Infinity;
  try {
    for (let i = 0; i < channels.size(); i++) {
      const channel = channels.get(i);
      try {
        const values = cv.minMaxLoc(channel);
        min = Math.min(min, values.minVal);
        max = Math.max(max, values.maxVal);
      } finally {
        channel.delete();
      }
    }
    return { min, max };
  } finally {
    channels.delete();
  }
}
function formatValue(value) {
  return Number(value.toPrecision(6)).toString();
}
function makeDisplayImage(floatImage, range) {
  let { min, max } = range;
  if (range.auto) {
    ({ min, max } = matRange(floatImage));
    range.error.textContent =
      min === max
        ? `Image uniforme : ${formatValue(min)}`
        : `Plage utilisée : ${formatValue(min)} → ${formatValue(max)}`;
  }
  if (min === max) max = min + 1;
  range.resolvedMin = min;
  range.resolvedMax = max;
  const display = new cv.Mat(),
    scale = 255 / (max - min);
  floatImage.convertTo(display, cv.CV_8U, scale, -min * scale);
  return display;
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
  clearTimeout(timer);
  timer = setTimeout(processImage, 75);
}
function processImage() {
  const range = displayRange("result");
  if (!cvReady || !imageReady || !validate() || !range.valid) return;
  els.processing.hidden = false;
  requestAnimationFrame(() => {
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
    } catch (error) {
      els.timing.textContent = `Erreur : ${error.message}`;
      console.error(error);
    } finally {
      src?.delete();
      dst?.delete();
      display?.delete();
      els.processing.hidden = true;
    }
  });
}
async function drawImage(file) {
  imageReady = false;
  lastResult?.delete();
  lastResult = null;
  analysis.clearCursor();
  els.download.disabled = true;
  els.fileName.textContent = file.name;
  els.imageMeta.textContent = "Décodage de l’image…";
  try {
    const decoded = await drawFileToCanvas(file, els.source);
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
  } catch (error) {
    els.imageMeta.textContent = error.message;
    els.timing.textContent = "Chargement impossible";
    console.error(error);
  }
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
  const examples = {
    constant: "<em>0 0</em> │ a b c d │ <em>0 0</em>",
    replicate: "<em>a a</em> │ a b c d │ <em>d d</em>",
    reflect: "<em>b a</em> │ a b c d │ <em>d c</em>",
    reflect101: "<em>c b</em> │ a b c d │ <em>c b</em>",
  };
  els.borderDemo.innerHTML = examples[els.border.value];
  els.borderValueField.hidden = els.border.value !== "constant";
}
function updateMode() {
  const filter = selectedFilter(),
    median = filter === "median",
    gaussian = filter === "gaussian",
    convolution = filter === "convolution",
    labels = {
      mean: [
        "Paramètres du filtre moyenneur",
        "Lissage uniforme par moyenne locale.",
      ],
      median: [
        "Paramètres du filtre médian",
        "Remplacement par la médiane du voisinage.",
      ],
      gaussian: [
        "Paramètres du filtre gaussien",
        "Lissage pondéré par une distribution gaussienne.",
      ],
      convolution: [
        "Paramètres de convolution",
        "Application d’un noyau personnalisé.",
      ],
    };
  els.parameterPanel.dataset.filter = filter;
  [els.parameterTitle.textContent, els.parameterDescription.textContent] =
    labels[filter];
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
  if ((gaussian || median) && n(els.width) % 2 === 0)
    els.width.value = n(els.width) + 1;
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

window.addEventListener("opencv-ready", () => {
  cvReady = true;
  byId("runtimeDot").parentElement.classList.add("ready");
  els.runtime.textContent = "OpenCV prêt";
  renderOriginal();
  schedule();
});
if (window.cv?.Mat) {
  cvReady = true;
  byId("runtimeDot").parentElement.classList.add("ready");
  els.runtime.textContent = "OpenCV prêt";
}
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
    if (input === els.border) updateBorderDemo();
    if (input === els.sigmaX && els.linkSigma.checked)
      els.sigmaY.value = els.sigmaX.value;
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
    els.kernelError.textContent =
      "Impossible de normaliser : la somme du noyau est nulle.";
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
els.download.addEventListener("click", () => {
  els.result.toBlob((blob) => {
    const a = document.createElement("a"),
      url = URL.createObjectURL(blob);
    a.href = url;
    a.download = "image-filtree.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
});
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
byId("closeKernelDialog").addEventListener("click", () =>
  els.kernelDialog.close(),
);
byId("closeKernelDialogIcon").addEventListener("click", () =>
  els.kernelDialog.close(),
);
els.kernelDialog.addEventListener("click", (event) => {
  if (event.target === els.kernelDialog) els.kernelDialog.close();
});
[els.originalDisplayMin, els.originalDisplayMax].forEach((input) =>
  input.addEventListener("input", renderOriginal),
);
[els.resultDisplayMin, els.resultDisplayMax].forEach((input) =>
  input.addEventListener("input", schedule),
);
els.originalAutoRange.addEventListener("change", renderOriginal);
els.resultAutoRange.addEventListener("change", schedule);
displayRange("original");
displayRange("result");
for (const stage of [els.originalStage, els.resultStage]) {
  stage.addEventListener("pointermove", (event) => {
    if (!imageReady || !lastResult) return;
    const point = viewer.toImagePoint(stage, event.clientX, event.clientY);
    if (point) analysis.setCursor(point.x, point.y, els.source, lastResult);
    else analysis.clearCursor();
  });
  stage.addEventListener("pointerleave", () => analysis.clearCursor());
}
updateBorderDemo();
rebuildKernel(false);
updateMode();
