export const OPENCV_SPACES = { lab: 'COLOR_RGB2Lab', hls: 'COLOR_RGB2HLS', xyz: 'COLOR_RGB2XYZ' };
let runtimePromise;

export function loadColorRuntime() {
  // Certains builds Emscripten sont des objets "thenables" : ne pas les
  // résoudre directement, au risque d'une assimilation récursive infinie.
  if (globalThis.cv?.Mat) return Promise.resolve({ runtime: globalThis.cv });
  if (!runtimePromise) runtimePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script'); let done = false;
    const fail = () => { if (done) return; done = true; clearTimeout(timeout); script.remove(); runtimePromise = null; reject(Error('Le moteur de conversion ne peut pas être chargé. Vérifiez votre connexion et sélectionnez de nouveau cet espace.')); };
    const ready = value => { if (!done && value?.Mat) { done = true; clearTimeout(timeout); resolve({ runtime: value }); } };
    const check = () => { const runtime = globalThis.cv; if (runtime?.then) runtime.then(ready, fail); else ready(runtime); };
    const timeout = setTimeout(fail, 45000);
    globalThis.Module = { ...(globalThis.Module || {}), onRuntimeInitialized: check };
    script.src = 'https://docs.opencv.org/4.13.0/opencv.js'; script.async = true; script.onload = check; script.onerror = fail;
    document.head.append(script);
  });
  return runtimePromise;
}

export function convertWithOpenCV(image, space, runtime) {
  const name = OPENCV_SPACES[space];
  if (!name || runtime[name] === undefined) throw Error('Conversion non disponible.');
  let rgba, rgb, result;
  try {
    rgba = runtime.matFromArray(image.height, image.width, runtime.CV_8UC4, image.data);
    rgb = new runtime.Mat(); result = new runtime.Mat();
    runtime.cvtColor(rgba, rgb, runtime.COLOR_RGBA2RGB);
    runtime.cvtColor(rgb, result, runtime[name]);
    // Copier les données avant de libérer la mémoire du moteur.
    return { data: new Uint8Array(result.data), channels: 3, space };
  } finally { rgba?.delete(); rgb?.delete(); result?.delete(); }
}
