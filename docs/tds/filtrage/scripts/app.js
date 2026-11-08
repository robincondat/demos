import { createSignalListApp } from "../../shared/scripts/signal-list-app.js?v=20261106-tds3";
import { createChart } from "../../shared/scripts/chart.js?v=20261106-tds3";
import { signalName } from "../../shared/scripts/tds-signals/signals.js?v=20261106-tds3";

const $ = (id) => document.getElementById(id);
const chart = (prefix, xLabel) =>
  createChart({
    stage: $(prefix + "Stage"),
    canvas: $(prefix + "Chart"),
    tooltip: $(prefix + "Tooltip"),
    xLabel,
    yLabel: () => "Amplitude",
  });
const temporal = chart("time", "Temps (s)");
const frequency = chart("frequency", "Fréquence (Hz)");
const kind = () => document.querySelector('input[name="filterKind"]:checked').value;
const number = (id) => ($(id).value.trim() === "" ? null : Number($(id).value));
const settings = () => ({
  kind: kind(),
  cutoff: number("cutoff"),
  low: number("low"),
  high: number("high"),
});
function refreshControls() {
  const band = ["bandpass", "bandstop"].includes(kind());
  $("singleCutoff").hidden = band;
  $("bandCutoffs").hidden = !band;
}
function resetFilter() {
  document.querySelector('input[name="filterKind"][value="lowpass"]').checked = true;
  $("cutoff").value = 100;
  $("low").value = 100;
  $("high").value = 200;
  refreshControls();
}
const app = createSignalListApp({
  workerURL: "./scripts/scientific-worker.js?v=20261106-tds3",
  single: true,
  extraPayload: () => ({ filter: settings() }),
  onReset: resetFilter,
  clearView() {
    temporal.setData([]);
    frequency.setData([]);
    $("timeEmpty").hidden = false;
    $("frequencyEmpty").hidden = false;
    $("samplingInfo").textContent = "";
  },
  displayResult(result, signals) {
    const source = result.signals[0],
      output = result.filter;
    if (!source || !output) return;
    const visible = signals[0].visible;
    temporal.setData(
      visible
        ? [
            {
              x: source.times,
              y: source.values,
              label: signalName(signals[0]),
              color: "#168665",
              width: 1.7,
            },
            {
              x: source.times,
              y: output.values,
              label: "Signal filtré",
              color: "#e07a2d",
              width: 1.8,
            },
          ]
        : [],
    );
    const config = settings(),
      max = output.nyquist;
    const bands =
      config.kind === "lowpass"
        ? [[0, config.cutoff]]
        : config.kind === "highpass"
          ? [[config.cutoff, max]]
          : config.kind === "bandpass"
            ? [[config.low, config.high]]
            : [
                [0, config.low],
                [config.high, max],
              ];
    frequency.setData(
      [
        ...(visible
          ? [
              {
                x: output.frequencies,
                y: output.amplitudes,
                label: "Spectre d’entrée",
                color: "#168665",
                width: 1.7,
              },
              {
                x: output.frequencies,
                y: output.filteredAmplitudes,
                label: "Spectre filtré",
                color: "#e07a2d",
                width: 2,
              },
            ]
          : []),
        {
          x: output.frequencies,
          y: output.mask,
          label: "H(f)",
          color: "#7564c9",
          step: true,
          width: 1.8,
        },
      ],
      { regions: bands.map(([start, end]) => ({ start, end, color: "#7564c915" })) },
    );
    frequency.setDomain([0, max]);
    $("timeEmpty").hidden = visible;
    $("frequencyEmpty").hidden = true;
    $("samplingInfo").textContent =
      `Nyquist : ${max.toLocaleString("fr-FR")} Hz · Pas fréquentiel : ${output.resolution.toLocaleString("fr-FR")} Hz`;
  },
});
document.querySelectorAll('input[name="filterKind"]').forEach((input) =>
  input.addEventListener("change", () => {
    refreshControls();
    app.schedule();
  }),
);
for (const id of ["cutoff", "low", "high"])
  $(id).addEventListener("input", () => {
    app.schedule();
  });
