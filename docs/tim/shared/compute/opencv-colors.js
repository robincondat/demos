export const OPENCV_SPACES = { lab: "COLOR_RGB2Lab", hls: "COLOR_RGB2HLS", xyz: "COLOR_RGB2XYZ" };

export function convertWithOpenCV(image, space, runtime) {
  const name = OPENCV_SPACES[space];
  if (!name || runtime[name] === undefined) throw Error("Conversion non disponible.");
  let rgba, rgb, result;
  try {
    rgba = runtime.matFromArray(image.height, image.width, runtime.CV_8UC4, image.data);
    rgb = new runtime.Mat();
    result = new runtime.Mat();
    runtime.cvtColor(rgba, rgb, runtime.COLOR_RGBA2RGB);
    runtime.cvtColor(rgb, result, runtime[name]);
    // Copier les données avant de libérer la mémoire du moteur.
    return { data: new Uint8Array(result.data), channels: 3, space };
  } finally {
    rgba?.delete();
    rgb?.delete();
    result?.delete();
  }
}
