import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient
from starlette.requests import Request

import app as backend
from iip_client import IIPClient, IIPMetadata, _encode_query


IIP_DETAILS = IIPMetadata(
    width=1000,
    height=700,
    tile_width=256,
    tile_height=256,
    resolutions=3,
    bits_per_channel=16,
    display_windows=((12.0, 640.0), (15.0, 720.0), (9.0, 590.0)),
)


class IIPClientTests(unittest.TestCase):
    def test_query_encoding_preserves_commands_but_escapes_paths(self):
        query = _encode_query(
            [
                ("FIF", "/private/a,b: c.jp2"),
                ("OBJ", "IIP,1.0"),
                ("MINMAX", "0:8,53"),
                ("JTL", "8,20587"),
            ]
        )
        self.assertEqual(
            query,
            "FIF=%2Fprivate%2Fa%2Cb%3A%20c.jp2&OBJ=IIP,1.0&MINMAX=0:8,53&JTL=8,20587",
        )

    def test_loopback_only_and_metadata_parsing(self):
        with self.assertRaises(ValueError):
            IIPClient("https://images.example.test/iip")

        client = IIPClient("http://127.0.0.1/neuroscope-iip")
        response = (
            b"Max-size:1000 700\r\n"
            b"Tile-size:256 256\r\n"
            b"Resolution-number:3\r\n"
            b"Bits-per-channel:16\r\n"
            b"Min-Max-sample-values: 12 640 15 720 9 590\r\n"
        )
        with mock.patch.object(client, "_get", return_value=(response, "text/plain")) as request:
            details = client.metadata(Path("/private/source.jp2"))

        self.assertEqual(details, IIP_DETAILS)
        self.assertEqual(
            request.call_args.args[0],
            [
                ("FIF", "/private/source.jp2"),
                ("OBJ", "Max-size"),
                ("OBJ", "Tile-size"),
                ("OBJ", "Resolution-number"),
                ("OBJ", "Bits-per-channel"),
                ("OBJ", "Min-Max-sample-values"),
            ],
        )

    def test_tile_commands_are_deterministically_ordered(self):
        client = IIPClient("http://localhost/neuroscope-iip")
        windows = [
            {"channel": 0, "min": 12, "max": 640},
            {"channel": 1, "min": 15, "max": 720},
            {"channel": 2, "min": 9, "max": 590},
        ]
        with mock.patch.object(client, "_get", return_value=(b"jpeg", "image/jpeg")) as request:
            body, content_type = client.tile(Path("/private/source.jp2"), 2, 11, windows)

        self.assertEqual((body, content_type), (b"jpeg", "image/jpeg"))
        self.assertEqual(
            request.call_args.args[0],
            [
                ("FIF", "/private/source.jp2"),
                ("GAM", "1"),
                ("MINMAX", "0:12,640"),
                ("MINMAX", "1:15,720"),
                ("MINMAX", "2:9,590"),
                ("JTL", "2,11"),
            ],
        )

    def test_probe_is_short_and_contains_no_source_path(self):
        client = IIPClient("http://127.0.0.1/neuroscope-iip")
        with mock.patch.object(client, "_get", return_value=(b"IIPImage", "text/html")) as request:
            self.assertTrue(client.probe(timeout=0.25))
        request.assert_called_once_with([], 16 * 1024, timeout=0.25, retries=0)


