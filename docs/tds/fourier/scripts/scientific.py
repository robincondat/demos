import ast
import numpy as np

PERIODIC_TYPES = {"sine", "cosine", "square", "triangle"}

def _function(signal, times):
    amplitude, offset = float(signal.get("amplitude", 1)), float(signal.get("offset", 0))
    kind = signal["type"]
    if kind in PERIODIC_TYPES:
        phase = 2 * np.pi * float(signal.get("frequency", 0)) * (times - float(signal.get("delay", 0)))
        if kind == "sine": values = np.sin(phase)
        elif kind == "cosine": values = np.cos(phase)
        elif kind == "square": values = np.where(np.sin(phase) >= 0, 1.0, -1.0)
        else: values = (2 / np.pi) * np.arcsin(np.sin(phase))
    elif kind == "gate": values = np.ones(times.size)
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

def _spectrum(values, sample_period):
    coefficients = np.fft.fftshift(np.fft.fft(values))
    frequencies = np.fft.fftshift(np.fft.fftfreq(values.size, d=sample_period))
    # Spectre brut, identique à np.abs(np.fft.fft(values)) dans le TP.
    amplitudes = np.abs(coefficients)
    return frequencies, amplitudes, np.angle(coefficients)

def compute(payload):
    signals = payload["signals"]
    results, definitions = [], []
    for signal in signals:
        start, end = float(signal["start"]), float(signal["end"])
        if end <= start: raise ValueError(f"{signal['code']} : la fin doit être supérieure au début")
        sample_rate = float(signal["sampleRate"])
        if sample_rate <= 0: raise ValueError(f"{signal['code']} : la fréquence d’échantillonnage doit être positive")
        sample_period = 1 / sample_rate
        times = np.arange(start, end, sample_period, dtype=np.float64)
        # Les signaux précédents sont réévalués sur l'axe propre de la combinaison.
        environment = {previous["code"]: evaluate(previous, times, definitions[:index]) for index, previous in enumerate(definitions)}
        if signal["definition"] == "wav": values = _wav(signal, times)
        elif signal["definition"] == "combination": values = np.asarray(_expression(signal.get("expression", ""), environment), dtype=np.float64) + np.zeros(times.size)
        else: values = _function(signal, times)
        frequencies, amplitudes, phases = _spectrum(values, sample_period)
        results.append({"times": times, "values": values, "frequencies": frequencies, "amplitudes": amplitudes, "phases": phases, "resolution": sample_rate / values.size, "nyquist": sample_rate / 2})
        definitions.append(signal)
    return {"signals": results}

def evaluate(signal, times, previous):
    mask = (times >= float(signal["start"])) & (times < float(signal["end"]))
    if signal["definition"] == "wav": return np.where(mask, _wav(signal, times), 0)
    if signal["definition"] == "function":
        values = _function(signal, times)
        return np.where(mask, values, 0)
    environment = {item["code"]: evaluate(item, times, previous[:index]) for index, item in enumerate(previous)}
    values = np.asarray(_expression(signal.get("expression", ""), environment), dtype=np.float64) + np.zeros(times.size)
    return np.where(mask, values, 0)
