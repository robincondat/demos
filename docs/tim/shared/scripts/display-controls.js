// UI settings are separate from scientific pixels and native OpenCV matrices.
export function createDisplayControls(kind, root = document) {
  const get = (suffix) => root.getElementById(kind + suffix);
  const minInput = get("DisplayMin"),
    maxInput = get("DisplayMax"),
    autoInput = get("AutoRange"),
    error = get("DisplayRangeError");
  return {
    read() {
      const min = Number.parseFloat(minInput.value),
        max = Number.parseFloat(maxInput.value),
        auto = autoInput.checked;
      const valid = auto || (Number.isFinite(min) && Number.isFinite(max) && max > min);
      minInput.disabled = maxInput.disabled = auto;
      error.textContent = valid
        ? ""
        : "La valeur blanche doit être strictement supérieure à la valeur noire.";
      return { min, max, auto, valid, error };
    },
    bind(onChange) {
      const inputs = [minInput, maxInput, autoInput];
      inputs.forEach((input) => input.addEventListener("input", onChange));
      return () => inputs.forEach((input) => input.removeEventListener("input", onChange));
    },
  };
}

export function resolveDisplaySettings(settings, actualRange) {
  let { min, max } = settings;
  if (settings.auto) {
    ({ min, max } = actualRange());
    const format = (value) => Number(value.toPrecision(6)).toString();
    settings.error.textContent =
      min === max
        ? `Image uniforme : ${format(min)}`
        : `Plage utilisée : ${format(min)} → ${format(max)}`;
  }
  if (min === max) max = min + 1;
  settings.resolvedMin = min;
  settings.resolvedMax = max;
  return { min, max };
}
