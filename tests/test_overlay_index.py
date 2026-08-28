import json
import os
import struct
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import overlay_index as indexer


def fixture(*, geometry_type="MultiLineString", coordinates=None, properties=None):
    if coordinates is None:
        coordinates = [[[1, 2], [1, 2]], [[2, 2], [5, 6]]]
    return {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "ID": 7,
            "properties": properties or {"stroke_width": 1},
            "geometry": {"type": geometry_type, "coordinates": coordinates},
        }],
    }


class OverlayIndexTests(unittest.TestCase):
    def build_fixture(self, root, value, *, force_python=False, cell_size=256):
        source = root / "overlay.json"
        output = root / "overlay.nsovl"
        source.write_text(json.dumps(value), encoding="utf-8")
        mode = "1" if force_python else "0"
        with mock.patch.dict(os.environ, {"NEUROSCOPE_OVERLAY_INDEX_PYTHON": mode}):
            metadata = indexer.build_index(source, output, cell_size=cell_size)
        return source, output, metadata

    def test_node_and_python_builders_preserve_counts_bounds_and_degenerate_segments(self):
        for force_python in (False, True):
            with self.subTest(force_python=force_python), tempfile.TemporaryDirectory() as temporary:
                source, output, metadata = self.build_fixture(
                    Path(temporary), fixture(), force_python=force_python
                )
                self.assertEqual(metadata.feature_count, 1)
                self.assertEqual(metadata.primitive_count, 2)
                self.assertEqual(metadata.segment_count, 2)
                self.assertEqual(metadata.vertex_count, 4)
                self.assertEqual(metadata.degenerate_count, 1)
                self.assertEqual(metadata.bounds, indexer.Bounds(1, 2, 5, 6))
                self.assertTrue(metadata.coordinates_exact)
                self.assertEqual(metadata.source.sha256, indexer.fingerprint_source(source, include_digest=True).sha256)
                with indexer.read_index(output, expected_fingerprint=indexer.fingerprint_source(source)) as opened:
                    self.assertEqual(opened.features[0].bounds, indexer.Bounds(1, 2, 5, 6))
                    self.assertEqual(opened.feature_for_segment(1).source_id, 7)
                    result = opened.query(0, 0, 10, 10, limit=1)
                    self.assertEqual(result.matching_feature_count, 1)
                    self.assertEqual(result.matching_primitive_count, 2)
                    self.assertEqual(result.matching_segment_count, 2)
                    self.assertTrue(result.counts_exact)
                    self.assertTrue(result.sampled)
                    self.assertTrue(result.approximate)

    def test_structural_splitter_handles_braces_quotes_and_escaped_text(self):
        properties = {
            "note": 'literal } ], "features": [{ and escaped slash \\ remain data',
            "unicode": "microglia μ",
        }
        with tempfile.TemporaryDirectory() as temporary:
            _, output, metadata = self.build_fixture(Path(temporary), fixture(properties=properties))
            self.assertEqual(metadata.segment_count, 2)
            with indexer.read_index(output) as opened:
                self.assertEqual(opened.features[0].attributes["properties"], properties)

    def test_multivertex_primitive_map_and_grid_boundary_query(self):
        value = fixture(
            geometry_type="LineString",
            coordinates=[[0, 0], [2, 0], [4, 0]],
        )
        with tempfile.TemporaryDirectory() as temporary:
            _, output, metadata = self.build_fixture(Path(temporary), value, cell_size=2)
            self.assertEqual((metadata.primitive_count, metadata.segment_count, metadata.vertex_count), (1, 2, 3))
            self.assertFalse(metadata.primitive_ids_implicit)
            with indexer.read_index(output) as opened:
                result = opened.query(1.5, -0.1, 2.5, 0.1)
                self.assertEqual(result.matching_segment_count, 2)
                self.assertEqual(result.matching_primitive_count, 1)
                self.assertEqual({segment.primitive_id for segment in result.segments}, {0})

    def test_float32_rounding_does_not_hide_decimal_extrema(self):
        decimal = fixture(coordinates=[[[0.1, 0.2], [0.1, 0.2]]])
        with tempfile.TemporaryDirectory() as temporary:
            _, output, metadata = self.build_fixture(Path(temporary), decimal)
            self.assertFalse(metadata.coordinates_exact)
            self.assertGreater(metadata.max_coordinate_error, 0)
            with indexer.read_index(output) as opened:
                result = opened.query(0.1, 0.2, 0.1, 0.2)
                self.assertEqual(result.matching_segment_count, 1)
                self.assertEqual(result.returned_count, 1)

    def test_malformed_nan_and_deep_json_fail_without_output(self):
        invalid_sources = [
            '{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"MultiLineString","coordinates":[[[NaN,0],[1,1]]]}}]}',
            '{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"MultiLineString","coordinates":[[[0,0],[true,1]]]}}]}',
            '{"type":"FeatureCollection","features":[',
        ]
        for force_python in (False, True):
            for source_text in invalid_sources:
                with self.subTest(force_python=force_python), tempfile.TemporaryDirectory() as temporary:
                    root = Path(temporary)
                    source = root / "invalid.json"
                    output = root / "invalid.nsovl"
                    source.write_text(source_text, encoding="utf-8")
                    mode = "1" if force_python else "0"
                    with mock.patch.dict(os.environ, {"NEUROSCOPE_OVERLAY_INDEX_PYTHON": mode}):
                        with self.assertRaises(indexer.OverlayValidationError):
                            indexer.build_index(source, output)
                    self.assertFalse(output.exists())

        for force_python in (False, True):
            with self.subTest(deep=True, force_python=force_python), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                source = root / "deep.json"
                output = root / "deep.nsovl"
                source.write_text(
                    '{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"deep":'
                    + "[" * 2_000 + "0" + "]" * 2_000
                    + '},"geometry":{"type":"MultiLineString","coordinates":[[[0,0],[1,1]]]}}]}',
                    encoding="utf-8",
                )
                mode = "1" if force_python else "0"
                with mock.patch.dict(os.environ, {"NEUROSCOPE_OVERLAY_INDEX_PYTHON": mode}):
                    with self.assertRaises(indexer.OverlayValidationError):
                        indexer.build_index(source, output)
                self.assertFalse(output.exists())

    def test_stale_corrupt_and_truncated_indexes_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, output, metadata = self.build_fixture(root, fixture())
            stale = metadata.source.to_dict()
            stale["size"] += 1
            with self.assertRaises(indexer.OverlayIndexStaleError):
                indexer.inspect_index(output, expected_fingerprint=stale)

            truncated = root / "truncated.nsovl"
            truncated.write_bytes(output.read_bytes()[:100])
            with self.assertRaises(indexer.OverlayIndexFormatError):
                indexer.inspect_index(truncated)

            corrupt = root / "corrupt.nsovl"
            payload = bytearray(output.read_bytes())
            payload[0] ^= 0xFF
            corrupt.write_bytes(payload)
            with self.assertRaises(indexer.OverlayIndexFormatError):
                indexer.inspect_index(corrupt)

            old_version = root / "old-version.nsovl"
            payload = bytearray(output.read_bytes())
            struct.pack_into("<I", payload, 8, indexer.INDEX_VERSION - 1)
            old_version.write_bytes(payload)
            with self.assertRaisesRegex(indexer.OverlayIndexFormatError, "unsupported"):
                indexer.inspect_index(old_version)

            bad_offsets = root / "bad-offsets.nsovl"
            payload = bytearray(output.read_bytes())
            offset_section = metadata.sections["grid_offsets"]
            struct.pack_into(
                "<Q",
                payload,
                offset_section["offset"] + offset_section["length"] - 8,
                metadata.grid_entry_count - 1,
            )
            bad_offsets.write_bytes(payload)
            with self.assertRaisesRegex(indexer.OverlayIndexFormatError, "do not end"):
                indexer.inspect_index(bad_offsets)

            bad_occupied = root / "bad-occupied.nsovl"
            payload = bytearray(output.read_bytes())
            occupied_section = metadata.sections["occupied_cells"]
            struct.pack_into(
                "<I",
                payload,
                occupied_section["offset"],
                metadata.grid_cols * metadata.grid_rows,
            )
            bad_occupied.write_bytes(payload)
            with self.assertRaisesRegex(indexer.OverlayIndexFormatError, "outside the grid"):
                indexer.inspect_index(bad_occupied)

            source.write_text(source.read_text(encoding="utf-8") + " ", encoding="utf-8")
            with self.assertRaises(indexer.OverlayIndexStaleError):
                indexer.inspect_index(output, expected_fingerprint=indexer.fingerprint_source(source))

    def test_grid_amplification_is_rejected_before_allocation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "overlay.json"
            output = root / "overlay.nsovl"
            source.write_text(json.dumps(fixture()), encoding="utf-8")
            with (
                mock.patch.dict(os.environ, {"NEUROSCOPE_OVERLAY_INDEX_PYTHON": "1"}),
                mock.patch.object(indexer, "MAX_GRID_ENTRIES", 1),
            ):
                with self.assertRaisesRegex(indexer.OverlayValidationError, "grid would require"):
                    indexer.build_index(source, output)
            self.assertFalse(output.exists())

    def test_sparse_million_cell_query_uses_only_occupied_cells(self):
        sparse = fixture(coordinates=[
            [[0, 0], [0, 0]],
            [[999_999, 0], [999_999, 0]],
        ])
        with tempfile.TemporaryDirectory() as temporary:
            _, output, metadata = self.build_fixture(Path(temporary), sparse, cell_size=1)
            self.assertEqual(metadata.grid_cols, 1_000_000)
            self.assertEqual(metadata.occupied_cell_count, 2)
            with indexer.read_index(output) as opened:
                cells, complete, factor = indexer._select_visible_cells(
                    opened, indexer.Bounds(0, 0, 999_999, 0), 100
                )
                self.assertEqual(cells, [0, 999_999])
                self.assertTrue(complete)
                self.assertEqual(factor, 1)
                with mock.patch("overlay_index._cell_span", wraps=indexer._cell_span) as spans:
                    result = opened.query(0, 0, 999_999, 0, limit=10)
                self.assertLessEqual(spans.call_count, 10)
                self.assertEqual(result.matching_segment_count, 2)
                self.assertFalse(result.approximate)

    def test_fast_builder_timeout_is_bounded_and_configurable(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "overlay.json"
            output = root / "overlay.nsovl"
            source.write_text(json.dumps(fixture()), encoding="utf-8")
            with (
                mock.patch.dict(os.environ, {
                    "NEUROSCOPE_OVERLAY_INDEX_PYTHON": "0",
                    "NEUROSCOPE_OVERLAY_INDEX_TIMEOUT_SECONDS": "1.5",
                }),
                mock.patch("overlay_index.subprocess.run", side_effect=subprocess.TimeoutExpired("node", 1.5)),
            ):
                with self.assertRaisesRegex(indexer.OverlayIndexError, "1.5-second time limit"):
                    indexer.build_index(source, output)
            self.assertFalse(output.exists())

    def test_fast_builder_maps_only_marked_source_errors_to_validation(self):
        outcomes = [
            (
                subprocess.CompletedProcess([], 2, "", "NSOVL_VALIDATION:bad geometry\n"),
                indexer.OverlayValidationError,
                "bad geometry",
            ),
            (
                subprocess.CompletedProcess([], 1, "", "NSOVL_INTERNAL:no space left\n"),
                indexer.OverlayIndexError,
                "exit code 1",
            ),
            (
                subprocess.CompletedProcess([], -9, "", ""),
                indexer.OverlayIndexError,
                "signal 9",
            ),
        ]
        for completed, error_type, message in outcomes:
            with self.subTest(returncode=completed.returncode), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                source = root / "overlay.json"
                output = root / "overlay.nsovl"
                source.write_text(json.dumps(fixture()), encoding="utf-8")
                with (
                    mock.patch.dict(os.environ, {"NEUROSCOPE_OVERLAY_INDEX_PYTHON": "0"}),
                    mock.patch("overlay_index.subprocess.run", return_value=completed),
                ):
                    with self.assertRaisesRegex(error_type, message):
                        indexer.build_index(source, output)
                self.assertFalse(output.exists())

    def test_invalid_decoded_bounds_are_rejected(self):
        with self.assertRaises(ValueError):
            indexer._bounds_from_json({"min_x": 2, "min_y": 0, "max_x": 1, "max_y": 1})


if __name__ == "__main__":
    unittest.main()
