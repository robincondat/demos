import ast
import numpy as np

PERIODIC_TYPES = {"sine", "cosine", "square", "triangle"}

def _equation(signal, times, previous, sample_period, cache):
    tree = signal.get("equationTree")
    if not tree: return np.zeros(times.size, dtype=np.float64)
    periodic = signal.get("periodic") or {}
    if periodic.get("enabled"):
        if not periodic.get("tree"): raise ValueError("Définissez la période du signal")
        period_signal = dict(signal, periodic=None, equationTree=periodic["tree"])
        period = float(_equation(period_signal, np.array([0.0]), [], sample_period, {})[0])
        if not np.isfinite(period) or period <= 0: raise ValueError("La période doit être strictement positive et finie")
        shift = period / 2 if periodic.get("origin") == "centered" else 0.0
        local = np.remainder(times + shift, period)
        tolerance = min(period * 1e-9, 8 * np.finfo(float).eps * max(period, float(np.max(np.abs(times))) if times.size else period))
        times = np.where(period - local <= tolerance, 0.0, local) - shift
        cache = {}
    variables = signal.get("variables", {})
    unary_functions = {
        "sin": np.sin, "cos": np.cos, "tan": np.tan, "asin": np.arcsin,
        "acos": np.arccos, "atan": np.arctan, "sinh": np.sinh, "cosh": np.cosh,
        "tanh": np.tanh, "exp": np.exp, "ln": np.log, "log10": np.log10,
        "sqrt": np.sqrt, "abs": np.abs, "sign": np.sign, "floor": np.floor,
        "ceil": np.ceil, "sinc": np.sinc,
    }
    count = 0
    def visit(node, depth=0, selected=None):
        nonlocal count
        count += 1
        if count > 17000 or depth > 48: raise ValueError("Équation trop complexe")
        kind = node.get("kind")
        if kind == "boolean": return bool(node["value"])
        if kind == "cases":
            output = np.zeros(times.size, dtype=np.float64)
            remaining = np.ones(times.size, dtype=bool) if selected is None else selected.copy()
            for row in node["rows"]:
                if not np.any(remaining): break
                condition = np.asarray(visit(row["condition"], depth + 1, remaining))
                if not np.all(np.isfinite(condition)): raise ValueError("Une condition produit une valeur non finie")
                matches = remaining.copy()
                matches[remaining] = np.broadcast_to(condition.astype(bool), (np.count_nonzero(remaining),))
                if np.any(matches):
                    output[matches] = visit(row["value"], depth + 1, matches)
                    remaining[matches] = False
            if np.any(remaining): output[remaining] = visit(node["otherwise"], depth + 1, remaining)
            return output if selected is None else output[selected]
        if kind == "condition" and node.get("op") in {"and", "or"}:
            active = np.ones(times.size, dtype=bool) if selected is None else selected.copy()
            output = np.zeros(times.size, dtype=bool)
            output[active] = np.asarray(visit(node["args"][0], depth + 1, active), dtype=bool)
            needed = active & (output if node["op"] == "and" else ~output)
            if np.any(needed): output[needed] = visit(node["args"][1], depth + 1, needed)
            return output if selected is None else output[selected]
        if kind == "number": return float(node["value"])
        if kind == "symbol":
            if node["name"] == "t": return times if selected is None else times[selected]
            if node["name"] == "pi": return np.pi
            if node["name"] == "e": return np.e
            raise ValueError("Constante inconnue")
        if kind == "variable":
            if node["name"] not in variables or variables[node["name"]] is None: raise ValueError(f"Variable non définie : {node['name']}")
            value = float(variables[node["name"]])
            if not np.isfinite(value): raise ValueError(f"Valeur invalide : {node['name']}")
            return value
        if kind == "reference":
            index = next((i for i, item in enumerate(previous) if item.get("id") == node.get("id")), None)
            if index is None: raise ValueError(f"Signal précédent introuvable : {node.get('name', 'X')}")
            item = previous[index]
            if node.get("time") is not None:
                current_times = times if selected is None else times[selected]
                transformed_times = np.broadcast_to(np.asarray(visit(node["time"], depth + 1, selected), dtype=np.float64), current_times.shape)
                if not np.all(np.isfinite(transformed_times)): raise ValueError("L’argument temporel doit être réel et fini")
                # Le cache d'un axe ne peut pas être réutilisé pour un autre.
                return evaluate(item, transformed_times, previous[:index], sample_period, {})
            if selected is not None and not np.all(selected):
                return evaluate(item, times[selected], previous[:index], sample_period, {})
            if item["id"] not in cache:
                cache[item["id"]] = evaluate(item, times, previous[:index], sample_period, cache)
            return cache[item["id"]]
        args = [visit(arg, depth + 1, selected) for arg in node.get("args", [])]
        comparisons = {"<": np.less, "<=": np.less_equal, ">": np.greater, ">=": np.greater_equal, "==": np.equal, "!=": np.not_equal}
        if kind == "relation":
            result = True
            for index, op in enumerate(node["ops"]): result = np.logical_and(result, comparisons[op](args[index], args[index + 1]))
            return result
        if kind == "condition":
            op = node["op"]
            if op == "not" and len(args) == 1: return np.logical_not(args[0])
            if len(args) == 2:
                if op in comparisons: return comparisons[op](*args)
                if op == "and": return np.logical_and(*args)
                if op == "or": return np.logical_or(*args)
            raise ValueError("Condition invalide")
        if kind == "operator":
            op = node.get("op")
            if len(args) == 1 and op in {"+", "-"}: return args[0] if op == "+" else -args[0]
            if len(args) != 2: raise ValueError("Opérateur invalide")
            a, b = args
            operations = {"+": np.add, "-": np.subtract, "*": np.multiply, "/": np.divide, "^": np.power, "%": np.remainder}
            if op not in operations: raise ValueError("Opérateur inconnu")
            return operations[op](a, b)
        if kind == "function":
            name = node.get("name")
            if name in {"min", "max"} and 2 <= len(args) <= 32:
                operation = np.minimum if name == "min" else np.maximum
                result = args[0]
                for argument in args[1:]: result = operation(result, argument)
                return result
            if name == "clip" and len(args) == 3:
                if np.any(np.asarray(args[1]) > np.asarray(args[2])): raise ValueError("La borne basse de clip doit être inférieure ou égale à la borne haute")
                return np.clip(*args)
            if name == "mod" and len(args) == 2: return np.remainder(*args)
            if name in unary_functions and len(args) == 1: return unary_functions[name](args[0])
            if name == "log" and len(args) in {1, 2}:
                if len(args) == 2 and (np.any(np.asarray(args[1]) <= 0) or np.any(np.asarray(args[1]) == 1)): raise ValueError("La base du logarithme doit être positive et différente de 1")
                return np.log(args[0]) if len(args) == 1 else np.log(args[0]) / np.log(args[1])
            if name in {"step", "echelon", "u"} and len(args) == 1: return np.where(np.asarray(args[0]) >= 0, 1.0, 0.0)
            if name in {"rect", "porte"}:
                if len(args) == 1: return np.where((np.asarray(args[0]) >= -0.5) & (np.asarray(args[0]) < 0.5), 1.0, 0.0)
                if len(args) == 3:
                    x, start, end = args
                    if np.any(np.asarray(end) <= np.asarray(start)): raise ValueError("Les bornes de la porte doivent être croissantes")
                    return np.where((np.asarray(x) >= start) & (np.asarray(x) < end), 1.0, 0.0)
            if name == "dirac" and len(args) == 1:
                x = np.asarray(args[0])
                # Impulsion unitaire : hauteur 1, indépendante de fe.
                return np.where((x >= -sample_period / 2) & (x < sample_period / 2), 1.0, 0.0)
            raise ValueError(f"Fonction ou arguments invalides : {name}")
        raise ValueError("Équation invalide")
    try:
        with np.errstate(divide="raise", invalid="raise", over="raise"):
            values = np.asarray(visit(tree), dtype=np.float64) + np.zeros(times.size)
    except (FloatingPointError, OverflowError) as error:
        raise ValueError("L’équation produit une valeur non réelle ou non finie sur cet intervalle") from error
    if not np.all(np.isfinite(values)): raise ValueError("L’équation produit une valeur non finie")
    return values

