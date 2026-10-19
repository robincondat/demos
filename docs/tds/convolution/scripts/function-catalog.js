const argument = (name, description) => ({ name, description });
const variant = (signature, insert, args) => ({ signature, insert, args });
const unary = (name, title, description, parameter = "Valeur réelle ou expression à évaluer.", category = "Mathématiques") => ({
  name, title, category, description, aliases: [], variants: [variant(`${name}(x)`, `${name}(t)`, [argument("x", parameter)])], example: `${name}(t)`,
});

export const CATALOG = [
  ...[
    ["sin", "Sinus", "Sinus d’un angle en radians."], ["cos", "Cosinus", "Cosinus d’un angle en radians."], ["tan", "Tangente", "Tangente d’un angle en radians ; non définie en π/2 + kπ."],
    ["asin", "Arc sinus", "Renvoie un angle en radians ; l’argument doit être dans [−1, 1]."], ["acos", "Arc cosinus", "Renvoie un angle en radians ; l’argument doit être dans [−1, 1]."], ["atan", "Arc tangente", "Renvoie l’arc tangente en radians."],
    ["sinh", "Sinus hyperbolique", "Sinus hyperbolique."], ["cosh", "Cosinus hyperbolique", "Cosinus hyperbolique."], ["tanh", "Tangente hyperbolique", "Tangente hyperbolique, comprise entre −1 et 1."],
  ].map(([name, title, description]) => unary(name, title, description, name.length === 3 && !name.startsWith("a") ? "Angle ou expression en radians, par exemple 2*pi*f0*t." : "Valeur réelle ou expression.", "Trigonométrie")),
  unary("exp", "Exponentielle", "Calcule e à la puissance x."),
  { name: "log", title: "Logarithme", category: "Mathématiques", aliases: ["ln"], description: "Logarithme naturel par défaut, ou dans une base choisie.", example: "log(t+1)", variants: [
    variant("log(x)", "log(t)", [argument("x", "Valeur strictement positive. log et ln utilisent la base e.")]),
    variant("log(x, base)", "log(t, 10)", [argument("x", "Valeur strictement positive."), argument("base", "Base strictement positive et différente de 1.")]),
  ] },
  unary("log10", "Logarithme décimal", "Logarithme en base 10.", "Valeur strictement positive."),
  unary("sqrt", "Racine carrée", "Racine carrée réelle.", "Valeur positive ou nulle."),
  unary("abs", "Valeur absolue", "Renvoie la valeur absolue à chaque instant."),
  unary("sign", "Signe", "Renvoie −1 si x < 0, 0 si x = 0, et 1 si x > 0."),
  unary("floor", "Partie entière inférieure", "Plus grand entier inférieur ou égal à x."),
  unary("ceil", "Partie entière supérieure", "Plus petit entier supérieur ou égal à x."),
  ...["min", "max"].map(name => ({ name, title: name === "min" ? "Minimum" : "Maximum", category: "Mathématiques", aliases: [],
    description: `${name === "min" ? "Minimum" : "Maximum"} à chaque instant entre plusieurs expressions ; de 2 à 32 arguments.`, example: `${name}(sin(t), 0)`,
    variants: [variant(`${name}(a, b, …)`, `${name}(t, 0)`, [argument("a", "Première valeur, expression ou signal."), argument("b", "Deuxième valeur, expression ou signal."), argument("…", "Autres valeurs facultatives, comparées au même instant.")])] })),
  { name: "clip", title: "Écrêtage", category: "Mathématiques", aliases: [], description: "Limite les valeurs du signal entre deux bornes incluses.", example: "clip(2*sin(t), -1, 1)",
    variants: [variant("clip(signal, bas, haut)", "clip(t, -1, 1)", [argument("signal", "Valeur ou expression à écrêter."), argument("bas", "Valeur minimale autorisée."), argument("haut", "Valeur maximale autorisée, supérieure ou égale à bas.")])] },
  { name: "porte", title: "Porte", category: "Signaux usuels", aliases: ["rect"], description: "Vaut 1 à l’intérieur d’un intervalle, et 0 ailleurs. La borne droite est exclue.", example: "porte(t, 0, 0.5)", variants: [
    variant("porte(x)", "porte(t)", [argument("x", "Expression comprise dans [−0.5, 0.5[ lorsque la porte vaut 1. Exemple : (t-t0)/largeur.")]),
    variant("porte(x, a, b)", "porte(t, 0, 1)", [argument("x", "Temps ou expression à tester."), argument("a", "Borne gauche incluse."), argument("b", "Borne droite exclue, strictement supérieure à a.")]),
  ] },
  { ...unary("echelon", "Échelon", "Vaut 0 pour x < 0 et 1 pour x ≥ 0.", "Expression dont le passage par 0 déclenche l’échelon. Exemple : t-t0.", "Signaux usuels"), aliases: ["step", "u"], example: "echelon(t-t0)" },
  { ...unary("dirac", "Impulsion unitaire", "Impulsion échantillonnée de hauteur 1 autour de zéro, indépendante de la fréquence d’échantillonnage.", "Expression proche de zéro : −Δt/2 ≤ x < Δt/2, avec Δt = 1/fe. Exemple : t-t0.", "Signaux usuels"), example: "dirac(t-t0)" },
  { ...unary("sinc", "Sinus cardinal", "sinc(x) = sin(pi*x)/(pi*x), avec sinc(0) = 1.", "Argument sans dimension ; par exemple f0*t.", "Signaux usuels"), example: "sinc(f0*t)" },
  { name: "mod", title: "Modulo", category: "Opérateurs", aliases: ["%"], description: "Reste de la division. Si T > 0, t % T appartient à [0, T[, même si t est négatif.", example: "t % T", variants: [variant("mod(a, b)", "mod(t, T)", [argument("a", "Valeur ou expression à ramener dans un intervalle."), argument("b", "Diviseur non nul ; souvent une période T positive.")]), variant("a % b", "t % T", [argument("a", "Valeur à gauche de %."), argument("b", "Diviseur non nul à droite de %.")])] },
  ...[
    ["pi", "Nombre π", "Constante π ≈ 3.141592653589793. Également saisissable avec le caractère π.", "2*pi*f0*t"],
    ["e", "Nombre e", "Constante e ≈ 2.718281828459045, base du logarithme naturel.", "e^(-t)"],
    ["t", "Temps", "Temps en secondes. Avec la répétition périodique, t est ramené dans l’intervalle du motif choisi.", "cos(2*pi*f0*t)"],
    ["f0", "Paramètre libre", "Un nom libre crée un paramètre réglable dans la fiche du signal. Par exemple f0 pour une fréquence, A pour une amplitude ou T pour la période.", "A*cos(2*pi*f0*t)"],
  ].map(([name,title,description,example]) => ({ name,title,category:"Constantes et variables",aliases:name === "pi" ? ["π"] : [],description,example,variants:[variant(name,name,[])] })),
  { name: "power", title: "Puissance", category: "Opérateurs", aliases: ["^", "**"], description: "Élève une expression à une puissance ; ^ et ** sont acceptés.", example: "exp(-t^2)", variants:[variant("x ^ n", "t^2", [argument("x","Expression de base."),argument("n","Exposant.")])] },
  { name: "conditions", title: "Conditions", category: "Opérateurs", aliases: ["et", "ou", "non", "and", "or", "not", "<", "<=", ">", ">=", "==", "!="], description: "Dans une définition par cas : comparaisons, conditions chaînées et logique et/ou/non. La première condition satisfaite s’applique.", example: "0 <= t < T/2", variants:[variant("a <= t < b", "0 <= t < T", [argument("a","Borne gauche de cet exemple."),argument("b","Borne droite de cet exemple.")])] },
];

