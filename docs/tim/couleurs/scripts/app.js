import { mountImageComponents } from "../../shared/scripts/image-components.js?v=20261106-ui2";
import {
  downloadCanvas,
  bindImageCursor,
} from "../../shared/scripts/image-actions.js?v=20261106-ui2";
import {
  createImageInformation,
  createPixelInspector,
} from "../../shared/scripts/image-information.js?v=20261106-science1";
import { makeHistogram } from "../../shared/compute/histogram.js?v=20261106-science1";
import { renderHistogram } from "../../shared/scripts/histogram-view.js?v=20261106-histcurves";
import { loadOpenCV } from "../../shared/scripts/opencv-runtime.js?v=20261106-science1";
import { createImageApplication } from "../../shared/scripts/image-application.js?v=20261106-controller1";
import { createImageViewer } from "../../shared/scripts/viewer.js?v=20261106-science1";
import { convertRGB } from "../../shared/compute/color-spaces.js?v=20261106-science1";
import {
  SPACES,
  originalView,
  convertedView,
  displayPixels,
} from "./colors.js?v=20261106-science1";
import {
  OPENCV_SPACES,
  convertWithOpenCV,
} from "../../shared/compute/opencv-colors.js?v=20261106-science1";
import {
  createCloudView,
  selectColorRepresentatives,
  cloudTrace,
} from "./clouds.js?v=20261106-science1";
import {
  ALL_HSV,
  selectHSV,
  selectionView,
} from "../../shared/compute/hsv-selection.js?v=20261106-science1";
import { reconstructionView } from "../../shared/compute/reconstruction.js?v=20261106-science1";
import {
  ORIGINAL_VIEW_GROUPS,
  resultViewGroups,
  populateGroupedMenu,
} from "./view-menus.js?v=20261106-science1";

mountImageComponents();

const $ = (id) => document.getElementById(id);

const information = createImageInformation(
  Object.fromEntries(
    ["infoDimensions", "infoType", "infoOriginalRange", "infoFileSize"].map((id) => [id, $(id)]),
  ),
);
const pixelInspector = createPixelInspector(
  Object.fromEntries(
    ["cursorPosition", "cursorOriginal", "cursorResult", "cursorDifference"].map((id) => [
      id,
      $(id),
    ]),
  ),
);
const kinds = ["original", "result"];
const isCloud = (kind) => ["cloud", "cloud-top"].includes($(`${kind}View`).value);
let active = "original",
  sourceVersion = 0,
  indices = null;
let syncPreference = true,
  navigationHadCloud = false;
const traceCache = new Map();
const reconstructionCache = new Map();
const conversionCache = new Map();
const clouds = Object.fromEntries(kinds.map((kind) => [kind, createCloudView($(`${kind}Cloud`))]));
const viewers = Object.fromEntries(
  kinds.map((kind) => [
    kind,
    createImageViewer({
      stages: [$(`${kind}Stage`)],
      canvases: [$(`${kind}Canvas`)],
      zoomLabel: document.createElement("output"),
      zoomSlider: document.createElement("input"),
      fitButton: document.createElement("button"),
      enabled: () => !isCloud(kind),
      onActivate: () => {
        active = kind;
        updateToolbar();
      },
      onViewChange: (view) => {
        active = kind;
        if ($("syncNavigation").checked)
          viewers[kind === "original" ? "result" : "original"].setView(view);
        updateToolbar();
      },
    }),
  ]),
);
let source = null,
  converted = null,
  left = null,
  right = null,
  displayed = {},
  currentFile = null;
let hsvSource = null,
  selectionMask = null,
  selectionKey = "";
const space = () => document.querySelector('input[name="space"]:checked').value;

