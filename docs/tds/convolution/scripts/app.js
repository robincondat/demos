import { createPairSignalApp } from "../../shared/scripts/pair-signal-app.js?v=20261106-tds3";
import { convolutionDescriptions } from "./descriptions.js?v=20261106-tds3";
import { createConvolutionInspector } from "./convolution-inspector.js?v=20261106-tds3";
createPairSignalApp({
  workerURL: "./scripts/scientific-worker.js?v=20261106-tds3",
  resultKey: "convolution",
  errorKey: "convolutionError",
  operationLabel: "Convolution",
  emptyMessage: "Définissez les deux signaux pour calculer leur convolution.",
  descriptions: convolutionDescriptions,
  createInspector: createConvolutionInspector,
});
