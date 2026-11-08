import { test } from "node:test";
import assert from "node:assert/strict";

class UIEvent extends Event {
  constructor(type, options = {}) {
    super(type, { cancelable: true });
    Object.assign(this, options);
  }
}

function fixture() {
  const stage = new EventTarget();
  Object.assign(stage, {
    clientWidth: 640,
    clientHeight: 300,
    classList: { add() {}, remove() {} },
    setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 300 }),
  });
  let dashed = 0;
  const labels = [];
  const context = new Proxy(
    {
      fillText(text, x, y) {
        labels.push({ text, x, y });
      },
      setLineDash(value) {
        if (value.length) dashed++;
      },
    },
    {
      get: (obj, key) => obj[key] || (() => {}),
      set: (obj, key, value) => ((obj[key] = value), true),
    },
  );
  return {
    stage,
    canvas: { width: 0, height: 0, style: {}, getContext: () => context },
    tooltip: { hidden: true, style: {}, offsetWidth: 100, offsetHeight: 40 },
    xLabel: "Temps (s)",
    yLabel: () => "Amplitude",
    dashed: () => dashed,
    labels,
  };
}

globalThis.devicePixelRatio = 1;
globalThis.ResizeObserver = class {
  observe() {}
};

test("The filter mask shares the spectrum amplitude axis", async () => {
  const { createChart } = await import("../scripts/chart.js");
  const f = fixture(),
    chart = createChart(f);
  const signal = { x: [0, 1, 2], y: [0, 0.001, 0], label: "Spectrum", color: "#168665" };
  chart.setData([signal]);
  const before = f.labels.filter((item) => item.x === 54).map((item) => item.text);
  f.labels.length = 0;
  chart.setData([
    signal,
    { x: [0, 1, 2], y: [1, 1, 0], label: "H(f)", color: "#7564c9", step: true },
  ]);
  const after = f.labels.filter((item) => item.x === 54).map((item) => item.text);
  assert.notDeepEqual(after, before);
  assert(after.some((label) => Number(String(label).replace(",", ".")) >= 1));
});

test(`Courbe partagée : repère présent au survol, au zoom et après recentrage`, async () => {
  const { createChart } = await import("../scripts/chart.js");
  const f = fixture(),
    chart = createChart(f);
  chart.setData([{ x: [0, 1, 2], y: [0, 1, 0], label: "Signal", color: "#168665" }]);
  f.stage.dispatchEvent(new UIEvent("pointermove", { clientX: 300, clientY: 100 }));
  let count = f.dashed();
  assert(count > 0);
  f.stage.dispatchEvent(new UIEvent("wheel", { clientX: 300, deltaY: -200 }));
  assert(f.dashed() > count);
  count = f.dashed();
  f.stage.dispatchEvent(new UIEvent("dblclick"));
  assert(f.dashed() > count);
  count = f.dashed();
  f.stage.dispatchEvent(new UIEvent("pointerleave"));
  chart.render();
  assert.equal(f.dashed(), count);
});

test("Navigation synchronisée limitée au domaine du résultat, dans les deux sens", async () => {
  const { createChart } = await import("../scripts/chart.js");
  const f = fixture(),
    g = fixture(),
    a = createChart(f),
    b = createChart(g);
  a.onViewChange((view) => b.setView(view));
  b.onViewChange((view) => a.setView(view));
  for (const chart of [a, b]) {
    chart.setData([{ x: [0, 1, 2], y: [1, 2, 1], label: "Signal", color: "#168665" }]);
    chart.setDomain([0, 2]);
  }
  assert.deepEqual(a.getView(), [0, 2]);
  f.stage.dispatchEvent(new UIEvent("wheel", { clientX: 300, deltaY: -200 }));
  assert.deepEqual(a.getView(), b.getView());
  g.stage.dispatchEvent(new UIEvent("pointerdown", { button: 0, clientX: 300 }));
  g.stage.dispatchEvent(new UIEvent("pointermove", { clientX: 330 }));
  g.stage.dispatchEvent(new UIEvent("pointerup"));
  assert.deepEqual(a.getView(), b.getView());
  g.stage.dispatchEvent(new UIEvent("dblclick"));
  assert.deepEqual(a.getView(), [0, 2]);
  assert.deepEqual(b.getView(), [0, 2]);
});

