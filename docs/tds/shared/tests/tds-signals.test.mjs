import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { makeSignal, signalName } from "../scripts/tds-signals/signals.js";
import { renameSignal } from "../scripts/tds-signals/equations.js";

test("Independent signals allocate names without collisions or shared parameters", () => {
  const first = makeSignal(["S1", "S3"]);
  const second = makeSignal();
  assert.equal(first.name, "S2");
  first.variables.f0 = 10;
  assert.deepEqual(second.variables, {});
  assert.notEqual(first.id, second.id);
  assert.equal(
    signalName(makeSignal([], { name: "", definition: "wav", wavName: "audio.WAV" })),
    "audio",
  );
});

test("Renaming updates expressions, cases and stable reference trees", () => {
  const a = makeSignal();
  const b = makeSignal(["S1"], {
    expression: "2*S1 + S10",
    equationSingleExpression: "S1(t-1)",
    equationTree: { kind: "reference", id: a.id, name: "S1" },
  });
  const c = makeSignal(["S1", "S2"], {
    equationMode: "cases",
    equationCases: [{ expression: "S1", condition: "S1 > 0" }],
    equationOtherwise: "-S1",
  });
  renameSignal([a, b, c], a, "source");
  assert.equal(b.expression, "2*source + S10");
  assert.equal(b.equationSingleExpression, "source(t-1)");
  assert.equal(b.equationTree.name, "source");
  assert.equal(b.equationTree.id, a.id);
  assert.deepEqual(c.equationCases, [{ expression: "source", condition: "source > 0" }]);
  assert.equal(c.equationOtherwise, "-source");
  assert.throws(() => renameSignal([a, b, c], a, b.name));
  assert.equal(a.name, "source");
});

test("Both platforms load the common editor and model; module imports resolve", async () => {
  const seen = new Set();
  async function visit(url) {
    url.search = "";
    if (seen.has(url.href)) return;
    seen.add(url.href);
    const source = await readFile(url, "utf8");
    for (const match of source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g))
      await visit(new URL(match[1], url));
  }
  for (const platform of ["fourier", "convolution", "correlation", "signaux", "filtrage"]) {
    const htmlUrl = new URL(`../../${platform}/index.html`, import.meta.url);
    const html = await readFile(htmlUrl, "utf8");
    for (const match of html.matchAll(/(?:src|href)="(\.[^"]+)"/g)) {
      const asset = new URL(match[1], htmlUrl);
      asset.search = "";
      await readFile(asset);
    }
    const url = new URL(`../../${platform}/scripts/app.js`, import.meta.url);
    const app = await readFile(url, "utf8");
    await visit(url);
    assert([...seen].some((url) => url.endsWith('/tds-signals/equation-editor.js')));
    assert([...seen].some((url) => url.endsWith('/tds-signals/signal-cards.js')));
  }
});
