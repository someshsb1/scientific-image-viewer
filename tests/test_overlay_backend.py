import asyncio
import json
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest import mock

from starlette.requests import Request

import app as backend


def multiline_fixture() -> bytes:
    return json.dumps(
        {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "ID": 17,
                    "properties": {"stroke_width": 1},
                    "geometry": {
                        "type": "MultiLineString",
                        "coordinates": [
                            [[1, 2], [3, 4]],
                            [[3, 4], [5, 6]],
                        ],
                    },
                }
            ],
        },
        separators=(",", ":"),
    ).encode("utf-8")


def streaming_request(path: str, body: bytes, filename: str) -> Request:
    messages = iter(
        [
            {"type": "http.request", "body": body[: len(body) // 2], "more_body": True},
            {"type": "http.request", "body": body[len(body) // 2 :], "more_body": False},
        ]
    )

    async def receive():
        return next(messages)

    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": path,
            "headers": [(b"content-length", str(len(body)).encode("ascii"))],
            "query_string": f"filename={filename}".encode("ascii"),
        },
        receive,
    )


class IndexedOverlayBackendTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        temporary = Path(self.temporary.name)
        self.data_root = temporary / "records"
        self.mount_root = temporary / "mount"
        self.data_root.mkdir()
        self.mount_root.mkdir()
        self.original_data_root = backend.DATA_ROOT
        self.original_mount_roots = backend.MOUNT_ROOTS
        self.original_limit = backend.MAX_INDEXED_OVERLAY_BYTES
        self.original_overlay_age = backend.MAX_UPLOADED_OVERLAY_AGE_SECONDS
        backend.DATA_ROOT = self.data_root
        backend.MOUNT_ROOTS = {"test": self.mount_root}
        backend.MAX_INDEXED_OVERLAY_BYTES = 2 * 1024**3

    def tearDown(self):
        backend.DATA_ROOT = self.original_data_root
        backend.MOUNT_ROOTS = self.original_mount_roots
        backend.MAX_INDEXED_OVERLAY_BYTES = self.original_limit
        backend.MAX_UPLOADED_OVERLAY_AGE_SECONDS = self.original_overlay_age
        self.temporary.cleanup()

    def test_mounted_registration_reuses_cache_and_queries_bounded_flat_segments(self):
        source = self.mount_root / "large.json"
        original = multiline_fixture()
        source.write_bytes(original)

        first = backend.register_mounted_overlay("test", {"path": "large.json"})
        first_payload = json.loads(first.body)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(first_payload["kind"], "indexed-geojson")
        self.assertEqual(first_payload["status"], "ready")
        self.assertEqual(first_payload["featureCount"], 1)
        self.assertEqual(first_payload["primitiveCount"], 2)
        self.assertEqual(first_payload["segmentCount"], 2)
        self.assertEqual(first_payload["vertexCount"], 4)
        self.assertEqual(first_payload["bounds"], {"minX": 1.0, "minY": 2.0, "maxX": 5.0, "maxY": 6.0})
        self.assertNotIn("_source", first_payload)
        self.assertNotIn("_index", first_payload)

        stored = backend.read_overlay_metadata(first_payload["id"])
        alias = Path(stored["_source"])
        self.assertTrue(alias.is_symlink())
        self.assertEqual(alias.resolve(), source)
        self.assertEqual(source.read_bytes(), original)
        self.assertTrue(Path(stored["_index"]).is_file())

        second = backend.register_mounted_overlay("test", {"path": "large.json"})
        second_payload = json.loads(second.body)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second_payload["id"], first_payload["id"])

        with self.assertRaises(backend.HTTPException) as shared_cache:
            backend.delete_overlay(first_payload["id"])
        self.assertEqual(shared_cache.exception.status_code, 409)
        self.assertTrue(backend.overlay_record_dir(first_payload["id"]).is_dir())

        response = backend.get_overlay_geometry(first_payload["id"], 0, 0, 10, 10, 10)
        geometry = json.loads(response.body)
        self.assertEqual(geometry["segmentCount"], 2)
        self.assertEqual(len(geometry["segments"]), 8)
        self.assertEqual(geometry["matchingFeatureCount"], 1)
        self.assertEqual(geometry["matchingPrimitiveCount"], 2)
        self.assertFalse(geometry["approximate"])
        self.assertTrue(all(isinstance(value, (int, float)) for value in geometry["segments"]))

        bounded = json.loads(
            backend.get_overlay_geometry(first_payload["id"], 0, 0, 10, 10, 1).body
        )
        self.assertLessEqual(bounded["segmentCount"], 1)
        self.assertLessEqual(len(bounded["segments"]), 4)
        self.assertTrue(bounded["approximate"])

        outside = json.loads(
            backend.get_overlay_geometry(first_payload["id"], 100, 100, 110, 110, 10).body
        )
        self.assertEqual(outside["segments"], [])
        self.assertEqual(outside["segmentCount"], 0)

        edge_touch = json.loads(
            backend.get_overlay_geometry(first_payload["id"], -10, 0, 1, 10, 10).body
        )
        self.assertEqual(edge_touch["segments"], [])
        self.assertEqual(edge_touch["segmentCount"], 0)

        with self.assertRaises(backend.HTTPException) as invalid_bounds:
            backend.get_overlay_geometry(first_payload["id"], 2, 0, 2, 10, 10)
        self.assertEqual(invalid_bounds.exception.status_code, 400)

        source.write_bytes(original + b"\n")
        with self.assertRaises(backend.HTTPException) as changed:
            backend.get_overlay_geometry(first_payload["id"], 0, 0, 10, 10, 10)
        self.assertEqual(changed.exception.status_code, 409)

    def test_raw_upload_streams_once_off_event_loop_and_cleans_invalid_input(self):
        body = multiline_fixture()
        request = streaming_request("/api/overlays/raw", body, "local.json")
        offload = mock.AsyncMock(wraps=backend.run_in_threadpool)
        with mock.patch.object(backend, "run_in_threadpool", offload):
            response = asyncio.run(backend.upload_overlay_raw(request, filename="local.json"))
        offload.assert_awaited_once()
        payload = json.loads(response.body)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(payload["sourceKind"], "upload")
        self.assertEqual(payload["fileSize"], len(body))
        stored = backend.read_overlay_metadata(payload["id"])
        self.assertEqual(Path(stored["_source"]).read_bytes(), body)
        self.assertFalse(Path(stored["_source"]).is_symlink())

        deleted = backend.delete_overlay(payload["id"])
        self.assertEqual(deleted.status_code, 204)
        self.assertFalse(backend.overlay_record_dir(payload["id"]).exists())

        existing = {path.name for path in backend.overlay_records_root().iterdir()}
        bad_request = streaming_request("/api/overlays/raw", b"not geojson", "bad.json")
        with self.assertRaises(backend.HTTPException) as invalid:
            asyncio.run(backend.upload_overlay_raw(bad_request, filename="bad.json"))
        self.assertEqual(invalid.exception.status_code, 400)
        self.assertEqual({path.name for path in backend.overlay_records_root().iterdir()}, existing)

    def test_raw_limit_is_checked_before_creating_a_record(self):
        backend.MAX_INDEXED_OVERLAY_BYTES = 10
        request = streaming_request("/api/overlays/raw", b"12345678901", "too-large.json")
        with self.assertRaises(backend.HTTPException) as caught:
            asyncio.run(backend.upload_overlay_raw(request, filename="too-large.json"))
        self.assertEqual(caught.exception.status_code, 413)
        self.assertFalse(backend.overlay_records_root().exists())

    def test_degenerate_decimal_geometry_remains_queryable_at_exact_bounds(self):
        source = self.mount_root / "point-like-line.json"
        source.write_text(
            json.dumps(
                {
                    "type": "FeatureCollection",
                    "features": [
                        {
                            "type": "Feature",
                            "geometry": {
                                "type": "LineString",
                                "coordinates": [[0.1, 0.2], [0.1, 0.2]],
                            },
                            "properties": {},
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )
        registered = json.loads(
            backend.register_mounted_overlay("test", {"path": source.name}).body
        )
        self.assertEqual(
            registered["bounds"],
            {"minX": 0.1, "minY": 0.2, "maxX": 0.1, "maxY": 0.2},
        )
        geometry = json.loads(
            backend.get_overlay_geometry(
                registered["id"],
                0.0,
                0.0,
                0.1,
                0.2,
                10,
            ).body
        )
        self.assertEqual(geometry["segmentCount"], 1)
        self.assertEqual(len(geometry["segments"]), 4)

    def test_busy_indexer_rejects_without_waiting_or_leaving_records(self):
        mounted = self.mount_root / "busy.json"
        mounted.write_bytes(multiline_fixture())
        self.assertTrue(backend.OVERLAY_OPERATION_GATE.acquire(blocking=False))
        try:
            request = streaming_request(
                "/api/overlays/raw",
                multiline_fixture(),
                "busy-local.json",
            )
            with self.assertRaises(backend.HTTPException) as raw_busy:
                asyncio.run(backend.upload_overlay_raw(request, filename="busy-local.json"))
            self.assertEqual(raw_busy.exception.status_code, 429)
            self.assertEqual(raw_busy.exception.headers, {"Retry-After": "5"})
            self.assertEqual(list(backend.overlay_records_root().iterdir()), [])

            with self.assertRaises(backend.HTTPException) as mounted_busy:
                backend.register_mounted_overlay("test", {"path": "busy.json"})
            self.assertEqual(mounted_busy.exception.status_code, 429)
            self.assertEqual(mounted_busy.exception.headers, {"Retry-After": "5"})
            self.assertEqual(list(backend.overlay_records_root().iterdir()), [])
        finally:
            backend.OVERLAY_OPERATION_GATE.release()

    def test_startup_expires_orphaned_uploaded_overlay(self):
        response = asyncio.run(
            backend.upload_overlay_raw(
                streaming_request(
                    "/api/overlays/raw",
                    multiline_fixture(),
                    "expired.json",
                ),
                filename="expired.json",
            )
        )
        overlay_id = json.loads(response.body)["id"]
        metadata = backend.read_overlay_metadata(overlay_id)
        metadata["updatedAt"] = "2000-01-01T00:00:00+00:00"
        backend.write_overlay_metadata(overlay_id, metadata)
        backend.MAX_UPLOADED_OVERLAY_AGE_SECONDS = 1

        backend.sweep_incomplete_overlay_records()

        self.assertFalse(backend.overlay_record_dir(overlay_id).exists())

    def test_startup_sweep_is_uuid_scoped_and_preserves_ready_indexes(self):
        source = self.mount_root / "ready.json"
        source.write_bytes(multiline_fixture())
        ready = json.loads(backend.register_mounted_overlay("test", {"path": "ready.json"}).body)

        root = backend.overlay_records_root()
        manual = root / "manual-folder"
        manual.mkdir()
        (manual / "keep.txt").write_text("keep", encoding="utf-8")

        missing_metadata = root / str(uuid.uuid4())
        missing_metadata.mkdir()

        uploading_id = str(uuid.uuid4())
        uploading = root / uploading_id
        uploading.mkdir()
        backend.write_overlay_metadata(
            uploading_id,
            {
                "id": uploading_id,
                "kind": "indexed-geojson",
                "status": "uploading",
            },
        )

        missing_index_id = str(uuid.uuid4())
        missing_index = root / missing_index_id
        missing_index.mkdir()
        backend.write_overlay_metadata(
            missing_index_id,
            {
                "id": missing_index_id,
                "kind": "indexed-geojson",
                "status": "ready",
                "_index": str(missing_index / "geometry.nsovl"),
            },
        )

        corrupt_index_id = str(uuid.uuid4())
        corrupt_index = root / corrupt_index_id
        corrupt_index.mkdir()
        corrupt_path = corrupt_index / "geometry.nsovl"
        corrupt_path.write_bytes(b"obsolete index format")
        backend.write_overlay_metadata(
            corrupt_index_id,
            {
                "id": corrupt_index_id,
                "kind": "indexed-geojson",
                "status": "ready",
                "_index": str(corrupt_path),
            },
        )

        backend.sweep_incomplete_overlay_records()
        self.assertTrue(backend.overlay_record_dir(ready["id"]).is_dir())
        self.assertTrue(manual.is_dir())
        self.assertFalse(missing_metadata.exists())
        self.assertFalse(uploading.exists())
        self.assertFalse(missing_index.exists())
        self.assertFalse(corrupt_index.exists())


if __name__ == "__main__":
    unittest.main()
