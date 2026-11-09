import { mountImageComponents } from "../../shared/scripts/image-components.js?v=20261106-histlayout";
import { createImageApplication } from "../../shared/scripts/image-application.js?v=20261106-controller1";
import { createImageViewer } from "../../shared/scripts/viewer.js?v=20261106-science1";
import { createAnalysisView } from "../../shared/scripts/analysis.js?v=20261106-clahe-local";
import {
  createDisplayControls,
  resolveDisplaySettings,
} from "../../shared/scripts/display-controls.js?v=20261106-ui2";
import { renderImage } from "../../shared/scripts/image-display.js?v=20261106-science1";
import {
  bindImageCursor,
  downloadCanvas,
} from "../../shared/scripts/image-actions.js?v=20261106-ui2";
import { loadOpenCV } from "../../shared/scripts/opencv-runtime.js?v=20261106-science1";
import { readCanvasImage } from "../../shared/scripts/opencv-image.js?v=20261106-ui2";
import { fromOpenCV, fromRGBA, dataRange } from "../../shared/compute/image.js?v=20261106-science1";
import {
  CORNER_DEFAULTS,
  validateCornerSettings,
  detectCorners,
} from "../../shared/compute/corners.js?v=20261109-coins2";
import { refineCorners } from "../../shared/compute/corner-refinement.js?v=20261108-coins1";

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
const viewer = createImageViewer({
  stages: kinds.map((kind) => $(kind + "Stage")),
  canvases: kinds.map((kind) => $(kind + "Canvas")),
  zoomLabel: $("zoomLabel"),
  zoomSlider: $("zoomSlider"),
  fitButton: $("fitView"),
});
const displays = Object.fromEntries(kinds.map((kind) => [kind, createDisplayControls(kind)]));
const fixedRange = { min: 0, max: 255, resolvedMin: 0, resolvedMax: 255 };
let image = null,
  pipeline = null,
  displayed = null,
  runtime = null,
  preferredView = "coins",
  computedSettings = null;
