import sys
import unittest
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).parents[1] / "compute"))
from tds_filtering import ideal_filter


class IdealFilterTests(unittest.TestCase):
    def test_four_filters_on_two_sinusoids(self):
        t = np.arange(1000) / 1000
        low = np.sin(2 * np.pi * 50 * t)
        high = 0.5 * np.cos(2 * np.pi * 200 * t)
        for kind, options, expected in [
            ("lowpass", dict(cutoff=100), low),
            ("highpass", dict(cutoff=100), high),
            ("bandpass", dict(low=150, high=250), high),
            ("bandstop", dict(low=150, high=250), low),
        ]:
            with self.subTest(kind=kind):
                result = ideal_filter(low + high, sample_rate=1000, kind=kind, **options)
                np.testing.assert_allclose(result["values"], expected, atol=1e-12)
                np.testing.assert_array_equal(
                    result["filteredAmplitudes"], result["amplitudes"] * result["mask"]
                )

    def test_odd_even_single_sample_and_cutoff_boundaries(self):
        for size in [1, 7, 8, 1001]:
            a = np.arange(size, dtype=float)
            result = ideal_filter(a, sample_rate=1000, cutoff=500)
            self.assertEqual(len(result["values"]), size)
            np.testing.assert_allclose(result["values"], a, atol=1e-11)
        a = 2 + (-1.0) ** np.arange(8)
        low = ideal_filter(a, sample_rate=8, cutoff=0)
        np.testing.assert_allclose(low["values"], 2)
        self.assertEqual(low["amplitudes"][0], 2)
        self.assertEqual(low["amplitudes"][-1], 1)
        high = ideal_filter(a, sample_rate=8, kind="highpass", cutoff=4)
        np.testing.assert_allclose(high["values"], (-1.0) ** np.arange(8))

    def test_masks_are_complementary_and_inputs_preserved(self):
        a = np.arange(20, dtype=float)
        before = a.copy()
        band = ideal_filter(a, sample_rate=20, kind="bandpass", low=3, high=5)
        stop = ideal_filter(a, sample_rate=20, kind="bandstop", low=3, high=5)
        np.testing.assert_array_equal(band["mask"] + stop["mask"], np.ones(11))
        np.testing.assert_allclose(band["values"] + stop["values"], a, atol=1e-12)
        np.testing.assert_array_equal(a, before)

    def test_invalid_cutoffs(self):
        for options in [
            dict(cutoff=-1),
            dict(cutoff=6),
            dict(cutoff=None),
            dict(kind="bandpass", low=3, high=2),
            dict(kind="bad"),
        ]:
            with self.subTest(options=options), self.assertRaises(ValueError):
                ideal_filter([1, 2, 3], sample_rate=10, **options)
