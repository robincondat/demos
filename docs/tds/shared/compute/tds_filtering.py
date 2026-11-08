"""Ideal real-signal filtering on the signal's own RFFT grid."""

import numpy as np


def ideal_filter(values, *, sample_rate, kind="lowpass", cutoff=100.0, low=100.0, high=200.0):
    values = np.asarray(values, dtype=np.float64)
    rate = float(sample_rate)
    if values.ndim != 1 or not values.size or not np.all(np.isfinite(values)):
        raise ValueError("Le signal doit être un tableau réel fini non vide")
    if not np.isfinite(rate) or rate <= 0:
        raise ValueError("La fréquence d’échantillonnage doit être positive")
    if kind not in {"lowpass", "highpass", "bandpass", "bandstop"}:
        raise ValueError("Type de filtre inconnu")
    frequencies = np.fft.rfftfreq(values.size, d=1 / rate)
    nyquist = rate / 2

    def frequency(value):
        try:
            value = float(value)
        except (TypeError, ValueError) as error:
            raise ValueError("Saisissez les fréquences de coupure") from error
        if not np.isfinite(value) or not 0 <= value <= nyquist:
            raise ValueError(f"Les coupures doivent être comprises entre 0 et {nyquist:g} Hz")
        return value

    if kind in {"lowpass", "highpass"}:
        edge = frequency(cutoff)
        mask = frequencies <= edge if kind == "lowpass" else frequencies >= edge
    else:
        lower, upper = frequency(low), frequency(high)
        if lower >= upper:
            raise ValueError("La coupure basse doit être inférieure à la coupure haute")
        inside = (frequencies >= lower) & (frequencies <= upper)
        mask = inside if kind == "bandpass" else ~inside
    coefficients = np.fft.rfft(values)
    filtered_coefficients = coefficients * mask
    # Explicit n is essential for an odd number of time samples.
    filtered = np.fft.irfft(filtered_coefficients, n=values.size)
    amplitudes = np.abs(coefficients) / values.size
    amplitudes[1 : -1 if values.size % 2 == 0 else None] *= 2
    return {
        "values": filtered,
        "frequencies": frequencies,
        "mask": mask.astype(np.float64),
        "amplitudes": amplitudes,
        "filteredAmplitudes": amplitudes * mask,
        "nyquist": nyquist,
        "resolution": rate / values.size,
    }