const method = () => document.querySelector('[name="method"]:checked').value;
const number = (id) => ($(id).value.trim() === "" ? NaN : Number($(id).value));
function settings() {
  return {
    method: method(),
    preBlur: $("preBlur").checked,
    blurSize: number("blurSize"),
    blockSize: number("blockSize"),
    k: number("k"),
    quality: number("quality"),
    minDistance: number("minDistance"),
    maxCorners: number("maxCorners"),
  };
}
function controls() {
  $("kField").hidden = method() !== "harris";
  $("blurSizeField").hidden = !$("preBlur").checked;
  $("refineSettings").hidden = !$("refineEnabled").checked;
  const diameter = 2 * number("refineRadius") + 1;
  $("refineWindow").textContent = Number.isFinite(diameter)
    ? `Fenêtre ${diameter} × ${diameter}`
    : "";
}
function menu() {
  const groups = [
    [
      "Préparation",
      [
        ["smooth", computedSettings.preBlur ? "Image lissée" : "Image de calcul (gris)"],
        ["ix", "Gradient Ix"],
        ["iy", "Gradient Iy"],
      ],
    ],
    [
      "Réponse du détecteur",
      [
        ["sxx", "Sxx"],
        ["sxy", "Sxy"],
        ["syy", "Syy"],
        [
          "score",
          computedSettings.method === "harris" ? "Score de Harris R" : "Score de Shi-Tomasi λ min",
        ],
      ],
    ],
    [
      "Détection",
      [
        ["mask", "Masque des candidats"],
        ["candidates", "Candidats sur l’image"],
        ["coins", "Coins après NMS"],
        ...(pipeline.refined ? [["refined", "Affinage : avant / après"]] : []),
      ],
    ],
  ];
  $("resultView").replaceChildren(
    ...groups.map(([label, items]) => {
      const group = document.createElement("optgroup");
      group.label = label;
      for (const [value, text] of items) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        group.append(option);
      }
      return group;
    }),
  );
  $("resultView").value = [...$("resultView").options].some(
    (option) => option.value === preferredView,
  )
    ? preferredView
    : "coins";
  $("resultView").disabled = false;
}
function renderOriginal() {
  if (!image) return;
  const settings = displays.original.read();
  if (!settings.valid) return;
  renderImage(
    $("originalCanvas"),
    image,
    resolveDisplaySettings(settings, () => dataRange(image)),
  );
  analysis.setSourceDisplay(image, settings);
}
function drawPoints(ctx, points, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const { x, y } of points) {
    ctx.moveTo(x + 3, y);
    ctx.arc(x, y, 3, 0, 2 * Math.PI);
  }
  ctx.stroke();
}
function renderResult() {
  if (!pipeline || !image) return;
  $("downloadButton").disabled = true;
  const view = $("resultView").value,
    numeric = !!pipeline.views[view] && view !== "mask";
  $("centerScoreField").hidden = !(view === "score" && computedSettings.method === "harris");
  $("refinementLegend").hidden = view !== "refined";
  for (const suffix of ["DisplayMin", "DisplayMax", "AutoRange"])
    $("result" + suffix).disabled = !numeric;
  let range;
  if (pipeline.views[view]) {
    displayed = pipeline.views[view];
    if (numeric) {
      const selected = displays.result.read();
      if (!selected.valid) return;
      range = resolveDisplaySettings(selected, () => {
        const actual = dataRange(displayed);
        if (view === "score" && computedSettings.method === "harris" && $("centerScore").checked) {
          const bound = Math.max(Math.abs(actual.min), Math.abs(actual.max)) || 1;
          return { min: -bound, max: bound };
        }
        return actual;
      });
    } else range = { min: 0, max: 255 };
    renderImage($("resultCanvas"), displayed, range);
  } else {
    range = { min: 0, max: 255 };
    renderImage($("resultCanvas"), image, range);
    const ctx = $("resultCanvas").getContext("2d");
    if (view === "candidates") {
      ctx.strokeStyle = "#e32939";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < pipeline.views.mask.data.length; i++)
        if (pipeline.views.mask.data[i]) {
          const x = i % image.width,
            y = Math.floor(i / image.width);
          ctx.moveTo(x + 3, y);
          ctx.arc(x, y, 3, 0, 2 * Math.PI);
        }
      ctx.stroke();
    } else if (view === "refined") {
      drawPoints(ctx, pipeline.points, "#2384bd");
      drawPoints(ctx, pipeline.refined, "#dc3545");
    } else drawPoints(ctx, pipeline.refined || pipeline.points, "#e32939");
    displayed = fromRGBA(ctx.getImageData(0, 0, image.width, image.height), { mode: "rgb" });
  }
  if (!numeric) $("resultDisplayRangeError").textContent = "";
  analysis.setResult(
    displayed,
    { ...range, resolvedMin: range.min, resolvedMax: range.max },
    displayed.channels === 1 ? "Grayscale" : "RGB",
  );
  analysis.clearCursor();
  $("downloadButton").disabled = false;
}
async function calculate({ current }) {
  controls();
  const s = settings();
  validateCornerSettings(s);
  $("parameterError").textContent = "";
  $("downloadButton").disabled = true;
  if (!image) return;
  const next = detectCorners(image, s, runtime);
  if ($("refineEnabled").checked)
    next.refined = await refineCorners(image, next.points, {
      radius: number("refineRadius"),
      iterations: number("refineIterations"),
      epsilon: number("refineEpsilon"),
      current,
    });
  if (!current()) return;
  computedSettings = s;
  pipeline = next;
  menu();
  renderOriginal();
  renderResult();
  $("cornerSummary").textContent =
    `${next.candidateCount.toLocaleString("fr-FR")} candidats · ${next.points.length.toLocaleString("fr-FR")} coins retenus`;
}
const application = createImageApplication({
  delay: 100,
  frame: true,
  onBusy: (busy) => {
    $("processing").hidden = !busy;
  },
  onError: (error) => {
    $("parameterError").textContent = error.message;
    $("downloadButton").disabled = true;
  },
  onLoadStart() {
    image = pipeline = displayed = null;
    $("cornerSummary").textContent = "";
    $("downloadButton").disabled = true;
    $("resultView").disabled = true;
    analysis.clearCursor();
  },
  async onImage({ canvas, file, current }) {
    const loaded = await loadOpenCV();
    if (!current()) return;
    runtime = loaded.runtime;
    const gray = readCanvasImage(canvas, { mode: "Grayscale", float: false }, runtime);
    try {
      image = fromOpenCV(gray);
    } finally {
      gray.delete();
    }
    analysis.setSource(image, "Grayscale", {
      width: image.width,
      height: image.height,
      fileSize: file.size,
      type: "Niveaux de gris · 8 bits",
    });
    kinds.forEach((kind) => $(kind + "Stage").classList.remove("empty"));
    viewer.setImageSize(image.width, image.height);
    renderOriginal();
    await application.run(calculate);
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
document.querySelectorAll(".workbench input,.workbench select").forEach((input) =>
  input.addEventListener("input", () => {
    if (input.id === "refineEnabled" && input.checked) preferredView = "refined";
    pipeline = displayed = null;
    $("resultView").disabled = true;
    analysis.clearCursor();
    controls();
    $("downloadButton").disabled = true;
    application.schedule(calculate);
  }),
);
$("resultView").addEventListener("change", () => {
  preferredView = $("resultView").value;
  renderResult();
});
$("centerScore").addEventListener("input", renderResult);
displays.original.bind(renderOriginal);
displays.result.bind(renderResult);
bindImageCursor({
  stages: kinds.map((kind) => $(kind + "Stage")),
  viewer,
  enabled: () => !!displayed && !!image,
  onPoint: ({ x, y }) =>
    analysis.setCursor(x, y, image, displayed, displayed.channels === 1 ? "Grayscale" : "RGB"),
  clear: () => analysis.clearCursor(),
});
$("downloadButton").addEventListener("click", () =>
  downloadCanvas(
    $("resultCanvas"),
    `coins-${computedSettings.method}-${$("resultView").value}.png`,
  ),
);
$("resetButton").addEventListener("click", () => {
  document.querySelector('[name="method"][value="harris"]').checked = true;
  for (const key of ["blurSize", "blockSize", "k", "quality", "minDistance", "maxCorners"])
    $(key).value = CORNER_DEFAULTS[key];
  $("preBlur").checked = false;
  $("refineEnabled").checked = false;
  $("refineRadius").value = 5;
  $("refineIterations").value = 40;
  $("refineEpsilon").value = 0.001;
  $("centerScore").checked = true;
  for (const kind of kinds) {
    $(kind + "DisplayMin").value = 0;
    $(kind + "DisplayMax").value = 255;
    $(kind + "AutoRange").checked = kind === "result";
  }
  preferredView = "coins";
  application.run(calculate);
});
controls();
displays.original.read();
displays.result.read();
