import { drawFileToCanvas } from "../../../shared/scripts/image-loaders.js";
import { createSyncedViewer } from "../../../shared/scripts/viewer.js";
import { createAnalysisView } from "../../../shared/scripts/analysis.js";
import { runPipeline, deletePipeline } from "./processing.js";
import { byId, collectElements } from "./ui.js";

let cvReady = false, imageReady = false, workingMode = "RGB", timer = null, pipeline = null, lastResult = null;
const els = collectElements();
const viewer = createSyncedViewer({ stages: [els.originalStage, els.resultStage], canvases: [els.originalCanvas, els.resultCanvas], zoomLabel: byId("zoomLabel"), zoomSlider: byId("zoomSlider"), fitButton: byId("fitView") });
const analysis = createAnalysisView({
  infoDimensions: byId("infoDimensions"), infoType: byId("infoType"), infoOriginalRange: byId("infoOriginalRange"), infoFileSize: byId("infoFileSize"), cursorPosition: byId("cursorPosition"), cursorOriginal: byId("cursorOriginal"), cursorResult: byId("cursorResult"), cursorDifference: byId("cursorDifference"), originalHistogram: byId("originalHistogram"), resultHistogram: byId("resultHistogram"), originalHistogramRange: byId("originalHistogramRange"), resultHistogramRange: byId("resultHistogramRange")
});
const integer = (input, fallback = 0) => Number.isFinite(Number.parseInt(input.value, 10)) ? Number.parseInt(input.value, 10) : fallback;
const number = (input, fallback = 0) => Number.isFinite(Number.parseFloat(input.value)) ? Number.parseFloat(input.value) : fallback;

