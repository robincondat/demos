import { test } from "node:test";
import assert from "node:assert/strict";
import { createImageViewer, createSyncedViewer } from "../scripts/viewer.js";
import { makeHistogram } from "../compute/histogram.js";
import { createImageInformation, createPixelInspector } from "../scripts/image-information.js";

class UIEvent extends Event {
  constructor(type, properties = {}) {
    super(type, { cancelable: true });
    Object.assign(this, properties);
  }
}
function node() {
  return Object.assign(new EventTarget(), { textContent: "", style: {}, value: 0 });
}
function fixture(options = {}) {
  const stages = Array.from({ length: 2 }, () =>
    Object.assign(node(), {
      clientWidth: 400,
      clientHeight: 300,
      classList: { add() {}, remove() {} },
      setPointerCapture() {},
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    }),
  );
  const canvases = [node(), node()];
  globalThis.ResizeObserver = class {
    observe() {}
  };
  const viewer = createImageViewer({
    stages,
    canvases,
    zoomSlider: node(),
    zoomLabel: node(),
    fitButton: node(),
    ...options,
  });
  viewer.setImageSize(200, 100);
  return { viewer, stages, canvases };
}

test("Grouped viewers keep the same geometry and independent instances link silently", () => {
  assert.equal(createSyncedViewer, createImageViewer);
  const a = fixture(),
    b = fixture();
  a.stages[1].dispatchEvent(new UIEvent("wheel", { clientX: 200, clientY: 150, deltaY: -200 }));
  assert.equal(a.canvases[0].style.transform, a.canvases[1].style.transform);
  assert(a.viewer.getView().zoom > 1);
  assert.equal(b.viewer.getView().zoom, 1);
  b.viewer.setView(a.viewer.getView());
  assert.deepEqual(b.viewer.getView(), a.viewer.getView());
  assert.deepEqual(a.viewer.toImagePoint(a.stages[0], 200, 150), { x: 100, y: 50 });
});

test("Disabled image navigation leaves wheel and drag events to a cloud view", () => {
  let enabled = true,
    calls = 0;
  const f = fixture({ enabled: () => enabled, onViewChange: () => calls++ });
  enabled = false;
  const previous = f.viewer.getView(),
    before = calls;
  const event = new UIEvent("wheel", { clientX: 100, clientY: 100, deltaY: -200 });
  f.stages[0].dispatchEvent(event);
  assert.equal(event.defaultPrevented, false);
  assert.deepEqual(f.viewer.getView(), previous);
  assert.equal(calls, before);
  enabled = true;
  f.stages[0].dispatchEvent(new UIEvent("wheel", { clientX: 100, clientY: 100, deltaY: -200 }));
  assert(f.viewer.getView().zoom > previous.zoom);
  const count = calls;
  f.viewer.setView(previous);
  assert.equal(calls, count);
});

test("Histogram counts include endpoints, skip nonfinite values and handle wide float ranges", () => {
  const stats = makeHistogram(new Float32Array([-1, 0, 255, 256, NaN]), 1, [0], {
    min: 0,
    max: 255,
  });
  assert.equal(stats.series[0][0], 2);
  assert.equal(stats.series[0][255], 2);
  const wide = makeHistogram(new Float32Array([-10000, 10000, 0]), 1, [0], {
    min: -10000,
    max: 10000,
  });
  assert.equal(wide.bins, 4096);
  assert.equal(wide.exactIntegers, false);
  assert.equal(
    wide.series[0].reduce((a, b) => a + b, 0),
    3,
  );
  const hsv = makeHistogram(new Uint8Array([0, 90, 180]), 1, [0], { min: 0, max: 180 });
  assert.equal(hsv.bins, 181);
  assert.equal(hsv.series[0][180], 1);
});

test("Common information and cursor support grayscale, CMYK and explicit RGB differences", () => {
  const ids = Object.fromEntries(
    ["cursorPosition", "cursorOriginal", "cursorResult", "cursorDifference"].map((id) => [
      id,
      node(),
    ]),
  );
  const cursor = createPixelInspector(ids);
  cursor.show({
    x: 1,
    y: 2,
    source: new Uint8Array([10, 20, 30]),
    result: [1, 2, 3, 4],
    sourceLabels: ["R", "G", "B"],
    resultLabels: ["C", "M", "Y", "K"],
    difference: null,
  });
  assert.match(ids.cursorResult.textContent, /K 4/);
  assert.equal(ids.cursorDifference.textContent, "—");
  cursor.show({ x: 0, y: 0, source: [20], result: [30] });
  assert.equal(ids.cursorDifference.textContent, "10");
  cursor.clear();
  assert(Object.values(ids).every((node) => node.textContent === "—"));
  const infoIds = Object.fromEntries(
    ["infoDimensions", "infoType", "infoOriginalRange", "infoFileSize"].map((id) => [id, node()]),
  );
  createImageInformation(infoIds).set({
    width: 2,
    height: 3,
    fileSize: 2048,
    type: "Binaire",
    range: "0 et 255",
  });
  assert.equal(infoIds.infoDimensions.textContent, "2 × 3 px");
  assert.equal(infoIds.infoFileSize.textContent, "2.0 Ko");
});
