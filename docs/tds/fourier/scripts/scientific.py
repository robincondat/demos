import numpy as np

PERIODIC_TYPES = {"sine", "cosine", "square", "triangle"}

def _component(signal, times):
    kind = signal["type"]
    amplitude = float(signal.get("amplitude", 1))
    offset = float(signal.get("offset", 0))
    if kind == "wav":
        source = np.asarray(signal["samples"], dtype=np.float64)
        source_times = np.arange(source.size, dtype=np.float64) / float(signal["sampleRate"])
        return amplitude * np.interp(times, source_times, source, left=0, right=0) + offset
    if kind in PERIODIC_TYPES:
        shifted = times - float(signal.get("delay", 0))
        phase = 2 * np.pi * float(signal.get("frequency", 0)) * shifted
        if kind == "sine": values = np.sin(phase)
        elif kind == "cosine": values = np.cos(phase)
        elif kind == "square": values = np.where(np.sin(phase) >= 0, 1.0, -1.0)
        else: values = (2 / np.pi) * np.arcsin(np.sin(phase))
        return amplitude * values + offset
    start = float(signal.get("start", 0))
    if kind == "gate": values = (times >= start) & (times < float(signal.get("end", start)))
    else: values = times >= start
    return amplitude * values.astype(np.float64) + offset

def compute(payload):
    sample_period = float(payload["samplePeriod"])
    duration = float(payload["duration"])
    # Même convention que le TP : la borne supérieure est exclue.
    times = np.arange(0, duration, sample_period, dtype=np.float64)
    components = [_component(signal, times) for signal in payload["signals"]]
    if not components:
        return {"times": times, "components": [], "combined": np.zeros(times.size), "frequencies": np.array([]), "amplitudes": np.array([]), "phases": np.array([]), "resolution": 0.0, "nyquist": 1 / (2 * sample_period)}
    combined = components[0].copy()
    for signal, values in zip(payload["signals"][1:], components[1:]):
        if signal.get("operation") == "multiply": combined *= values
        else: combined += values
    if payload["transform"] == "rfft":
        coefficients = np.fft.rfft(combined)
        frequencies = np.fft.rfftfreq(combined.size, d=sample_period)
        amplitudes = np.abs(coefficients) / combined.size
        if amplitudes.size > 1:
            amplitudes[1:-1 if combined.size % 2 == 0 else None] *= 2
    else:
        coefficients = np.fft.fftshift(np.fft.fft(combined))
        frequencies = np.fft.fftshift(np.fft.fftfreq(combined.size, d=sample_period))
        amplitudes = np.abs(coefficients) / combined.size
    return {"times": times, "components": components, "combined": combined, "frequencies": frequencies, "amplitudes": amplitudes, "phases": np.angle(coefficients), "resolution": 1 / (combined.size * sample_period), "nyquist": 1 / (2 * sample_period)}