function canvasIsGrayscale(canvas) {
  const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 0; i < data.length; i += 4) if (data[i] !== data[i + 1] || data[i] !== data[i + 2]) return false;
  return true;
}
function readImages() {
  const rgba = cv.imread(els.sourceCanvas), gray8 = new cv.Mat(), rgb8 = new cv.Mat(), gray = new cv.Mat(), rgb = new cv.Mat();
  try {
    cv.cvtColor(rgba, gray8, cv.COLOR_RGBA2GRAY); cv.cvtColor(rgba, rgb8, cv.COLOR_RGBA2RGB);
    gray8.convertTo(gray, cv.CV_32F); rgb8.convertTo(rgb, cv.CV_32F);
    return { gray, rgb };
  } finally { rgba.delete(); gray8.delete(); rgb8.delete(); }
}
function matRange(mat) {
  const channels = new cv.MatVector(); cv.split(mat, channels); let min = Infinity, max = -Infinity;
  try { for (let i = 0; i < channels.size(); i++) { const channel = channels.get(i); try { const range = cv.minMaxLoc(channel); min = Math.min(min, range.minVal); max = Math.max(max, range.maxVal); } finally { channel.delete(); } } return { min, max }; }
  finally { channels.delete(); }
}
function displayRange(kind) {
  const minInput = els[`${kind}DisplayMin`], maxInput = els[`${kind}DisplayMax`], auto = els[`${kind}AutoRange`].checked, error = els[`${kind}DisplayRangeError`], min = number(minInput), max = number(maxInput), valid = auto || max > min;
  minInput.disabled = auto; maxInput.disabled = auto; error.textContent = valid ? "" : "La valeur blanche doit être strictement supérieure à la valeur noire.";
  return { min, max, auto, valid, error };
}
function makeDisplayImage(mat, range) {
  let { min, max } = range;
  if (range.auto) { ({ min, max } = matRange(mat)); range.error.textContent = min === max ? `Image uniforme : ${Number(min.toPrecision(6))}` : `Plage utilisée : ${Number(min.toPrecision(6))} → ${Number(max.toPrecision(6))}`; }
  if (min === max) max = min + 1;
  range.resolvedMin = min; range.resolvedMax = max;
  const display = new cv.Mat(); mat.convertTo(display, cv.CV_8U, 255 / (max - min), -min * 255 / (max - min)); return display;
}
function renderOriginal() {
  const range = displayRange("original"); if (!cvReady || !imageReady || !range.valid) return;
  const { gray, rgb } = readImages(), mat = workingMode === "Grayscale" ? gray : rgb;
  let display;
  try { display = makeDisplayImage(mat, range); cv.imshow(els.originalCanvas, display); analysis.setSourceDisplay(els.sourceCanvas, range); }
  finally { gray.delete(); rgb.delete(); display?.delete(); }
}
function settings() { return {
  gaussianEnabled: els.gaussianEnabled.checked, gaussianSize: integer(els.gaussianSize, 5), gaussianSigma: Math.max(0, number(els.gaussianSigma, 1.4)), method: els.method.value, derivativeSize: integer(els.derivativeSize, 3), laplacianSize: integer(els.laplacianSize, 3), dogSigma1: Math.max(.1, number(els.dogSigma1, 1)), dogSigma2: Math.max(.1, number(els.dogSigma2, 2)), gradientThreshold: integer(els.gradientThreshold, 80), zeroCrossingMode: els.zeroCrossingMode.value, zeroThresholdDifference: Math.max(0, number(els.zeroThresholdDifference, 20)), zeroThresholdMin: number(els.zeroThresholdMin), zeroThresholdMax: number(els.zeroThresholdMax), cannyLow: integer(els.cannyLow, 50), cannyHigh: integer(els.cannyHigh, 150), cannyAperture: integer(els.cannyAperture, 3), cannyL2: els.cannyL2.checked, retrievalMode: els.retrievalMode.value, approximationMode: els.approximationMode.value, drawContours: els.drawContours.checked
}; }
function validate(s) {
  let error = "";
  if (s.gaussianSize < 1 || s.gaussianSize > 31 || s.gaussianSize % 2 === 0) error = "Le noyau gaussien doit être impair et compris entre 1 et 31.";
  else if (s.method === "dog" && s.dogSigma2 <= s.dogSigma1) error = "Pour la DoG, σ₂ doit être strictement supérieur à σ₁.";
  else if (s.method === "canny" && s.cannyHigh <= s.cannyLow) error = "Le seuil haut de Canny doit être supérieur au seuil bas.";
  els.parameterError.textContent = error; return !error;
}
function updateMethodInterface() {
  const method = els.method.value, first = method === "sobel" || method === "prewitt", second = method === "laplacian" || method === "dog";
  els.firstOrderSettings.hidden = !first; els.derivativeSize.disabled = method === "prewitt"; if (method === "prewitt") els.derivativeSize.value = "3";
  els.laplacianSettings.hidden = method !== "laplacian"; els.dogSettings.hidden = method !== "dog"; els.cannySettings.hidden = method !== "canny";
  els.thresholdSettings.hidden = !first; els.zeroCrossingSettings.hidden = !second; els.cannyThresholdSettings.hidden = method !== "canny";
  els.postSubtitle.textContent = first ? "Normalisation et seuillage" : second ? "Détection des passages par zéro" : "Double seuillage et hystérésis";
  updateZeroInterface(); schedule();
}
function updateZeroInterface() { els.simpleZeroSettings.hidden = els.zeroCrossingMode.value !== "simple"; }
function updateResultOptions() {
  const previous = els.resultView.value, options = [...pipeline.images.values()];
  els.resultView.replaceChildren(...options.map(({ key, label }) => { const option = document.createElement("option"); option.value = key; option.textContent = label; return option; }));
  els.resultView.value = pipeline.images.has(previous) ? previous : (pipeline.images.has("amplitude") ? "amplitude" : pipeline.images.has("response") ? "response" : "binary");
}
function renderSelected() {
  if (!pipeline) return; const selected = pipeline.images.get(els.resultView.value); if (!selected) return;
  const range = displayRange("result"); if (!range.valid) return; let display;
  try { display = makeDisplayImage(selected.mat, range); cv.imshow(els.resultCanvas, display); lastResult = selected; analysis.setResult(selected.mat, range, selected.mode); els.resultBadge.textContent = `${selected.mat.cols} × ${selected.mat.rows} px · ${selected.mode} float32`; }
  finally { display?.delete(); }
}
function schedule() { clearTimeout(timer); timer = setTimeout(processImage, 70); }
function processImage() {
  const s = settings(); if (!cvReady || !imageReady || !validate(s)) return; els.processing.hidden = false;
  requestAnimationFrame(() => { const start = performance.now(); let gray, rgb;
    try { ({ gray, rgb } = readImages()); const next = runPipeline(gray, rgb, s); deletePipeline(pipeline); pipeline = next; updateResultOptions(); renderSelected(); els.contourCount.textContent = `${pipeline.contourCount} contour${pipeline.contourCount > 1 ? "s" : ""} détecté${pipeline.contourCount > 1 ? "s" : ""}.`; els.timing.textContent = `Calcul : ${Math.round(performance.now() - start)} ms`; els.downloadButton.disabled = false; }
    catch (error) { els.timing.textContent = `Erreur : ${error.message}`; console.error(error); }
    finally { gray?.delete(); rgb?.delete(); els.processing.hidden = true; }
  });
}
async function drawImage(file) {
  imageReady = false; deletePipeline(pipeline); pipeline = null; lastResult = null; analysis.clearCursor(); els.downloadButton.disabled = true; els.fileName.textContent = file.name; els.imageMeta.textContent = "Décodage de l’image…";
  try { const decoded = await drawFileToCanvas(file, els.sourceCanvas); workingMode = canvasIsGrayscale(els.sourceCanvas) ? "Grayscale" : "RGB"; els.originalCanvas.width = decoded.width; els.originalCanvas.height = decoded.height; els.imageMeta.textContent = `${decoded.width} × ${decoded.height} px · ${((decoded.width * decoded.height) / 1e6).toFixed(1)} Mpx · ${decoded.format}${decoded.detail || ""} · ${workingMode}`; els.originalBadge.textContent = `${decoded.width} × ${decoded.height} px · ${workingMode} float32`; els.originalStage.classList.remove("empty"); els.resultStage.classList.remove("empty"); viewer.setImageSize(decoded.width, decoded.height); analysis.setSource(els.sourceCanvas, workingMode, { width: decoded.width, height: decoded.height, fileSize: file.size }); imageReady = true; els.resultView.disabled = false; renderOriginal(); schedule(); }
  catch (error) { els.imageMeta.textContent = error.message; els.timing.textContent = "Chargement impossible"; console.error(error); }
}
function reset() {
  Object.assign(els.gaussianEnabled, { checked: true }); els.gaussianSize.value = 5; els.gaussianSigma.value = 1.4; els.method.value = "sobel"; els.derivativeSize.value = 3; els.laplacianSize.value = 3; els.dogSigma1.value = 1; els.dogSigma2.value = 2; els.gradientThreshold.value = 80; els.zeroCrossingMode.value = "simple"; els.zeroThresholdDifference.value = 20; els.zeroThresholdMin.value = 0; els.zeroThresholdMax.value = 0; els.cannyLow.value = 50; els.cannyHigh.value = 150; els.cannyAperture.value = 3; els.cannyL2.checked = true; els.retrievalMode.value = "external"; els.approximationMode.value = "simple"; els.drawContours.checked = true; els.originalDisplayMin.value = 0; els.originalDisplayMax.value = 255; els.resultDisplayMin.value = 0; els.resultDisplayMax.value = 255; els.originalAutoRange.checked = false; els.resultAutoRange.checked = true; els.gaussianSettings.hidden = false; els.gradientThresholdValue.value = 80; updateMethodInterface(); renderOriginal();
}
window.addEventListener("opencv-ready", () => { cvReady = true; byId("runtimeDot").parentElement.classList.add("ready"); els.runtimeText.textContent = "OpenCV prêt"; renderOriginal(); schedule(); });
if (window.cv?.Mat) { cvReady = true; byId("runtimeDot").parentElement.classList.add("ready"); els.runtimeText.textContent = "OpenCV prêt"; }
els.imageInput.addEventListener("change", (event) => { const [file] = event.target.files; if (file) drawImage(file); });
els.method.addEventListener("change", updateMethodInterface); els.zeroCrossingMode.addEventListener("change", () => { updateZeroInterface(); schedule(); }); els.gaussianEnabled.addEventListener("change", () => { els.gaussianSettings.hidden = !els.gaussianEnabled.checked; schedule(); }); els.gradientThreshold.addEventListener("input", () => { els.gradientThresholdValue.value = els.gradientThreshold.value; schedule(); });
document.querySelectorAll(".contour-workbench input, .contour-workbench select").forEach((control) => { if (![els.method, els.zeroCrossingMode, els.gaussianEnabled, els.gradientThreshold].includes(control)) control.addEventListener("input", schedule); });
els.resultView.addEventListener("change", renderSelected); byId("resetButton").addEventListener("click", reset);
[els.originalDisplayMin, els.originalDisplayMax].forEach((input) => input.addEventListener("input", renderOriginal)); [els.resultDisplayMin, els.resultDisplayMax].forEach((input) => input.addEventListener("input", renderSelected)); els.originalAutoRange.addEventListener("change", renderOriginal); els.resultAutoRange.addEventListener("change", renderSelected);
els.downloadButton.addEventListener("click", () => els.resultCanvas.toBlob((blob) => { const link = document.createElement("a"), url = URL.createObjectURL(blob); link.href = url; link.download = `contours-${els.resultView.value}.png`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }, "image/png"));
for (const stage of [els.originalStage, els.resultStage]) { stage.addEventListener("pointermove", (event) => { if (!imageReady || !lastResult) return; const point = viewer.toImagePoint(stage, event.clientX, event.clientY); if (point) analysis.setCursor(point.x, point.y, els.sourceCanvas, lastResult.mat, lastResult.mode); else analysis.clearCursor(); }); stage.addEventListener("pointerleave", () => analysis.clearCursor()); }
displayRange("original"); displayRange("result"); updateMethodInterface();
