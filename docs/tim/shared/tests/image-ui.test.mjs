import { test } from "node:test";
import assert from "node:assert/strict";
import { createDisplayControls, resolveDisplaySettings } from "../scripts/display-controls.js";
import { bindImageCursor, downloadCanvas, renderBorderPreview } from "../scripts/image-actions.js";
import { imageComponentHTML } from "../scripts/image-components.js";

test("Display settings reject empty/nonfinite ranges and ignore them only in automatic mode", () => {
  const fields = Object.fromEntries(
    ["DisplayMin", "DisplayMax", "AutoRange", "DisplayRangeError"].map((key) => [
      "original" + key,
      new EventTarget(),
    ]),
  );
  const control = createDisplayControls("original", { getElementById: (id) => fields[id] });
  fields.originalDisplayMin.value = "0";
  fields.originalDisplayMax.value = "255";
  assert.equal(control.read().valid, true);
  for (const value of ["", "NaN", "Infinity", "0", "-1"]) {
    fields.originalDisplayMax.value = value;
    assert.equal(control.read().valid, false);
  }
  fields.originalAutoRange.checked = true;
  const settings = control.read();
  assert.equal(settings.valid, true);
  assert.equal(fields.originalDisplayMin.disabled, true);
  assert.deepEqual(
    resolveDisplaySettings(settings, () => ({ min: 42, max: 42 })),
    { min: 42, max: 43 },
  );
  assert.equal(settings.resolvedMax, 43);
  assert.match(settings.error.textContent, /uniforme/);
  let changes = 0;
  const remove = control.bind(() => changes++);
  fields.originalAutoRange.dispatchEvent(new Event("input"));
  assert.equal(changes, 1);
  remove();
  fields.originalAutoRange.dispatchEvent(new Event("input"));
  assert.equal(changes, 1);
});

test("Shared cursor clears on exit, cancel, disabled views and outside pixels", () => {
  const stage = new EventTarget();
  let point = { x: 1, y: 2 },
    enabled = true,
    clears = 0;
  const seen = [],
    remove = bindImageCursor({
      stages: [stage],
      viewer: () => ({ toImagePoint: () => point }),
      enabled: () => enabled,
      onPoint: (p) => seen.push(p),
      clear: () => clears++,
    });
  stage.dispatchEvent(new Event("pointermove"));
  stage.dispatchEvent(new Event("pointerleave"));
  stage.dispatchEvent(new Event("pointercancel"));
  enabled = false;
  stage.dispatchEvent(new Event("pointermove"));
  enabled = true;
  point = null;
  stage.dispatchEvent(new Event("pointermove"));
  assert.deepEqual(seen, [{ x: 1, y: 2 }]);
  assert.equal(clears, 4);
  remove();
  stage.dispatchEvent(new Event("pointerleave"));
  assert.equal(clears, 4);
});

test("PNG export waits for a blob, preserves the filename and releases its URL", async () => {
  const log = [],
    link = {
      click() {
        log.push(this.download);
      },
    };
  const dependencies = {
    document: { createElement: () => link },
    urls: { createObjectURL: () => "blob:test", revokeObjectURL: (url) => log.push(url) },
    defer: (callback) => callback(),
  };
  assert.equal(
    await downloadCanvas({ toBlob: (callback) => callback(null) }, "empty.png", dependencies),
    false,
  );
  assert.deepEqual(log, []);
  assert.equal(
    await downloadCanvas(
      {
        toBlob(callback, type) {
          assert.equal(type, "image/png");
          queueMicrotask(() => callback({}));
        },
      },
      "image.png",
      dependencies,
    ),
    true,
  );
  assert.deepEqual(log, ["image.png", "blob:test"]);
  await assert.rejects(
    downloadCanvas({ toBlob: (callback) => queueMicrotask(() => callback({})) }, "failed.png", {
      ...dependencies,
      document: {
        createElement() {
          throw Error("failure");
        },
      },
    }),
    /failure/,
  );
});

test("Border previews share the same extensions and preserve morphology's neutral option", () => {
  const preview = {
      ownerDocument: { createElement: () => ({}) },
      replaceChildren(...nodes) {
        this.nodes = nodes;
      },
      setAttribute(key, value) {
        this[key] = value;
      },
    },
    valueField = {};
  renderBorderPreview({ preview, valueField, border: "constant", value: "<1>" });
  assert.equal(preview.nodes[0].textContent, "<1> <1>");
  assert.equal(valueField.hidden, false);
  renderBorderPreview({ preview, valueField, border: "reflect101" });
  assert.equal(preview.nodes[0].textContent, "c b");
  assert.equal(valueField.hidden, true);
  renderBorderPreview({ preview, valueField, border: "neutral" });
  assert.match(preview["aria-label"], /neutre/);
});

test("Reusable panels support binary labels, selectable views, optional synchronization and large histograms", () => {
  const binary = imageComponentHTML("information", { rangeLabel: "Valeurs binaires" });
  assert.match(binary, /Valeurs binaires/);
  assert.match(
    imageComponentHTML("display-settings", { kind: "result", auto: "true" }),
    /type="checkbox" checked/,
  );
  assert.doesNotMatch(imageComponentHTML("navigation"), /id="syncNavigation"/);
  assert.match(imageComponentHTML("navigation", { sync: "true" }), /id="syncNavigation"/);
  const color = imageComponentHTML(
    "image-panel",
    { kind: "result" },
    { heading: '<h2 id="resultTitle">RGB</h2>', extra: '<div id="resultCloud"></div>' },
  );
  for (const id of ["resultTitle", "resultCloud", "resultCanvas", "processing"])
    assert.match(color, new RegExp(`id="${id}"`));
  assert.match(imageComponentHTML("histograms", { large: "true" }), /large-histograms/);
  assert.match(
    imageComponentHTML("image-panel", { title: '<img src=x onerror="bad">' }),
    /&lt;img/,
  );
  assert.doesNotMatch(imageComponentHTML("upload", { metadata: "none" }), /id="fileName"/);
  assert.throws(() => imageComponentHTML("unknown"), /inconnu/);
});