function refreshSelection() {
  $("hsvSelection").hidden = space() !== "hsv";
  if (!source) return true;
  let key = `${sourceVersion}:all`,
    mask = null;
  if (space() === "hsv") {
    const bounds = Object.fromEntries(
      Object.keys(ALL_HSV).map((name) => [name, Number.parseFloat($(name).value)]),
    );
    key = `${sourceVersion}:${JSON.stringify(bounds)}`;
    if (key === selectionKey) {
      $("selectionError").textContent = "";
      return true;
    }
    try {
      hsvSource ||= convertRGB(source.data, "hsv");
      ({ mask } = selectHSV(hsvSource.data, bounds));
      $("selectionError").textContent = "";
    } catch (error) {
      $("selectionError").textContent = error.message;
      $("downloadButton").disabled = true;
      return false;
    }
  }
  if (key !== selectionKey) {
    selectionKey = key;
    selectionMask = mask;
    indices = null;
    traceCache.clear();
  }
  return true;
}

function updateToolbar() {
  if (isCloud(active)) active = kinds.find((kind) => !isCloud(kind)) || active;
  const available = Boolean(source) && !isCloud(active);
  $("zoomSlider").disabled = $("fitView").disabled = !available;
  $("navigationTitle").textContent = $("syncNavigation").checked
    ? "Navigation"
    : `Navigation · ${active === "original" ? "gauche" : "droite"}`;
  if (available) {
    const { zoom } = viewers[active].getView();
    $("zoomLabel").textContent = `${Math.round(zoom * 100)} %`;
    $("zoomSlider").value = Math.round((Math.log(zoom / 0.1) / Math.log(400)) * 1000);
  } else $("zoomLabel").textContent = "";
}

function updateNavigation() {
  const anyCloud = kinds.some(isCloud);
  $("syncNavigation").checked = !anyCloud && syncPreference;
  if (!anyCloud && navigationHadCloud && syncPreference)
    viewers[active === "original" ? "result" : "original"].setView(viewers[active].getView());
  navigationHadCloud = anyCloud;
  $("syncNavigation").disabled = anyCloud;
  $("syncNavigation").title = anyCloud
    ? "Les nuages 3D utilisent leur navigation propre."
    : "Lier le zoom et le déplacement des deux images.";
  for (const kind of kinds) {
    const cloud = isCloud(kind);
    $(`${kind}Canvas`).hidden = cloud;
    $(`${kind}Stage`).classList.toggle("has-cloud", cloud);
    if (!cloud) clouds[kind].hide();
  }
  updateToolbar();
}

function drawCloud(kind) {
  const mode =
    kind === "original" ? "rgb" : $("resultView").value === "cloud-top" ? "hsv-top" : "hsv";
  if (!indices) indices = selectColorRepresentatives(source.data, undefined, selectionMask).indices;
  const key = `${selectionKey}:${mode}`;
  const pixels = source.data,
    selectedIndices = indices;
  clouds[kind].show(
    key,
    mode,
    () => {
      if (!traceCache.has(key)) traceCache.set(key, cloudTrace(pixels, selectedIndices, mode));
      return traceCache.get(key);
    },
    `${sourceVersion}:${mode}`,
  );
}

function populateViews() {
  $("hsvSelection").hidden = space() !== "hsv";
  const config = SPACES[space()];
  populateGroupedMenu($("resultView"), resultViewGroups(space()));
  $("resultView").title =
    space() === "cmyk"
      ? "Composantes soustraites au blanc, selon les formules du TP."
      : "Canaux empilés : valeurs des trois canaux affichées directement comme R, G et B, en fausses couleurs.";
  $("resultTitle").textContent = `Image ${config.name}`;
}

function clearCursor() {
  pixelInspector.clear();
}
function drawHistogram(kind, view, resolved) {
  const stats = makeHistogram(
    view.data,
    view.channels,
    Array.from({ length: view.channels }, (_, i) => i),
    resolved,
  );
  stats.labels = view.labels;
  renderHistogram($(`${kind}Histogram`), stats, view.channels === 1 ? "Grayscale" : "RGB");
  $(`${kind}HistogramRange`).textContent =
    `${view.labels.join(" / ")} ? [${resolved.min}, ${resolved.max}]`;
}

