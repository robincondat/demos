import { test } from "node:test";
import assert from "node:assert/strict";
import { claheGrid, claheTileAt } from "../compute/clahe.js";
import { extractImageRegion } from "../compute/image-region.js";
import { createImage } from "../compute/image.js";

test("CLAHE grid matches OpenCV padding, including a divisible axis when the other is not", () => {
  const settings = { clipLimit: 40, tilesX: 8, tilesY: 8 };
  assert.equal(claheGrid(16, 16, settings).tileWidth, 2);
  const grid = claheGrid(16, 17, settings);
  assert.equal(grid.tileWidth, 3);
  assert.equal(grid.tileHeight, 3);
  assert.deepEqual(claheTileAt(grid, 15, 16), {
    column: 5,
    row: 5,
    x: 15,
    y: 15,
    width: 1,
    height: 2,
  });
  assert.equal(claheTileAt(grid, 16, 0), null);
  assert.equal(claheTileAt(grid, -1, 0), null);
  assert.equal(claheTileAt(grid, 3, 3).column, 1);
});

test("Extracting an image region preserves RGB channels and source pixels", () => {
  const image = createImage({
    width: 3,
    height: 2,
    channels: 3,
    data: Uint8Array.from({ length: 18 }, (_, i) => i),
  });
  const region = extractImageRegion(image, { x: 1, y: 0, width: 2, height: 2 });
  assert.deepEqual([...region.data], [3, 4, 5, 6, 7, 8, 12, 13, 14, 15, 16, 17]);
  region.data[0] = 255;
  assert.equal(image.data[3], 3);
  assert.throws(() => extractImageRegion(image, { x: 2, y: 0, width: 2, height: 1 }));
});
