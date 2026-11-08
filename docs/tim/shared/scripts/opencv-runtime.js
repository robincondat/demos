export const OPENCV_VERSION = "4.13.0";
export const OPENCV_URL = `https://docs.opencv.org/${OPENCV_VERSION}/opencv.js`;

export function createOpenCVLoader({
  scope = globalThis,
  timeoutMs = 45000,
  url = OPENCV_URL,
} = {}) {
  let pending;
  return function load() {
    // Emscripten can resolve its thenable to itself. Always wrap the runtime.
    if (scope.cv?.Mat) return Promise.resolve({ runtime: scope.cv });
    if (pending) return pending;
    const attempt = new Promise((resolve, reject) => {
      let done = false,
        script,
        observed;
      const previous = scope.Module?.onRuntimeInitialized;
      const timer = setTimeout(() => fail(), timeoutMs);
      function cleanup() {
        clearTimeout(timer);
        if (scope.Module?.onRuntimeInitialized === initialized)
          scope.Module.onRuntimeInitialized = previous;
      }
      function fail() {
        if (done) return;
        done = true;
        cleanup();
        script?.remove();
        if (observed && scope.cv === observed && !scope.cv?.Mat) scope.cv = undefined;
        reject(
          Error(
            "OpenCV n’a pas pu être chargé. Vérifiez la connexion Internet puis réessayez ou rechargez la page.",
          ),
        );
      }
      function ready(runtime) {
        if (done || !runtime?.Mat) return;
        done = true;
        cleanup();
        scope.cv = runtime;
        resolve({ runtime });
      }
      function check() {
        const runtime = scope.cv;
        if (runtime?.Mat) ready(runtime);
        else if (runtime?.then && runtime !== observed) {
          observed = runtime;
          runtime.then(ready, fail);
        }
      }
      function initialized() {
        check();
        previous?.();
      }
      scope.Module = { ...(scope.Module || {}), onRuntimeInitialized: initialized };
      try {
        check();
        if (!done && !observed) {
          script = scope.document.createElement("script");
          script.src = url;
          script.async = true;
          script.onload = check;
          script.onerror = fail;
          scope.document.head.append(script);
        }
      } catch {
        fail();
      }
    });
    pending = attempt.catch((error) => {
      pending = null;
      throw error;
    });
    return pending;
  };
}

export const loadOpenCV = createOpenCVLoader();