function renderView(kind, view) {
  try {
    const pixels = displayPixels(view, { min: 0, max: view.max ?? 255, auto: false });
    const canvas = $(`${kind}Canvas`);
    canvas.width = source.width;
    canvas.height = source.height;
    canvas
      .getContext("2d")
      .putImageData(new ImageData(pixels.rgba, source.width, source.height), 0, 0);
    displayed[kind] = pixels.rgba;
    drawHistogram(kind, view, pixels);
    return true;
  } catch (failure) {
    $("conversionError").textContent = failure.message;
    return false;
  }
}

function render() {
  updateNavigation();
  if (!refreshSelection()) return;
  if (!source || !converted || converted.space !== space()) return;
  left = originalView(source.data, isCloud("original") ? "rgb" : $("originalView").value);
  const resultView = $("resultView").value;
  if (resultView.startsWith("reduced-")) {
    if (!reconstructionCache.has(resultView))
      reconstructionCache.set(
        resultView,
        reconstructionView(source.data, source.width, source.height, resultView),
      );
    right = reconstructionCache.get(resultView);
  } else
    right = ["selected", "mask"].includes(resultView)
      ? selectionView(source.data, selectionMask, resultView === "mask")
      : convertedView(converted, isCloud("result") ? "stack" : resultView);
  if (isCloud("original")) {
    drawCloud("original");
    drawHistogram("original", left, { min: 0, max: 255 });
  } else renderView("original", left);
  let b = false;
  if (isCloud("result")) {
    drawCloud("result");
    drawHistogram("result", right, { min: 0, max: 255 });
  } else b = renderView("result", right);
  $("downloadButton").disabled = isCloud("result") || !b;
  information.set({ type: `RGB uint8 → ${SPACES[space()].name} uint8` });
  clearCursor();
}

function schedule() {
  application.render(render);
}

function convert() {
  return application.run(convertCurrent);
}
async function convertCurrent({ current }) {
  const target = space(),
    image = source;
  $("conversionError").textContent = "";
  if (!source) return;
  $("downloadButton").disabled = true;
  let next;
  if (OPENCV_SPACES[target]) {
    if (!conversionCache.has(target)) {
      const { runtime } = await loadOpenCV();
      if (!current() || image !== source) return;
      const value = convertWithOpenCV(image, target, runtime);
      value.labels = SPACES[target].labels;
      conversionCache.set(target, value);
    }
    next = conversionCache.get(target);
  } else next = convertRGB(image.data, target);
  if (!current() || image !== source) return;
  converted = next;
  schedule();
}

const application = createImageApplication({
  onBusy: (busy) => {
    $("processing").hidden = !busy;
  },
  onError: (error) => {
    $("conversionError").textContent = error.message;
  },
  onLoadStart() {
    $("imageMeta").textContent = "Décodage de l’image…";
  },
  async onImage({ file, canvas, decoded }) {
    const pixels = canvas.getContext("2d").getImageData(0, 0, decoded.width, decoded.height);
    source = pixels;
    currentFile = file;
    displayed = {};
    sourceVersion++;
    indices = null;
    traceCache.clear();
    reconstructionCache.clear();
    conversionCache.clear();
    hsvSource = null;
    selectionKey = "";
    converted = null;
    $("sourceCanvas").width = pixels.width;
    $("sourceCanvas").height = pixels.height;
    $("sourceCanvas").getContext("2d").putImageData(pixels, 0, 0);
    $("fileName").textContent = file.name;
    $("imageMeta").textContent =
      `${pixels.width} × ${pixels.height} px · ${decoded.format}${decoded.detail || ""} · RGB`;
    information.set({ width: pixels.width, height: pixels.height, fileSize: file.size });
    let min = 255,
      max = 0;
    for (let i = 0; i < pixels.data.length; i++)
      if (i % 4 !== 3) {
        min = Math.min(min, pixels.data[i]);
        max = Math.max(max, pixels.data[i]);
      }
    information.set({ range: { min, max } });
    for (const kind of ["original", "result"]) $(`${kind}Stage`).classList.remove("empty");
    for (const kind of kinds) viewers[kind].setImageSize(pixels.width, pixels.height);
    await convert();
  },
  onLoadError(error) {
    $("imageMeta").textContent = "Chargement impossible";
    $("conversionError").textContent = error.message;
  },
  onLoadEnd() {
    $("imageInput").value = "";
  },
});
function loadImage(file) {
  return application.load(file);
}

