import struct
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from display_window import estimate_display_windows


class DisplayWindowTests(unittest.TestCase):
    def test_reduced_overview_produces_one_shared_rgb_window(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source = directory / "source.jp2"
            source.write_bytes(b"fixture")

            pixels = []
            for value in range(100):
                pixels.extend((value, value + 10, value + 20))

            def fake_expand(command, **_kwargs):
                output = Path(command[command.index("-o") + 1])
                raster = b"".join(struct.pack(">H", value) for value in pixels)
                output.write_bytes(b"P6\n10 10\n65535\n" + raster)
                return subprocess.CompletedProcess(command, 0, "", "")

            with mock.patch("display_window.subprocess.run", side_effect=fake_expand) as run:
                windows = estimate_display_windows(
                    "/opt/kdu_expand",
                    source,
                    directory,
                    reduction_levels=7,
                    image_width=1000,
                    image_height=700,
                    channel_count=3,
                    nominal_windows=((0.0, 65535.0),) * 3,
                    threads=8,
                )

            self.assertEqual(windows[0], windows[1])
            self.assertEqual(windows[1], windows[2])
            self.assertGreater(windows[0][0], 0)
            self.assertLess(windows[0][1], 65535)
            command = run.call_args.args[0]
            self.assertEqual(command[command.index("-reduce") + 1], "7")
            self.assertFalse((directory / ".window-overview.ppm").exists())

    def test_retries_one_lower_reduction_and_cleans_partial_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source = directory / "source.jp2"
            source.write_bytes(b"fixture")
            reductions = []
            timeouts = []

            def fake_expand(command, **kwargs):
                output = Path(command[command.index("-o") + 1])
                reduction = command[command.index("-reduce") + 1]
                reductions.append(reduction)
                timeouts.append(kwargs["timeout"])
                if reduction == "8":
                    output.write_bytes(b"partial")
                    return subprocess.CompletedProcess(command, 1, "", "invalid reduction")
                self.assertFalse(output.exists())
                pixels = [value for value in range(1, 101) for _ in range(3)]
                raster = b"".join(struct.pack(">H", value) for value in pixels)
                output.write_bytes(b"P6\n10 10\n65535\n" + raster)
                return subprocess.CompletedProcess(command, 0, "", "")

            with mock.patch("display_window.subprocess.run", side_effect=fake_expand):
                windows = estimate_display_windows(
                    "/opt/kdu_expand",
                    source,
                    directory,
                    reduction_levels=8,
                    image_width=1000,
                    image_height=700,
                    channel_count=3,
                    nominal_windows=((0.0, 65535.0),) * 3,
                    threads=8,
                    timeout=5.0,
                )

            self.assertEqual(reductions, ["8", "7"])
            self.assertGreater(timeouts[0], 0)
            self.assertGreater(timeouts[1], 0)
            self.assertLessEqual(timeouts[1], timeouts[0])
            self.assertEqual(windows[0], windows[1])
            self.assertLess(windows[0][1], 65535)
            self.assertFalse((directory / ".window-overview.ppm").exists())

    def test_shallow_huge_image_uses_a_bounded_center_region(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source = directory / "source.jp2"
            source.write_bytes(b"fixture")
            captured = {}

            def fake_expand(command, **_kwargs):
                captured["command"] = command
                output = Path(command[command.index("-o") + 1])
                pixels = [value for value in range(1, 101) for _ in range(3)]
                raster = b"".join(struct.pack(">H", value) for value in pixels)
                output.write_bytes(b"P6\n10 10\n65535\n" + raster)
                return subprocess.CompletedProcess(command, 0, "", "")

            with mock.patch("display_window.subprocess.run", side_effect=fake_expand):
                estimate_display_windows(
                    "/opt/kdu_expand",
                    source,
                    directory,
                    reduction_levels=0,
                    image_width=100_000,
                    image_height=50_000,
                    channel_count=3,
                    nominal_windows=((0.0, 65535.0),) * 3,
                    threads=8,
                )

            command = captured["command"]
            self.assertIn("-region", command)
            region = command[command.index("-region") + 1]
            top, left, height, width = map(float, region.translate(str.maketrans("", "", "{}")).split(","))
            self.assertGreater(top, 0)
            self.assertGreater(left, 0)
            self.assertLess(height, 1)
            self.assertLess(width, 1)
            self.assertLessEqual(100_000 * 50_000 * height * width, 300_001)




if __name__ == "__main__":
    unittest.main()