def _function(signal, times):
    amplitude, offset = float(signal.get("amplitude", 1)), float(signal.get("offset", 0))
    kind = signal["type"]
    if kind in PERIODIC_TYPES:
        phase = 2 * np.pi * float(signal.get("frequency", 0)) * (times - float(signal.get("delay", 0)))
        if kind == "sine": values = np.sin(phase)
        elif kind == "cosine": values = np.cos(phase)
        elif kind == "square": values = np.where(np.sin(phase) >= 0, 1.0, -1.0)
        else: values = (2 / np.pi) * np.arcsin(np.sin(phase))
    elif kind == "gate":
        values = (
            (times >= float(signal.get("gateStart", 0)))
            & (times < float(signal.get("gateEnd", 0)))
        ).astype(np.float64)
    else: values = (times >= 0).astype(np.float64)
    return amplitude * values + offset

def _wav(signal, times):
    source = np.asarray(signal.get("samples", []), dtype=np.float64)
    if not source.size: return np.zeros(times.size)
    local_times = times - float(signal["start"])
    source_times = np.arange(source.size, dtype=np.float64) / float(signal["sourceSampleRate"])
    return float(signal.get("amplitude", 1)) * np.interp(local_times, source_times, source, left=0, right=0) + float(signal.get("offset", 0))

