"""Streaming, dependency-free spatial indexes for very large GeoJSON overlays.

The on-disk ``.nsovl`` format is private to NeuroScope.  Public callers should
use :func:`build_index`, :func:`inspect_index`, and :func:`read_index` instead
of depending on section offsets directly.
"""

from __future__ import annotations

import codecs
import hashlib
import json
import math
import mmap
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import time
from array import array
from bisect import bisect_right
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, BinaryIO, Callable, Iterator, Mapping, Sequence


INDEX_SUFFIX = ".nsovl"
INDEX_MAGIC = b"NSOVLIDX"
INDEX_VERSION = 2
INDEX_HEADER_SIZE = 4096
DEFAULT_CELL_SIZE = 256.0
DEFAULT_QUERY_LIMIT = 50_000
DEFAULT_EXACT_QUERY_THRESHOLD = 200_000
MAX_GRID_CELLS_PER_SEGMENT = 4096
MAX_GRID_CELLS = 10_000_000
MAX_GRID_ENTRIES = 100_000_000
MAX_GRID_ENTRY_AMPLIFICATION = 32
MAX_STREAM_VALUE_CHARS = 128 * 1024 * 1024
STREAM_CHUNK_BYTES = 4 * 1024 * 1024
GRID_FILL_CHUNK_SEGMENTS = 262_144
FAST_BUILDER = Path(__file__).with_name("overlay_index_fast.js")
FAST_BUILDER_TIMEOUT_SECONDS = 300.0

_PREFIX = struct.Struct("<8sII")
_SEGMENT = struct.Struct("<ffff")
_U32 = struct.Struct("<I")
_U64 = struct.Struct("<Q")


class OverlayIndexError(RuntimeError):
    """Base error for overlay indexing."""


class OverlayValidationError(OverlayIndexError):
    """The source is not a supported, valid GeoJSON overlay."""


class OverlayIndexFormatError(OverlayIndexError):
    """An index is truncated, corrupt, or from an unsupported version."""


class OverlayIndexStaleError(OverlayIndexError):
    """An index does not match the expected source fingerprint."""


@dataclass(frozen=True)
class Bounds:
    min_x: float
    min_y: float
    max_x: float
    max_y: float

    def intersects(self, other: "Bounds") -> bool:
        return not (
            self.max_x < other.min_x
            or self.min_x > other.max_x
            or self.max_y < other.min_y
            or self.min_y > other.max_y
        )

    def contains(self, other: "Bounds") -> bool:
        return (
            self.min_x <= other.min_x
            and self.min_y <= other.min_y
            and self.max_x >= other.max_x
            and self.max_y >= other.max_y
        )

    def to_dict(self) -> dict[str, float]:
        return asdict(self)


@dataclass(frozen=True)
class SourceFingerprint:
    size: int
    mtime_ns: int
    inode: int
    device: int
    sha256: str | None = None

    def stat_matches(self, other: "SourceFingerprint") -> bool:
        return (
            self.size == other.size
            and self.mtime_ns == other.mtime_ns
            and self.inode == other.inode
            and self.device == other.device
        )

    def matches(self, other: "SourceFingerprint") -> bool:
        if not self.stat_matches(other):
            return False
        return not self.sha256 or not other.sha256 or self.sha256 == other.sha256

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_value(cls, value: "SourceFingerprint | Mapping[str, Any]") -> "SourceFingerprint":
        if isinstance(value, cls):
            return value
        return cls(
            size=int(value["size"]),
            mtime_ns=int(value["mtime_ns"]),
            inode=int(value["inode"]),
            device=int(value["device"]),
            sha256=value.get("sha256"),
        )


@dataclass(frozen=True)
class FeatureMetadata:
    index: int
    source_id: Any
    segment_start: int
    segment_count: int
    primitive_start: int
    primitive_count: int
    vertex_count: int
    bounds: Bounds | None
    attributes: Mapping[str, Any]

    def to_dict(self) -> dict[str, Any]:
        value = asdict(self)
        return value


@dataclass(frozen=True)
class IndexMetadata:
    version: int
    source: SourceFingerprint
    feature_count: int
    primitive_count: int
    segment_count: int
    vertex_count: int
    degenerate_count: int
    bounds: Bounds | None
    stored_bounds: Bounds | None
    coordinate_encoding: str
    coordinates_exact: bool
    max_coordinate_error: float
    cell_size: float
    grid_min_col: int
    grid_min_row: int
    grid_cols: int
    grid_rows: int
    grid_entry_count: int
    occupied_cell_count: int
    long_segment_count: int
    primitive_ids_implicit: bool
    file_size: int
    sections: Mapping[str, Mapping[str, int]]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class Segment:
    segment_id: int
    feature_index: int
    primitive_id: int
    x1: float
    y1: float
    x2: float
    y2: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class QueryResult:
    segments: tuple[Segment, ...]
    matching_feature_count: int
    matching_primitive_count: int
    matching_segment_count: int
    counts_exact: bool
    approximate: bool
    sampled: bool
    candidate_count: int
    returned_count: int

    def to_dict(self, *, include_segments: bool = True) -> dict[str, Any]:
        value = asdict(self)
        if not include_segments:
            value.pop("segments", None)
        return value


ProgressCallback = Callable[[dict[str, Any]], None]


def fingerprint_source(source: str | os.PathLike[str], *, include_digest: bool = False) -> SourceFingerprint:
    """Return the stable stat identity and, optionally, the full source SHA-256."""
    path = Path(source)
    stat = path.stat()
    digest = None
    if include_digest:
        hasher = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
                hasher.update(chunk)
        digest = hasher.hexdigest()
    return SourceFingerprint(stat.st_size, stat.st_mtime_ns, stat.st_ino, stat.st_dev, digest)


def build_index(
    source: str | os.PathLike[str],
    output: str | os.PathLike[str],
    *,
    cell_size: float = DEFAULT_CELL_SIZE,
    progress: ProgressCallback | None = None,
) -> IndexMetadata:
    """Stream a MultiLineString FeatureCollection into an atomic ``.nsovl`` index."""
    node = shutil.which("node")
    if node and FAST_BUILDER.is_file() and os.environ.get("NEUROSCOPE_OVERLAY_INDEX_PYTHON") != "1":
        return _build_index_fast(Path(source), Path(output), cell_size, progress, node)
    return _IndexBuilder(Path(source), Path(output), cell_size, progress).build()


