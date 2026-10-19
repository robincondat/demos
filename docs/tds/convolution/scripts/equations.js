// L'arbre transmis au moteur Python est limité aux opérations autorisées.
// Math.js sert à analyser et composer le LaTeX, jamais à exécuter du code.
export const FUNCTIONS = {
  sin: [1, 1], cos: [1, 1], tan: [1, 1], asin: [1, 1], acos: [1, 1], atan: [1, 1],
  sinh: [1, 1], cosh: [1, 1], tanh: [1, 1], exp: [1, 1], log: [1, 2], ln: [1, 1],
  log10: [1, 1], sqrt: [1, 1], abs: [1, 1], sign: [1, 1], floor: [1, 1], ceil: [1, 1],
  sinc: [1, 1], dirac: [1, 1], rect: [1, 3], porte: [1, 3], step: [1, 1], echelon: [1, 1], u: [1, 1],
  min: [2, 32], max: [2, 32], clip: [3, 3], mod: [2, 2],
};
export const functionName = name => name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
export const referenceName = signal => signal.name?.trim() || (signal.definition === "wav" ? signal.wavName.replace(/\.wav$/i, "") : signal.code);
export function referenceText(signal) {
  const name = referenceName(signal);
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(name) && !Object.hasOwn(FUNCTIONS, functionName(name)) && !["t", "pi", "e", "and", "or", "not", "et", "ou", "non"].includes(name)
    ? name : `\`${name.replaceAll("\\", "\\\\").replaceAll("`", "\\`")}\``;
}

const nameTokens = /`(?:\\.|[^`\\])*`|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[\p{L}_][\p{L}\p{N}_]*/gu;
const tokenName = token => token.startsWith("`") ? token.slice(1, -1).replace(/\\(.)/gs, "$1") : token;

export function renameSignal(signals, source, newName) {
  const oldName = referenceName(source), oldText = referenceText(source), next = newName.trim();
  if (!next) throw new Error("Le nom du signal ne peut pas être vide.");
  if (signals.some(signal => signal.id !== source.id && referenceName(signal) === next)) throw new Error("Ce nom est déjà utilisé par un autre signal.");
  if (signals.slice(signals.indexOf(source) + 1).some(signal => Object.hasOwn(signal.variables || {}, next))) throw new Error("Ce nom est déjà utilisé par un paramètre d’un signal suivant.");
  source.name = next;
  const rewrite = text => typeof text === "string" ? text.replace(nameTokens, token => tokenName(token) === oldName && (token.startsWith("`") || oldText === oldName) ? referenceText(source) : token) : text;
  function updateTree(tree) {
    if (!tree || typeof tree !== "object") return;
    if (tree.kind === "reference" && tree.id === source.id) tree.name = next;
    for (const value of Object.values(tree)) {
      if (Array.isArray(value)) value.forEach(updateTree); else if (value && typeof value === "object") updateTree(value);
    }
  }
  if (next !== oldName) signals.slice(signals.indexOf(source) + 1).forEach(signal => {
    if (signal.equationMode !== "cases") signal.expression = rewrite(signal.expression);
    signal.equationSingleExpression = rewrite(signal.equationSingleExpression);
    signal.equationOtherwise = rewrite(signal.equationOtherwise);
    signal.equationCases?.forEach(row => { row.expression = rewrite(row.expression); row.condition = rewrite(row.condition); });
    updateTree(signal.equationTree);
  });
}

