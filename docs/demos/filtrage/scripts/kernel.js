export function resizeKernel(grid, width, height, oldValues = []) {
  const table = document.createElement("table"),
    body = document.createElement("tbody"),
    values = [];
  table.className = "kernel-table";
  for (let y = 0; y < height; y++) {
    const row = document.createElement("tr");
    for (let x = 0; x < width; x++) {
      const i = y * width + x,
        cell = document.createElement("td"),
        input = document.createElement("input");
      input.type = "text";
      input.inputMode = "decimal";
      input.value =
        oldValues[i] ??
        (x === Math.floor(width / 2) && y === Math.floor(height / 2) ? 1 : 0);
      input.dataset.row = y;
      input.dataset.column = x;
      input.setAttribute(
        "aria-label",
        `Coefficient ligne ${y + 1}, colonne ${x + 1}`,
      );
      cell.append(input);
      row.append(cell);
      values.push(input);
    }
    body.append(row);
  }
  table.append(body);
  grid.replaceChildren(table);
  return values;
}
export function readKernel(inputs) {
  return inputs.map(
    (input) => Number.parseFloat(input.value.replace(",", ".")) || 0,
  );
}
export function setIdentity(inputs, width, height) {
  inputs.forEach(
    (input, i) =>
      (input.value =
        i === Math.floor(height / 2) * width + Math.floor(width / 2)
          ? "1"
          : "0"),
  );
}
export function normalizeKernel(inputs) {
  const values = readKernel(inputs),
    sum = values.reduce((a, b) => a + b, 0);
  if (Math.abs(sum) < 1e-12) return false;
  inputs.forEach(
    (input, i) =>
      (input.value = String(Number((values[i] / sum).toPrecision(8)))),
  );
  return true;
}

export function enableKernelTableEditing(grid, onChange) {
  const focusCell = (row, column) => {
    const input = grid.querySelector(
      `input[data-row="${row}"][data-column="${column}"]`,
    );
    if (input) {
      input.focus();
      input.select();
    }
  };
  grid.addEventListener("keydown", (event) => {
    const input = event.target.closest("input[data-row]");
    if (!input) return;
    const row = Number(input.dataset.row),
      column = Number(input.dataset.column),
      moves = {
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        Enter: [1, 0],
      };
    if (!moves[event.key]) return;
    event.preventDefault();
    const [dy, dx] = moves[event.key];
    focusCell(row + dy, column + dx);
  });
  grid.addEventListener("paste", (event) => {
    const input = event.target.closest("input[data-row]"),
      text = event.clipboardData?.getData("text");
    if (!input || !text || (!text.includes("\t") && !/[\r\n]/.test(text)))
      return;
    event.preventDefault();
    const startRow = Number(input.dataset.row),
      startColumn = Number(input.dataset.column),
      rows = text
        .trim()
        .split(/\r?\n/)
        .map((row) => row.split("\t"));
    rows.forEach((values, y) =>
      values.forEach((value, x) => {
        const target = grid.querySelector(
          `input[data-row="${startRow + y}"][data-column="${startColumn + x}"]`,
        );
        if (target) target.value = value.trim().replace(",", ".");
      }),
    );
    onChange();
    focusCell(startRow + rows.length - 1, startColumn + rows.at(-1).length - 1);
  });
}
