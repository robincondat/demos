import { test } from 'node:test';
import assert from 'node:assert/strict';

class UIEvent extends Event {
  constructor(type, options = {}) { super(type, { cancelable: true }); Object.assign(this, options); }
}

function fixture() {
  const stage = new EventTarget();
  Object.assign(stage, { clientWidth: 640, clientHeight: 300, classList: { add() {}, remove() {} }, setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 300 }) });
  let dashed = 0;
  const context = new Proxy({ setLineDash(value) { if (value.length) dashed++; } }, { get: (obj, key) => obj[key] || (() => {}), set: (obj, key, value) => (obj[key] = value, true) });
  return { stage, canvas: { width: 0, height: 0, style: {}, getContext: () => context }, tooltip: { hidden: true, style: {}, offsetWidth: 100, offsetHeight: 40 }, xLabel: 'Temps (s)', yLabel: () => 'Amplitude', dashed: () => dashed };
}

globalThis.devicePixelRatio = 1;
globalThis.ResizeObserver = class { observe() {} };

for (const platform of ['convolution', 'fourier']) {
  test(`${platform} : repère présent au survol, au zoom et après recentrage`, async () => {
    const { createChart } = await import(`../../${platform}/scripts/chart.js`);
    const f = fixture(), chart = createChart(f);
    chart.setData([{ x: [0, 1, 2], y: [0, 1, 0], label: 'Signal', color: '#168665' }]);
    f.stage.dispatchEvent(new UIEvent('pointermove', { clientX: 300, clientY: 100 }));
    let count = f.dashed(); assert(count > 0);
    f.stage.dispatchEvent(new UIEvent('wheel', { clientX: 300, deltaY: -200 }));
    assert(f.dashed() > count); count = f.dashed();
    f.stage.dispatchEvent(new UIEvent('dblclick'));
    assert(f.dashed() > count); count = f.dashed();
    f.stage.dispatchEvent(new UIEvent('pointerleave')); chart.render();
    assert.equal(f.dashed(), count);
  });
}

test('Navigation synchronisée limitée au domaine du résultat, dans les deux sens', async () => {
  const { createChart } = await import('../scripts/chart.js');
  const f = fixture(), g = fixture(), a = createChart(f), b = createChart(g);
  a.onViewChange(view => b.setView(view)); b.onViewChange(view => a.setView(view));
  for (const chart of [a, b]) {
    chart.setData([{ x: [0, 1, 2], y: [1, 2, 1], label: 'Signal', color: '#168665' }]);
    chart.setDomain([0, 2]);
  }
  assert.deepEqual(a.getView(), [0, 2]);
  f.stage.dispatchEvent(new UIEvent('wheel', { clientX: 300, deltaY: -200 }));
  assert.deepEqual(a.getView(), b.getView());
  g.stage.dispatchEvent(new UIEvent('pointerdown', { button: 0, clientX: 300 }));
  g.stage.dispatchEvent(new UIEvent('pointermove', { clientX: 330 }));
  g.stage.dispatchEvent(new UIEvent('pointerup'));
  assert.deepEqual(a.getView(), b.getView());
  g.stage.dispatchEvent(new UIEvent('dblclick'));
  assert.deepEqual(a.getView(), [0, 2]); assert.deepEqual(b.getView(), [0, 2]);
});

test('Le survol communique le temps et place le repère sur la figure liée sans boucle', async () => {
  const { createChart } = await import('../scripts/chart.js');
  const f = fixture(), g = fixture(); let seen = null, calls = 0, a, b;
  const follow = time => { calls++; seen = time; a.setCursor(time); b.setCursor(time); };
  a = createChart({ ...f, onPointerTime: follow }); b = createChart({ ...g, onPointerTime: follow });
  for (const chart of [a, b]) chart.setData([{ x: [0, 1, 2], y: [0, 1, 0], color: '#168665', label: 'Signal' }]);
  let count = f.dashed();
  g.stage.dispatchEvent(new UIEvent('pointermove', { clientX: 342, clientY: 100 }));
  assert.equal(seen, 1); assert.equal(calls, 1); assert(f.dashed() > count);
  count = g.dashed();
  f.stage.dispatchEvent(new UIEvent('pointermove', { clientX: 202, clientY: 100 }));
  assert.equal(seen, 0.5); assert.equal(calls, 2); assert(g.dashed() > count);
  for (const source of [f, g]) {
    source.stage.dispatchEvent(new UIEvent('pointermove', { clientX: 300, clientY: 100 }));
    source.stage.dispatchEvent(new UIEvent('pointerleave'));
    assert.equal(seen, null);
    const beforeA = f.dashed(), beforeB = g.dashed();
    a.render(); b.render();
    assert.equal(f.dashed(), beforeA); assert.equal(g.dashed(), beforeB);
  }
});
