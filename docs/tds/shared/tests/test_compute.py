"""Scientific primitives can be called without any platform or browser."""

import importlib.util
from pathlib import Path
import sys
import unittest
import numpy as np

COMPUTE = Path(__file__).parents[1] / "compute"
sys.path.insert(0, str(COMPUTE))
from tds_convolution import convolve_signals
from tds_fourier import spectrum
from tds_signals import evaluate, prepare_signals


class ComputeTests(unittest.TestCase):
    def test_convolution_modes_axes_normalization_and_input_order(self):
        for a, b in [([1, 2, 3, 4], [2, -1]), ([2, -1], [1, 2, 3, 4]), ([3], [2])]:
            for mode in ["full", "same", "valid"]:
                with self.subTest(a=a, mode=mode):
                    result = convolve_signals(
                        a, b, sample_rate=8, start_a=-0.5, start_b=0.25, mode=mode
                    )
                    np.testing.assert_allclose(result["values"], np.convolve(a, b, mode))
                    shorter = min(len(a), len(b))
                    offset = (
                        0
                        if mode == "full"
                        else (shorter - 1) // 2 if mode == "same" else shorter - 1
                    )
                    np.testing.assert_allclose(
                        result["times"], -0.25 + (offset + np.arange(len(result["values"]))) / 8
                    )
                    normalized = convolve_signals(a, b, sample_rate=8, mode=mode, normalize=True)
                    np.testing.assert_allclose(normalized["values"], result["values"] / 8)

    def test_impulse_preserves_signal_and_inputs(self):
        values = np.array([0.0, 1.0, -3.0, 2.0])
        before = values.copy()
        result = convolve_signals(values, [1], sample_rate=10)
        np.testing.assert_array_equal(result["values"], values)
        np.testing.assert_array_equal(values, before)

    def test_invalid_convolution(self):
        for kwargs in [
            dict(sample_rate=0),
            dict(sample_rate=float("nan")),
            dict(sample_rate=8, mode="unknown"),
        ]:
            with self.assertRaises(ValueError):
                convolve_signals([1], [2], **kwargs)
        for a in [[], [[1]], [float("inf")]]:
            with self.assertRaises(ValueError):
                convolve_signals(a, [1], sample_rate=8)

    def test_rfft_amplitudes_even_and_odd(self):
        for size in [7, 8]:
            t = np.arange(size)
            frequencies, amplitudes, _ = spectrum(
                3 + 2 * np.cos(2 * np.pi * t / size), 1 / size, "rfft"
            )
            self.assertAlmostEqual(amplitudes[0], 3)
            self.assertAlmostEqual(amplitudes[1], 2)
            self.assertEqual(frequencies[1], 1)
        _, amplitudes, _ = spectrum((-1.0) ** np.arange(8), 1 / 8, "rfft")
        self.assertAlmostEqual(amplitudes[-1], 1)

    def test_shifted_fft_matches_numpy(self):
        values = np.array([1.0, 3.0, -1.0, 4.0, 2.0])
        f, a, p = spectrum(values, 0.1, "fft")
        expected = np.fft.fftshift(np.fft.fft(values))
        np.testing.assert_allclose(f, np.fft.fftshift(np.fft.fftfreq(5, 0.1)))
        np.testing.assert_allclose(a, np.abs(expected) / 5)
        np.testing.assert_allclose(p, np.angle(expected))

    def test_same_evaluator_in_both_platforms(self):
        root = Path(__file__).parents[2]
        for name in ["fourier", "convolution"]:
            spec = importlib.util.spec_from_file_location(
                name, root / name / "scripts" / "scientific.py"
            )
            engine = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(engine)
            self.assertIs(engine.prepare_signals, prepare_signals)
        signal = dict(
            id="one",
            definition="equation",
            start=0,
            end=1,
            sampleRate=8,
            equationTree=dict(kind="function", name="dirac", args=[dict(kind="symbol", name="t")]),
        )
        np.testing.assert_array_equal(evaluate(signal, np.arange(4) / 8, []), [1, 0, 0, 0])
