import sys
import unittest
from pathlib import Path
import numpy as np
from scipy.signal import correlate

sys.path.insert(0, str(Path(__file__).parents[1] / "compute"))
from tds_correlation import correlate_signals


class ZNCCTests(unittest.TestCase):
    def test_all_modes_against_explicit_centered_windows(self):
        rng = np.random.default_rng(42)
        for n, m in [(8, 3), (7, 4), (3, 6), (1, 3), (5, 1), (5, 5)]:
            a, b = rng.normal(size=n), rng.normal(size=m)
            centered = b - b.mean()
            full = []
            for lag in range(-m + 1, n):
                window = np.array([a[j + lag] if 0 <= j + lag < n else 0 for j in range(m)])
                window -= window.mean()
                denominator = np.linalg.norm(window) * np.linalg.norm(centered)
                full.append(np.dot(window, centered) / denominator if denominator else 0)
            for mode in ["full", "same", "valid"]:
                offset, count = (
                    (0, n + m - 1)
                    if mode == "full"
                    else ((m - 1) // 2, n) if mode == "same" else (min(n, m) - 1, abs(n - m) + 1)
                )
                result = correlate_signals(a, b, sample_rate=8, mode=mode, method="zncc")
                np.testing.assert_allclose(
                    result["values"], full[offset : offset + count], atol=1e-12
                )
                np.testing.assert_allclose(
                    result["times"], np.arange(-m + 1 + offset, -m + 1 + offset + count) / 8
                )
                self.assertTrue(np.all(np.abs(result["values"]) <= 1))

    def test_valid_matches_supplied_algorithm(self):
        a = np.array([1.0, 4.0, 2.0, -1.0, 3.0, 8.0])
        b = np.array([2.0, -3.0, 1.0])
        centered = b - b.mean()
        sums = np.convolve(a, np.ones(3), "valid")
        energy = np.convolve(a * a, np.ones(3), "valid") - sums * sums / 3
        expected = correlate(a, centered, mode="valid") / np.sqrt(
            energy * np.dot(centered, centered)
        )
        np.testing.assert_allclose(
            correlate_signals(a, b, sample_rate=8, method="zncc", mode="valid")["values"], expected
        )

    def test_offset_gain_and_perfect_positive_negative_match(self):
        b = np.array([1.0, -2.0, 4.0, 0.0])
        for gain in [3.0, -2.0]:
            result = correlate_signals(gain * b + 20, b, sample_rate=8, method="zncc", mode="valid")
            self.assertAlmostEqual(result["values"][0], np.sign(gain))

    def test_constant_windows_and_patterns_are_zero(self):
        for a, b in [([0] * 8, [1, 2, 3]), ([1] * 8, [1, 2, 3]), ([1, 4, 2, 8], [0.1] * 3)]:
            result = correlate_signals(a, b, sample_rate=8, method="zncc", mode="valid")
            np.testing.assert_array_equal(result["values"], np.zeros(len(a) - len(b) + 1))

    def test_dt_does_not_scale_zncc_and_origins_are_preserved(self):
        args = dict(sample_rate=10, start_a=2, start_b=0.5, method="zncc")
        raw = correlate_signals([1, 3, 2], [1, 2], **args)
        normalized = correlate_signals([1, 3, 2], [1, 2], normalize=True, **args)
        np.testing.assert_array_equal(raw["values"], normalized["values"])
        np.testing.assert_allclose(raw["times"], [1.4, 1.5, 1.6, 1.7])
