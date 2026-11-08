import { createSignalListApp } from "../../shared/scripts/signal-list-app.js?v=20261106-tds3";
import { createChart } from "../../shared/scripts/chart.js?v=20261106-tds3";
import {
  palette,
  signalName,
} from "../../shared/scripts/tds-signals/signals.js?v=20261106-tds3";
const $ = (id) => document.getElementById(id);
const chart = createChart({
  stage: $("timeStage"),
  canvas: $("timeChart"),
  tooltip: $("timeTooltip"),
  xLabel: "Temps (s)",
  yLabel: () => "Amplitude",
});
createSignalListApp({
  workerURL: "./scripts/scientific-worker.js?v=20261106-tds3",
  clearView() {
    chart.setData([]);
    $("timeEmpty").hidden = false;
  },
  displayResult(result, signals) {
    const visible = signals
      .map((signal, index) => ({ signal, data: result.signals[index], index }))
      .filter(({ signal }) => signal.visible);
    chart.setData(
      visible.map(({ signal, data, index }) => ({
        x: data.times,
        y: data.values,
        label: signalName(signal),
        color: palette[index % palette.length],
        width: 1.7,
      })),
    );
    $("timeEmpty").hidden = visible.length > 0;
  },
});
