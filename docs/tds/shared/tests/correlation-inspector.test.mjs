import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shiftedTimes,
  correlationProducts,
  createCorrelationInspector,
} from "../../correlation/scripts/correlation-inspector.js";

test("Correlation shifts B without reversing and its product sums to the output", () => {
  assert.deepEqual([...shiftedTimes([-0.5, 0, 0.5], 1)], [0.5, 1, 1.5]);
  const a = [1, 2, -1],
    b = [3, 4];
  const full = [4, 11, 2, -3];
  for (let lag = -1; lag <= 2; lag++) {
    const products = correlationProducts(a, b, lag);
    assert.equal(
      products.reduce((sum, value) => sum + value, 0),
      full[lag + 1],
    );
  }
});

test("Classic correlation and ZNCC use the same raw sliding visualization", () => {
  const panel = new EventTarget();
  panel.open = true;
  const chart = { setData(series) { this.series = series; } };
  const inspector = createCorrelationInspector({ chart,
    stage: { closest: () => panel, querySelector: () => ({ hidden: true }) },
  });
  const result = { signals: [
    { slot: "input", times: [0,1,2], values: [2,4,1] },
    { slot: "impulse", times: [0,1], values: [1,3] },
  ], correlation: { times: [-1,0,1,2], values: [6,14,7,1] } };
  let previous;
  for (const method of ["classic", "zncc"]) {
    inspector.setResult({ ...result, method }, 1);
    const snapshot = chart.series.map(series => ({ x: [...series.x], y: [...series.y], signedFill: series.signedFill }));
    assert.equal(snapshot.length, 3);
    assert.equal(snapshot[0].signedFill, true);
    if (previous) assert.deepEqual(snapshot, previous);
    previous = snapshot;
  }
  inspector.clear();
});

test("Inspection uses physical lag with different time origins and keeps B in order", async () => {
  globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  globalThis.cancelAnimationFrame = clearTimeout;
  const panel = new EventTarget();
  panel.open = true;
  const chart = {
    setData(series) {
      this.series = series;
    },
  };
  const inspector = createCorrelationInspector({
    chart,
    stage: { closest: () => panel, querySelector: () => ({ hidden: true }) },
  });
  inspector.setResult(
    {
      signals: [
        { slot: "input", times: [1, 2, 3], values: [1, 2, -1] },
        { slot: "impulse", times: [-1, 0], values: [3, 4] },
      ],
      correlation: { times: [1, 2, 3, 4], values: [4, 11, 2, -3] },
    },
    1,
  );
  inspector.hoverTime(2);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.deepEqual([...chart.series[2].x], [1, 2]);
  assert.deepEqual([...chart.series[2].y], [3, 4]);
  assert.deepEqual([...chart.series[0].y], [3, 8, 0]);
  assert.match(chart.series[2].label, /retard/);
  inspector.clear();
});
