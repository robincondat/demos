"""Reusable discrete convolution, independent of platform payloads and UI."""

import numpy as np
from scipy.signal import convolve


def convolve_signals(a, b, *, sample_rate, start_a=0.0, start_b=0.0, mode="full", normalize=False):
    """Return {times, values}; same follows NumPy even when B is longer.

    Both inputs must be sampled at sample_rate. start_a/start_b locate their
    first samples. normalize multiplies only the output by 1/sample_rate.
    Inputs are never modified.
    """
    if mode not in {"full", "same", "valid"}:
        raise ValueError("Mode de convolution inconnu")
    rate = float(sample_rate)
    start = float(start_a) + float(start_b)
    if not np.isfinite(rate) or rate <= 0 or not np.isfinite(start):
        raise ValueError("Invalid sampling rate or start time")
    a, b = np.asarray(a, dtype=np.float64), np.asarray(b, dtype=np.float64)
    if a.ndim != 1 or b.ndim != 1 or not a.size or not b.size:
        raise ValueError("Convolution requires two nonempty one-dimensional signals")
    if not np.all(np.isfinite(a)) or not np.all(np.isfinite(b)):
        raise ValueError("Convolution inputs must be finite")
    if a.size < b.size:
        a, b = b, a
    values = convolve(a, b, mode=mode, method="auto")
    if normalize:
        values /= rate
    offset = 0 if mode == "full" else (b.size - 1) // 2 if mode == "same" else b.size - 1
    times = start + (offset + np.arange(values.size, dtype=np.float64)) / rate
    if not np.all(np.isfinite(values)):
        raise ValueError("La convolution produit des valeurs non finies")
    return {"times": times, "values": values}
