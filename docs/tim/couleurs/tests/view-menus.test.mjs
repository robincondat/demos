import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORIGINAL_VIEW_GROUPS, resultViewGroups } from '../scripts/view-menus.js';
import { SPACES } from '../scripts/colors.js';

test('Le menu RGB regroupe toutes les vues sans doublons', () => {
  const values = ORIGINAL_VIEW_GROUPS.flatMap(group => group.options.map(([value]) => value));
  assert.deepEqual(values, ['rgb', 'r', 'g', 'b', 'r-gray', 'g-gray', 'b-gray', 'cloud']);
  assert.equal(new Set(values).size, values.length);
});

test('Les groupes conservent les vues de chaque espace et les ajouts spécifiques', () => {
  for (const space of Object.keys(SPACES)) {
    const groups = resultViewGroups(space), values = groups.flatMap(group => group.options.map(([value]) => value));
    for (const [value] of SPACES[space].views) assert(values.includes(value));
    assert.equal(new Set(values).size, values.length);
    assert(groups.every(group => group.options.length > 0));
    if (space === 'hsv') assert.deepEqual(values.slice(-2), ['mask', 'selected']);
    if (space === 'ycbcr') assert.deepEqual(values.slice(-2), ['reduced-rgb', 'reduced-chroma']);
  }
});
