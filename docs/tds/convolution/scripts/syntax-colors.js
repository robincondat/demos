import { FUNCTIONS, functionName, referenceName, referenceText } from "./equations.js?v=20261019-help1";
import { palette } from "./signals.js?v=20261019-help1";

export function expressionTokens(text, previous = []) {
  const tokens = [];
  const pattern = /`(?:\\.|[^`\\])*`|\s+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[\p{L}_][\p{L}\p{N}_]*|<=|>=|==|!=|&&|\|\||\*\*|./gsu;
  for (const match of text.matchAll(pattern)) {
    const value = match[0], quoted = value.startsWith("`"), name = quoted ? value.slice(1,-1).replace(/\\(.)/gs,"$1") : value;
    const index = previous.findIndex(signal => referenceName(signal) === name && (quoted || referenceText(signal) === name));
    let type = "operator", color = null;
    if (/^\s+$/.test(value)) type = "space";
    else if (/^(?:\d|\.\d)/.test(value)) type = "number";
    else if (index >= 0) {
      type = "reference"; color = palette[index % palette.length];
    } else if (quoted || /^[XS]\d+$/.test(value)) {
      type = "unknown";
    } else if (["t", "pi", "π", "e"].includes(value)) type = "constant";
    else if (["and", "or", "not", "et", "ou", "non", "mod"].includes(value)) type = "operator";
    else if (Object.hasOwn(FUNCTIONS, functionName(value))) type = "function";
    else if (/^[\p{L}_]/u.test(value)) type = /^\s*\(/.test(text.slice(match.index + value.length)) ? "unknown" : "parameter";
    tokens.push({ text: value, type, color });
  }
  return tokens;
}

// Le champ natif conserve le clavier, la sélection et le presse-papiers.
// Une couche non interactive superposée n'en affiche que les couleurs.
export function colorizeInput(input, previous) {
  const wrapper = document.createElement("div"), layer = document.createElement("pre");
  wrapper.className = `math-input${input.tagName === "TEXTAREA" ? " multiline" : ""}`;
  layer.className = "syntax-layer"; layer.setAttribute("aria-hidden", "true");
  input.replaceWith(wrapper); wrapper.append(layer, input);
  function syncScroll() { layer.scrollTop = input.scrollTop; layer.scrollLeft = input.scrollLeft; }
  function syncGeometry() {
    // clientWidth exclut la barre de défilement native du textarea : la
    // coloration doit utiliser la même largeur pour revenir à la ligne.
    if (input.clientWidth > 0) layer.style.width = `${input.clientWidth}px`;
    if (input.clientHeight > 0) layer.style.height = `${input.clientHeight}px`;
    syncScroll();
  }
  function refresh() {
    layer.replaceChildren(...expressionTokens(input.value, previous()).map(token => {
      if (token.type === "space") return document.createTextNode(token.text);
      const span = document.createElement("span"); span.className = `syntax-${token.type}`; span.textContent = token.text;
      if (token.color) span.style.color = token.color;
      return span;
    }));
    if (input.value.endsWith("\n")) layer.append(document.createTextNode(" "));
    syncGeometry();
  }
  input.addEventListener("input", refresh); input.addEventListener("scroll", syncScroll);
  const Observer = input.ownerDocument.defaultView.ResizeObserver;
  const observer = Observer ? new Observer(syncGeometry) : null;
  observer?.observe(input);
  refresh();
  return { input, refresh, destroy() { observer?.disconnect(); } };
}