def _build_index_fast(
    source: Path,
    output: Path,
    cell_size: float,
    progress: ProgressCallback | None,
    node: str,
) -> IndexMetadata:
    if not source.is_file():
        raise OverlayValidationError(f"Overlay source does not exist or is not a file: {source}")
    if not math.isfinite(cell_size) or cell_size <= 0:
        raise ValueError("cell_size must be a positive finite number")
    if source.resolve() == output.resolve():
        raise ValueError("overlay source and index output must be different files")
    output.parent.mkdir(parents=True, exist_ok=True)
    before = fingerprint_source(source)
    temporary = tempfile.NamedTemporaryFile(
        prefix=f".{output.name}.", suffix=".tmp", dir=output.parent, delete=False
    )
    temporary_path = Path(temporary.name)
    temporary.close()
    started = time.monotonic()
    if progress is not None:
        progress({
            "stage": "parsing",
            "completed": 0,
            "total": before.size,
            "progress": 0.0,
            "elapsed_seconds": 0.0,
        })
    try:
        try:
            timeout = float(
                os.environ.get("NEUROSCOPE_OVERLAY_INDEX_TIMEOUT_SECONDS", FAST_BUILDER_TIMEOUT_SECONDS)
            )
            if not math.isfinite(timeout) or timeout <= 0:
                raise ValueError
        except ValueError as error:
            raise ValueError("NEUROSCOPE_OVERLAY_INDEX_TIMEOUT_SECONDS must be positive and finite") from error
        try:
            completed = subprocess.run(
                [
                    node,
                    "--max-old-space-size=1024",
                    str(FAST_BUILDER),
                    str(source),
                    str(temporary_path),
                    str(cell_size),
                ],
                check=False,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired as error:
            raise OverlayIndexError(
                f"Overlay indexing exceeded its {timeout:g}-second time limit."
            ) from error
        if completed.returncode:
            detail = completed.stderr.strip().splitlines()
            validation_lines = [line for line in detail if line.startswith("NSOVL_VALIDATION:")]
            if completed.returncode == 2 and validation_lines:
                message = validation_lines[0].partition(":")[2].strip()[:500]
                raise OverlayValidationError(message or "Overlay source failed validation.")
            internal_lines = [line for line in detail if line.startswith("NSOVL_INTERNAL:")]
            internal = internal_lines[0].partition(":")[2].strip()[:300] if internal_lines else ""
            if completed.returncode < 0:
                message = f"Overlay index builder was terminated by signal {-completed.returncode}."
            else:
                message = f"Overlay index builder failed with exit code {completed.returncode}."
            if internal:
                message = f"{message} {internal}"
            raise OverlayIndexError(message)
        metadata = inspect_index(temporary_path, expected_fingerprint=before)
        after = fingerprint_source(source)
        if not before.stat_matches(after) or not metadata.source.stat_matches(after):
            raise OverlayValidationError("Overlay source changed while its index was being built.")
        os.replace(temporary_path, output)
        metadata = inspect_index(output, expected_fingerprint=after)
        if progress is not None:
            progress({
                "stage": "ready",
                "completed": after.size,
                "total": after.size,
                "progress": 1.0,
                "elapsed_seconds": time.monotonic() - started,
                "metadata": metadata.to_dict(),
            })
        return metadata
    finally:
        try:
            temporary_path.unlink()
        except FileNotFoundError:
            pass


def inspect_index(
    path: str | os.PathLike[str],
    *,
    expected_fingerprint: SourceFingerprint | Mapping[str, Any] | None = None,
) -> IndexMetadata:
    """Read and validate only an index header."""
    metadata, _ = _read_header(Path(path))
    _validate_expected_fingerprint(metadata, expected_fingerprint)
    return metadata


def read_index(
    path: str | os.PathLike[str],
    *,
    expected_fingerprint: SourceFingerprint | Mapping[str, Any] | None = None,
) -> "OverlayIndex":
    """Open a memory-mapped index.  The result is a context manager."""
    return OverlayIndex(Path(path), expected_fingerprint=expected_fingerprint)


class OverlayIndex:
    """Memory-mapped reader and bounded spatial query interface."""

    def __init__(
        self,
        path: Path,
        *,
        expected_fingerprint: SourceFingerprint | Mapping[str, Any] | None = None,
    ) -> None:
        self.path = path
        self.metadata, self._header = _read_header(path)
        _validate_expected_fingerprint(self.metadata, expected_fingerprint)
        self._handle = path.open("rb")
        self._map = mmap.mmap(self._handle.fileno(), 0, access=mmap.ACCESS_READ)
        self.features = _decode_features(self._map, self._header)
        self._feature_starts = [feature.segment_start for feature in self.features]

    def __enter__(self) -> "OverlayIndex":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()

    def close(self) -> None:
        if getattr(self, "_map", None) is not None:
            self._map.close()
            self._map = None
        if getattr(self, "_handle", None) is not None:
            self._handle.close()
            self._handle = None

    def feature_for_segment(self, segment_id: int) -> FeatureMetadata:
        if segment_id < 0 or segment_id >= self.metadata.segment_count:
            raise IndexError("segment id is outside this index")
        index = bisect_right(self._feature_starts, segment_id) - 1
        return self.features[index]

    def feature_metadata(self, index: int) -> FeatureMetadata:
        return self.features[index]

    def query(
        self,
        min_x: float,
        min_y: float,
        max_x: float,
        max_y: float,
        *,
        limit: int = DEFAULT_QUERY_LIMIT,
    ) -> QueryResult:
        return _query_index(self, Bounds(min_x, min_y, max_x, max_y), limit)


def _validate_expected_fingerprint(
    metadata: IndexMetadata,
    expected: SourceFingerprint | Mapping[str, Any] | None,
) -> None:
    if expected is None:
        return
    value = SourceFingerprint.from_value(expected)
    if not metadata.source.matches(value):
        raise OverlayIndexStaleError("overlay index source fingerprint does not match")


# Implementations below are intentionally module-private; the API above is stable.


def _invalid_json_constant(value: str) -> None:
    raise ValueError(f"non-standard JSON constant {value!r}")


class _StreamingFeatureCollection:
    """Incrementally decode one top-level FeatureCollection member at a time."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._raw: BinaryIO | None = None
        self._decoder = codecs.getincrementaldecoder("utf-8-sig")("strict")
        self._json = json.JSONDecoder(parse_constant=_invalid_json_constant)
        self._buffer = ""
        self._position = 0
        self._character_offset = 0
        self._eof = False
        self._hash = hashlib.sha256()
        self.bytes_read = 0
        self.collection_type: str | None = None

    def __enter__(self) -> "_StreamingFeatureCollection":
        self._raw = self.path.open("rb")
        return self

    def __exit__(self, *_: Any) -> None:
        if self._raw is not None:
            self._raw.close()
            self._raw = None

    @property
    def sha256(self) -> str:
        if not self._eof:
            raise RuntimeError("source digest is not final until the stream reaches EOF")
        return self._hash.hexdigest()

    def _read_more(self) -> bool:
        if self._eof:
            return False
        assert self._raw is not None
        chunk = self._raw.read(STREAM_CHUNK_BYTES)
        if chunk:
            self.bytes_read += len(chunk)
            self._hash.update(chunk)
            try:
                self._buffer += self._decoder.decode(chunk, final=False)
            except UnicodeDecodeError as error:
                raise OverlayValidationError(f"GeoJSON is not valid UTF-8: {error}") from error
            return True
        try:
            self._buffer += self._decoder.decode(b"", final=True)
        except UnicodeDecodeError as error:
            raise OverlayValidationError(f"GeoJSON is not valid UTF-8: {error}") from error
        self._eof = True
        return False

    def _compact(self, *, force: bool = False) -> None:
        if self._position and (force or self._position >= STREAM_CHUNK_BYTES * 2):
            self._character_offset += self._position
            self._buffer = self._buffer[self._position :]
            self._position = 0

    def _peek(self) -> str | None:
        while self._position >= len(self._buffer):
            self._compact(force=True)
            if not self._read_more():
                return None
        return self._buffer[self._position]

    def _skip_whitespace(self) -> None:
        while (character := self._peek()) is not None and character in " \t\r\n":
            self._position += 1

    def _expect(self, expected: str) -> None:
        self._skip_whitespace()
        actual = self._peek()
        if actual != expected:
            location = self._character_offset + self._position
            raise OverlayValidationError(
                f"Invalid GeoJSON near character {location}: expected {expected!r}, found {actual!r}."
            )
        self._position += 1

    def _decode_value(self, label: str) -> Any:
        self._skip_whitespace()
        self._compact(force=True)
        start = self._position
        while True:
            try:
                value, end = self._json.raw_decode(self._buffer, start)
            except json.JSONDecodeError as error:
                if self._eof:
                    location = self._character_offset + start
                    raise OverlayValidationError(
                        f"Invalid {label} near character {location}: {error}"
                    ) from error
                if len(self._buffer) - start > MAX_STREAM_VALUE_CHARS:
                    raise OverlayValidationError(
                        f"A single {label} exceeds the {MAX_STREAM_VALUE_CHARS:,}-character streaming limit."
                    )
                self._read_more()
                continue
            except (RecursionError, ValueError) as error:
                location = self._character_offset + start
                raise OverlayValidationError(
                    f"Invalid {label} near character {location}: {error}"
                ) from error
            self._position = end
            self._compact()
            return value

    def features(self) -> Iterator[dict[str, Any]]:
        self._expect("{")
        seen_keys: set[str] = set()
        found_features = False
        first_member = True
        while True:
            self._skip_whitespace()
            if self._peek() == "}":
                self._position += 1
                break
            if not first_member:
                self._expect(",")
            key = self._decode_value("top-level object key")
            if not isinstance(key, str):
                raise OverlayValidationError("GeoJSON top-level object keys must be strings.")
            if key in seen_keys:
                raise OverlayValidationError(f"GeoJSON top-level key {key!r} is duplicated.")
            seen_keys.add(key)
            self._expect(":")
            if key == "features":
                found_features = True
                self._expect("[")
                first_feature = True
                while True:
                    self._skip_whitespace()
                    if self._peek() == "]":
                        self._position += 1
                        break
                    if not first_feature:
                        self._expect(",")
                    feature = self._decode_value("GeoJSON feature")
                    if not isinstance(feature, dict):
                        raise OverlayValidationError("Every FeatureCollection entry must be an object.")
                    yield feature
                    first_feature = False
            else:
                value = self._decode_value(f"top-level {key!r} value")
                if key == "type":
                    self.collection_type = value if isinstance(value, str) else None
            first_member = False
        self._skip_whitespace()
        if self._peek() is not None:
            raise OverlayValidationError("Unexpected content follows the top-level GeoJSON object.")
        if self.collection_type != "FeatureCollection":
            raise OverlayValidationError("Large overlay indexes require a GeoJSON FeatureCollection.")
        if not found_features:
            raise OverlayValidationError("GeoJSON FeatureCollection is missing its features array.")


def _finite_coordinate(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise OverlayValidationError(f"{label} must be a JSON number.")
    number = float(value)
    if not math.isfinite(number):
        raise OverlayValidationError(f"{label} must be finite.")
    return number


def _position(value: Any, label: str) -> tuple[float, float]:
    if not isinstance(value, list) or len(value) < 2:
        raise OverlayValidationError(f"{label} must contain at least X and Y coordinates.")
    return _finite_coordinate(value[0], f"{label} X"), _finite_coordinate(value[1], f"{label} Y")


def _extend_bounds(values: list[float], x: float, y: float) -> None:
    values[0] = min(values[0], x)
    values[1] = min(values[1], y)
    values[2] = max(values[2], x)
    values[3] = max(values[3], y)


def _finish_bounds(values: Sequence[float]) -> Bounds | None:
    if not values or not math.isfinite(values[0]):
        return None
    return Bounds(values[0], values[1], values[2], values[3])


def _segment_grid_extent(
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    cell_size: float,
) -> tuple[int, int, int, int, int]:
    min_col = math.floor(min(x1, x2) / cell_size)
    max_col = math.floor(max(x1, x2) / cell_size)
    min_row = math.floor(min(y1, y2) / cell_size)
    max_row = math.floor(max(y1, y2) / cell_size)
    count = (max_col - min_col + 1) * (max_row - min_row + 1)
    return min_col, max_col, min_row, max_row, count


def _write_array_little_endian(handle: BinaryIO, values: array) -> None:
    if sys.byteorder == "little" or values.itemsize == 1:
        values.tofile(handle)
        return
    copy = values[:]
    copy.byteswap()
    copy.tofile(handle)


def _align_file(handle: BinaryIO, alignment: int = 64) -> int:
    position = handle.tell()
    padding = (-position) % alignment
    if padding:
        handle.write(b"\0" * padding)
    return position + padding


class _PrimitiveMapWriter:
    """Avoid a 4-byte/segment table when primitive id equals segment id."""

    def __init__(self, directory: Path) -> None:
        self.directory = directory
        self.handle: BinaryIO | None = None
        self.count = 0

    @property
    def implicit(self) -> bool:
        return self.handle is None

    def append(self, segment_id: int, primitive_id: int) -> None:
        if segment_id != self.count:
            raise RuntimeError("primitive map segment ids are not contiguous")
        if self.handle is None and primitive_id == segment_id:
            self.count += 1
            return
        if self.handle is None:
            self.handle = tempfile.TemporaryFile(mode="w+b", dir=self.directory)
            for start in range(0, self.count, 262_144):
                stop = min(self.count, start + 262_144)
                _write_array_little_endian(self.handle, array("I", range(start, stop)))
        self.handle.write(_U32.pack(primitive_id))
        self.count += 1

    def copy_to(self, destination: BinaryIO) -> int:
        if self.handle is None:
            return 0
        self.handle.flush()
        self.handle.seek(0)
        start = destination.tell()
        shutil.copyfileobj(self.handle, destination, length=8 * 1024 * 1024)
        return destination.tell() - start

    def close(self) -> None:
        if self.handle is not None:
            self.handle.close()
            self.handle = None


class _IndexBuilder:
    def __init__(self, source: Path, output: Path, cell_size: float, progress: ProgressCallback | None) -> None:
        self.source = source
        self.output = output
        self.cell_size = cell_size
        self.progress = progress

    def build(self) -> IndexMetadata:
        if not self.source.is_file():
            raise OverlayValidationError(f"Overlay source does not exist or is not a file: {self.source}")
        if not math.isfinite(self.cell_size) or self.cell_size <= 0:
            raise ValueError("cell_size must be a positive finite number")
        if self.source.resolve() == self.output.resolve():
            raise ValueError("overlay source and index output must be different files")
        self.output.parent.mkdir(parents=True, exist_ok=True)
        source_before = fingerprint_source(self.source)
        temporary = tempfile.NamedTemporaryFile(
            mode="w+b",
            prefix=f".{self.output.name}.",
            suffix=".tmp",
            dir=self.output.parent,
            delete=False,
        )
        temporary_path = Path(temporary.name)
        primitive_map = _PrimitiveMapWriter(self.output.parent)
        started = time.monotonic()
        try:
            temporary.write(b"\0" * INDEX_HEADER_SIZE)
            result = self._build_into(temporary, source_before, primitive_map, started)
            temporary.flush()
            os.fsync(temporary.fileno())
            temporary.close()
            os.replace(temporary_path, self.output)
            self._notify("ready", result.source.size, result.source.size, result, started)
            return inspect_index(self.output, expected_fingerprint=result.source)
        except Exception:
            temporary.close()
            try:
                temporary_path.unlink()
            except FileNotFoundError:
                pass
            raise
        finally:
            primitive_map.close()

    def _build_into(
        self,
        handle: BinaryIO,
        source_before: SourceFingerprint,
        primitive_map: _PrimitiveMapWriter,
        started: float,
    ) -> IndexMetadata:
        features: list[FeatureMetadata] = []
        cell_counts: dict[tuple[int, int], int] = {}
        long_ids = array("I")
        exact_bounds_values = [math.inf, math.inf, -math.inf, -math.inf]
        stored_bounds_values = [math.inf, math.inf, -math.inf, -math.inf]
        segment_count = 0
        primitive_count = 0
        vertex_count = 0
        degenerate_count = 0
        max_coordinate_error = 0.0
        coordinates_exact = True
        last_progress_bytes = 0

        with _StreamingFeatureCollection(self.source) as stream:
            for feature_index, feature in enumerate(stream.features()):
                if feature.get("type") != "Feature":
                    raise OverlayValidationError(f"Feature {feature_index:,} has type other than 'Feature'.")
                geometry = feature.get("geometry")
                if not isinstance(geometry, dict):
                    raise OverlayValidationError(f"Feature {feature_index:,} is missing a geometry object.")
                geometry_type = geometry.get("type")
                coordinates = geometry.get("coordinates")
                if geometry_type == "LineString":
                    primitives = [coordinates]
                elif geometry_type == "MultiLineString":
                    if not isinstance(coordinates, list):
                        raise OverlayValidationError(
                            f"Feature {feature_index:,} MultiLineString coordinates must be an array."
                        )
                    primitives = coordinates
                else:
                    raise OverlayValidationError(
                        f"Feature {feature_index:,} geometry {geometry_type!r} is unsupported; "
                        "large indexes currently accept LineString and MultiLineString only."
                    )
                if not primitives:
                    raise OverlayValidationError(f"Feature {feature_index:,} contains no line primitives.")

                feature_segment_start = segment_count
                feature_primitive_start = primitive_count
                feature_vertex_count = 0
                feature_bounds_values = [math.inf, math.inf, -math.inf, -math.inf]
                for primitive_offset, line in enumerate(primitives):
                    if not isinstance(line, list) or len(line) < 2:
                        raise OverlayValidationError(
                            f"Feature {feature_index:,} line {primitive_offset:,} must contain at least two positions."
                        )
                    points = [
                        _position(point, f"Feature {feature_index:,} line {primitive_offset:,} position {point_index:,}")
                        for point_index, point in enumerate(line)
                    ]
                    primitive_id = primitive_count
                    primitive_count += 1
                    vertex_count += len(points)
                    feature_vertex_count += len(points)
                    for x, y in points:
                        _extend_bounds(exact_bounds_values, x, y)
                        _extend_bounds(feature_bounds_values, x, y)
                    for (x1, y1), (x2, y2) in zip(points, points[1:]):
                        if segment_count > 0xFFFFFFFF or primitive_id > 0xFFFFFFFF:
                            raise OverlayValidationError("Overlay exceeds the uint32 index identifier limit.")
                        try:
                            encoded = _SEGMENT.pack(x1, y1, x2, y2)
                            sx1, sy1, sx2, sy2 = _SEGMENT.unpack(encoded)
                        except (OverflowError, struct.error) as error:
                            raise OverlayValidationError(
                                f"Feature {feature_index:,} contains a coordinate outside Float32 range."
                            ) from error
                        if not all(math.isfinite(value) for value in (sx1, sy1, sx2, sy2)):
                            raise OverlayValidationError(
                                f"Feature {feature_index:,} contains a coordinate outside finite Float32 range."
                            )
                        errors = (
                            abs(x1 - sx1),
                            abs(y1 - sy1),
                            abs(x2 - sx2),
                            abs(y2 - sy2),
                        )
                        local_error = max(errors)
                        max_coordinate_error = max(max_coordinate_error, local_error)
                        coordinates_exact = coordinates_exact and local_error == 0
                        _extend_bounds(stored_bounds_values, sx1, sy1)
                        _extend_bounds(stored_bounds_values, sx2, sy2)
                        if x1 == x2 and y1 == y2:
                            degenerate_count += 1
                        handle.write(encoded)
                        primitive_map.append(segment_count, primitive_id)
                        extent = _segment_grid_extent(sx1, sy1, sx2, sy2, self.cell_size)
                        min_col, max_col, min_row, max_row, covered_cells = extent
                        if covered_cells > MAX_GRID_CELLS_PER_SEGMENT:
                            long_ids.append(segment_count)
                        else:
                            for row in range(min_row, max_row + 1):
                                for col in range(min_col, max_col + 1):
                                    key = (row, col)
                                    cell_counts[key] = cell_counts.get(key, 0) + 1
                        segment_count += 1

                attributes = {key: value for key, value in feature.items() if key != "geometry"}
                source_id = feature.get("id", feature.get("ID", feature_index))
                features.append(
                    FeatureMetadata(
                        index=feature_index,
                        source_id=source_id,
                        segment_start=feature_segment_start,
                        segment_count=segment_count - feature_segment_start,
                        primitive_start=feature_primitive_start,
                        primitive_count=primitive_count - feature_primitive_start,
                        vertex_count=feature_vertex_count,
                        bounds=_finish_bounds(feature_bounds_values),
                        attributes=attributes,
                    )
                )
                progress_increment = max(1_048_576, source_before.size // 100)
                if stream.bytes_read - last_progress_bytes >= progress_increment:
                    last_progress_bytes = stream.bytes_read
                    self._notify("parsing", stream.bytes_read, source_before.size, None, started, segment_count)

            digest = stream.sha256

        if not features or not segment_count:
            raise OverlayValidationError("GeoJSON contains no indexable line segments.")
        source_after = fingerprint_source(self.source)
        if not source_before.stat_matches(source_after):
            raise OverlayValidationError("Overlay source changed while its index was being built.")
        source_fingerprint = SourceFingerprint(
            source_after.size,
            source_after.mtime_ns,
            source_after.inode,
            source_after.device,
            digest,
        )
        exact_bounds = _finish_bounds(exact_bounds_values)
        stored_bounds = _finish_bounds(stored_bounds_values)
        assert exact_bounds is not None and stored_bounds is not None
        grid_min_col = math.floor(stored_bounds.min_x / self.cell_size)
        grid_max_col = math.floor(stored_bounds.max_x / self.cell_size)
        grid_min_row = math.floor(stored_bounds.min_y / self.cell_size)
        grid_max_row = math.floor(stored_bounds.max_y / self.cell_size)
        grid_cols = grid_max_col - grid_min_col + 1
        grid_rows = grid_max_row - grid_min_row + 1
        grid_cell_count = grid_cols * grid_rows
        if grid_cell_count > MAX_GRID_CELLS:
            raise OverlayValidationError(
                f"Overlay bounds require {grid_cell_count:,} grid cells; increase cell_size from {self.cell_size:g}."
            )
        grid_entry_count = sum(cell_counts.values())
        amplification_limit = max(segment_count, segment_count * MAX_GRID_ENTRY_AMPLIFICATION)
        if (
            grid_entry_count > sys.maxsize
            or grid_entry_count > MAX_GRID_ENTRIES
            or grid_entry_count > amplification_limit
        ):
            raise OverlayValidationError(
                f"Overlay grid would require {grid_entry_count:,} entries for {segment_count:,} segments; "
                "use a larger cell_size or simplify very long geometry."
            )

        counts = array("Q", [0]) * grid_cell_count
        for (row, col), count in cell_counts.items():
            index = (row - grid_min_row) * grid_cols + (col - grid_min_col)
            counts[index] = count
        offsets = array("Q", [0]) * (grid_cell_count + 1)
        running = 0
        for index, count in enumerate(counts):
            offsets[index] = running
            running += count
        offsets[grid_cell_count] = running
        if running != grid_entry_count:
            raise RuntimeError("grid prefix sum does not match entry count")
        try:
            items = array("I", [0]) * grid_entry_count
        except MemoryError as error:
            raise OverlayIndexError(
                f"Insufficient memory for {grid_entry_count:,} grid entries."
            ) from error
        cursors = offsets[:-1]
        handle.flush()
        handle.seek(INDEX_HEADER_SIZE)
        segment_id = 0
        while segment_id < segment_count:
            chunk_count = min(GRID_FILL_CHUNK_SEGMENTS, segment_count - segment_id)
            payload = handle.read(chunk_count * _SEGMENT.size)
            if len(payload) != chunk_count * _SEGMENT.size:
                raise RuntimeError("temporary segment table is truncated")
            for sx1, sy1, sx2, sy2 in struct.iter_unpack("<ffff", payload):
                extent = _segment_grid_extent(sx1, sy1, sx2, sy2, self.cell_size)
                min_col, max_col, min_row, max_row, covered_cells = extent
                if covered_cells <= MAX_GRID_CELLS_PER_SEGMENT:
                    for row in range(min_row, max_row + 1):
                        for col in range(min_col, max_col + 1):
                            cell_index = (row - grid_min_row) * grid_cols + (col - grid_min_col)
                            destination = cursors[cell_index]
                            items[destination] = segment_id
                            cursors[cell_index] = destination + 1
                segment_id += 1
            self._notify("indexing", segment_id, segment_count, None, started, segment_id)

        for index in range(grid_cell_count):
            if cursors[index] != offsets[index + 1]:
                raise RuntimeError("grid fill count does not match prefix sum")
        occupied_cells = array("I", (index for index, count in enumerate(counts) if count))
        del cursors
        del counts

        handle.seek(0, os.SEEK_END)
        sections: dict[str, dict[str, int]] = {
            "segments": {
                "offset": INDEX_HEADER_SIZE,
                "length": segment_count * _SEGMENT.size,
                "count": segment_count,
                "record_size": _SEGMENT.size,
            }
        }
        _align_file(handle)
        section_offset = handle.tell()
        _write_array_little_endian(handle, offsets)
        sections["grid_offsets"] = {
            "offset": section_offset,
            "length": len(offsets) * _U64.size,
            "count": len(offsets),
            "record_size": _U64.size,
        }
        del offsets
        _align_file(handle)
        section_offset = handle.tell()
        _write_array_little_endian(handle, items)
        sections["grid_items"] = {
            "offset": section_offset,
            "length": len(items) * _U32.size,
            "count": len(items),
            "record_size": _U32.size,
        }
        del items
        _align_file(handle)
        section_offset = handle.tell()
        _write_array_little_endian(handle, occupied_cells)
        sections["occupied_cells"] = {
            "offset": section_offset,
            "length": len(occupied_cells) * _U32.size,
            "count": len(occupied_cells),
            "record_size": _U32.size,
        }
        _align_file(handle)
        section_offset = handle.tell()
        _write_array_little_endian(handle, long_ids)
        sections["long_items"] = {
            "offset": section_offset,
            "length": len(long_ids) * _U32.size,
            "count": len(long_ids),
            "record_size": _U32.size,
        }
        _align_file(handle)
        section_offset = handle.tell()
        primitive_map_length = primitive_map.copy_to(handle)
        sections["primitive_ids"] = {
            "offset": section_offset,
            "length": primitive_map_length,
            "count": 0 if primitive_map.implicit else segment_count,
            "record_size": 0 if primitive_map.implicit else _U32.size,
        }
        _align_file(handle)
        try:
            feature_payload = json.dumps(
                [feature.to_dict() for feature in features],
                ensure_ascii=False,
                allow_nan=False,
                separators=(",", ":"),
            ).encode("utf-8")
        except (RecursionError, TypeError, ValueError) as error:
            raise OverlayValidationError(
                f"Feature metadata is too deeply nested or invalid: {error}"
            ) from error
        section_offset = handle.tell()
        handle.write(feature_payload)
        sections["features"] = {
            "offset": section_offset,
            "length": len(feature_payload),
            "count": len(features),
            "record_size": 0,
        }
        file_size = handle.tell()
        metadata = IndexMetadata(
            version=INDEX_VERSION,
            source=source_fingerprint,
            feature_count=len(features),
            primitive_count=primitive_count,
            segment_count=segment_count,
            vertex_count=vertex_count,
            degenerate_count=degenerate_count,
            bounds=exact_bounds,
            stored_bounds=stored_bounds,
            coordinate_encoding="float32-le",
            coordinates_exact=coordinates_exact,
            max_coordinate_error=max_coordinate_error,
            cell_size=self.cell_size,
            grid_min_col=grid_min_col,
            grid_min_row=grid_min_row,
            grid_cols=grid_cols,
            grid_rows=grid_rows,
            grid_entry_count=grid_entry_count,
            occupied_cell_count=len(occupied_cells),
            long_segment_count=len(long_ids),
            primitive_ids_implicit=primitive_map.implicit,
            file_size=file_size,
            sections=sections,
        )
        header = {
            "format": "NeuroScope overlay spatial index",
            "metadata": metadata.to_dict(),
        }
        header_payload = json.dumps(header, allow_nan=False, separators=(",", ":")).encode("utf-8")
        if len(header_payload) > INDEX_HEADER_SIZE - _PREFIX.size:
            raise OverlayIndexFormatError("Index header metadata exceeds its reserved space.")
        handle.seek(0)
        handle.write(_PREFIX.pack(INDEX_MAGIC, INDEX_VERSION, len(header_payload)))
        handle.write(header_payload)
        handle.write(b"\0" * (INDEX_HEADER_SIZE - _PREFIX.size - len(header_payload)))
        return metadata

    def _notify(
        self,
        stage: str,
        completed: int,
        total: int,
        metadata: IndexMetadata | None,
        started: float,
        segment_count: int | None = None,
    ) -> None:
        if self.progress is None:
            return
        payload: dict[str, Any] = {
            "stage": stage,
            "completed": completed,
            "total": total,
            "progress": 0.0 if not total else min(1.0, completed / total),
            "elapsed_seconds": time.monotonic() - started,
        }
        if segment_count is not None:
            payload["segment_count"] = segment_count
        if metadata is not None:
            payload["metadata"] = metadata.to_dict()
        self.progress(payload)


def _read_header(path: Path) -> tuple[IndexMetadata, dict[str, Any]]:
    try:
        file_size = path.stat().st_size
        with path.open("rb") as handle:
            raw = handle.read(INDEX_HEADER_SIZE)
    except OSError as error:
        raise OverlayIndexFormatError(f"Could not read overlay index: {error}") from error
    if len(raw) < INDEX_HEADER_SIZE:
        raise OverlayIndexFormatError("Overlay index is truncated before its full header.")
    magic, version, header_length = _PREFIX.unpack_from(raw)
    if magic != INDEX_MAGIC:
        raise OverlayIndexFormatError("File is not a NeuroScope overlay index.")
    if version != INDEX_VERSION:
        raise OverlayIndexFormatError(
            f"Overlay index version {version} is unsupported; expected {INDEX_VERSION}."
        )
    if header_length <= 0 or header_length > INDEX_HEADER_SIZE - _PREFIX.size:
        raise OverlayIndexFormatError("Overlay index header length is invalid.")
    try:
        header = json.loads(raw[_PREFIX.size : _PREFIX.size + header_length])
        value = header["metadata"]
        source = SourceFingerprint.from_value(value["source"])
        bounds = _bounds_from_json(value.get("bounds"))
        stored_bounds = _bounds_from_json(value.get("stored_bounds"))
        sections = value["sections"]
        metadata = IndexMetadata(
            version=int(value["version"]),
            source=source,
            feature_count=int(value["feature_count"]),
            primitive_count=int(value["primitive_count"]),
            segment_count=int(value["segment_count"]),
            vertex_count=int(value["vertex_count"]),
            degenerate_count=int(value["degenerate_count"]),
            bounds=bounds,
            stored_bounds=stored_bounds,
            coordinate_encoding=str(value["coordinate_encoding"]),
            coordinates_exact=bool(value["coordinates_exact"]),
            max_coordinate_error=float(value["max_coordinate_error"]),
            cell_size=float(value["cell_size"]),
            grid_min_col=int(value["grid_min_col"]),
            grid_min_row=int(value["grid_min_row"]),
            grid_cols=int(value["grid_cols"]),
            grid_rows=int(value["grid_rows"]),
            grid_entry_count=int(value["grid_entry_count"]),
            occupied_cell_count=int(value["occupied_cell_count"]),
            long_segment_count=int(value["long_segment_count"]),
            primitive_ids_implicit=bool(value["primitive_ids_implicit"]),
            file_size=int(value["file_size"]),
            sections=sections,
        )
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise OverlayIndexFormatError(f"Overlay index header metadata is invalid: {error}") from error
    if metadata.version != INDEX_VERSION or metadata.coordinate_encoding != "float32-le":
        raise OverlayIndexFormatError("Overlay index metadata version or coordinate encoding is unsupported.")
    if metadata.file_size != file_size:
        raise OverlayIndexFormatError("Overlay index file size does not match its header.")
    if (
        metadata.grid_cols <= 0
        or metadata.grid_rows <= 0
        or not math.isfinite(metadata.cell_size)
        or metadata.cell_size <= 0
    ):
        raise OverlayIndexFormatError("Overlay index grid dimensions are invalid.")
    if not math.isfinite(metadata.max_coordinate_error) or metadata.max_coordinate_error < 0:
        raise OverlayIndexFormatError("Overlay index coordinate error is invalid.")
    required = {
        "segments", "grid_offsets", "grid_items", "occupied_cells",
        "long_items", "primitive_ids", "features",
    }
    if not isinstance(sections, dict) or not required.issubset(sections):
        raise OverlayIndexFormatError("Overlay index is missing one or more required sections.")
    for name, section in sections.items():
        try:
            offset = int(section["offset"])
            length = int(section["length"])
        except (KeyError, TypeError, ValueError) as error:
            raise OverlayIndexFormatError(f"Overlay index section {name!r} is invalid.") from error
        if offset < INDEX_HEADER_SIZE or length < 0 or offset + length > file_size:
            raise OverlayIndexFormatError(f"Overlay index section {name!r} lies outside the file.")
    if int(sections["segments"]["length"]) != metadata.segment_count * _SEGMENT.size:
        raise OverlayIndexFormatError("Overlay index segment section length is inconsistent.")
    if int(sections["grid_offsets"]["length"]) != (metadata.grid_cols * metadata.grid_rows + 1) * _U64.size:
        raise OverlayIndexFormatError("Overlay index grid-offset section length is inconsistent.")
    if int(sections["grid_items"]["length"]) != metadata.grid_entry_count * _U32.size:
        raise OverlayIndexFormatError("Overlay index grid-item section length is inconsistent.")
    if int(sections["occupied_cells"]["length"]) != metadata.occupied_cell_count * _U32.size:
        raise OverlayIndexFormatError("Overlay index occupied-cell section length is inconsistent.")
    if int(sections["long_items"]["length"]) != metadata.long_segment_count * _U32.size:
        raise OverlayIndexFormatError("Overlay index long-item section length is inconsistent.")
    expected_primitive_bytes = 0 if metadata.primitive_ids_implicit else metadata.segment_count * _U32.size
    if int(sections["primitive_ids"]["length"]) != expected_primitive_bytes:
        raise OverlayIndexFormatError("Overlay index primitive-id section length is inconsistent.")
    counts = (
        metadata.feature_count,
        metadata.primitive_count,
        metadata.segment_count,
        metadata.vertex_count,
        metadata.degenerate_count,
        metadata.grid_entry_count,
        metadata.occupied_cell_count,
        metadata.long_segment_count,
    )
    if any(count < 0 for count in counts):
        raise OverlayIndexFormatError("Overlay index contains a negative count.")
    grid_cell_count = metadata.grid_cols * metadata.grid_rows
    if grid_cell_count > MAX_GRID_CELLS:
        raise OverlayIndexFormatError("Overlay index grid exceeds the supported cell limit.")
    if (
        metadata.feature_count <= 0
        or metadata.primitive_count <= 0
        or metadata.segment_count <= 0
        or metadata.vertex_count != metadata.segment_count + metadata.primitive_count
        or metadata.degenerate_count > metadata.segment_count
        or metadata.long_segment_count > metadata.segment_count
        or metadata.occupied_cell_count > grid_cell_count
        or metadata.occupied_cell_count > metadata.grid_entry_count
    ):
        raise OverlayIndexFormatError("Overlay index counts are inconsistent.")
    if metadata.source.size < 0 or metadata.source.mtime_ns < 0:
        raise OverlayIndexFormatError("Overlay source fingerprint stat values are invalid.")
    if metadata.source.sha256 is None or len(metadata.source.sha256) != 64:
        raise OverlayIndexFormatError("Overlay source fingerprint digest is missing or invalid.")
    try:
        bytes.fromhex(metadata.source.sha256)
    except ValueError as error:
        raise OverlayIndexFormatError("Overlay source fingerprint digest is invalid.") from error
    nonempty_ranges = sorted(
        (int(section["offset"]), int(section["offset"]) + int(section["length"]), name)
        for name, section in sections.items()
        if int(section["length"]) > 0
    )
    previous_end = INDEX_HEADER_SIZE
    for start, end, name in nonempty_ranges:
        if start < previous_end:
            raise OverlayIndexFormatError(f"Overlay index section {name!r} overlaps another section.")
        previous_end = end
    _validate_grid_offsets(path, metadata)
    _validate_occupied_cells(path, metadata)
    return metadata, header


def _iter_section_values(
    path: Path,
    offset: int,
    count: int,
    record: struct.Struct,
) -> Iterator[int]:
    records_per_chunk = max(1, (1024 * 1024) // record.size)
    with path.open("rb") as handle:
        handle.seek(offset)
        remaining = count
        while remaining:
            chunk_count = min(remaining, records_per_chunk)
            payload = handle.read(chunk_count * record.size)
            if len(payload) != chunk_count * record.size:
                raise OverlayIndexFormatError("Overlay index section is truncated.")
            for (value,) in record.iter_unpack(payload):
                yield value
            remaining -= chunk_count


def _validate_grid_offsets(path: Path, metadata: IndexMetadata) -> None:
    section = metadata.sections["grid_offsets"]
    count = metadata.grid_cols * metadata.grid_rows + 1
    previous = -1
    final = None
    for index, value in enumerate(
        _iter_section_values(path, int(section["offset"]), count, _U64)
    ):
        if index == 0 and value != 0:
            raise OverlayIndexFormatError("Overlay grid offsets must begin at zero.")
        if value < previous:
            raise OverlayIndexFormatError("Overlay grid offsets are not monotonic.")
        if value > metadata.grid_entry_count:
            raise OverlayIndexFormatError("Overlay grid offset exceeds the grid-item count.")
        previous = value
        final = value
    if final != metadata.grid_entry_count:
        raise OverlayIndexFormatError("Overlay grid offsets do not end at the grid-item count.")


def _validate_occupied_cells(path: Path, metadata: IndexMetadata) -> None:
    section = metadata.sections["occupied_cells"]
    grid_cell_count = metadata.grid_cols * metadata.grid_rows
    previous = -1
    for value in _iter_section_values(
        path, int(section["offset"]), metadata.occupied_cell_count, _U32
    ):
        if value <= previous:
            raise OverlayIndexFormatError("Overlay occupied-cell ids are not strictly ordered.")
        if value >= grid_cell_count:
            raise OverlayIndexFormatError("Overlay occupied-cell id is outside the grid.")
        previous = value


def _bounds_from_json(value: Any) -> Bounds | None:
    if value is None:
        return None
    if not isinstance(value, Mapping):
        raise TypeError("bounds must be an object")
    result = Bounds(
        float(value["min_x"]),
        float(value["min_y"]),
        float(value["max_x"]),
        float(value["max_y"]),
    )
    if not all(math.isfinite(item) for item in asdict(result).values()):
        raise ValueError("bounds must be finite")
    if result.min_x > result.max_x or result.min_y > result.max_y:
        raise ValueError("bounds minima must not exceed maxima")
    return result


def _decode_features(data: mmap.mmap, header: Mapping[str, Any]) -> tuple[FeatureMetadata, ...]:
    metadata_value = header["metadata"]
    section = metadata_value["sections"]["features"]
    offset = int(section["offset"])
    length = int(section["length"])
    try:
        decoded = json.loads(data[offset : offset + length])
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise OverlayIndexFormatError(f"Overlay feature metadata is invalid: {error}") from error
    if not isinstance(decoded, list):
        raise OverlayIndexFormatError("Overlay feature metadata must be an array.")
    features: list[FeatureMetadata] = []
    try:
        for item in decoded:
            attributes = item.get("attributes", {})
            if not isinstance(attributes, dict):
                raise TypeError("feature attributes must be an object")
            features.append(
                FeatureMetadata(
                    index=int(item["index"]),
                    source_id=item.get("source_id"),
                    segment_start=int(item["segment_start"]),
                    segment_count=int(item["segment_count"]),
                    primitive_start=int(item["primitive_start"]),
                    primitive_count=int(item["primitive_count"]),
                    vertex_count=int(item["vertex_count"]),
                    bounds=_bounds_from_json(item.get("bounds")),
                    attributes=attributes,
                )
            )
    except (KeyError, TypeError, ValueError) as error:
        raise OverlayIndexFormatError(f"Overlay feature metadata is invalid: {error}") from error
    expected_count = int(metadata_value["feature_count"])
    if len(features) != expected_count:
        raise OverlayIndexFormatError("Overlay feature metadata count is inconsistent.")
    expected_start = 0
    for index, feature in enumerate(features):
        if feature.index != index or feature.segment_start != expected_start or feature.segment_count <= 0:
            raise OverlayIndexFormatError("Overlay feature segment ranges are not contiguous.")
        expected_start += feature.segment_count
    if expected_start != int(metadata_value["segment_count"]):
        raise OverlayIndexFormatError("Overlay feature segment ranges do not cover the segment table.")
    return tuple(features)


def _query_index(index: OverlayIndex, bounds: Bounds, limit: int) -> QueryResult:
    if not all(math.isfinite(value) for value in asdict(bounds).values()):
        raise ValueError("query bounds must be finite")
    if bounds.min_x > bounds.max_x or bounds.min_y > bounds.max_y:
        raise ValueError("query minimum bounds must not exceed maximum bounds")
    if not isinstance(limit, int) or isinstance(limit, bool) or limit <= 0:
        raise ValueError("query limit must be a positive integer")
    metadata = index.metadata
    overlay_bounds = metadata.bounds
    stored_overlay_bounds = metadata.stored_bounds
    coordinate_error = metadata.max_coordinate_error
    full_overlay = overlay_bounds is not None and bounds.contains(overlay_bounds)
    max_x = bounds.max_x if full_overlay or bounds.min_x == bounds.max_x else math.nextafter(bounds.max_x, -math.inf)
    max_y = bounds.max_y if full_overlay or bounds.min_y == bounds.max_y else math.nextafter(bounds.max_y, -math.inf)
    spatial_bounds = Bounds(
        bounds.min_x - coordinate_error,
        bounds.min_y - coordinate_error,
        max_x + coordinate_error,
        max_y + coordinate_error,
    )
    if stored_overlay_bounds is None or not stored_overlay_bounds.intersects(spatial_bounds):
        return QueryResult((), 0, 0, 0, True, False, False, 0, 0)

    cell_budget = max(limit * 2, DEFAULT_EXACT_QUERY_THRESHOLD)
    cell_ids, cells_complete, cell_sampling_factor = _select_visible_cells(
        index, spatial_bounds, cell_budget
    )
    selected_entry_count = 0
    for cell_id in cell_ids:
        start, end = _cell_span(index, cell_id)
        selected_entry_count += end - start
    if full_overlay:
        candidate_count = metadata.grid_entry_count + metadata.long_segment_count
    elif cells_complete:
        candidate_count = selected_entry_count + metadata.long_segment_count
    else:
        candidate_count = min(
            metadata.grid_entry_count,
            selected_entry_count * cell_sampling_factor,
        ) + metadata.long_segment_count
    if cells_complete and candidate_count <= DEFAULT_EXACT_QUERY_THRESHOLD:
        matched_ids = _exact_matching_ids(index, spatial_bounds, cell_ids)
        matching_features = {index.feature_for_segment(segment_id).index for segment_id in matched_ids}
        matching_primitives = {_primitive_id(index, segment_id) for segment_id in matched_ids}
        selected_ids = _evenly_limit(matched_ids, limit)
        segments = tuple(_decode_segment(index, segment_id) for segment_id in selected_ids)
        sampled = len(selected_ids) < len(matched_ids)
        return QueryResult(
            segments=segments,
            matching_feature_count=len(matching_features),
            matching_primitive_count=len(matching_primitives),
            matching_segment_count=len(matched_ids),
            counts_exact=True,
            approximate=sampled,
            sampled=sampled,
            candidate_count=candidate_count,
            returned_count=len(segments),
        )

    scan_target = max(limit * 2, DEFAULT_EXACT_QUERY_THRESHOLD // 2)
    step = max(1, math.ceil(max(1, selected_entry_count) / scan_target))
    sampled_ids: list[int] = []
    seen: set[int] = set()
    sampled_entries = 0
    items_offset = int(metadata.sections["grid_items"]["offset"])
    for cell_index in cell_ids:
        start, end = _cell_span(index, cell_index)
        if start >= end:
            continue
        phase = cell_index % step
        position = start + min(phase, end - start - 1)
        while position < end:
            segment_id = _U32.unpack_from(index._map, items_offset + position * _U32.size)[0]
            sampled_entries += 1
            if segment_id not in seen:
                seen.add(segment_id)
                if _segment_matches(index, segment_id, spatial_bounds):
                    sampled_ids.append(segment_id)
            position += step
    long_section = metadata.sections["long_items"]
    long_offset = int(long_section["offset"])
    long_count = metadata.long_segment_count
    long_step = max(1, math.ceil(long_count / max(1, min(scan_target, limit * 2))))
    for position in range(0, long_count, long_step):
        segment_id = _U32.unpack_from(index._map, long_offset + position * _U32.size)[0]
        sampled_entries += 1
        if segment_id not in seen:
            seen.add(segment_id)
            if _segment_matches(index, segment_id, spatial_bounds):
                sampled_ids.append(segment_id)

    selected_ids = _evenly_limit(sampled_ids, limit)
    segments = tuple(_decode_segment(index, segment_id) for segment_id in selected_ids)
    sampled = candidate_count > len(selected_ids)
    if full_overlay:
        matching_feature_count = metadata.feature_count
        matching_primitive_count = metadata.primitive_count
        matching_segment_count = metadata.segment_count
        counts_exact = True
    else:
        hit_rate = 0.0 if not sampled_entries else len(sampled_ids) / sampled_entries
        matching_segment_count = min(
            metadata.segment_count,
            max(len(sampled_ids), round(candidate_count * hit_rate)),
        )
        sampled_primitive_count = len({_primitive_id(index, segment_id) for segment_id in sampled_ids})
        primitive_ratio = 0.0 if not sampled_ids else sampled_primitive_count / len(sampled_ids)
        matching_primitive_count = min(
            metadata.primitive_count,
            max(sampled_primitive_count, round(matching_segment_count * primitive_ratio)),
        )
        matching_feature_count = sum(
            1 for feature in index.features if feature.bounds is not None and feature.bounds.intersects(bounds)
        )
        counts_exact = False
    return QueryResult(
        segments=segments,
        matching_feature_count=matching_feature_count,
        matching_primitive_count=matching_primitive_count,
        matching_segment_count=matching_segment_count,
        counts_exact=counts_exact,
        approximate=sampled or not counts_exact or not cells_complete,
        sampled=sampled,
        candidate_count=candidate_count,
        returned_count=len(segments),
    )


def _visible_cell_window(
    metadata: IndexMetadata,
    bounds: Bounds,
) -> tuple[int, int, int, int] | None:
    min_col = max(metadata.grid_min_col, math.floor(bounds.min_x / metadata.cell_size))
    max_col = min(
        metadata.grid_min_col + metadata.grid_cols - 1,
        math.floor(bounds.max_x / metadata.cell_size),
    )
    min_row = max(metadata.grid_min_row, math.floor(bounds.min_y / metadata.cell_size))
    max_row = min(
        metadata.grid_min_row + metadata.grid_rows - 1,
        math.floor(bounds.max_y / metadata.cell_size),
    )
    if min_col > max_col or min_row > max_row:
        return None
    return min_col, max_col, min_row, max_row


def _cell_span(index: OverlayIndex, cell_index: int) -> tuple[int, int]:
    offset_base = int(index.metadata.sections["grid_offsets"]["offset"])
    start = _U64.unpack_from(index._map, offset_base + cell_index * _U64.size)[0]
    end = _U64.unpack_from(index._map, offset_base + (cell_index + 1) * _U64.size)[0]
    return start, end


def _cell_in_window(
    metadata: IndexMetadata,
    cell_index: int,
    window: tuple[int, int, int, int],
) -> bool:
    row_offset, col_offset = divmod(cell_index, metadata.grid_cols)
    col = metadata.grid_min_col + col_offset
    row = metadata.grid_min_row + row_offset
    min_col, max_col, min_row, max_row = window
    return min_col <= col <= max_col and min_row <= row <= max_row


def _select_visible_cells(
    index: OverlayIndex,
    bounds: Bounds,
    budget: int,
) -> tuple[list[int], bool, int]:
    metadata = index.metadata
    window = _visible_cell_window(metadata, bounds)
    if window is None:
        return [], True, 1
    min_col, max_col, min_row, max_row = window
    visible_cell_count = (max_col - min_col + 1) * (max_row - min_row + 1)
    if visible_cell_count <= budget:
        cells = [
            (row - metadata.grid_min_row) * metadata.grid_cols + (col - metadata.grid_min_col)
            for row in range(min_row, max_row + 1)
            for col in range(min_col, max_col + 1)
        ]
        return cells, True, 1

    occupied_count = metadata.occupied_cell_count
    occupied_offset = int(metadata.sections["occupied_cells"]["offset"])
    if occupied_count <= budget:
        cells = []
        for position in range(occupied_count):
            cell_index = _U32.unpack_from(index._map, occupied_offset + position * _U32.size)[0]
            if _cell_in_window(metadata, cell_index, window):
                cells.append(cell_index)
        return cells, True, 1

    step = max(1, math.ceil(occupied_count / budget))
    cells = []
    for position in range(0, occupied_count, step):
        cell_index = _U32.unpack_from(index._map, occupied_offset + position * _U32.size)[0]
        if _cell_in_window(metadata, cell_index, window):
            cells.append(cell_index)
    return cells, False, step


def _exact_matching_ids(
    index: OverlayIndex,
    bounds: Bounds,
    cell_ids: Sequence[int],
) -> list[int]:
    items_offset = int(index.metadata.sections["grid_items"]["offset"])
    seen: set[int] = set()
    matches: list[int] = []
    for cell_index in cell_ids:
        start, end = _cell_span(index, cell_index)
        for position in range(start, end):
            segment_id = _U32.unpack_from(index._map, items_offset + position * _U32.size)[0]
            if segment_id in seen:
                continue
            seen.add(segment_id)
            if _segment_matches(index, segment_id, bounds):
                matches.append(segment_id)
    long_section = index.metadata.sections["long_items"]
    long_offset = int(long_section["offset"])
    for position in range(index.metadata.long_segment_count):
        segment_id = _U32.unpack_from(index._map, long_offset + position * _U32.size)[0]
        if segment_id in seen:
            continue
        seen.add(segment_id)
        if _segment_matches(index, segment_id, bounds):
            matches.append(segment_id)
    matches.sort()
    return matches


def _segment_coordinates(index: OverlayIndex, segment_id: int) -> tuple[float, float, float, float]:
    if segment_id < 0 or segment_id >= index.metadata.segment_count:
        raise OverlayIndexFormatError("grid references a segment outside the coordinate table")
    offset = int(index.metadata.sections["segments"]["offset"]) + segment_id * _SEGMENT.size
    return _SEGMENT.unpack_from(index._map, offset)


def _primitive_id(index: OverlayIndex, segment_id: int) -> int:
    if index.metadata.primitive_ids_implicit:
        return segment_id
    offset = int(index.metadata.sections["primitive_ids"]["offset"]) + segment_id * _U32.size
    return _U32.unpack_from(index._map, offset)[0]


def _decode_segment(index: OverlayIndex, segment_id: int) -> Segment:
    x1, y1, x2, y2 = _segment_coordinates(index, segment_id)
    feature = index.feature_for_segment(segment_id)
    return Segment(segment_id, feature.index, _primitive_id(index, segment_id), x1, y1, x2, y2)


def _segment_matches(index: OverlayIndex, segment_id: int, bounds: Bounds) -> bool:
    return _line_intersects_bounds(*_segment_coordinates(index, segment_id), bounds)


def _line_intersects_bounds(
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    bounds: Bounds,
) -> bool:
    if (
        max(x1, x2) < bounds.min_x
        or min(x1, x2) > bounds.max_x
        or max(y1, y2) < bounds.min_y
        or min(y1, y2) > bounds.max_y
    ):
        return False
    if bounds.min_x <= x1 <= bounds.max_x and bounds.min_y <= y1 <= bounds.max_y:
        return True
    if bounds.min_x <= x2 <= bounds.max_x and bounds.min_y <= y2 <= bounds.max_y:
        return True
    dx = x2 - x1
    dy = y2 - y1
    if dx == 0 and dy == 0:
        return False
    lower = 0.0
    upper = 1.0
    for p, q in (
        (-dx, x1 - bounds.min_x),
        (dx, bounds.max_x - x1),
        (-dy, y1 - bounds.min_y),
        (dy, bounds.max_y - y1),
    ):
        if p == 0:
            if q < 0:
                return False
            continue
        ratio = q / p
        if p < 0:
            lower = max(lower, ratio)
        else:
            upper = min(upper, ratio)
        if lower > upper:
            return False
    return True


def _evenly_limit(values: Sequence[int], limit: int) -> list[int]:
    if len(values) <= limit:
        return list(values)
    return [values[(index * len(values)) // limit] for index in range(limit)]


__all__ = [
    "INDEX_SUFFIX",
    "INDEX_VERSION",
    "Bounds",
    "FeatureMetadata",
    "IndexMetadata",
    "OverlayIndex",
    "OverlayIndexError",
    "OverlayIndexFormatError",
    "OverlayIndexStaleError",
    "OverlayValidationError",
    "QueryResult",
    "Segment",
    "SourceFingerprint",
    "build_index",
    "fingerprint_source",
    "inspect_index",
    "read_index",
]
