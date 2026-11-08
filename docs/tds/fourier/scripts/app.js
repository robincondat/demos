import { createSignalListApp } from "../../shared/scripts/signal-list-app.js?v=20261106-tds3";
import { createChart } from "../../shared/scripts/chart.js?v=20261106-tds3";
import { palette, signalName } from "../../shared/scripts/tds-signals/signals.js?v=20261106-tds3";
const byId = (id) => document.getElementById(id);
const elements = Object.fromEntries(
  ["fftPoints", "frequencyResolution", "nyquistFrequency", "transformTitle", "spectrumTitle"].map(
    (id) => [id, byId(id)],
  ),
);
const spectrumType = () => document.querySelector('input[name="spectrum"]:checked').value;
const transformType = () => document.querySelector('input[name="transform"]:checked').value;
const timeChart = createChart({
  stage: byId("timeStage"),
  canvas: byId("timeChart"),
  tooltip: byId("timeTooltip"),
  xLabel: "Temps (s)",
  yLabel: () => "Amplitude",
});
const spectrumChart = createChart({
  stage: byId("spectrumStage"),
  canvas: byId("spectrumChart"),
  tooltip: byId("spectrumTooltip"),
  xLabel: "Fr\u00e9quence (Hz)",
  yLabel: () => (spectrumType() === "phase" ? "Phase (rad)" : "Amplitude"),
});
function clearView() {
  timeChart.setData([]);
  spectrumChart.setData([]);
  byId("timeEmpty").hidden = false;
  elements.fftPoints.textContent =
    elements.frequencyResolution.textContent =
    elements.nyquistFrequency.textContent =
      "\u2014";
}
function rangeLabel(values, suffix = "") {
  if (!values.length) return "—";
  const min = Math.min(...values),
    max = Math.max(...values),
    text =
      min === max
        ? min.toLocaleString("fr-FR")
        : `${min.toLocaleString("fr-FR")}–${max.toLocaleString("fr-FR")}`;
  return `${text}${suffix}`;
}
function display(result, signals) {
  const visible = signals
    .map((signal, index) => ({ signal, data: result.signals[index], index }))
    .filter(({ signal }) => signal.visible);
  timeChart.setData(
    visible.map(({ signal, data, index }) => ({
      x: data.times,
      y: data.values,
      label: signalName(signal),
      color: palette[index % palette.length],
      width: 1.7,
    })),
  );
  const phase = spectrumType() === "phase";
  elements.spectrumTitle.textContent = phase ? "Spectre de phase" : "Spectre d’amplitude";
  spectrumChart.setData(
    visible.map(({ signal, data, index }) => ({
      x: data.frequencies,
      y: phase ? data.phases : data.amplitudes,
      label: signalName(signal),
      color: palette[index % palette.length],
      width: phase ? 1.35 : 1.6,
    })),
  );
  byId("timeEmpty").hidden = visible.length > 0;
  elements.fftPoints.textContent = rangeLabel(visible.map(({ data }) => data.frequencies.length));
  elements.frequencyResolution.textContent = rangeLabel(
    visible.map(({ data }) => Number(data.resolution.toPrecision(6))),
    " Hz",
  );
  elements.nyquistFrequency.textContent = rangeLabel(
    visible.map(({ data }) => Number(data.nyquist.toPrecision(8))),
    " Hz",
  );
}

const app = createSignalListApp({
  workerURL: "./scripts/scientific-worker.js?v=20261106-tds3",
  displayResult: display,
  clearView,
  extraPayload: () => ({ transform: transformType() }),
  onReset() {
    document.querySelector('input[name="transform"][value="rfft"]').checked = true;
    document.querySelector('input[name="spectrum"][value="amplitude"]').checked = true;
    elements.transformTitle.textContent = "Informations RFFT";
    elements.spectrumTitle.textContent = "Spectre d’amplitude";
  },
});
document.querySelectorAll('input[name="spectrum"]').forEach((input) =>
  input.addEventListener("change", () => {
    elements.spectrumTitle.textContent =
      spectrumType() === "phase" ? "Spectre de phase" : "Spectre d\u2019amplitude";
    app.redisplay();
  }),
);
document.querySelectorAll('input[name="transform"]').forEach((input) =>
  input.addEventListener("change", () => {
    app.invalidate();
    clearView();
    elements.transformTitle.textContent = `Informations ${transformType().toUpperCase()}`;
    app.update();
  }),
);