export function parseEquation(text, previous = [], parser = globalThis.math, condition = false) {
  if (!parser?.parse) throw new Error("L’éditeur mathématique est indisponible. Rechargez la page après avoir vérifié la connexion.");
  if (text.length > 2000) throw new Error("L’équation est trop longue (maximum 2 000 caractères).");
  // Math.js interprète parfois % comme un pourcentage (ex. t % -1).
  // Dans cet éditeur, % désigne toujours l'opérateur modulo binaire.
  let normalized = text.trim();
  if (!normalized) throw new Error("Saisissez une équation en fonction de t.");
  const namedReferences = new Map();
  normalized = normalized.replace(nameTokens, (token, offset, input) => {
    const name = tokenName(token), quoted = token.startsWith("`");
    if (!quoted && name.startsWith("__signal_ref_")) throw new Error("Ce nom est réservé au moteur de calcul.");
    const signal = previous.find(signal => referenceName(signal) === name && (quoted || referenceText(signal) === name));
    if (signal) {
      const key = `__signal_ref_${namedReferences.size}__`; namedReferences.set(key, signal); return key;
    }
    if (quoted) throw new Error(`Signal précédent inconnu : ${name}`);
    const canonical = functionName(name);
    if (Object.hasOwn(FUNCTIONS, canonical) && /^\s*\(/.test(input.slice(offset + token.length))) return canonical;
    return token;
  });
  normalized = normalized.replaceAll("π", "pi").replaceAll("−", "-").replaceAll("×", "*").replaceAll("÷", "/").replaceAll("**", "^").replaceAll("%", " mod ");
  if (condition) normalized = normalized.replaceAll("≤", "<=").replaceAll("≥", ">=").replaceAll("≠", "!=").replaceAll("&&", " and ").replaceAll("||", " or ").replace(/\bet\b/g, "and").replace(/\bou\b/g, "or").replace(/\bnon\b/g, "not");
  let root;
  try { root = parser.parse(normalized); }
  catch { throw new Error("Équation invalide : vérifiez les parenthèses et les opérateurs."); }
  const variables = new Set(), references = new Set();
  let count = 0;
  function serialize(node, depth = 0) {
    if (++count > 256 || depth > 48) throw new Error("L’équation est trop complexe.");
    if (node.isParenthesisNode) return serialize(node.content, depth + 1);
    if (condition && node.isConstantNode && typeof node.value === "boolean") return { kind: "boolean", value: node.value };
    if (condition && node.isRelationalNode) {
      const operators = { smaller: "<", smallerEq: "<=", larger: ">", largerEq: ">=", equal: "==", unequal: "!=" };
      if (node.conditionals.some(op => !operators[op])) throw new Error("Comparaison non prise en charge.");
      return { kind: "relation", ops: node.conditionals.map(op => operators[op]), args: node.params.map(arg => serialize(arg, depth + 1)) };
    }
    if (condition && node.isOperatorNode && ["<", "<=", ">", ">=", "==", "!=", "and", "or", "not"].includes(node.op)) {
      return { kind: "condition", op: node.op, args: node.args.map(arg => serialize(arg, depth + 1)) };
    }
    if (node.isConstantNode && typeof node.value === "number" && Number.isFinite(node.value)) return { kind: "number", value: node.value };
    if (node.isSymbolNode) {
      const name = node.name;
      if (namedReferences.has(name)) {
        const signal = namedReferences.get(name);
        references.add(signal.id);
        return { kind: "reference", id: signal.id, name: referenceName(signal) };
      }
      if (["t", "pi", "e"].includes(name)) return { kind: "symbol", name };
      if (/^[XS]\d+$/.test(name)) throw new Error(`Signal précédent inconnu : ${name}. Utilisez son nom actuel.`);
      if (Object.hasOwn(FUNCTIONS, functionName(name))) throw new Error(`${name} est une fonction : utilisez ${name}(…).`);
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) throw new Error(`Nom de variable invalide : ${name}`);
      variables.add(name);
      return { kind: "variable", name };
    }
    if (node.isOperatorNode && ["+", "-", "*", "/", "^", "%", "mod"].includes(node.op)) {
      if (node.args.length === 1 && !["+", "-"].includes(node.op)) throw new Error("Opérateur non pris en charge.");
      if (![1, 2].includes(node.args.length)) throw new Error("Opérateur non pris en charge.");
      return { kind: "operator", op: node.op === "mod" ? "%" : node.op, args: node.args.map(arg => serialize(arg, depth + 1)) };
    }
    if (node.isFunctionNode && node.fn.isSymbolNode) {
      if (namedReferences.has(node.fn.name)) {
        const signal = namedReferences.get(node.fn.name), name = referenceName(signal);
        if (node.args.length !== 1) throw new Error(`${name} attend un seul argument temporel, par exemple ${name}(t-t0).`);
        references.add(signal.id);
        return { kind: "reference", id: signal.id, name: referenceName(signal), time: serialize(node.args[0], depth + 1) };
      }
      const name = node.fn.name, arity = FUNCTIONS[name];
      if (!arity) throw new Error(`Fonction inconnue : ${name}`);
      if (node.args.length < arity[0] || node.args.length > arity[1] || (["rect", "porte"].includes(name) && node.args.length === 2)) throw new Error(`Nombre d’arguments invalide pour ${name}.`);
      return { kind: "function", name, args: node.args.map(arg => serialize(arg, depth + 1)) };
    }
    throw new Error("Utilisez des nombres, des fonctions et les opérateurs +, −, *, /, ^ et %.");
  }
  const tree = serialize(root);
  const symbolTex = name => {
    const indexed = name.match(/^([a-zA-Z]+)(\d+)$/);
    const escaped = name.replace(/[\\{}$&#%_^~]/g, character => ({"\\":"\\backslash ","{":"\\{","}":"\\}","$":"\\$","&":"\\&","#":"\\#","%":"\\%","_":"\\_","^":"\\textasciicircum{}","~":"\\textasciitilde{}"})[character]);
    return indexed ? `{${indexed[1]}_{${indexed[2]}}}` : `\\text{${escaped}}`;
  };
  const latex = root.toTex({ parenthesis: "auto", implicit: "hide", handler: function coloredTex(node) {
    if (node.isFunctionNode && namedReferences.has(node.fn.name)) {
      return `${symbolTex(referenceName(namedReferences.get(node.fn.name)))}\\left(${node.args[0].toTex({ parenthesis: "auto", implicit: "hide", handler: coloredTex })}\\right)`;
    }
    if (node.isSymbolNode) {
      if (namedReferences.has(node.name)) return symbolTex(referenceName(namedReferences.get(node.name)));
      if (variables.has(node.name)) return symbolTex(node.name);
    }
  } });
  return { tree, latex, variables: [...variables], references: [...references], expression: text.trim() };
}

export function parsePiecewise(cases, otherwise = "0", previous = [], parser = globalThis.math) {
  if (!cases.length || cases.length > 32) throw new Error("Définissez entre 1 et 32 cas.");
  const variables = new Set(), references = new Set();
  const collect = parsed => {
    parsed.variables.forEach(name => variables.add(name)); parsed.references.forEach(id => references.add(id));
    return parsed;
  };
  const rows = cases.map((row, index) => {
    try {
      const value = collect(parseEquation(row.expression, previous, parser));
      const condition = collect(parseEquation(row.condition, previous, parser, true));
      return { value, condition };
    } catch (error) { throw new Error(`Cas ${index + 1} : ${error.message}`); }
  });
  let fallback;
  try { fallback = collect(parseEquation(otherwise, previous, parser)); }
  catch (error) { throw new Error(`Sinon : ${error.message}`); }
  return {
    tree: { kind: "cases", rows: rows.map(({ value, condition }) => ({ value: value.tree, condition: condition.tree })), otherwise: fallback.tree },
    latex: `\\begin{cases}${rows.map(({ value, condition }) => `${value.latex} & \\text{si } ${condition.latex}`).join("\\\\")}\\\\${fallback.latex} & \\text{sinon}\\end{cases}`,
    variables: [...variables], references: [...references], expression: "Définition par cas",
  };
}

export function parsePeriod(text, parser = globalThis.math) {
  const parsed = parseEquation(text, [], parser);
  function check(node) {
    if (node.kind === "symbol" && node.name === "t") throw new Error("La période ne peut pas dépendre de t.");
    if (node.kind === "function" && ["dirac", "porte", "rect", "step", "echelon", "u"].includes(node.name)) throw new Error("La période doit être une expression scalaire.");
    (node.args || []).forEach(check);
  }
  check(parsed.tree);
  if (!parsed.variables.length) {
    function scalar(node) {
      if (node.kind === "number") return node.value;
      if (node.kind === "symbol") return node.name === "pi" ? Math.PI : Math.E;
      const args = (node.args || []).map(scalar);
      if (node.kind === "operator") {
        if (args.length === 1) return node.op === "-" ? -args[0] : args[0];
        const [a,b] = args;
        return { "+": () => a+b, "-": () => a-b, "*": () => a*b, "/": () => a/b, "^": () => a**b, "%": () => a-Math.floor(a/b)*b }[node.op]();
      }
      if (node.name === "sinc") return args[0] === 0 ? 1 : Math.sin(Math.PI*args[0])/(Math.PI*args[0]);
      if (node.name === "log" && args.length === 2) return Math.log(args[0])/Math.log(args[1]);
      if (node.name === "mod") return args[0]-Math.floor(args[0]/args[1])*args[1];
      if (node.name === "clip") {
        if (args[1] > args[2]) throw new Error("La borne basse de clip doit être inférieure ou égale à la borne haute.");
        return Math.min(Math.max(args[0],args[1]),args[2]);
      }
      return Math[node.name === "ln" ? "log" : node.name](...args);
    }
    const value = scalar(parsed.tree);
    if (!Number.isFinite(value) || value <= 0) throw new Error("La période doit être strictement positive et finie.");
  }
  return parsed;
}

export function renderFormula(element, latex) {
  // Neutralise aussi les couleurs des formules déjà enregistrées en mémoire.
  latex = latex.replace(/\\textcolor\{#[0-9a-f]{6}\}/gi, "");
  if (globalThis.katex?.render) globalThis.katex.render(latex, element, { throwOnError: false, displayMode: true, trust: false, strict: "ignore" });
  else element.textContent = latex;
}
