/**
 * Centralise les références vers le DOM.
 *
 * Les identifiants HTML ne doivent être modifiés qu'ici lorsqu'un contrôle
 * est renommé. Le reste de l'application manipule des noms fonctionnels.
 */
export const byId = (id) => document.getElementById(id);

export function collectElements() {
  return {
    input: byId("imageInput"),
    source: byId("sourceCanvas"),
    original: byId("originalCanvas"),
    result: byId("resultCanvas"),
    originalStage: byId("originalStage"),
    resultStage: byId("resultStage"),
    fileName: byId("fileName"),
    imageMeta: byId("imageMeta"),
    originalBadge: byId("originalBadge"),
    resultBadge: byId("resultBadge"),
    runtime: byId("runtimeText"),
    runtimeDot: byId("runtimeDot"),
    download: byId("downloadButton"),

    width: byId("kernelWidth"),
    widthLabel: byId("kernelWidthLabel"),
    height: byId("kernelHeight"),
    heightField: byId("heightField"),
    kernelSizeSection: byId("kernelSizeSection"),
    dimensionSeparator: byId("dimensionSeparator"),
    convolutionWidth: byId("convolutionKernelWidth"),
    convolutionHeight: byId("convolutionKernelHeight"),
    kernelDialogDimensionError: byId("kernelDialogDimensionError"),

    border: byId("borderType"),
    borderValue: byId("borderValue"),
    borderValueField: byId("borderValueField"),
    borderDemo: byId("borderDemo"),
    sigmaX: byId("sigmaX"),
    sigmaY: byId("sigmaY"),
    linkSigma: byId("linkSigma"),
    gaussian: byId("gaussianControls"),
    convolution: byId("convolutionControls"),

    parameterPanel: byId("parameterPanel"),
    parameterTitle: byId("parameterTitle"),
    parameterDescription: byId("parameterDescription"),
    grid: byId("kernelGrid"),
    sum: byId("kernelSum"),
    inlineSum: byId("kernelInlineSum"),
    kernelShape: byId("kernelShape"),
    kernelDialog: byId("kernelDialog"),
    dimensionError: byId("dimensionError"),
    kernelError: byId("kernelError"),

    originalDisplayMin: byId("originalDisplayMin"),
    originalDisplayMax: byId("originalDisplayMax"),
    originalAutoRange: byId("originalAutoRange"),
    originalDisplayRangeError: byId("originalDisplayRangeError"),
    resultDisplayMin: byId("resultDisplayMin"),
    resultDisplayMax: byId("resultDisplayMax"),
    resultAutoRange: byId("resultAutoRange"),
    resultDisplayRangeError: byId("resultDisplayRangeError"),

    hint: byId("kernelHint"),
    processing: byId("processing"),
    timing: byId("timing"),
  };
}