class FastJP2BackendTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.data_root = Path(self.temporary.name) / "records"
        self.mount_root = Path(self.temporary.name) / "mount"
        self.data_root.mkdir()
        self.mount_root.mkdir()
        self.original_data_root = backend.DATA_ROOT
        self.original_mount_roots = backend.MOUNT_ROOTS
        self.original_iip = backend.IIP
        self.original_estimator = backend.estimate_display_windows
        backend.DATA_ROOT = self.data_root
        backend.MOUNT_ROOTS = {"test": self.mount_root}
        backend.IIP = mock.Mock()
        backend.IIP.metadata.return_value = IIP_DETAILS
        backend.IIP.tile.return_value = (b"tile jpeg", "image/jpeg")
        backend.estimate_display_windows = mock.Mock(return_value=((13.0, 98.0),) * 3)

    def tearDown(self):
        backend.DATA_ROOT = self.original_data_root
        backend.MOUNT_ROOTS = self.original_mount_roots
        backend.IIP = self.original_iip
        backend.estimate_display_windows = self.original_estimator
        self.temporary.cleanup()

    def test_raw_jp2_upload_is_ready_without_a_pyramid(self):
        chunks = iter(
            [
                {"type": "http.request", "body": b"jp2-", "more_body": True},
                {"type": "http.request", "body": b"bytes", "more_body": False},
            ]
        )
        receive_count = 0

        async def receive():
            nonlocal receive_count
            if receive_count == 0:
                records = list(self.data_root.iterdir())
                self.assertEqual(len(records), 1)
                ingest = json.loads((records[0] / "metadata.json").read_text(encoding="utf-8"))
                self.assertEqual(ingest["status"], "uploading")
                self.assertEqual(ingest["fileSize"], 9)
            receive_count += 1
            return next(chunks)

        request = Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/api/images/raw",
                "headers": [(b"content-length", b"9")],
                "query_string": b"filename=test.jp2",
            },
            receive,
        )
        offload = mock.AsyncMock(wraps=backend.run_in_threadpool)
        with mock.patch.object(backend, "run_in_threadpool", offload):
            response = asyncio.run(backend.upload_image_raw(request, filename="test.jp2"))
        offload.assert_awaited_once()
        payload = json.loads(response.body)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(payload["status"], "ready")
        self.assertEqual(payload["tileBackend"], "iip")
        self.assertEqual(payload["displayWindows"][0], {"channel": 0, "min": 13.0, "max": 98.0})
        self.assertEqual(payload["displayWindowSource"], "reduced-overview-p0.5-p98-shared-rgb")
        directory = backend.record_dir(payload["id"])
        self.assertEqual((directory / "source.jp2").read_bytes(), b"jp2-bytes")
        self.assertFalse((directory / "image_files").exists())
        self.assertNotIn("_source", payload)

    def test_tile_dispatch_enforces_bounds_and_maps_xy_to_jtl(self):
        image_id = "iip-fixture"
        directory = backend.record_dir(image_id)
        directory.mkdir()
        source = directory / "source.jp2"
        source.write_bytes(b"fixture")
        metadata, status_code = backend.register_image_source(
            image_id,
            "fixture.jp2",
            ".jp2",
            source,
            source.stat().st_size,
            source_kind="upload",
        )
        self.assertEqual(status_code, 201)

        response = backend.get_tile(image_id, 2, "3_2.jpg")
        self.assertEqual(response.body, b"tile jpeg")
        backend.IIP.tile.assert_called_once_with(source, 2, 11, metadata["displayWindows"], gamma=1.0)
        with self.assertRaises(backend.HTTPException) as caught:
            backend.get_tile(image_id, 2, "4_2.jpg")
        self.assertEqual(caught.exception.status_code, 404)

    def test_odd_reduced_iip_geometry_uses_floor_grid_and_correct_row_stride(self):
        self.assertEqual(
            backend.iip_level_geometry(57369, 46849, 256, 256, 8, 3),
            (1792, 1464, 7, 6),
        )

        image_id = "odd-iip-fixture"
        directory = backend.record_dir(image_id)
        directory.mkdir()
        source = directory / "source.jp2"
        source.write_bytes(b"fixture")
        windows = [{"channel": 0, "min": 0, "max": 255}]
        backend.write_metadata(
            image_id,
            {
                "id": image_id,
                "filename": "odd.jp2",
                "format": "JP2",
                "fileSize": source.stat().st_size,
                "status": "ready",
                "sourceKind": "upload",
                "width": 57369,
                "height": 46849,
                "tileSize": 256,
                "tileWidth": 256,
                "tileHeight": 256,
                "tileFormat": "jpg",
                "tileBackend": "iip",
                "maxLevel": 8,
                "displayWindows": windows,
                "_source": str(source),
                "_sourceFingerprint": backend.source_fingerprint(source),
            },
        )

        backend.get_tile(image_id, 3, "2_5.jpg")
        backend.IIP.tile.assert_called_with(source, 3, 37, windows, gamma=1.0)
        backend.get_tile(image_id, 3, "6_5.jpg")
        self.assertEqual(backend.IIP.tile.call_args.args[2], 41)

        # Test dynamic windowing parameters
        backend.get_tile(image_id, 3, "2_5.jpg", min="10", max="200", gam=1.5)
        backend.IIP.tile.assert_called_with(source, 3, 37, [{"channel": 0, "min": 10.0, "max": 200.0}], gamma=1.5)

        for tile_name in ("7_0.jpg", "0_6.jpg"):
            with self.subTest(tile_name=tile_name):
                with self.assertRaises(backend.HTTPException) as caught:
                    backend.get_tile(image_id, 3, tile_name)
                self.assertEqual(caught.exception.status_code, 404)

    def test_mounted_browse_register_overlay_and_traversal(self):
        image = self.mount_root / "section.jp2"
        image.write_bytes(b"fixture")
        overlay = self.mount_root / "cells.json"
        overlay.write_text('[{"x": 1, "y": 2}]', encoding="utf-8")
        (self.mount_root / "ignored.txt").write_text("no", encoding="utf-8")

        listing = backend.browse_mount("test", "")
        self.assertEqual([entry["name"] for entry in listing["entries"]], ["cells.json", "section.jp2"])
        response = backend.register_mounted_image("test", {"path": "section.jp2"})
        payload = json.loads(response.body)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(payload["sourceKind"], "mounted")
        self.assertEqual(payload["mountedPath"], "section.jp2")
        self.assertNotIn("_source", payload)
        stored = backend.read_metadata(payload["id"])
        alias = Path(stored["_source"])
        self.assertTrue(alias.is_symlink())
        self.assertEqual(alias.resolve(), image)
        self.assertIn("_sourceFingerprint", stored)

        second_response = backend.register_mounted_image("test", {"path": "section.jp2"})
        second_payload = json.loads(second_response.body)
        second_alias = Path(backend.read_metadata(second_payload["id"])["_source"])
        self.assertEqual(second_response.status_code, 200)
        self.assertEqual(second_payload["id"], payload["id"])
        self.assertEqual(alias, second_alias)
        self.assertEqual(second_alias.resolve(), image)

        image.write_bytes(b"changed mounted source")
        with self.assertRaises(backend.HTTPException) as changed:
            backend.get_tile(payload["id"], 2, "0_0.jpg")
        self.assertEqual(changed.exception.status_code, 409)
        backend.IIP.tile.assert_not_called()


        file_response = backend.get_mounted_overlay("test", "cells.json")
        self.assertEqual(Path(file_response.path), overlay)

        # Test companion overlay discovery
        companions_res = backend.get_image_companions(payload["id"])
        self.assertEqual(len(companions_res["companions"]), 1)
        self.assertEqual(companions_res["companions"][0]["filename"], "cells.json")

        mount_companions = backend.find_mount_companions("test", {"path": "section.jp2"})
        self.assertEqual(len(mount_companions["companions"]), 1)
        self.assertEqual(mount_companions["companions"][0]["filename"], "cells.json")

        # Test brain series discovery
        brain_dir = self.mount_root / "MD1099" / "compressed_jp2"
        brain_dir.mkdir(parents=True, exist_ok=True)
        (brain_dir / "MD1099-F1-0001.jp2").write_bytes(b"slice1")
        (brain_dir / "MD1099-F2-0002.jp2").write_bytes(b"slice2")
        (brain_dir / "MD1099-F10-0003.jp2").write_bytes(b"slice10")
        (brain_dir / "MD1099-F1-0001.json").write_text('{"type":"FeatureCollection","features":[]}')

        brain_series = backend.get_brain_series("test", "MD1099")
        self.assertEqual(brain_series["brainId"], "MD1099")
        self.assertEqual(brain_series["sliceCount"], 3)
        self.assertEqual([s["section"] for s in brain_series["slices"]], ["F1", "F2", "F10"])
        self.assertEqual(len(brain_series["slices"][0]["companions"]), 1)

        with self.assertRaises(backend.HTTPException) as caught:
            backend.resolve_mounted_path("test", "../records", require_directory=True)
        self.assertEqual(caught.exception.status_code, 400)

    def test_absolute_path_registers_jp2_and_tiff_without_copying(self):
        jp2 = self.mount_root / "direct.jp2"
        jp2.write_bytes(b"jp2 fixture")
        jp2_response = backend.register_mounted_image_path({"path": str(jp2)})
        jp2_payload = json.loads(jp2_response.body)
        self.assertEqual(jp2_response.status_code, 201)
        self.assertEqual(jp2_payload["mountedPath"], "direct.jp2")
        jp2_alias = Path(backend.read_metadata(jp2_payload["id"])["_source"])
        self.assertTrue(jp2_alias.is_symlink())
        self.assertEqual(jp2_alias.resolve(), jp2)

        tiff = self.mount_root / "direct.tiff"
        tiff.write_bytes(b"tiff fixture")
        with mock.patch.object(backend, "queue_processing") as queue:
            tiff_response = backend.register_mounted_image_path({"path": str(tiff)})
        tiff_payload = json.loads(tiff_response.body)
        self.assertEqual(tiff_response.status_code, 202)
        self.assertEqual(tiff_payload["format"], "TIFF")
        queue.assert_called_once_with(tiff_payload["id"])
        tiff_alias = Path(backend.read_metadata(tiff_payload["id"])["_source"])
        self.assertTrue(tiff_alias.is_symlink())
        self.assertEqual(tiff_alias.resolve(), tiff)

    def test_absolute_path_reuses_relative_mounted_registration(self):
        image = self.mount_root / "reused.jp2"
        image.write_bytes(b"fixture")
        first = backend.register_mounted_image("test", {"path": image.name})
        second = backend.register_mounted_image_path({"path": str(image)})
        first_payload = json.loads(first.body)
        second_payload = json.loads(second.body)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second_payload["id"], first_payload["id"])
        self.assertEqual(len(list(self.data_root.iterdir())), 1)
        self.assertEqual(backend.IIP.metadata.call_count, 1)

    def test_absolute_path_rejects_outside_traversal_symlink_and_prefix_collision(self):
        outside = Path(self.temporary.name) / "outside.jp2"
        outside.write_bytes(b"outside")
        escape = self.mount_root / "escape.jp2"
        escape.symlink_to(outside)
        prefix_collision = Path(f"{self.mount_root}-other")
        prefix_collision.mkdir()
        prefixed = prefix_collision / "prefixed.jp2"
        prefixed.write_bytes(b"outside")

        for candidate in (
            outside,
            self.mount_root / ".." / outside.name,
            escape,
            prefixed,
        ):
            with self.subTest(candidate=candidate):
                with self.assertRaises(backend.HTTPException) as caught:
                    backend.register_mounted_image_path({"path": str(candidate)})
                self.assertEqual(caught.exception.status_code, 404)
                self.assertNotIn(str(self.mount_root), caught.exception.detail)
                self.assertNotIn(str(outside), caught.exception.detail)

    def test_absolute_path_rejects_relative_malformed_and_unsupported_inputs(self):
        unsupported = self.mount_root / "notes.png"
        unsupported.write_bytes(b"png")
        for payload in ({}, {"path": None}, {"path": 3}, {"path": "relative.jp2"}, []):
            with self.subTest(payload=payload):
                with self.assertRaises(backend.HTTPException) as caught:
                    backend.register_mounted_image_path(payload)
                self.assertEqual(caught.exception.status_code, 400)
        with self.assertRaises(backend.HTTPException) as unsupported_error:
            backend.register_mounted_image_path({"path": str(unsupported)})
        self.assertEqual(unsupported_error.exception.status_code, 400)

    def test_absolute_path_selects_deepest_root_without_fallback(self):
        nested = self.mount_root / "nested"
        nested.mkdir()
        image = nested / "section.jp2"
        image.write_bytes(b"fixture")
        backend.MOUNT_ROOTS = {"test": self.mount_root, "nested": nested}

        mount_id, resolved = backend.resolve_absolute_mounted_image_path(str(image))
        self.assertEqual((mount_id, resolved), ("nested", image))

        nested.rename(self.mount_root / "nested-offline")
        with self.assertRaises(backend.HTTPException) as caught:
            backend.register_mounted_image_path({"path": str(image)})
        self.assertEqual(caught.exception.status_code, 404)

    def test_absolute_overlay_path_describes_json_and_swc_without_private_paths(self):
        overlay_directory = self.mount_root / "overlays"
        overlay_directory.mkdir()
        fixtures = (
            (overlay_directory / "cells.json", b'{"type":"FeatureCollection","features":[]}', "JSON"),
            (overlay_directory / "neurons.swc", b"1 1 0 0 0 1 -1\n", "SWC"),
        )
        for source, content, expected_format in fixtures:
            with self.subTest(source=source):
                source.write_bytes(content)
                descriptor = backend.resolve_mounted_overlay_path({"path": str(source)})
                self.assertEqual(
                    descriptor,
                    {
                        "mountId": "test",
                        "path": f"overlays/{source.name}",
                        "name": source.name,
                        "size": len(content),
                        "format": expected_format,
                        "type": "file",
                        "kind": "overlay",
                        "modifiedAt": descriptor["modifiedAt"],
                    },
                )
                self.assertNotIn(str(self.mount_root), json.dumps(descriptor))
                self.assertFalse(any(key.startswith("_") for key in descriptor))
        self.assertEqual(list(self.data_root.iterdir()), [])

    def test_absolute_overlay_path_http_contract_keeps_path_in_post_body(self):
        source = self.mount_root / "cells.json"
        source.write_text("{}", encoding="utf-8")
        client = TestClient(backend.app)
        try:
            response = client.post(
                "/api/mounts/resolve-overlay-path",
                json={"path": str(source)},
            )
        finally:
            client.close()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.request.method, "POST")
        self.assertEqual(response.request.url.path, "/api/mounts/resolve-overlay-path")
        self.assertFalse(response.request.url.query)
        self.assertEqual(json.loads(response.request.content), {"path": str(source)})
        self.assertNotIn(str(self.mount_root), response.text)
        self.assertFalse(any(key.startswith("_") for key in response.json()))

    def test_absolute_overlay_path_rejects_escape_traversal_and_prefix_collision(self):
        outside = Path(self.temporary.name) / "outside.json"
        outside.write_text("{}", encoding="utf-8")
        escape = self.mount_root / "escape.json"
        escape.symlink_to(outside)
        prefix_root = Path(f"{self.mount_root}-other")
        prefix_root.mkdir()
        prefixed = prefix_root / "prefixed.swc"
        prefixed.write_text("1 1 0 0 0 1 -1\n", encoding="utf-8")

        for candidate in (outside, self.mount_root / ".." / outside.name, escape, prefixed):
            with self.subTest(candidate=candidate):
                with self.assertRaises(backend.HTTPException) as caught:
                    backend.resolve_mounted_overlay_path({"path": str(candidate)})
                self.assertEqual(caught.exception.status_code, 404)
                self.assertNotIn(str(self.mount_root), caught.exception.detail)
                self.assertNotIn(str(outside), caught.exception.detail)

    def test_absolute_overlay_path_rejects_malformed_images_empty_and_oversized(self):
        image = self.mount_root / "section.jp2"
        image.write_bytes(b"image")
        unsupported = self.mount_root / "notes.txt"
        unsupported.write_bytes(b"text")
        empty = self.mount_root / "empty.json"
        empty.touch()

        for payload in ({}, {"path": None}, {"path": 5}, {"path": "relative.json"}, []):
            with self.subTest(payload=payload):
                with self.assertRaises(backend.HTTPException) as caught:
                    backend.resolve_mounted_overlay_path(payload)
                self.assertEqual(caught.exception.status_code, 400)
        for source in (image, unsupported):
            with self.subTest(source=source):
                with self.assertRaises(backend.HTTPException) as caught:
                    backend.resolve_mounted_overlay_path({"path": str(source)})
                self.assertEqual(caught.exception.status_code, 400)
        with self.assertRaises(backend.HTTPException) as empty_error:
            backend.resolve_mounted_overlay_path({"path": str(empty)})
        self.assertEqual(empty_error.exception.status_code, 400)

        oversized = self.mount_root / "oversized.json"
        oversized.write_bytes(b"12345")
        with mock.patch.object(backend, "MAX_INDEXED_OVERLAY_BYTES", 4):
            with self.assertRaises(backend.HTTPException) as oversized_error:
                backend.resolve_mounted_overlay_path({"path": str(oversized)})
        self.assertEqual(oversized_error.exception.status_code, 413)

        large_swc = self.mount_root / "oversized.swc"
        large_swc.write_bytes(b"12345")
        with mock.patch.object(backend, "MAX_OVERLAY_BYTES", 4), \
             mock.patch.object(backend, "MAX_INDEXED_OVERLAY_BYTES", 10):
            with self.assertRaises(backend.HTTPException) as swc_error:
                backend.resolve_mounted_overlay_path({"path": str(large_swc)})
            # JSON still has an indexed route above the direct-file limit.
            descriptor = backend.resolve_mounted_overlay_path({"path": str(oversized)})
        self.assertEqual(swc_error.exception.status_code, 413)
        self.assertEqual(descriptor["format"], "JSON")

    def test_absolute_overlay_path_selects_deepest_root_without_fallback(self):
        nested = self.mount_root / "nested"
        nested.mkdir()
        overlay = nested / "cells.json"
        overlay.write_text("{}", encoding="utf-8")
        backend.MOUNT_ROOTS = {"test": self.mount_root, "nested": nested}
        descriptor = backend.resolve_mounted_overlay_path({"path": str(overlay)})
        self.assertEqual((descriptor["mountId"], descriptor["path"]), ("nested", "cells.json"))

        nested.rename(self.mount_root / "nested-offline")
        with self.assertRaises(backend.HTTPException) as caught:
            backend.resolve_mounted_overlay_path({"path": str(overlay)})
        self.assertEqual(caught.exception.status_code, 404)

    def test_startup_reclaims_only_incomplete_uuid_records(self):
        orphan_id = "11111111-1111-4111-8111-111111111111"
        orphan = backend.record_dir(orphan_id)
        (orphan / "image_files" / "7").mkdir(parents=True)
        (orphan / "image_files" / "7" / "0_0.jpg").write_bytes(b"partial")

        interrupted_id = "22222222-2222-4222-8222-222222222222"
        interrupted = backend.record_dir(interrupted_id)
        interrupted.mkdir()
        source = interrupted / "source.jp2"
        source.write_bytes(b"incomplete upload")
        backend.write_uploading_metadata(interrupted_id, "partial.jp2", ".jp2", source, 99)

        unrelated = self.data_root / "manual-folder"
        unrelated.mkdir()
        (unrelated / "keep.txt").write_text("keep", encoding="utf-8")

        backend.sweep_incomplete_records()
        self.assertFalse(orphan.exists())
        self.assertTrue(interrupted.exists())
        self.assertTrue(unrelated.exists())

        backend.recover_processing_jobs()
        self.assertFalse(interrupted.exists())
        self.assertTrue(unrelated.exists())

    def test_health_reports_dependency_failure(self):
        backend.IIP.probe.return_value = True
        with mock.patch.object(backend, "VIPS", "vips"), \
             mock.patch.object(backend, "VIPSHEADER", "vipsheader"), \
             mock.patch.object(backend, "KDU_EXPAND", "kdu_expand"):
            healthy = backend.health()
        self.assertEqual(healthy.status_code, 200)
        self.assertEqual(json.loads(healthy.body)["status"], "ok")

        backend.IIP.probe.side_effect = backend.IIPError("offline")
        with mock.patch.object(backend, "VIPS", "vips"), \
             mock.patch.object(backend, "VIPSHEADER", "vipsheader"), \
             mock.patch.object(backend, "KDU_EXPAND", "kdu_expand"):
            degraded = backend.health()
        payload = json.loads(degraded.body)
        self.assertEqual(degraded.status_code, 503)
        self.assertEqual(payload["status"], "degraded")
        self.assertFalse(payload["iip"])


if __name__ == "__main__":
    unittest.main()
