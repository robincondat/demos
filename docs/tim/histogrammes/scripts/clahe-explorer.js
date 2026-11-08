import { claheGrid, claheTileAt } from "../../shared/compute/clahe.js?v=20261106-clahe-local";

const namespace = "http://www.w3.org/2000/svg";
export function createCLAHEExplorer({ stages, canvases, viewer, analysis, title }) {
  let images = null,
    grid = null,
    pointer = null,
    selectedKey = "",
    showGrid = [true, true];
  const originalTitle = title.textContent;
  const make = (name, attributes) => {
    const node = title.ownerDocument.createElementNS(namespace, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  };
  const overlays = stages.map((stage) => {
    const svg = make("svg", { class: "clahe-overlay", "aria-hidden": "true", hidden: "" });
    const halo = make("path", { class: "clahe-grid-halo", "vector-effect": "non-scaling-stroke" });
    const lines = make("path", { class: "clahe-grid", "vector-effect": "non-scaling-stroke" });
    const highlight = make("rect", {
      class: "clahe-tile",
      "vector-effect": "non-scaling-stroke",
      visibility: "hidden",
    });
    svg.append(halo, lines, highlight);
    stage.append(svg);
    return { svg, halo, lines, highlight };
  });
  function clearSelection() {
    selectedKey = "";
    overlays.forEach(({ highlight }) => highlight.setAttribute("visibility", "hidden"));
    analysis.clearHistogramRegion();
    title.textContent = originalTitle;
  }
  function inspect() {
    const point = pointer && images && viewer.toImagePoint(pointer.stage, pointer.x, pointer.y);
    const tile = point && claheTileAt(grid, point.x, point.y);
    if (!tile) {
      clearSelection();
      return;
    }
    const key = `${tile.column}:${tile.row}`;
    if (key === selectedKey) return;
    selectedKey = key;
    for (const { highlight } of overlays) {
      for (const attribute of ["x", "y", "width", "height"])
        highlight.setAttribute(attribute, tile[attribute]);
      highlight.setAttribute("visibility", "visible");
    }
    analysis.setHistogramRegion(images.source, images.result, tile, { min: 0, max: 255 });
    title.textContent = `Histogrammes — tuile (${tile.column + 1}, ${tile.row + 1}) · ${tile.width} × ${tile.height} px visibles`;
  }
  function refresh() {
    overlays.forEach(({ svg, halo, lines, highlight }, i) => {
      svg.style.transform = canvases[i].style.transform;
      // SVG's vector effect does not cancel an external CSS scale.
      const matrix = new DOMMatrix(canvases[i].style.transform);
      const scale = Math.hypot(matrix.a, matrix.b) || 1;
      halo.style.strokeWidth = 3 / scale;
      lines.style.strokeWidth = 1 / scale;
      highlight.style.strokeWidth = 2 / scale;
    });
    inspect();
  }
  for (const stage of stages) {
    stage.addEventListener("pointermove", (event) => {
      pointer = { stage, x: event.clientX, y: event.clientY };
      inspect();
    });
    for (const event of ["pointerleave", "pointercancel"])
      stage.addEventListener(event, () => {
        pointer = null;
        clearSelection();
      });
  }
  return {
    refresh,
    reset() {
      images = grid = null;
      overlays.forEach(({ svg }) => svg.setAttribute("hidden", ""));
      clearSelection();
    },
    setGridVisible(index, value) {
      showGrid[index] = value;
      const { halo, lines } = overlays[index];
      halo.style.display = lines.style.display = value ? "" : "none";
    },
    setImages(source, result, settings) {
      clearSelection();
      images = { source, result };
      grid = claheGrid(source.width, source.height, settings);
      let path = "";
      for (let x = grid.tileWidth; x < grid.width; x += grid.tileWidth)
        path += `M ${x} 0 V ${grid.height} `;
      for (let y = grid.tileHeight; y < grid.height; y += grid.tileHeight)
        path += `M 0 ${y} H ${grid.width} `;
      for (const [index, { svg, halo, lines }] of overlays.entries()) {
        svg.removeAttribute("hidden");
        svg.setAttribute("viewBox", `0 0 ${grid.width} ${grid.height}`);
        svg.style.width = `${grid.width}px`;
        svg.style.height = `${grid.height}px`;
        lines.setAttribute("d", path);
        halo.setAttribute("d", path);
        halo.style.display = showGrid[index] ? "" : "none";
        lines.style.display = showGrid[index] ? "" : "none";
      }
      refresh();
    },
  };
}
