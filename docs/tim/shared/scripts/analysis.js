import {
  createImageInformation,
  createPixelInspector,
  formatNumber as nice,
} from "./image-information.js?v=20261106-science1";
import { makeHistogram } from "../compute/histogram.js?v=20261106-science1";
import { renderHistogram as drawHistogram } from "./histogram-view.js?v=20261106-histcurves";
import { fromOpenCV, pixelAt } from "../compute/image.js?v=20261106-science1";
import { extractImageRegion } from "../compute/image-region.js?v=20261106-clahe-local";

const scientificImage = (image) =>
  typeof image.channels === "number" ? image : fromOpenCV(image, { copy: false });

function dataRange(data, channels, offsets) {
  let min = Infinity,
    max = -Infinity;
  for (let i = 0; i < data.length; i += channels)
    for (const offset of offsets) {
      const value = data[i + offset];
      if (Number.isFinite(value)) {
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    }
  return Number.isFinite(min) ? { min, max } : { min: 0, max: 0 };
}

function sourceData(canvas) {
  return canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
}
function offsets(mode) {
  return mode === "Grayscale" ? [0] : [0, 1, 2];
}
function sourceHistogram(canvas, mode, range) {
  if (canvas.data) return makeHistogram(canvas.data, canvas.channels, offsets(mode), range);
  return makeHistogram(sourceData(canvas), 4, offsets(mode), range);
}
function matHistogram(mat, mode, range) {
  const image = scientificImage(mat);
  return makeHistogram(image.data, image.channels, offsets(mode), range);
}
function sourceRange(canvas, mode) {
  if (canvas.data) return dataRange(canvas.data, canvas.channels, offsets(mode));
  return dataRange(sourceData(canvas), 4, offsets(mode));
}

export function createAnalysisView(ids, { renderHistogram = drawHistogram } = {}) {
  const information = createImageInformation(
    Object.fromEntries(
      ["infoDimensions", "infoType", "infoOriginalRange", "infoFileSize"].map((key) => [
        key,
        ids[key],
      ]),
    ),
  );
  const cursor = createPixelInspector(
    Object.fromEntries(
      ["cursorPosition", "cursorOriginal", "cursorResult", "cursorDifference"].map((key) => [
        key,
        ids[key],
      ]),
    ),
  );
  let regionStats = null;
  let sourceStats = null,
    resultStats = null,
    mode = "RGB",
    resultMode = "RGB",
    sourceVersion = 0,
    sourceKey = "";
  const redraw = () => {
    if (sourceStats)
      renderHistogram(ids.originalHistogram, regionStats?.source ?? sourceStats, mode);
    if (resultStats)
      renderHistogram(ids.resultHistogram, regionStats?.result ?? resultStats, resultMode);
  };
  const clear = (canvas) => canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  const rangeLabel = (stats) =>
    `[${nice(stats.min)}, ${nice(stats.max)}] · ${stats.bins} classe${stats.bins > 1 ? "s" : ""}${stats.exactIntegers ? "" : " regroupées"}`;
  new ResizeObserver(redraw).observe(ids.originalHistogram.parentElement);
  return {
    setSource(canvas, nextMode, { width, height, fileSize, type }) {
      mode = nextMode;
      resultMode = nextMode;
      sourceVersion++;
      sourceKey = "";
      sourceStats = null;
      regionStats = null;
      resultStats = null;
      clear(ids.originalHistogram);
      clear(ids.resultHistogram);
      const rawRange = sourceRange(canvas, mode);
      information.set({
        width,
        height,
        fileSize,
        range: rawRange,
        type: type ?? (mode === "Grayscale" ? "Niveaux de gris · float32" : "RGB · float32"),
      });
      ids.originalHistogramRange.textContent = "—";
      ids.resultHistogramRange.textContent = "—";
      redraw();
    },
    setSourceDisplay(canvas, range) {
      const key = `${sourceVersion}|${range.resolvedMin}|${range.resolvedMax}`;
      if (key === sourceKey) return;
      sourceKey = key;
      sourceStats = sourceHistogram(canvas, mode, range);
      ids.originalHistogramRange.textContent = rangeLabel(sourceStats);
      redraw();
    },
    setResult(mat, range, nextMode = mode) {
      regionStats = null;
      resultMode = nextMode;
      resultStats = matHistogram(mat, resultMode, range);
      ids.resultHistogramRange.textContent = rangeLabel(resultStats);
      redraw();
    },
    setHistogramRegion(source, result, region, range) {
      regionStats = {
        source: matHistogram(extractImageRegion(scientificImage(source), region), mode, range),
        result: matHistogram(
          extractImageRegion(scientificImage(result), region),
          resultMode,
          range,
        ),
      };
      redraw();
    },
    clearHistogramRegion() {
      if (!regionStats) return;
      regionStats = null;
      redraw();
    },
    setCursor(x, y, sourceCanvas, resultMat, nextResultMode = resultMode) {
      if (!resultMat) return;
      const sourceData = sourceCanvas.data
        ? pixelAt(sourceCanvas, x, y)
        : sourceCanvas.getContext("2d").getImageData(x, y, 1, 1).data;
      const source =
          mode === "Grayscale" ? [sourceData[0]] : [sourceData[0], sourceData[1], sourceData[2]],
        result = pixelAt(scientificImage(resultMat), x, y);
      resultMode = nextResultMode;
      cursor.show({ x, y, source: Array.from(source), result });
    },
    clearCursor() {
      cursor.clear();
    },
  };
}
