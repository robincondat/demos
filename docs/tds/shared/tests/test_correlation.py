import sys
import unittest
from pathlib import Path
import importlib.util
import numpy as np
from scipy.signal import correlate

sys.path.insert(0, str(Path(__file__).parents[1] / "compute"))
from tds_correlation import correlate_signals


class CorrelationTests(unittest.TestCase):
    def test_all_modes_and_length_orders(self):
        for n in [1, 2, 3, 4, 7]:
            for m in [1, 2, 3, 4, 7]:
                a, b = np.arange(n) + 1.0, np.arange(m) - 2.0
                for mode in ["full", "same", "valid"]:
                    with self.subTest(n=n, m=m, mode=mode):
                        result = correlate_signals(a, b, sample_rate=8, mode=mode)
                        np.testing.assert_allclose(result["values"], correlate(a, b, mode=mode))
                        for lag, value in zip(result["times"] * 8, result["values"]):
                            k = int(round(lag))
                            expected = sum(a[j] * b[j - k] for j in range(n) if 0 <= j - k < m)
                            self.assertAlmostEqual(value, expected)

    def test_positive_lag_aligns_delayed_a_with_b(self):
        result = correlate_signals([0, 0, 1, 0], [1, 0], sample_rate=10, start_a=0.5, start_b=-0.25)
        self.assertAlmostEqual(result["times"][np.argmax(result["values"])], 0.95)

    def test_autocorrelation_symmetry_and_energy(self):
        a = np.array([1.0, -2.0, 3.0, 4.0])
        raw = correlate_signals(a, a, sample_rate=8)
        np.testing.assert_allclose(raw["values"], raw["values"][::-1])
        self.assertAlmostEqual(raw["values"][3], np.sum(a * a))
        normalized = correlate_signals(a, a, sample_rate=8, normalize=True)
        np.testing.assert_allclose(normalized["values"], raw["values"] / 8)
        np.testing.assert_array_equal(a, [1, -2, 3, 4])

    def test_validation(self):
        for values in [[], [[1]], [float("nan")]]:
            with self.assertRaises(ValueError):
                correlate_signals(values, [1], sample_rate=8)
        for kwargs in [dict(sample_rate=0), dict(sample_rate=8, mode="bad")]:
            with self.assertRaises(ValueError):
                correlate_signals([1], [1], **kwargs)

    def test_platform_and_partial_inputs(self):
        file = Path(__file__).parents[2] / "correlation" / "scripts" / "scientific.py"
        spec = importlib.util.spec_from_file_location("correlation_engine", file)
        engine = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(engine)

        def signal(slot, values):
            return dict(
                id=slot,
                code=slot,
                slot=slot,
                definition="wav",
                start=0,
                end=len(values) / 8,
                sampleRate=8,
                sourceSampleRate=8,
                samples=values,
            )

        a, b = signal("input", [0, 1, 0]), signal("impulse", [1, 0])
        self.assertIsNone(engine.compute(dict(signals=[a]))["correlation"])
        result = engine.compute(dict(signals=[a, b]))
        np.testing.assert_allclose(result["correlation"]["values"], [0, 0, 1, 0])
        b["sampleRate"] = 16
        self.assertTrue(engine.compute(dict(signals=[a, b]))["correlationError"])
