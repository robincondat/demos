import { binarize, applyMorphology, kernelValues, structuringColors } from "./processing.js";
import { drawFileToCanvas } from "../../../shared/scripts/image-loaders.js";
import { createSyncedViewer } from "../../../shared/scripts/viewer.js";

const $ = id => document.getElementById(id);
const viewer = createSyncedViewer({
  stages: [$("originalStage"), $("resultStage")],
  canvases: [$("originalCanvas"), $("resultCanvas")],
  zoomLabel: $("zoomLabel"), zoomSlider: $("zoomSlider"), fitButton: $("fitView"),
});
let width = 3, height = 3, colors = Array(9).fill("white");
const custom = { width: 3, height: 3, colors: ["gray", "gray", "gray", "gray", "white", "gray", "gray", "gray", "gray"] };
let sourceReady = false, cvReady = false, binary = null, result = null, timer, loadVersion = 0;
const operation = () => document.querySelector('input[name="operation"]:checked').value;
const shape = () => document.querySelector('input[name="shape"]:checked').value;
const integer = (id, min, max) => {
  const input = $(id), value = Number(input.value);
  return input.value.trim() !== "" && Number.isInteger(value) && value >= min && value <= max ? value : null;
};
function clearCursor() {
  for (const id of ["cursorPosition", "cursorOriginal", "cursorResult", "cursorDifference"]) $(id).textContent = "—";
}
function invalidateResult() {
  result?.delete(); result = null;
  $("downloadButton").disabled = true;
  $("resultCanvas").getContext("2d").clearRect(0, 0, $("resultCanvas").width, $("resultCanvas").height);
  $("resultStage").classList.add("empty");
  clearCursor();
}
function settings() {
  return { operation: operation(), width, height, colors,
    border: $("borderType").value, borderValue: Number($("borderValue").value) };
}
function validation() {
  const selected = shape(), widthId = selected === "custom" ? "kernelWidth" : "shapeWidth", heightId = selected === "custom" ? "kernelHeight" : "shapeHeight";
  let error = "";
  if (integer("threshold", 0, 255) === null) error = "Le seuil doit être un entier entre 0 et 255.";
  else if (integer(widthId, 1, 31) === null || integer(heightId, 1, 31) === null) error = "Les dimensions doivent être des entiers entre 1 et 31.";
  else if (!kernelValues(colors, operation() === "hitmiss").some(value => value !== 0)) error = operation() === "hitmiss" ? "Définissez au moins une case noire ou blanche pour rechercher un motif." : "L’élément structurant doit contenir au moins une case blanche.";
  $("status").textContent = error;
  return !error;
}
function renderPreview() {
  const canvas = $("kernelPreview"), context = canvas.getContext("2d");
  const frame = canvas.parentElement;
  const cellSize = Math.max(2, Math.floor(Math.min(
    ((frame.clientWidth || 300) - 21) / width,
    ((frame.clientHeight || 190) - 21) / height,
  )));
  canvas.width = width * cellSize + 1; canvas.height = height * cellSize + 1;
  context.imageSmoothingEnabled = false;
  // Fond noir : lignes internes et contour. Seul l'intérieur des cases
  // est coloré, sans modifier le masque transmis à OpenCV.
  context.fillStyle = "#000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const values = kernelValues(colors, operation() === "hitmiss");
  values.forEach((value, index) => {
    const level = value === 1 ? 255 : operation() === "hitmiss" && value === 0 ? 127 : 0;
    context.fillStyle = `rgb(${level}, ${level}, ${level})`;
    context.fillRect((index % width) * cellSize + 1,
      Math.floor(index / width) * cellSize + 1, cellSize - 1, cellSize - 1);
  });
  canvas.setAttribute("aria-label", `Élément structurant appliqué, ${width} colonnes et ${height} lignes`);
}
function paintCell(button, index) {
  const color = colors[index], hitmiss = operation() === "hitmiss";
  const names = { black: "noir", gray: "gris", white: "blanc" };
  const value = kernelValues([color], hitmiss)[0];
  button.dataset.color = color;
  button.textContent = hitmiss ? String(value).replace("-", "−") : value ? "1" : "0";
  button.setAttribute("aria-label", `Ligne ${Math.floor(index / width) + 1}, colonne ${index % width + 1} : ${names[color]}, valeur ${value}. Cliquer pour changer.`);
}
function refreshCells() {
  $("kernelGrid").querySelectorAll("button").forEach((button, index) => paintCell(button, index));
  renderPreview();
}
function renderGrid() {
  const table = document.createElement("table"); table.className = "morphology-table";
  const body = document.createElement("tbody");
  for (let y = 0; y < height; y++) {
    const row = document.createElement("tr");
    for (let x = 0; x < width; x++) {
      const index = y * width + x, cell = document.createElement("td"), button = document.createElement("button");
      button.type = "button"; button.className = "kernel-cell"; button.dataset.index = index;
      paintCell(button, index); cell.append(button); row.append(cell);
    }
    body.append(row);
  }
  table.append(body); $("kernelGrid").replaceChildren(table); renderPreview();
}
function saveCustom() {
  custom.width = width; custom.height = height; custom.colors = [...colors];
}
function selectShape() {
  const selected = shape();
  document.querySelectorAll("[data-shape-controls]").forEach(panel => {
    panel.hidden = panel.dataset.shapeControls !== (selected === "custom" ? "custom" : "preset");
  });
  if (selected === "custom") {
    width = custom.width; height = custom.height; colors = [...custom.colors];
  } else {
    const nextWidth = integer("shapeWidth", 1, 31), nextHeight = integer("shapeHeight", 1, 31);
    if (nextWidth === null || nextHeight === null) { schedule(); return; }
    if (!cvReady) return;
    width = nextWidth; height = nextHeight; colors = structuringColors(selected, width, height);
  }
  renderGrid(); schedule();
}
function resizeGrid() {
  const nextWidth = integer("kernelWidth", 1, 31), nextHeight = integer("kernelHeight", 1, 31);
  $("dimensionError").textContent = nextWidth === null || nextHeight === null ? "Dimensions entières de 1 à 31 requises." : "";
  if (nextWidth !== null && nextHeight !== null) {
    const old = colors, oldWidth = width, oldHeight = height;
    colors = Array.from({ length: nextWidth * nextHeight }, (_, index) => {
      const x = index % nextWidth, y = Math.floor(index / nextWidth);
      return x < oldWidth && y < oldHeight ? old[y * oldWidth + x] : "gray";
    });
    width = nextWidth; height = nextHeight; saveCustom(); renderGrid();
  }
  schedule();
}
function updateBorderDemo() {
  const border = $("borderType").value, value = $("borderValue").value;
  const examples = {
    neutral: "<em>∅ ∅</em> │ a b c d │ <em>∅ ∅</em>",
    constant: `<em>${value} ${value}</em> │ a b c d │ <em>${value} ${value}</em>`,
    replicate: "<em>a a</em> │ a b c d │ <em>d d</em>",
    reflect: "<em>b a</em> │ a b c d │ <em>d c</em>",
    reflect101: "<em>c b</em> │ a b c d │ <em>c b</em>",
  };
  $("borderDemo").innerHTML = examples[border];
  $("borderDemo").setAttribute("aria-label", border === "neutral" ? "Bord neutre : blanc pour l’érosion, noir pour la dilatation" : "Aperçu du prolongement");
  $("borderValueField").hidden = border !== "constant";
}
function schedule() {
  clearTimeout(timer); invalidateResult();
  const valid = validation();
  if (!valid || !sourceReady || !cvReady) return;
  timer = setTimeout(processImage, 65);
}
function processImage() {
  if (!sourceReady || !cvReady || !validation()) return;
  $("processing").hidden = false;
  let nextBinary, nextResult;
  try {
    nextBinary = binarize($("sourceCanvas"), Number($("threshold").value), $("invert").checked);
    cv.imshow($("originalCanvas"), nextBinary);
    $("originalStage").classList.remove("empty");
    binary?.delete(); binary = nextBinary; nextBinary = null;
    nextResult = applyMorphology(binary, settings());
    cv.imshow($("resultCanvas"), nextResult);
    result?.delete(); result = nextResult; nextResult = null;
    $("resultStage").classList.remove("empty");
    $("downloadButton").disabled = false;
    $("infoType").textContent = "Binaire · 8 bits · 1 canal";
    const hasWhite = binary.data.some(value => value === 255), hasBlack = binary.data.some(value => value === 0);
    $("infoOriginalRange").textContent = hasWhite && hasBlack ? "0 et 255" : hasWhite ? "255 (tout blanc)" : "0 (tout noir)";
  } catch (error) {
    invalidateResult(); $("status").textContent = `Calcul impossible : ${error.message || error}`;
    console.error(error);
  } finally { nextBinary?.delete(); nextResult?.delete(); $("processing").hidden = true; }
}
async function loadImage(file) {
  const version = ++loadVersion, temporary = document.createElement("canvas");
  sourceReady = false; clearTimeout(timer); invalidateResult(); binary?.delete(); binary = null;
  $("originalStage").classList.add("empty");
  $("fileName").textContent = file.name; $("imageMeta").textContent = "Décodage de l’image…";
  $("status").textContent = "";
  try {
    const decoded = await drawFileToCanvas(file, temporary);
    if (version !== loadVersion) return;
    const source = $("sourceCanvas"); source.width = decoded.width; source.height = decoded.height;
    source.getContext("2d").drawImage(temporary, 0, 0);
    $("imageMeta").textContent = `${decoded.width} × ${decoded.height} px · ${decoded.format}${decoded.detail || ""}`;
    $("infoDimensions").textContent = `${decoded.width} × ${decoded.height} px`;
    $("infoFileSize").textContent = file.size < 1048576 ? `${(file.size / 1024).toFixed(1)} Ko` : `${(file.size / 1048576).toFixed(1)} Mo`;
    sourceReady = true; viewer.setImageSize(decoded.width, decoded.height); schedule();
  } catch (error) {
    if (version !== loadVersion) return;
    $("imageMeta").textContent = "Chargement impossible"; $("status").textContent = error.message;
    for (const id of ["infoDimensions", "infoType", "infoOriginalRange", "infoFileSize"]) $(id).textContent = "—";
  } finally { if (version === loadVersion) $("imageInput").value = ""; }
}
async function ready() {
  if (cvReady) return;
  try {
    // Certaines distributions exposent un objet Emscripten « thenable » qui
    // se résout sur lui-même : l'attendre directement créerait une boucle.
    if (!window.cv?.Mat && window.cv?.then) {
      await new Promise((resolve, reject) => window.cv.then(module => {
        window.cv = module; resolve();
      }, reject));
    }
    if (!window.cv?.Mat) return;
    cvReady = true; $("runtimeText").textContent = "OpenCV prêt";
    $("runtimeDot").parentElement.classList.add("ready"); $("runtimeDot").parentElement.hidden = true;
    selectShape();
  } catch (error) { $("status").textContent = `Initialisation impossible : ${error.message}`; }
}
window.addEventListener("opencv-ready", ready);
$("opencvScript").addEventListener("load", ready);
$("opencvScript").addEventListener("error", () => {
  $("runtimeText").textContent = "OpenCV indisponible";
  $("status").textContent = "OpenCV n’a pas pu être chargé. Vérifiez la connexion Internet puis rechargez la page.";
});
$("imageInput").addEventListener("change", event => { if (event.target.files[0]) loadImage(event.target.files[0]); });
document.querySelectorAll('input[name="operation"]').forEach(input => input.addEventListener("change", () => {
  refreshCells(); schedule();
}));
$("thresholdSlider").addEventListener("input", () => { $("threshold").value = $("thresholdSlider").value; schedule(); });
$("threshold").addEventListener("input", () => { if (integer("threshold", 0, 255) !== null) $("thresholdSlider").value = $("threshold").value; schedule(); });
$("invert").addEventListener("input", schedule);
for (const id of ["borderType", "borderValue"]) $(id).addEventListener("input", () => { updateBorderDemo(); schedule(); });
document.querySelectorAll('input[name="shape"]').forEach(input => input.addEventListener("change", selectShape));
for (const id of ["shapeWidth", "shapeHeight"]) $(id).addEventListener("input", selectShape);
for (const id of ["kernelWidth", "kernelHeight"]) $(id).addEventListener("input", resizeGrid);
$("kernelGrid").addEventListener("click", event => {
  const button = event.target.closest("button[data-index]"); if (!button) return;
  const index = Number(button.dataset.index), sequence = ["black", "gray", "white"];
  colors[index] = sequence[(sequence.indexOf(colors[index]) + 1) % 3];
  paintCell(button, index); saveCustom(); renderPreview(); schedule();
});
$("kernelGrid").addEventListener("keydown", event => {
  const button = event.target.closest("button[data-index]"); if (!button) return;
  const index = Number(button.dataset.index), x = index % width, y = Math.floor(index / width);
  const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (!moves[event.key]) return;
  event.preventDefault(); const [dx, dy] = moves[event.key];
  if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height)
    $("kernelGrid").querySelector(`[data-index="${(y + dy) * width + x + dx}"]`).focus();
});
$("zeroKernel").addEventListener("click", () => { colors.fill("gray"); saveCustom(); refreshCells(); schedule(); });
$("openKernelEditor").addEventListener("click", () => { $("kernelDialog").showModal(); $("kernelGrid").querySelector("button")?.focus(); });
$("closeKernelDialogIcon").addEventListener("click", () => $("kernelDialog").close());
$("kernelDialog").addEventListener("click", event => { if (event.target === $("kernelDialog")) $("kernelDialog").close(); });
$("resetButton").addEventListener("click", () => {
  document.querySelector('input[name="operation"][value="erode"]').checked = true;
  width = height = 3; colors = Array(9).fill("white");
  custom.width = custom.height = 3;
  custom.colors = ["gray", "gray", "gray", "gray", "white", "gray", "gray", "gray", "gray"];
  document.querySelector('input[name="shape"][value="rectangle"]').checked = true;
  $("shapeWidth").value = $("shapeHeight").value = 3;
  $("kernelWidth").value = $("kernelHeight").value = 3;
  $("threshold").value = $("thresholdSlider").value = 127; $("invert").checked = false;
  $("borderType").value = "neutral"; $("borderValue").value = "0"; $("borderValueField").hidden = true;
  $("dimensionError").textContent = "";
  updateBorderDemo(); selectShape();
});
$("downloadButton").addEventListener("click", () => {
  if (!result) return;
  const filename = `morphologie-${operation()}.png`;
  $("resultCanvas").toBlob(blob => {
    if (!blob) return;
    const link = document.createElement("a"), url = URL.createObjectURL(blob);
    link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
});
for (const id of ["originalStage", "resultStage"]) {
  $(id).addEventListener("pointermove", event => {
    if (!binary) return;
    const point = viewer.toImagePoint($(id), event.clientX, event.clientY);
    if (!point) { clearCursor(); return; }
    const index = point.y * binary.cols + point.x, originalValue = binary.data[index];
    $("cursorPosition").textContent = `(${point.x}, ${point.y})`;
    $("cursorOriginal").textContent = String(originalValue);
    $("cursorResult").textContent = result ? String(result.data[index]) : "—";
    $("cursorDifference").textContent = result ? String(result.data[index] - originalValue) : "—";
  });
  $(id).addEventListener("pointerleave", clearCursor);
}
window.addEventListener("pagehide", () => { binary?.delete(); result?.delete(); });
renderGrid(); updateBorderDemo(); ready();
new ResizeObserver(renderPreview).observe($("kernelPreview").parentElement);
