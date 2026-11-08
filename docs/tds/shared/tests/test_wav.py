import importlib.util
import io
from pathlib import Path
import unittest
import numpy as np
from scipy.io import wavfile

spec = importlib.util.spec_from_file_location(
    "tds_wav", Path(__file__).parents[1] / "scripts" / "tds_wav.py"
)
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


def wav_bytes(samples, rate=44100):
    buffer = io.BytesIO()
    wavfile.write(buffer, rate, samples)
    return buffer.getvalue()


class WavTests(unittest.TestCase):
    def test_raw_amplitudes_and_mono(self):
        for dtype, values in [
            (np.int16, [-32768, 0, 32767]),
            (np.int32, [-2147483648, 0, 2147483647]),
            (np.uint8, [0, 128, 255]),
            (np.float32, [-0.5, 0, 0.5]),
        ]:
            samples = np.array(values, dtype=dtype)
            out = reader.read_wav_samples(wav_bytes(samples))
            np.testing.assert_array_equal(out["samples"], samples)
            self.assertEqual(out["samples"].dtype, np.float64)
            self.assertEqual(out["sourceSampleRate"], 44100)

    def test_stereo_average_without_integer_overflow(self):
        samples = np.array([[32767, 32767], [-32768, -32768], [1000, -1000]], dtype=np.int16)
        out = reader.read_wav_samples(wav_bytes(samples))
        np.testing.assert_array_equal(out["samples"], [32767, -32768, 0])
        self.assertEqual(out["sourceChannels"], 2)

    def test_pyodide_buffer_and_preserved_target_rate(self):
        raw = wav_bytes(np.array([1, 2], dtype=np.int16))

        class Proxy:
            def to_py(self):
                return memoryview(raw)

        payload = {
            "signals": [{"definition": "equation"}, {"definition": "wav", "sampleRate": 8000}]
        }
        reader.prepare_wav_signals(payload, {1: Proxy()})
        self.assertEqual(payload["signals"][1]["sampleRate"], 8000)
        self.assertEqual(payload["signals"][1]["sourceSampleRate"], 44100)
        np.testing.assert_array_equal(payload["signals"][1]["samples"], [1, 2])

    def test_missing_empty_or_invalid_audio(self):
        with self.assertRaises(ValueError):
            reader.prepare_wav_signals({"signals": [{"definition": "wav"}]}, {})
        with self.assertRaises(ValueError):
            reader.read_wav_samples(b"not a wav")
        with self.assertRaises(ValueError):
            reader.read_wav_samples(wav_bytes(np.array([], dtype=np.int16)))


if __name__ == "__main__":
    unittest.main()
