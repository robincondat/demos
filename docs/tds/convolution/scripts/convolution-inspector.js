import { createSlidingInspector } from "../../shared/scripts/sliding-inspector.js?v=20261106-tds3";
export {
  reflectedTimes,
  convolutionProducts,
  signalYRange,
} from "../../shared/scripts/sliding-inspector.js?v=20261106-tds3";
export function createConvolutionInspector(options) {
  return createSlidingInspector({
    ...options,
    emptyMessage: "Définissez les deux signaux pour visualiser la convolution.",
  });
}
