import { drawFileToCanvas } from "./image-loaders.js";

// Independent task lanes keep render requests from cancelling an asynchronous
// conversion. The task checks current() before committing after an await.
export function createLatestTaskController({
  delay = 70,
  frame = false,
  onError = () => {},
  onBusy = () => {},
} = {}) {
  let revision = 0,
    timer = null,
    animation = null,
    settleFrame = null,
    busy = false;
  function setBusy(value) {
    if (value !== busy) {
      busy = value;
      onBusy(value);
    }
  }
  function invalidate() {
    revision++;
    clearTimeout(timer);
    timer = null;
    if (animation !== null) cancelAnimationFrame(animation);
    animation = null;
    settleFrame?.();
    settleFrame = null;
    setBusy(false);
  }
  async function execute(task, version) {
    const current = () => version === revision;
    if (!current()) return;
    setBusy(true);
    try {
      return await task({ current });
    } catch (error) {
      if (current()) onError(error);
    } finally {
      if (current()) setBusy(false);
    }
  }
  function run(task) {
    invalidate();
    const version = revision;
    if (!frame) return execute(task, version);
    setBusy(true);
    return new Promise((resolve) => {
      settleFrame = resolve;
      animation = requestAnimationFrame(() => {
        animation = null;
        settleFrame = null;
        execute(task, version).then(resolve);
      });
    });
  }
  return {
    run,
    invalidate,
    schedule(task) {
      invalidate();
      timer = setTimeout(() => {
        timer = null;
        run(task);
      }, delay);
    },
  };
}

export function copyImageCanvas(target, source) {
  target.width = source.width;
  target.height = source.height;
  target.getContext("2d").drawImage(source, 0, 0);
}

export function createImageApplication({
  onImage,
  onLoadStart = () => {},
  onLoadError = () => {},
  onError = () => {},
  onBusy = () => {},
  onLoadEnd = () => {},
  delay = 70,
  frame = false,
  decode = drawFileToCanvas,
  createCanvas = () => document.createElement("canvas"),
}) {
  const states = { compute: false, render: false, load: false };
  const busy = (lane) => (value) => {
    states[lane] = value;
    onBusy(Object.values(states).some(Boolean));
  };
  const compute = createLatestTaskController({ delay, frame, onError, onBusy: busy("compute") });
  const render = createLatestTaskController({
    delay: 0,
    frame: true,
    onError,
    onBusy: busy("render"),
  });
  const loading = createLatestTaskController({ onError: onLoadError, onBusy: busy("load") });
  return {
    run: compute.run,
    schedule: compute.schedule,
    render: (task) => render.run(task),
    invalidate() {
      compute.invalidate();
      render.invalidate();
    },
    dispose() {
      compute.invalidate();
      render.invalidate();
      loading.invalidate();
    },
    load(file) {
      compute.invalidate();
      render.invalidate();
      return loading.run(async (context) => {
        onLoadStart(file);
        try {
          const canvas = createCanvas();
          const decoded = await decode(file, canvas);
          if (!context.current()) return;
          await onImage({ file, canvas, decoded, ...context });
        } finally {
          if (context.current()) onLoadEnd();
        }
      });
    },
  };
}
