import importlib.util
from pathlib import Path
import sys
import unittest
import numpy as np

sys.path.insert(0, str(Path(__file__).parents[1] / "compute"))
from tds_signals import prepare_signals, sample_counts


def number(value):
    return {"kind": "number", "value": value}


TIME = {"kind": "symbol", "name": "t"}


def signal(code="S1", **overrides):
    return dict(
        id=code,
        code=code,
        name=code,
        definition="equation",
        start=0,
        end=1,
        sampleRate=8,
        equationTree=number(1),
        **overrides
    )


class PreparationTests(unittest.TestCase):
    def test_unknown_definition_is_rejected_explicitly(self):
        item = signal()
        item["definition"] = "unknown"
        with self.assertRaises(ValueError):
            prepare_signals([item])

    def test_wav_retains_native_amplitudes_and_interpolates(self):
        item = signal()
        item.update(
            definition="wav",
            samples=np.array([100.0, -200.0, 300.0]),
            sourceSampleRate=2,
            sampleRate=4,
            start=0,
            end=1.5,
        )
        prepared = prepare_signals([item])[0]
        np.testing.assert_allclose(prepared["values"], [100, -50, -200, 50, 300, 0])

    def test_half_open_axes_with_noninteger_durations_and_single_sample(self):
        for start, end, rate, count in [
            (0, 0.3, 10, 3),
            (-0.2, 0.11, 10, 4),
            (0, 0.01, 8, 1),
            (0, 1, 8, 8),
        ]:
            with self.subTest(start=start, end=end):
                item = signal()
                item.update(start=start, end=end, sampleRate=rate)
                result = prepare_signals([item])[0]
                self.assertEqual(sample_counts([item]), [count])
                np.testing.assert_array_equal(result["times"], start + np.arange(count) / rate)
                self.assertTrue(np.all(result["times"] < end))

    def test_unset_equation_is_zero_and_inputs_are_not_modified(self):
        item = signal()
        item["equationTree"] = None
        self.assertEqual(prepare_signals([]), [])
        np.testing.assert_array_equal(prepare_signals([item])[0]["values"], np.zeros(8))
        self.assertNotIn("samples", item)

    def test_invalid_parameters_are_rejected_before_evaluation(self):
        for field, value in [
            ("start", float("nan")),
            ("end", float("inf")),
            ("end", 0),
            ("sampleRate", 0),
            ("sampleRate", -1),
        ]:
            item = signal()
            item[field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                prepare_signals([item])

    def test_case_branches_are_evaluated_only_where_selected(self):
        item = signal()
        item.update(
            start=-1,
            end=1,
            sampleRate=4,
            equationTree={
                "kind": "cases",
                "rows": [
                    {
                        "condition": {"kind": "condition", "op": ">", "args": [TIME, number(0)]},
                        "value": {"kind": "function", "name": "log", "args": [TIME]},
                    }
                ],
                "otherwise": number(0),
            },
        )
        result = prepare_signals([item])[0]
        expected = np.zeros(8)
        expected[5:] = np.log(result["times"][5:])
        np.testing.assert_allclose(result["values"], expected)

    def test_periodic_centered_signal_and_transformed_reference(self):
        a = signal()
        a.update(
            start=-1,
            end=1,
            equationTree=TIME,
            periodic={"enabled": True, "tree": number(0.5), "origin": "centered"},
        )
        b = signal("S2")
        b["equationTree"] = {
            "kind": "reference",
            "id": "S1",
            "name": "S1",
            "time": {"kind": "operator", "op": "-", "args": [TIME, number(0.25)]},
        }
        result = prepare_signals([a, b])
        np.testing.assert_allclose(
            result[1]["values"], (result[1]["times"] - 0.25 + 0.25) % 0.5 - 0.25
        )

    def test_fourier_and_convolution_receive_identical_samples(self):
        engines = []
        for platform in ["fourier", "convolution"]:
            file = Path(__file__).parents[2] / platform / "scripts" / "scientific.py"
            spec = importlib.util.spec_from_file_location(platform, file)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            engines.append(module)
        for definition in ["equation", "wav"]:
            a, b = signal(), signal("S2")
            a.update(slot="input", start=-0.2, end=0.8, sampleRate=10)
            b.update(
                slot="impulse",
                start=0.1,
                end=0.42,
                sampleRate=10,
                definition=definition,
                samples=np.array([2.0, -1.0, 4.0, 0.0]),
                sourceSampleRate=10,
            )
            with self.subTest(definition=definition):
                results = [engine.compute({"signals": [a, b]})["signals"] for engine in engines]
                for left, right in zip(*results):
                    np.testing.assert_array_equal(left["times"], right["times"])
                    np.testing.assert_array_equal(left["values"], right["values"])
