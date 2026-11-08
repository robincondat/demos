"""Cross-correlation of real sampled signals, independent of the platform."""

import numpy as np
from scipy.signal import correlate, correlation_lags


def correlate_signals(
    a, b, *, sample_rate, start_a=0.0, start_b=0.0, mode="full", normalize=False, method="classic"
):
    """R_AB(lag) = sum A[k] B[k-lag]; positive lag shifts B to the right.

    same returns len(A) samples, centered in full (SciPy convention).
    Physical lags include start_a - start_b. normalize multiplies by Δt;
    it does not turn the result into a normalized correlation coefficient.
    """
    if mode not in {"full", "same", "valid"}:
        raise ValueError("Mode de corrélation inconnu")
    if method not in {"classic", "zncc"}:
        raise ValueError("Méthode de corrélation inconnue")
    rate = float(sample_rate)
    origin = float(start_a) - float(start_b)
    if not np.isfinite(rate) or rate <= 0 or not np.isfinite(origin):
        raise ValueError("Invalid sampling rate or start time")
    a, b = np.asarray(a, dtype=np.float64), np.asarray(b, dtype=np.float64)
    if a.ndim != 1 or b.ndim != 1 or not a.size or not b.size:
        raise ValueError("Correlation requires two nonempty one-dimensional signals")
    if not np.all(np.isfinite(a)) or not np.all(np.isfinite(b)):
        raise ValueError("Correlation inputs must be finite")
    # Derive lags from the exact full-array slice: scipy correlation_lags('same')
    # has different centering for some odd/even length pairs.
    if method == "zncc":
        values = zncc_full(a, b)
    else:
        values = correlate(a, b, mode="full", method="auto")
    lags = correlation_lags(a.size, b.size, mode="full")
    if mode == "same":
        offset, count = (b.size - 1) // 2, a.size
    elif mode == "valid":
        offset, count = min(a.size, b.size) - 1, abs(a.size - b.size) + 1
    else:
        offset, count = 0, values.size
    values = values[offset : offset + count]
    times = origin + lags[offset : offset + count] / rate
    if normalize and method == "classic":
        values /= rate
    if not np.all(np.isfinite(values)):
        raise ValueError("La corrélation produit des valeurs non finies")
    return {"times": times, "values": values}


def zncc_full(signal, pattern):
    """Fixed-length pattern windows; missing signal samples are zero padded.

    All full lags are returned. Constant patterns/windows have score zero.
    No N×M window matrix and no quadratic box convolution are allocated.
    """
    size = pattern.size
    # Scaling prevents overflow without changing a normalized score.
    signal = signal / max(float(np.max(np.abs(signal))), 1.0)
    pattern = pattern / max(float(np.max(np.abs(pattern))), 1.0)
    if np.max(pattern) == np.min(pattern):
        return np.zeros(signal.size + size - 1)
    centered = pattern - np.mean(pattern)
    energy_pattern = np.dot(centered, centered)
    if energy_pattern == 0:
        return np.zeros(signal.size + size - 1)
    padded = np.pad(signal, (size - 1, size - 1))

    # Extended precision limits cancellation in local mean/energy estimates.
    def window_sum(values):
        prefix = np.empty(values.size + 1, dtype=np.longdouble)
        prefix[0] = 0
        np.cumsum(values, dtype=np.longdouble, out=prefix[1:])
        return prefix[size:] - prefix[:-size]

    sums = window_sum(padded)
    sums2 = window_sum(padded.astype(np.longdouble) ** 2)
    energy = np.maximum(sums2 - sums**2 / size, 0)
    tolerance = 64 * np.finfo(np.longdouble).eps * np.maximum(sums2, sums**2 / size)
    energy[energy <= tolerance] = 0
    corr = correlate(signal, centered, mode="full", method="auto")
    # Account for the residual floating-point sum of the centered pattern.
    corr = corr - np.asarray(sums / size, dtype=np.float64) * np.sum(centered)
    denominator = np.sqrt(energy * energy_pattern)
    values = np.divide(corr, denominator, out=np.zeros_like(corr), where=denominator > 0)
    return np.clip(values, -1, 1)