test("Le survol communique le temps et place le repère sur la figure liée sans boucle", async () => {
  const { createChart } = await import("../scripts/chart.js");
  const f = fixture(),
    g = fixture();
  let seen = null,
    calls = 0,
    a,
    b;
  const follow = (time) => {
    calls++;
    seen = time;
    a.setCursor(time);
    b.setCursor(time);
  };
  a = createChart({ ...f, onPointerTime: follow });
  b = createChart({ ...g, onPointerTime: follow });
  for (const chart of [a, b])
    chart.setData([{ x: [0, 1, 2], y: [0, 1, 0], color: "#168665", label: "Signal" }]);
  let count = f.dashed();
  g.stage.dispatchEvent(new UIEvent("pointermove", { clientX: 342, clientY: 100 }));
  assert.equal(seen, 1);
  assert.equal(calls, 1);
  assert(f.dashed() > count);
  count = g.dashed();
  f.stage.dispatchEvent(new UIEvent("pointermove", { clientX: 202, clientY: 100 }));
  assert.equal(seen, 0.5);
  assert.equal(calls, 2);
  assert(g.dashed() > count);
  for (const source of [f, g]) {
    source.stage.dispatchEvent(new UIEvent("pointermove", { clientX: 300, clientY: 100 }));
    source.stage.dispatchEvent(new UIEvent("pointerleave"));
    assert.equal(seen, null);
    const beforeA = f.dashed(),
      beforeB = g.dashed();
    a.render();
    b.render();
    assert.equal(f.dashed(), beforeA);
    assert.equal(g.dashed(), beforeB);
  }
});

test("Le déplacement du repère réutilise les points du tracé dense", async () => {
  const { createChart } = await import("../scripts/chart.js");
  const f = fixture(),
    chart = createChart(f),
    count = 100_000;
  let reads = 0;
  const raw = Float64Array.from({ length: count }, (_, i) => Math.sin(i));
  const values = new Proxy(raw, {
    get(target, key) {
      if (/^\d+$/.test(String(key))) reads++;
      return Reflect.get(target, key, target);
    },
  });
  chart.setData([
    {
      x: Float64Array.from({ length: count }, (_, i) => i / 1000),
      y: values,
      label: "Long",
      color: "#168665",
    },
  ]);
  const before = reads;
  for (let i = 0; i < 5; i++)
    f.stage.dispatchEvent(new UIEvent("pointermove", { clientX: 200 + i, clientY: 100 }));
  assert(reads - before < 20_000, "Le survol doit réutiliser la réduction du tracé et son échelle");
});

test("Deux courbes restent indépendantes sans liaison explicite", async () => {
  const { createChart } = await import("../scripts/chart.js");
  const f = fixture(),
    g = fixture();
  const a = createChart(f),
    b = createChart(g);
  for (const chart of [a, b]) {
    chart.setData([{ x: [0, 1, 2], y: [0, 1, 0], label: "Signal", color: "#168665" }]);
  }
  f.stage.dispatchEvent(new UIEvent("wheel", { clientX: 300, deltaY: -200 }));
  assert.notDeepEqual(a.getView(), b.getView());
  assert.deepEqual(b.getView(), [0, 2]);
  f.stage.dispatchEvent(new UIEvent("pointermove", { clientX: 300, clientY: 100 }));
  assert(f.dashed() > 0);
  assert.equal(g.dashed(), 0);
  const count = f.dashed();
  f.stage.dispatchEvent(new UIEvent("pointercancel"));
  a.render();
  assert.equal(f.dashed(), count);
});

test("Remplacer les données invalide le cache même avec le même objet de série", async () => {
  const { createChart } = await import("../scripts/chart.js");
  const f = fixture(),
    chart = createChart(f);
  let reads = 0;
  const y = new Proxy([0, 1, 0], {
    get(target, key) {
      if (/^\d+$/.test(String(key))) reads++;
      return Reflect.get(target, key);
    },
  });
  const series = { x: [0, 1, 2], y, label: "Signal", color: "#168665" };
  chart.setData([series]);
  reads = 0;
  y[1] = 10;
  chart.setData([series]);
  assert(reads >= y.length, "Les nouvelles amplitudes doivent être relues");
  chart.setData([]);
  const count = f.dashed();
  chart.render();
  assert.equal(f.dashed(), count);
});
