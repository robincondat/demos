export const formatNumber = (value) =>
  Number.isFinite(value) ? String(Number(value.toPrecision(6))) : "—";

export function createImageInformation(ids) {
  return {
    set({ width, height, fileSize, type, range } = {}) {
      if (width !== undefined && height !== undefined)
        ids.infoDimensions.textContent = `${width} × ${height} px`;
      if (fileSize !== undefined)
        ids.infoFileSize.textContent =
          fileSize < 1048576
            ? `${(fileSize / 1024).toFixed(1)} Ko`
            : `${(fileSize / 1048576).toFixed(1)} Mo`;
      if (type !== undefined) ids.infoType.textContent = type;
      if (range !== undefined)
        ids.infoOriginalRange.textContent =
          typeof range === "string"
            ? range
            : `[${formatNumber(range.min)}, ${formatNumber(range.max)}]`;
    },
    clear() {
      for (const node of Object.values(ids)) node.textContent = "—";
    },
  };
}

export function createPixelInspector(ids) {
  function text(values, labels) {
    if (!values) return "—";
    if (!labels && values.length === 1) return formatNumber(values[0]);
    return Array.from(
      values,
      (value, i) => `${(labels || ["R", "V", "B", "A"])[i]} ${formatNumber(value)}`,
    ).join(" · ");
  }
  return {
    show({ x, y, source, result, difference, sourceLabels, resultLabels, differenceLabels }) {
      if (difference === undefined && source && result) {
        const comparable =
          source.length === result.length
            ? source
            : source.length === 1
              ? Array(result.length).fill(source[0])
              : result.length === 1
                ? [source[0] * 0.299 + source[1] * 0.587 + source[2] * 0.114]
                : null;
        difference = comparable ? Array.from(result, (value, i) => value - comparable[i]) : null;
      }
      ids.cursorPosition.textContent = `x : ${x} · y : ${y}`;
      ids.cursorOriginal.textContent = text(source, sourceLabels);
      ids.cursorResult.textContent = text(result, resultLabels);
      ids.cursorDifference.textContent = text(difference, differenceLabels);
    },
    clear() {
      for (const node of Object.values(ids)) node.textContent = "—";
    },
  };
}
