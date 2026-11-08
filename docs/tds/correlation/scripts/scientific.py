"""Correlation platform orchestration; no UI rules in the shared correlation."""

import numpy as np
from tds_signals import prepare_signals, sample_counts
from tds_correlation import correlate_signals


def validate_payload(payload):
    """Check allocation sizes before decoding WAV buffers in the worker."""
    sample_counts(payload["signals"])


def compute(payload):
    method = payload.get("method", "classic")
    if method not in {"classic", "zncc"}:
        raise ValueError("Méthode de corrélation inconnue")
    mode = payload.get("mode", "full")
    if mode not in {"full", "same", "valid"}:
        raise ValueError("Mode de correlation inconnu")
    signals = payload["signals"]
    if len(signals) > 2 or len({item.get("slot") for item in signals}) != len(signals):
        raise ValueError("Un seul signal est autorisé par section")
    for signal in signals:
        if signal.get("slot") not in {"input", "impulse"}:
            raise ValueError("Section inconnue")
    results = [
        {"slot": signal["slot"], **prepared}
        for signal, prepared in zip(signals, prepare_signals(signals))
    ]
    result = {"signals": results, "correlation": None, "correlationError": "", "method": method}
    if len(results) != 2:
        return result
    if not np.isclose(
        float(signals[0]["sampleRate"]), float(signals[1]["sampleRate"]), rtol=1e-12, atol=0
    ):
        result["correlationError"] = (
            "Choisissez la même fréquence d’échantillonnage pour le signal A et le signal B."
        )
        return result
    result["correlation"] = correlate_signals(
        results[0]["values"],
        results[1]["values"],
        sample_rate=float(signals[0]["sampleRate"]),
        start_a=float(signals[0]["start"]),
        start_b=float(signals[1]["start"]),
        mode=mode,
        normalize=payload.get("normalize", False),
        method=method,
    )
    return result
