export const palette = ["#168665", "#e07a2d", "#7564c9", "#d34d72", "#2384bd", "#7d9130"];
export function signalName(signal) {
  return (
    signal.name?.trim() ||
    (signal.definition === "wav" ? signal.wavName.replace(/\.wav$/i, "") : signal.code)
  );
}
export function makeSignal(existingCodes = [], overrides = {}) {
  const used = new Set(existingCodes),
    index = Array.from({ length: used.size + 1 }, (_, position) => position + 1).find(
      (value) => !used.has(`S${value}`),
    ),
    code = `S${index}`;
  return {
    id: crypto.randomUUID(),
    code,
    name: code,
    visible: true,
    definition: "equation",
    sampleRate: 1000,
    start: 0,
    end: 1,
    expression: "",
    equationTree: null,
    equationLatex: "",
    variables: {},
    wavBytes: null,
    wavName: "",
    ...overrides,
  };
}
export { decodeWav } from "../tds-wav.js?v=20261106-tds3";
