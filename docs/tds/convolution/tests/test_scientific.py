"""Run: python -B -m unittest discover -s tds/convolution/tests"""
import importlib.util
from pathlib import Path
import unittest
import numpy as np

spec = importlib.util.spec_from_file_location('convolution', Path(__file__).parents[1] / 'scripts' / 'scientific.py')
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)

def signal(slot, values, start=0, rate=8):
    return dict(id=slot, code=slot, name=slot, slot=slot, definition='wav',
                samples=np.array(values), sourceSampleRate=rate, sampleRate=rate,
                start=start, end=start + len(values) / rate)

class ConvolutionTests(unittest.TestCase):
    def test_numpy_values_and_time_origin_in_all_modes(self):
        rng = np.random.default_rng(42)
        for n, m in [(1, 1), (1, 7), (4, 3), (3, 4), (4, 4), (5, 2), (2, 5), (2000, 900)]:
            a, b = rng.normal(size=n), rng.normal(size=m)
            for mode in ['full', 'same', 'valid']:
                with self.subTest(n=n, m=m, mode=mode):
                    out = engine.compute(dict(signals=[signal('input', a, -0.5), signal('impulse', b, 0.25)], mode=mode))['convolution']
                    expected = np.convolve(a, b, mode)
                    np.testing.assert_allclose(out['values'], expected, atol=1e-10)
                    offset = 0 if mode == 'full' else (min(n, m) - 1) // 2 if mode == 'same' else min(n, m) - 1
                    np.testing.assert_allclose(out['times'], -0.25 + (offset + np.arange(len(expected))) / 8)

    def test_missing_signal_and_different_sample_rates(self):
        a, b = signal('input', [1, 2]), signal('impulse', [1, 1], rate=16)
        self.assertIsNone(engine.compute(dict(signals=[a]))['convolution'])
        result = engine.compute(dict(signals=[a, b]))
        self.assertEqual(len(result['signals']), 2)
        self.assertIsNone(result['convolution'])
        self.assertIn('échantillonnage', result['convolutionError'])

    def test_unit_impulse_has_no_sampling_normalization(self):
        for rate in [8, 32]:
            a, b = signal('input', [1, 2, 3], rate=rate), signal('impulse', [0, 0, 0], rate=rate)
            b.update(definition='equation', equationTree=dict(kind='function', name='dirac', args=[dict(kind='symbol', name='t')]))
            np.testing.assert_allclose(engine.compute(dict(signals=[a, b]))['convolution']['values'], [1, 2, 3, 0, 0])

    def test_piecewise_and_periodic_equations(self):
        a, b = signal('input', [0] * 8), signal('impulse', [1, 1])
        a.update(definition='equation', periodic=dict(enabled=True, expression='T', tree=dict(kind='number', value=0.5)),
                 equationTree=dict(kind='cases', rows=[dict(condition=dict(kind='condition', op='<', args=[dict(kind='symbol', name='t'), dict(kind='number', value=0.25)]), value=dict(kind='number', value=1))], otherwise=dict(kind='number', value=0)))
        result = engine.compute(dict(signals=[a, b]))
        np.testing.assert_allclose(result['signals'][0]['values'], [1, 1, 0, 0, 1, 1, 0, 0])
        np.testing.assert_allclose(result['convolution']['values'], np.convolve([1, 1, 0, 0, 1, 1, 0, 0], [1, 1]))

    def test_invalid_parameters(self):
        for changes in [dict(sampleRate=0), dict(sampleRate=float('nan')), dict(end=0), dict(end=1e9)]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                engine.compute(dict(signals=[dict(signal('input', [1, 1]), **changes)]))
        with self.assertRaises(ValueError): engine.compute(dict(signals=[signal('input', [1]), signal('input', [2])]))
        with self.assertRaises(ValueError): engine.compute(dict(signals=[], mode='bad'))

if __name__ == '__main__': unittest.main()