const normalize = text => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
export function catalogEntry(name) {
  const key = normalize(name);
  return CATALOG.find(entry => [entry.name, ...entry.aliases].some(alias => normalize(alias) === key));
}

// Analyse légère et tolérante : l'aide doit fonctionner avant que la saisie
// ne soit une expression complète, sans exécuter la formule.
export function contextualCall(text, caret) {
  const stack = []; let quoted = false, escaped = false;
  for (let index = 0; index < caret; index++) {
    const char = text[index];
    if (escaped) { escaped = false; continue; }
    if (quoted && char === "\\") { escaped = true; continue; }
    if (char === "`") { quoted = !quoted; continue; }
    if (quoted) continue;
    if (char === "(") {
      const match = text.slice(0,index).match(/(`(?:\\.|[^`\\])*`|[\p{L}_][\p{L}\p{N}_]*)\s*$/u);
      stack.push({ name: match?.[1] || "", argument: 0, start: index });
    } else if (char === ")") stack.pop();
    else if (char === "," && stack.length) stack[stack.length-1].argument++;
  }
  for (let i=stack.length-1; i>=0; i--) if (stack[i].name) {
    const call = stack[i]; let depth=1, count=1, quote=false, escape=false;
    for(let j=call.start+1;j<text.length;j++) {
      const char=text[j];
      if(escape){escape=false;continue;} if(quote&&char==='\\'){escape=true;continue;} if(char==='`'){quote=!quote;continue;} if(quote)continue;
      if(char==='(')depth++;else if(char===')'){if(--depth===0)break;}else if(char===','&&depth===1)count++;
    }
    return {...call, count};
  }
  const before=text.slice(0,caret),after=text.slice(caret);
  const left=before.match(/[\p{L}_][\p{L}\p{N}_]*$/u)?.[0]||"",right=after.match(/^[\p{L}\p{N}_]*/u)?.[0]||"";
  if(left||right)return {name:left+right,argument:null,count:0};
  if(before.endsWith('%')||after.startsWith('%'))return {name:'%',argument:null,count:0};
  return null;
}
