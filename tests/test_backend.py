import shutil
import subprocess
import tempfile
import unittest
from concurrent.futures import Future
from pathlib import Path
from unittest import mock

import app as backend


JP2_FIXTURE = Path("/home/mitralab/MapMarmosetUG3/Marmoset/test16bit.jp2")
TIFF_FIXTURE = Path("/home/mitralab/dm2d/2D-Skeletonization/data/stp/img/190322_59_2501_4431.tif")


class DeferredExecutor:
    def __init__(self):
        self.submissions = []

    def submit(self, function, *args):
        future = Future()
        self.submissions.append((function, args, future))
        return future


class BackendTests(unittest.TestCase):
    def test_safe_filename_and_public_metadata(self):
        self.assertEqual(backend.safe_filename("../../unsafe brain?.jp2"), "unsafe brain_.jp2")
        self.assertEqual(backend.public_metadata({"id": "x", "_source": "/private"}), {"id": "x", "queuePosition": None, "queueDepth": 0})
        with self.assertRaises(ValueError):
            backend.record_dir("../escape")

    def test_image_library_is_bounded_ordered_private_and_resilient(self):
        original_root = backend.DATA_ROOT
        with backend.JOB_LOCK:
            original_queue = list(backend.QUEUED_JOBS)
            original_active = set(backend.ACTIVE_JOBS)
            backend.QUEUED_JOBS.clear()
            backend.ACTIVE_JOBS.clear()

        with tempfile.TemporaryDirectory() as temporary:
            backend.DATA_ROOT = Path(temporary)
            try:
                def add_record(image_id, status, updated_at, **extra):
                    metadata = {
                        "id": image_id,
                        "filename": f"{image_id}.jp2",
                        "format": "JP2",
                        "status": status,
                        "createdAt": updated_at,
                        "updatedAt": updated_at,
                        "_source": f"/private/{image_id}.jp2",
                        "_sourceFingerprint": {"inode": 123},
                    }
                    metadata.update(extra)
                    backend.write_metadata(image_id, metadata)

                add_record("ready-old", "ready", "2026-01-01T00:00:00+00:00")
                add_record("ready-new", "ready", "2026-03-01T00:00:00+00:00")
                add_record("queued-newest", "processing", "2026-04-01T00:00:00+00:00")
                add_record("error-record", "error", "2026-02-01T00:00:00+00:00")
                add_record(
                    "nonfinite-record",
                    "ready",
                    "2026-05-01T00:00:00+00:00",
                    width=float("nan"),
                    displayWindows=[{"min": 0, "max": float("inf")}],
                )
                with backend.JOB_LOCK:
                    backend.QUEUED_JOBS.append("queued-newest")

                corrupt = Path(temporary) / "corrupt-record"
                corrupt.mkdir()
                (corrupt / "metadata.json").write_text("{not json", encoding="utf-8")

                mismatch = Path(temporary) / "mismatch-record"
                mismatch.mkdir()
                (mismatch / "metadata.json").write_text(
                    '{"id":"different-record","filename":"private.jp2","status":"ready"}',
                    encoding="utf-8",
                )

                private = Path(temporary) / "_overlays"
                private.mkdir()
                (private / "metadata.json").write_text(
                    '{"id":"_overlays","filename":"private.json","status":"ready"}',
                    encoding="utf-8",
                )

                symlink = Path(temporary) / "linked-record"
                symlink.symlink_to(backend.record_dir("ready-new"), target_is_directory=True)

                metadata_link = Path(temporary) / "linked-metadata"
                metadata_link.mkdir()
                (metadata_link / "metadata.json").symlink_to(
                    backend.metadata_path("ready-new")
                )

                oversized = Path(temporary) / "oversized-record"
                oversized.mkdir()
                (oversized / "metadata.json").write_text(
                    " " * (backend.MAX_IMAGE_METADATA_BYTES + 1),
                    encoding="utf-8",
                )

                page = backend.list_images(limit=2)
                self.assertEqual(page["total"], 4)
                self.assertTrue(page["truncated"])
                self.assertEqual(
                    [record["id"] for record in page["images"]],
                    ["queued-newest", "ready-new"],
                )
                for record in page["images"]:
                    self.assertFalse(any(key.startswith("_") for key in record))

                complete = backend.list_images(limit=10)
                self.assertFalse(complete["truncated"])
                self.assertEqual(
                    [record["id"] for record in complete["images"]],
                    ["queued-newest", "ready-new", "error-record", "ready-old"],
                )
                queued = complete["images"][0]
                self.assertEqual(queued["status"], "queued")
                self.assertEqual(queued["queuePosition"], 1)
                self.assertEqual(queued["queueDepth"], 1)

                for invalid_limit in (0, backend.IMAGE_LIBRARY_MAX_LIMIT + 1):
                    with self.assertRaises(backend.HTTPException) as caught:
                        backend.list_images(limit=invalid_limit)
                    self.assertEqual(caught.exception.status_code, 400)
            finally:
                backend.DATA_ROOT = original_root
                with backend.JOB_LOCK:
                    backend.QUEUED_JOBS.clear()
                    backend.QUEUED_JOBS.extend(original_queue)
                    backend.ACTIVE_JOBS.clear()
                    backend.ACTIVE_JOBS.update(original_active)

    def test_image_library_keeps_recent_nonready_records_beyond_limit(self):
        original_root = backend.DATA_ROOT
        with tempfile.TemporaryDirectory() as temporary:
            backend.DATA_ROOT = Path(temporary)
            try:
                def add_record(image_id, status, updated_at):
                    backend.write_metadata(
                        image_id,
                        {
                            "id": image_id,
                            "filename": f"{image_id}.jp2",
                            "format": "JP2",
                            "status": status,
                            "createdAt": updated_at,
                            "updatedAt": updated_at,
                        },
                    )

                for index in range(backend.IMAGE_LIBRARY_MAX_LIMIT + 5):
                    add_record(
                        f"archive-{index:03d}",
                        "ready",
                        f"2025-01-01T00:{index // 60:02d}:{index % 60:02d}+00:00",
                    )

                add_record("latest-error", "error", "2026-01-01T00:00:00+00:00")
                add_record("latest-processing", "processing", "2026-02-01T00:00:00+00:00")
                add_record("latest-queued", "queued", "2026-03-01T00:00:00+00:00")
                add_record("latest-uploading", "uploading", "2026-04-01T00:00:00+00:00")

                page = backend.list_images(limit=backend.IMAGE_LIBRARY_MAX_LIMIT)
                self.assertEqual(page["total"], backend.IMAGE_LIBRARY_MAX_LIMIT + 9)
                self.assertTrue(page["truncated"])
                self.assertEqual(len(page["images"]), backend.IMAGE_LIBRARY_MAX_LIMIT)
                self.assertEqual(
                    [record["id"] for record in page["images"][:5]],
                    [
                        "latest-uploading",
                        "latest-queued",
                        "latest-processing",
                        "latest-error",
                        "archive-204",
                    ],
                )
                self.assertEqual(page["images"][-1]["id"], "archive-009")
            finally:
                backend.DATA_ROOT = original_root

    def test_vips_inspection(self):
        if not backend.VIPS:
            self.skipTest("vips not installed")
        with tempfile.TemporaryDirectory() as temporary:
            fixture = Path(temporary) / "test.tif"
            subprocess.run([backend.VIPS, "black", str(fixture), "32", "32", "--bands=3"], check=True)
            fixture16 = Path(temporary) / "test16.tif"
            subprocess.run([backend.VIPS, "cast", str(fixture), str(fixture16), "ushort"], check=True)
            details = backend.inspect_image(fixture16)
            self.assertEqual((details["width"], details["height"]), (32, 32))
            self.assertEqual(details["bands"], 3)
            self.assertEqual(details["pixelFormat"], "ushort")

    def test_jp2_and_tiff_build_real_pyramids(self):
        if not backend.VIPS:
            self.skipTest("vips not installed")
        original_root = backend.DATA_ROOT
        with tempfile.TemporaryDirectory() as temporary:
            backend.DATA_ROOT = Path(temporary)
            try:
                image_id = "tiff-fixture"
                directory = backend.record_dir(image_id)
                directory.mkdir()
                source = directory / "source.tif"
                subprocess.run([backend.VIPS, "black", str(source), "32", "32", "--bands=3"], check=True)
                backend.write_metadata(image_id, {
                    "id": image_id,
                    "filename": "source.tif",
                    "format": "TIFF",
                    "fileSize": source.stat().st_size,
                    "status": "queued",
                    "progress": 0,
                    "_source": str(source),
                })
                backend.build_tile_pyramid(image_id)
                metadata = backend.read_metadata(image_id)
                self.assertEqual(metadata["status"], "ready")
                levels = [path for path in (directory / "image_files").iterdir() if path.is_dir()]
                self.assertEqual(metadata["maxLevel"], len(levels) - 1)
                self.assertTrue((directory / "image_files" / str(metadata["maxLevel"]) / "0_0.jpg").is_file())
                self.assertTrue((directory / "image.dzi").is_file())
            finally:
                backend.DATA_ROOT = original_root

    def test_invalid_image_records_clear_error(self):
        original_root = backend.DATA_ROOT
        with tempfile.TemporaryDirectory() as temporary:
            backend.DATA_ROOT = Path(temporary)
            try:
                directory = backend.record_dir("invalid-fixture")
                directory.mkdir()
                source = directory / "source.tif"
                source.write_bytes(b"this is not a tiff")
                backend.write_metadata("invalid-fixture", {
                    "id": "invalid-fixture",
                    "filename": "invalid.tif",
                    "status": "queued",
                    "_source": str(source),
                })
                backend.build_tile_pyramid("invalid-fixture")
                metadata = backend.read_metadata("invalid-fixture")
                self.assertEqual(metadata["status"], "error")
                self.assertTrue(metadata["error"])
            finally:
                backend.DATA_ROOT = original_root


    def test_queue_positions_and_safe_deletion(self):
        original_root = backend.DATA_ROOT
        original_processors = backend.PROCESSORS
        with backend.JOB_LOCK:
            original_queue = list(backend.QUEUED_JOBS)
            original_active = set(backend.ACTIVE_JOBS)
            original_futures = dict(backend.JOB_FUTURES)
            backend.QUEUED_JOBS.clear()
            backend.ACTIVE_JOBS.clear()
            backend.JOB_FUTURES.clear()

        with tempfile.TemporaryDirectory() as temporary:
            backend.DATA_ROOT = Path(temporary)
            deferred = DeferredExecutor()
            backend.PROCESSORS = deferred
            try:
                for image_id, status in (
                    ("first-job", "processing"),
                    ("second-job", "queued"),
                ):
                    directory = backend.record_dir(image_id)
                    directory.mkdir()
                    source = directory / "source.jp2"
                    source.write_bytes(b"fixture")
                    backend.write_metadata(image_id, {
                        "id": image_id,
                        "filename": f"{image_id}.jp2",
                        "status": status,
                        "message": "Building deep-zoom pyramid",
                        "_source": str(source),
                    })
                    backend.queue_processing(image_id)

                first = backend.public_metadata(backend.read_metadata("first-job"))
                second = backend.public_metadata(backend.read_metadata("second-job"))
                self.assertEqual(first["status"], "queued")
                self.assertEqual(first["message"], "Queued for processing")
                self.assertEqual((first["queuePosition"], first["queueDepth"]), (1, 2))
                self.assertEqual((second["queuePosition"], second["queueDepth"]), (2, 2))

                first_future = deferred.submissions[0][2]
                self.assertEqual(backend.delete_image("first-job"), {"removed": "first-job"})
                self.assertTrue(first_future.cancelled())
                self.assertFalse(backend.record_dir("first-job").exists())

                second = backend.public_metadata(backend.read_metadata("second-job"))
                self.assertEqual((second["queuePosition"], second["queueDepth"]), (1, 1))

                def assert_active_delete_is_rejected(active_id):
                    active = backend.public_metadata(backend.read_metadata(active_id))
                    self.assertEqual(active["status"], "processing")
                    self.assertIsNone(active["queuePosition"])
                    self.assertEqual(active["queueDepth"], 0)
                    with self.assertRaises(backend.HTTPException) as caught:
                        backend.delete_image(active_id)
                    self.assertEqual(caught.exception.status_code, 409)
                    self.assertTrue(backend.record_dir(active_id).is_dir())

                function, args, _ = deferred.submissions[1]
                with mock.patch.object(
                    backend,
                    "build_tile_pyramid",
                    side_effect=assert_active_delete_is_rejected,
                ):
                    function(*args)
                self.assertNotIn("second-job", backend.ACTIVE_JOBS)
                self.assertNotIn("second-job", backend.JOB_FUTURES)
            finally:
                backend.DATA_ROOT = original_root
                backend.PROCESSORS = original_processors
                with backend.JOB_LOCK:
                    backend.QUEUED_JOBS.clear()
                    backend.QUEUED_JOBS.extend(original_queue)
                    backend.ACTIVE_JOBS.clear()
                    backend.ACTIVE_JOBS.update(original_active)
                    backend.JOB_FUTURES.clear()
                    backend.JOB_FUTURES.update(original_futures)


if __name__ == "__main__":
    unittest.main()
