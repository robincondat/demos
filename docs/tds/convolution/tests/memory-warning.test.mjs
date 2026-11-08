import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryWarning, estimateWorkingBytes } from "../../shared/scripts/memory-warning.js";

const signal = (count) => ({ start: 0, end: count, sampleRate: 1 });

test("Le volume habituel ne demande pas de confirmation", () => {
  const guard = createMemoryWarning(() => {
    throw Error("Confirmation inattendue");
  });
  assert(guard.check([signal(1_294_174), signal(1_294_174)]));
  assert.equal(estimateWorkingBytes([signal(3), signal(2)]), 80 * 5 + 48 * 4);
});

test("Un volume important peut être accepté, sans répétition pour le même volume", () => {
  let calls = 0;
  const guard = createMemoryWarning((message) => {
    calls++;
    assert.match(message, /Continuer/);
    return true;
  });
  const large = [signal(3_000_000), signal(3_000_000)];
  assert(guard.check(large));
  assert(guard.check(large));
  assert.equal(calls, 1);
  assert(guard.check([signal(4_000_000), signal(4_000_000)]));
  assert.equal(calls, 2);
  guard.reset();
  assert(guard.check(large));
  assert.equal(calls, 3);
});

test("Annuler refuse uniquement cette tentative et permet de réessayer", () => {
  let calls = 0;
  const guard = createMemoryWarning(() => ++calls > 1);
  const large = [signal(3_000_000), signal(3_000_000)];
  assert.equal(guard.check(large), false);
  assert.equal(guard.check(large), true);
});
