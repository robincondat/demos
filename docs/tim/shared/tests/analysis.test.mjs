import { test } from "node:test";
import assert from "node:assert/strict";
import { createAnalysisView } from "../scripts/analysis.js";
import { createImage } from "../compute/image.js";

test("Analysis accepts common images and legacy OpenCV matrices with the same histogram and cursor values", () => {
  globalThis.ResizeObserver = class {
    observe() {}
  };
  const ids = Object.fromEntries(
    [
      "infoDimensions",
      "infoType",
      "infoOriginalRange",
      "infoFileSize",
      "cursorPosition",
      "cursorOriginal",
      "cursorResult",
      "cursorDifference",
      "originalHistogramRange",
      "resultHistogramRange",
    ].map((id) => [id, { textContent: "" }]),
  );
  const canvas = () => ({ parentElement: {}, getContext: () => ({ clearRect() {} }) });
  ids.originalHistogram = canvas();
  ids.resultHistogram = canvas();
  let resultStats;
  const analysis = createAnalysisView(ids, {
    renderHistogram: (canvas, stats) => {
      if (canvas === ids.resultHistogram) resultStats = stats;
    },
  });
  const source = createImage({ width: 2, height: 1, channels: 1, data: new Uint8Array([20, 40]) });
  const result = createImage({
    width: 2,
    height: 1,
    channels: 1,
    data: new Float32Array([30, 80]),
  });
  const mat = { cols: 2, rows: 1, channels: () => 1, depth: () => 5, data32F: result.data };
  const range = { min: 0, max: 255, resolvedMin: 0, resolvedMax: 255 };
  analysis.setSource(source, "Grayscale", { width: 2, height: 1, fileSize: 100 });
  analysis.setSourceDisplay(source, range);
  analysis.setResult(result, range);
  const expected = [...resultStats.series[0]];
  analysis.setCursor(0, 0, source, result);
  const expectedCursor = [
    ids.cursorOriginal.textContent,
    ids.cursorResult.textContent,
    ids.cursorDifference.textContent,
  ];
  analysis.setResult(mat, range);
  assert.deepEqual([...resultStats.series[0]], expected);
  analysis.setCursor(0, 0, source, mat);
  assert.deepEqual(
    [
      ids.cursorOriginal.textContent,
      ids.cursorResult.textContent,
      ids.cursorDifference.textContent,
    ],
    expectedCursor,
  );
  assert.equal(resultStats.series[0][30], 1);
  assert.equal(resultStats.series[0][80], 1);
  const imageType = ids.infoType.textContent;
  analysis.setHistogramRegion(source, result, { x: 0, y: 0, width: 1, height: 1 }, range);
  assert.equal(resultStats.series[0][30], 1);
  assert.equal(resultStats.series[0][80], 0);
  assert.equal(ids.infoType.textContent, imageType);
  analysis.clearHistogramRegion();
  assert.deepEqual([...resultStats.series[0]], expected);
  const sourceCanvas = {
    getContext: () => ({
      getImageData: (x, y, w) => ({
        data:
          w === 1
            ? new Uint8Array([20, 20, 20, 255])
            : new Uint8Array([20, 20, 20, 255, 40, 40, 40, 255]),
      }),
    }),
  };
  analysis.setSource(sourceCanvas, "Grayscale", { width: 2, height: 1, fileSize: 100 });
  analysis.setSourceDisplay(sourceCanvas, range);
  analysis.setResult(mat, range);
  analysis.setCursor(0, 0, sourceCanvas, mat);
  assert.deepEqual(
    [
      ids.cursorOriginal.textContent,
      ids.cursorResult.textContent,
      ids.cursorDifference.textContent,
    ],
    expectedCursor,
  );
});
