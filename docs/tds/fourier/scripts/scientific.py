"""Fourier platform orchestration; reusable calculations live in tds/shared/compute."""

from tds_signals import prepare_signals, sample_counts
from tds_fourier import spectrum


def compute(payload):
    signals = payload["signals"]
    transform = payload.get("transform", "rfft")
    if transform not in {"fft", "rfft"}:
        raise ValueError("Transformée inconnue")
    results = []
    for signal, prepared in zip(signals, prepare_signals(signals)):
        times, values = prepared["times"], prepared["values"]
        sample_rate = float(signal["sampleRate"])
        sample_period = 1 / sample_rate
        frequencies, amplitudes, phases = spectrum(values, sample_period, transform)
        results.append(
            {
                "times": times,
                "values": values,
                "frequencies": frequencies,
                "amplitudes": amplitudes,
                "phases": phases,
                "resolution": sample_rate / values.size,
                "nyquist": sample_rate / 2,
            }
        )
    return {"signals": results, "transform": transform}


def validate_payload(payload):
    """Validate temporal dimensions before WAV decoding, as in other TDS engines."""
    sample_counts(payload["signals"])
