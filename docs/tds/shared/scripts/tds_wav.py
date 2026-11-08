"""Lecture WAV commune aux moteurs TDS ; aucune normalisation implicite."""

import io
import numpy as np
from scipy.io import wavfile


def read_wav_samples(value):
    # Pyodide expose les TypedArray comme JsProxy ou comme tampon Python.
    if hasattr(value, "to_py"):
        value = value.to_py()
    rate, samples = wavfile.read(io.BytesIO(bytes(value)))
    channels = 1 if samples.ndim == 1 else samples.shape[1]
    # Conversion avant la moyenne pour éviter les dépassements des entiers.
    samples = samples.astype(np.float64)
    if samples.ndim > 1:
        samples = samples.mean(axis=1)
    if not samples.size:
        raise ValueError("Le fichier WAV ne contient aucun échantillon.")
    if rate <= 0 or not np.all(np.isfinite(samples)):
        raise ValueError("Le fichier WAV contient des données invalides.")
    return {
        "samples": samples.reshape(-1),
        "sourceSampleRate": float(rate),
        "sourceChannels": channels,
    }


def prepare_wav_signals(payload, buffers):
    """Ajoute les échantillons décodés sans modifier la fréquence demandée."""
    for index, signal in enumerate(payload["signals"]):
        if signal["definition"] != "wav":
            continue
        if index not in buffers:
            raise ValueError("Les données du fichier WAV sont manquantes.")
        signal.update(read_wav_samples(buffers[index]))
    return payload