$("imageInput").addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) loadImage(file);
});
$("originalView").addEventListener("change", () => {
  active = "original";
  updateNavigation();
  schedule();
});
$("resultView").addEventListener("change", () => {
  active = "result";
  updateNavigation();
  schedule();
});
$("syncNavigation").addEventListener("change", () => {
  syncPreference = $("syncNavigation").checked;
  if (syncPreference)
    viewers[active === "original" ? "result" : "original"].setView(viewers[active].getView());
  updateToolbar();
});
$("zoomSlider").addEventListener("input", () =>
  viewers[active].setZoom(0.1 * Math.pow(400, Number($("zoomSlider").value) / 1000)),
);
$("fitView").addEventListener("click", () => viewers[active].fit());
document.querySelectorAll('input[name="space"]').forEach((input) =>
  input.addEventListener("change", () => {
    populateViews();
    convert();
  }),
);
for (const name of Object.keys(ALL_HSV)) $(name).addEventListener("input", schedule);
$("resetSelection").addEventListener("click", () => {
  for (const [name, value] of Object.entries(ALL_HSV)) $(name).value = value;
  selectionKey = "";
  schedule();
});
bindImageCursor({
  stages: kinds.map((kind) => $(kind + "Stage")),
  viewer: (stage) => viewers[stage.id.replace("Stage", "")],
  enabled: (stage) =>
    !!source &&
    !!converted &&
    converted.space === space() &&
    !isCloud(stage.id.replace("Stage", "")),
  onPoint(point, stage) {
    const kind = stage.id.replace("Stage", "");
    const i = point.y * source.width + point.x,
      rgb = source.data.slice(i * 4, i * 4 + 3),
      base = i * converted.channels;
    const reconstructed = $("resultView").value.startsWith("reduced-");
    const resultValues = reconstructed
      ? Array.from(right.data.slice(i * 3, i * 3 + 3))
      : Array.from(converted.data.slice(base, base + converted.channels));
    const difference =
      !kinds.some(isCloud) && displayed.original && displayed.result
        ? Array.from(
            { length: 3 },
            (_, c) => displayed.result[i * 4 + c] - displayed.original[i * 4 + c],
          )
        : null;
    pixelInspector.show({
      x: point.x,
      y: point.y,
      source: Array.from(rgb),
      result: resultValues,
      difference,
      sourceLabels: ["R", "G", "B"],
      resultLabels: reconstructed ? right.labels : converted.labels,
      differenceLabels: ["R", "G", "B"],
    });
  },
  clear: clearCursor,
});
$("resetButton").addEventListener("click", () => {
  document.querySelector('input[name="space"][value="cmyk"]').checked = true;
  $("originalView").value = "rgb";
  populateViews();
  syncPreference = true;
  $("syncNavigation").checked = true;
  indices = null;
  traceCache.clear();
  for (const [name, value] of Object.entries(ALL_HSV)) $(name).value = value;
  selectionKey = "";
  selectionMask = null;
  $("selectionError").textContent = "";
  updateNavigation();
  viewers[active === "original" ? "result" : "original"].setView(viewers[active].getView());
  convert();
});
$("downloadButton").addEventListener("click", () => {
  if (!source) return;
  downloadCanvas(
    $("resultCanvas"),
    `${currentFile.name.replace(/\.[^.]+$/, "")}-${space()}-${$("resultView").value}.png`,
  );
});
populateGroupedMenu($("originalView"), ORIGINAL_VIEW_GROUPS);
populateViews();
updateNavigation();
new ResizeObserver(() => {
  if (source) schedule();
}).observe($("originalHistogram").parentElement);
