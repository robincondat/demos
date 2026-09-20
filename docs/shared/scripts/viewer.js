export function createSyncedViewer({
  stages,
  canvases,
  zoomLabel,
  zoomSlider,
  fitButton,
}) {
  const state = {
    width: 0,
    height: 0,
    zoom: 1,
    centerX: 0.5,
    centerY: 0.5,
    drag: null,
  };
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const sliderFromZoom = (zoom) =>
    Math.round((Math.log(zoom / 0.1) / Math.log(400)) * 1000);
  const zoomFromSlider = (value) => 0.1 * Math.pow(400, value / 1000);
  function geometry(stage) {
    const width = stage.clientWidth,
      height = stage.clientHeight,
      padding = 24,
      fit = Math.min(
        (width - padding) / state.width,
        (height - padding) / state.height,
      );
    return { width, height, fit: Math.max(fit, 0.0001) };
  }
  function constrain(stage) {
    if (!state.width) return;
    const { width, height, fit } = geometry(stage),
      scale = fit * state.zoom,
      halfX = width / (2 * scale * state.width),
      halfY = height / (2 * scale * state.height);
    state.centerX = halfX >= 0.5 ? 0.5 : clamp(state.centerX, halfX, 1 - halfX);
    state.centerY = halfY >= 0.5 ? 0.5 : clamp(state.centerY, halfY, 1 - halfY);
  }
  function render() {
    if (!state.width) return;
    stages.forEach((stage, index) => {
      const { width, height, fit } = geometry(stage),
        scale = fit * state.zoom,
        x = width / 2 - state.centerX * state.width * scale,
        y = height / 2 - state.centerY * state.height * scale,
        canvas = canvases[index];
      canvas.style.width = `${state.width}px`;
      canvas.style.height = `${state.height}px`;
      canvas.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
    });
    zoomLabel.textContent = `${Math.round(state.zoom * 100)} %`;
    zoomSlider.value = sliderFromZoom(state.zoom);
    zoomSlider.disabled = false;
    fitButton.disabled = false;
  }
  function setZoom(
    nextZoom,
    stage = stages[0],
    anchorX = stage.clientWidth / 2,
    anchorY = stage.clientHeight / 2,
  ) {
    if (!state.width) return;
    const old = geometry(stage),
      oldScale = old.fit * state.zoom,
      oldX = old.width / 2 - state.centerX * state.width * oldScale,
      oldY = old.height / 2 - state.centerY * state.height * oldScale,
      imageX = (anchorX - oldX) / oldScale,
      imageY = (anchorY - oldY) / oldScale;
    state.zoom = clamp(nextZoom, 0.1, 40);
    const next = geometry(stage),
      nextScale = next.fit * state.zoom;
    state.centerX =
      (imageX - (anchorX - next.width / 2) / nextScale) / state.width;
    state.centerY =
      (imageY - (anchorY - next.height / 2) / nextScale) / state.height;
    constrain(stage);
    render();
  }
  function fit() {
    state.zoom = 1;
    state.centerX = state.centerY = 0.5;
    render();
  }
  stages.forEach((stage) => {
    stage.addEventListener(
      "wheel",
      (event) => {
        if (!state.width) return;
        event.preventDefault();
        const rect = stage.getBoundingClientRect(),
          factor = Math.exp(-event.deltaY * 0.0015);
        setZoom(
          state.zoom * factor,
          stage,
          event.clientX - rect.left,
          event.clientY - rect.top,
        );
      },
      { passive: false },
    );
    stage.addEventListener("pointerdown", (event) => {
      if (!state.width || event.button !== 0) return;
      stage.setPointerCapture(event.pointerId);
      state.drag = { x: event.clientX, y: event.clientY, stage };
      stage.classList.add("dragging");
    });
    stage.addEventListener("pointermove", (event) => {
      if (!state.drag || state.drag.stage !== stage) return;
      const { fit } = geometry(stage),
        scale = fit * state.zoom;
      state.centerX -= (event.clientX - state.drag.x) / (state.width * scale);
      state.centerY -= (event.clientY - state.drag.y) / (state.height * scale);
      state.drag.x = event.clientX;
      state.drag.y = event.clientY;
      constrain(stage);
      render();
    });
    const end = () => {
      state.drag = null;
      stage.classList.remove("dragging");
    };
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);
    stage.addEventListener("dblclick", fit);
  });
  zoomSlider.addEventListener("input", () =>
    setZoom(zoomFromSlider(Number(zoomSlider.value))),
  );
  fitButton.addEventListener("click", fit);
  new ResizeObserver(() => {
    if (state.width) {
      constrain(stages[0]);
      render();
    }
  }).observe(stages[0]);
  return {
    setImageSize(width, height) {
      state.width = width;
      state.height = height;
      fit();
    },
    fit,
    toImagePoint(stage, clientX, clientY) {
      if (!state.width) return null;
      const rect = stage.getBoundingClientRect(),
        { width, height, fit } = geometry(stage),
        scale = fit * state.zoom,
        x = width / 2 - state.centerX * state.width * scale,
        y = height / 2 - state.centerY * state.height * scale,
        imageX = Math.floor((clientX - rect.left - x) / scale),
        imageY = Math.floor((clientY - rect.top - y) / scale);
      if (
        imageX < 0 ||
        imageY < 0 ||
        imageX >= state.width ||
        imageY >= state.height
      )
        return null;
      return { x: imageX, y: imageY };
    },
  };
}