def _expression(expression, environment):
    if not expression.strip(): raise ValueError("L’expression de combinaison est vide")
    try: tree = ast.parse(expression, mode="eval")
    except SyntaxError as error: raise ValueError("Expression de combinaison invalide") from error
    def visit(node):
        if isinstance(node, ast.Expression): return visit(node.body)
        if isinstance(node, ast.Name):
            if node.id not in environment: raise ValueError(f"Signal inconnu ou non précédent : {node.id}")
            return environment[node.id]
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)): return float(node.value)
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            value = visit(node.operand); return value if isinstance(node.op, ast.UAdd) else -value
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub, ast.Mult)):
            left, right = visit(node.left), visit(node.right)
            return left + right if isinstance(node.op, ast.Add) else left - right if isinstance(node.op, ast.Sub) else left * right
        raise ValueError("Expression invalide : seuls +, −, *, les nombres et les parenthèses sont acceptés")
    return visit(tree)

def _spectrum(values, sample_period, transform):
    if transform == "rfft":
        coefficients = np.fft.rfft(values)
        frequencies = np.fft.rfftfreq(values.size, d=sample_period)
    else:
        coefficients = np.fft.fftshift(np.fft.fft(values))
        frequencies = np.fft.fftshift(np.fft.fftfreq(values.size, d=sample_period))
    amplitudes = np.abs(coefficients) / values.size
    if transform == "rfft":
        # Spectre unilatéral : réunir les amplitudes des fréquences ±f.
        # DC est unique ; Nyquist l'est également uniquement pour N pair.
        if values.size % 2 == 0:
            amplitudes[1:-1] *= 2
        else:
            amplitudes[1:] *= 2
    phases = np.angle(coefficients)
    return frequencies, amplitudes, phases

def compute(payload):
    signals = payload["signals"]
    transform = payload.get("transform", "rfft")
    if transform not in {"fft", "rfft"}: raise ValueError("Transformée inconnue")
    results, definitions = [], []
    for signal in signals:
        start, end = float(signal["start"]), float(signal["end"])
        if end <= start: raise ValueError(f"{signal['code']} : la fin doit être supérieure au début")
        if signal["definition"] == "function" and signal["type"] == "gate" and float(signal["gateEnd"]) <= float(signal["gateStart"]):
            raise ValueError(f"{signal['code']} : la fin de la porte doit être supérieure à son début")
        sample_rate = float(signal["sampleRate"])
        if sample_rate <= 0: raise ValueError(f"{signal['code']} : la fréquence d’échantillonnage doit être positive")
        sample_period = 1 / sample_rate
        times = np.arange(start, end, sample_period, dtype=np.float64)
        # Les signaux précédents sont réévalués sur l'axe propre de la combinaison.
        environment = {previous["code"]: evaluate(previous, times, definitions[:index]) for index, previous in enumerate(definitions)} if signal["definition"] == "combination" else {}
        if signal["definition"] == "equation": values = _equation(signal, times, definitions, sample_period, {})
        elif signal["definition"] == "wav": values = _wav(signal, times)
        elif signal["definition"] == "combination": values = np.asarray(_expression(signal.get("expression", ""), environment), dtype=np.float64) + np.zeros(times.size)
        else: values = _function(signal, times)
        if not values.size: raise ValueError(f"{signal['code']} : aucun échantillon à calculer")
        frequencies, amplitudes, phases = _spectrum(values, sample_period, transform)
        results.append({"times": times, "values": values, "frequencies": frequencies, "amplitudes": amplitudes, "phases": phases, "resolution": sample_rate / values.size, "nyquist": sample_rate / 2})
        definitions.append(signal)
    return {"signals": results, "transform": transform}

def evaluate(signal, times, previous, sample_period=None, cache=None):
    if sample_period is None: sample_period = float(times[1] - times[0]) if times.size > 1 else 1 / float(signal["sampleRate"])
    if cache is None: cache = {}
    mask = (times >= float(signal["start"])) & (times < float(signal["end"]))
    if signal["definition"] == "equation":
        # Une référence est nulle hors de son intervalle. Évaluer seulement
        # les points valides évite, par exemple, log(t) sur des t négatifs.
        values = np.zeros(times.size, dtype=np.float64)
        if np.all(mask): return _equation(signal, times, previous, sample_period, cache)
        if np.any(mask): values[mask] = _equation(signal, times[mask], previous, sample_period, {})
        return values
    if signal["definition"] == "wav": return np.where(mask, _wav(signal, times), 0)
    if signal["definition"] == "function":
        values = _function(signal, times)
        return np.where(mask, values, 0)
    environment = {item["code"]: evaluate(item, times, previous[:index]) for index, item in enumerate(previous)}
    values = np.asarray(_expression(signal.get("expression", ""), environment), dtype=np.float64) + np.zeros(times.size)
    return np.where(mask, values, 0)
