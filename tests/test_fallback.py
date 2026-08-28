import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import app as backend
import image_pipeline


JP2_FIXTURE = Path("/home/mitralab/MapMarmosetUG3/Marmoset/test16bit.jp2")


class KakaduFallbackTests(unittest.TestCase):
    @unittest.skipUnless(backend.KDU_EXPAND, "Kakadu is not installed")
    def test_kakadu_compatibility_fallback(self):
        original_root = backend.DATA_ROOT
        with tempfile.TemporaryDirectory() as temporary:
            backend.DATA_ROOT = Path(temporary)
            try:
                image_id = "kakadu-fixture"
                directory = backend.record_dir(image_id)
                directory.mkdir()
                source = directory / "source.jp2"
                shutil.copyfile(JP2_FIXTURE, source)
                backend.write_metadata(image_id, {
                    "id": image_id,
                    "filename": JP2_FIXTURE.name,
                    "format": "JP2",
                    "fileSize": source.stat().st_size,
                    "status": "queued",
                    "progress": 0,
                    "_source": str(source),
                })

                calls = 0

                def fail_openjpeg_once(vips, candidate, output_prefix, tile_size):
                    nonlocal calls
                    calls += 1
                    if calls == 1:
                        return subprocess.CompletedProcess([], 1, "", "forced OpenJPEG failure")
                    return image_pipeline.run_dzsave(vips, candidate, output_prefix, tile_size)

                with mock.patch.object(backend, "run_dzsave", side_effect=fail_openjpeg_once):
                    backend.build_tile_pyramid(image_id)

                metadata = backend.read_metadata(image_id)
                self.assertEqual(metadata["status"], "ready")
                self.assertEqual(metadata["decoder"], "Kakadu compatibility fallback")
                self.assertFalse((directory / "kakadu-decoded.tif").exists())
                self.assertTrue((directory / "image_files" / "0" / "0_0.jpg").is_file())
            finally:
                backend.DATA_ROOT = original_root


if __name__ == "__main__":
    unittest.main()
