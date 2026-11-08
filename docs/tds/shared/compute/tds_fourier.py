import numpy as np


def spectrum(values, sample_period, transform):
    """Return frequency, amplitude and phase arrays for fft or rfft.

    FFT is centered and bilateral. RFFT doubles positive-frequency amplitudes
    except DC and (for an even sample count) Nyquist.
    """
    values = np.asarray(values, dtype=np.float64)
    if values.ndim != 1 or not values.size or not np.all(np.isfinite(values)):
        raise ValueError("Spectrum requires a nonempty finite one-dimensional signal")
    if transform not in {"fft", "rfft"}:
        raise ValueError("Transformée inconnue")
    if not np.isfinite(sample_period) or sample_period <= 0:
        raise ValueError("Sample period must be positive and finite")
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
