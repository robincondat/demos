export function downloadCanvas(
  canvas,
  filename,
  { document: doc = document, urls = URL, defer = setTimeout } = {},
) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(false);
          return;
        }
        try {
          const link = doc.createElement("a"),
            url = urls.createObjectURL(blob);
          try {
            link.href = url;
            link.download = filename;
            link.click();
          } finally {
            defer(() => urls.revokeObjectURL(url), 1000);
          }
          resolve(true);
        } catch (error) {
          reject(error);
        }
      }, "image/png");
    } catch (error) {
      reject(error);
    }
  });
}

// The platform supplies the pixel inspection: RGB, binary and color spaces differ.
export function bindImageCursor({ stages, viewer, enabled = () => true, onPoint, clear }) {
  const remove = [];
  for (const stage of stages) {
    const move = (event) => {
      const point = enabled(stage)
        ? (typeof viewer === "function" ? viewer(stage) : viewer).toImagePoint(
            stage,
            event.clientX,
            event.clientY,
          )
        : null;
      if (point) onPoint(point, stage);
      else clear();
    };
    for (const [name, callback] of [
      ["pointermove", move],
      ["pointerleave", clear],
      ["pointercancel", clear],
    ]) {
      stage.addEventListener(name, callback);
      remove.push(() => stage.removeEventListener(name, callback));
    }
  }
  return () => remove.forEach((fn) => fn());
}

export function renderBorderPreview({ preview, valueField, border, value = 0 }) {
  const examples = {
    neutral: ["∅ ∅", "∅ ∅"],
    constant: [String(value) + " " + value, String(value) + " " + value],
    replicate: ["a a", "d d"],
    reflect: ["b a", "d c"],
    reflect101: ["c b", "c b"],
  };
  const [left, right] = examples[border];
  const doc = preview.ownerDocument,
    before = doc.createElement("em"),
    after = doc.createElement("em");
  before.textContent = left;
  after.textContent = right;
  preview.replaceChildren(before, " │ a b c d │ ", after);
  preview.setAttribute(
    "aria-label",
    border === "neutral"
      ? "Bord neutre : blanc pour l’érosion, noir pour la dilatation"
      : "Aperçu du prolongement",
  );
  valueField.hidden = border !== "constant";
}
