#!/usr/bin/env python3
"""Backend for the NeuroScope scientific image viewer.

JP2 sources are registered with IIPImage and become usable without preprocessing.
TIFF sources retain the libvips Deep Zoom compatibility pipeline.
"""

from __future__ import annotations

import json
import logging
import math
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from bisect import insort
from contextlib import asynccontextmanager, contextmanager
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timezone
from itertools import islice
from pathlib import Path
from typing import Optional

from display_window import DisplayWindowError, estimate_display_windows
from image_pipeline import clear_partial_pyramid, decode_jp2_with_kakadu, run_dzsave
from iip_client import IIPClient, IIPError, IIPMetadata
import overlay_index

import uvicorn
from fastapi import Body, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool


APP_ROOT = Path(__file__).resolve().parent
STATIC_ROOT = APP_ROOT / "static"
DATA_ROOT = Path(os.environ.get("NEUROSCOPE_DATA_DIR", APP_ROOT / "data")).resolve()
HOST = os.environ.get("NEUROSCOPE_HOST", "0.0.0.0")
PORT = int(os.environ.get("NEUROSCOPE_PORT", "8088"))
MAX_UPLOAD_BYTES = int(os.environ.get("NEUROSCOPE_MAX_UPLOAD_BYTES", str(20 * 1024**3)))
MAX_OVERLAY_BYTES = int(os.environ.get("NEUROSCOPE_MAX_OVERLAY_BYTES", str(256 * 1024**2)))
MAX_INDEXED_OVERLAY_BYTES = int(
    os.environ.get("NEUROSCOPE_MAX_INDEXED_OVERLAY_BYTES", str(2 * 1024**3))
)
MAX_UPLOADED_OVERLAY_AGE_SECONDS = int(
    os.environ.get("NEUROSCOPE_MAX_UPLOADED_OVERLAY_AGE_SECONDS", str(24 * 60 * 60))
)
IIP_URL = os.environ.get("NEUROSCOPE_IIP_URL", "http://127.0.0.1/neuroscope-iip")
IIP_TIMEOUT = float(os.environ.get("NEUROSCOPE_IIP_TIMEOUT", "15"))
IIP_RETRIES = int(os.environ.get("NEUROSCOPE_IIP_RETRIES", "1"))
MOUNT_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,40}$")
TILE_SIZE = 512
ALLOWED_EXTENSIONS = {".jp2": "JP2", ".tif": "TIFF", ".tiff": "TIFF"}
ALLOWED_OVERLAY_EXTENSIONS = {".json": "JSON", ".swc": "SWC"}
IMAGE_ID_RE = re.compile(r"^[a-zA-Z0-9-]{1,64}$")
TILE_NAME_RE = re.compile(r"^(\d+)_(\d+)\.(jpg|jpeg|png)$")
MAX_OVERLAY_QUERY_SEGMENTS = 80_000
OVERLAY_RECORDS_DIRECTORY = "_overlays"
IMAGE_LIBRARY_DEFAULT_LIMIT = 200
IMAGE_LIBRARY_MAX_LIMIT = 200
MAX_IMAGE_METADATA_BYTES = 64 * 1024
IMAGE_RECORD_STATUSES = frozenset({"uploading", "queued", "processing", "ready", "error"})

DATA_ROOT.mkdir(parents=True, exist_ok=True)
VIPS = shutil.which("vips")
VIPSHEADER = shutil.which("vipsheader")
KDU_EXPAND = os.environ.get("NEUROSCOPE_KDU_EXPAND") or shutil.which("kdu_expand")
KAKADU_THREADS = max(1, int(os.environ.get("NEUROSCOPE_KAKADU_THREADS", "8")))
IIP = IIPClient(IIP_URL, timeout=IIP_TIMEOUT, retries=IIP_RETRIES)
PROCESSORS = ThreadPoolExecutor(
    max_workers=max(1, int(os.environ.get("NEUROSCOPE_PROCESSORS", "1"))),
    thread_name_prefix="tile-pyramid",
)
RECORD_LOCK = threading.RLock()
JOB_LOCK = threading.RLock()
QUEUED_JOBS: list[str] = []
ACTIVE_JOBS: set[str] = set()
JOB_FUTURES: dict[str, Future] = {}
DEMO_LOCK = threading.Lock()
OVERLAY_REGISTRATION_LOCK = threading.RLock()
OVERLAY_OPERATION_GATE = threading.Lock()
MOUNTED_IMAGE_REGISTRATION_LOCK = threading.RLock()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
LOGGER = logging.getLogger("neuroscope")


@contextmanager
def exclusive_overlay_operation():
    """Admit one memory-intensive overlay build without blocking API workers."""
    if not OVERLAY_OPERATION_GATE.acquire(blocking=False):
        raise HTTPException(
            status_code=429,
            detail="Another large overlay is currently being indexed. Try again shortly.",
            headers={"Retry-After": "5"},
        )
    try:
        yield
    finally:
        OVERLAY_OPERATION_GATE.release()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_filename(value: str) -> str:
    """Return a display/storage-safe filename without trusting client paths."""
    value = Path(value or "image").name
    cleaned = re.sub(r"[^A-Za-z0-9._ -]+", "_", value).strip(" .")
    return (cleaned or "image")[:180]

def configured_mount_roots(value: str | None = None) -> dict[str, Path]:
    """Parse id:/absolute/path mount mappings without exposing paths to clients."""
    default_roots = "mnt:/mnt"
    raw = value if value is not None else os.environ.get("NEUROSCOPE_MOUNT_ROOTS", default_roots)
    roots: dict[str, Path] = {}
    for specification in raw.split(","):
        specification = specification.strip()
        if not specification:
            continue
        mount_id, separator, raw_path = specification.partition(":")
        if not separator or not MOUNT_ID_RE.fullmatch(mount_id) or not raw_path:
            raise ValueError("NEUROSCOPE_MOUNT_ROOTS must contain id:/absolute/path entries")
        root = Path(raw_path)
        if not root.is_absolute():
            raise ValueError("Configured mount roots must be absolute paths")
        if mount_id in roots:
            raise ValueError(f"Duplicate mounted root id: {mount_id}")
        roots[mount_id] = root.resolve()
    if not roots:
        raise ValueError("At least one mounted root must be configured")
    return roots


MOUNT_ROOTS = configured_mount_roots()


def mounted_root(mount_id: str) -> Path:
    if not MOUNT_ID_RE.fullmatch(mount_id) or mount_id not in MOUNT_ROOTS:
        raise HTTPException(status_code=404, detail="Mounted root not found")
    root = MOUNT_ROOTS[mount_id]
    if not root.is_dir():
        raise HTTPException(status_code=503, detail="Mounted root is unavailable")
    return root


def resolve_mounted_path(mount_id: str, relative_path: str, *, require_directory: bool | None = None) -> Path:
    """Resolve a relative path and forbid symlink/traversal escapes from its root."""
    root = mounted_root(mount_id)
    if "\x00" in relative_path or len(relative_path) > 4096 or Path(relative_path).is_absolute():
        raise HTTPException(status_code=400, detail="Invalid mounted path")
    try:
        target = (root / relative_path).resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise HTTPException(status_code=404, detail="Mounted path not found") from exc
    if target != root and root not in target.parents:
        raise HTTPException(status_code=400, detail="Mounted path leaves the configured root")
    if require_directory is True and not target.is_dir():
        raise HTTPException(status_code=400, detail="Mounted path is not a directory")
    if require_directory is False and not target.is_file():
        raise HTTPException(status_code=400, detail="Mounted path is not a file")
    return target


def mounted_relative_path(root: Path, target: Path) -> str:
    relative = target.relative_to(root)
    return "" if relative == Path(".") else relative.as_posix()


def resolve_absolute_mounted_file_path(raw_path: object) -> tuple[str, Path]:
    """Match an absolute client path to a configured root without leaking roots."""
    if not isinstance(raw_path, str) or not raw_path or "\x00" in raw_path or len(raw_path) > 4096:
        raise HTTPException(status_code=400, detail="A valid absolute mounted file path is required")
    candidate = Path(raw_path)
    if not candidate.is_absolute():
        raise HTTPException(status_code=400, detail="An absolute mounted file path is required")

    try:
        # Collapse dot segments without following symlinks. Requiring lexical
        # containment as well as resolved containment rejects outside aliases.
        lexical = Path(os.path.abspath(raw_path))
    except (OSError, RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="A valid absolute mounted file path is required") from exc

    matches = [
        (mount_id, root)
        for mount_id, root in MOUNT_ROOTS.items()
        if lexical == root or root in lexical.parents
    ]
    if not matches:
        raise HTTPException(status_code=404, detail="Mounted file path not found")
    # Select once: never fall back to a broader root if a nested root is
    # unavailable or the selected path escapes through a symlink.
    mount_id, root = max(matches, key=lambda item: len(item[1].parts))
    relative_path = mounted_relative_path(root, lexical)
    try:
        mounted_root(mount_id)
        source = resolve_mounted_path(mount_id, relative_path, require_directory=False)
    except HTTPException as exc:
        # Outside, absent, inaccessible, and symlink-escape paths deliberately
        # share one response so this endpoint cannot probe server filesystems.
        raise HTTPException(status_code=404, detail="Mounted file path not found") from exc
    return mount_id, source


def resolve_absolute_mounted_image_path(raw_path: object) -> tuple[str, Path]:
    """Backward-compatible image adapter over the shared absolute resolver."""
    return resolve_absolute_mounted_file_path(raw_path)


class OverlaySourceChangedError(RuntimeError):
    """An indexed overlay source no longer matches its saved fingerprint."""


def overlay_records_root() -> Path:
    return DATA_ROOT / OVERLAY_RECORDS_DIRECTORY


def overlay_record_dir(overlay_id: str) -> Path:
    if not IMAGE_ID_RE.fullmatch(overlay_id):
        raise ValueError("Invalid overlay id")
    return overlay_records_root() / overlay_id


def overlay_metadata_path(overlay_id: str) -> Path:
    return overlay_record_dir(overlay_id) / "metadata.json"


def overlay_geometry_path(overlay_id: str) -> Path:
    return overlay_record_dir(overlay_id) / "geometry.nsovl"


def read_overlay_metadata(overlay_id: str) -> dict:
    with overlay_metadata_path(overlay_id).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_overlay_metadata(overlay_id: str, metadata: dict) -> None:
    directory = overlay_record_dir(overlay_id)
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / "metadata.json"
    temporary = directory / "metadata.json.tmp"
    with RECORD_LOCK:
        with temporary.open("w", encoding="utf-8") as handle:
            json.dump(metadata, handle, indent=2, sort_keys=True)
        temporary.replace(target)


def public_overlay_metadata(metadata: dict) -> dict:
    return {key: value for key, value in metadata.items() if not key.startswith("_")}


def _object_value(value: object, name: str, default: object = None) -> object:
    if isinstance(value, dict):
        return value.get(name, default)
    return getattr(value, name, default)


def _overlay_fingerprint_dict(source: Path) -> dict:
    fingerprint = overlay_index.fingerprint_source(source)
    if hasattr(fingerprint, "to_dict"):
        fingerprint = fingerprint.to_dict()
    if not isinstance(fingerprint, dict):
        raise overlay_index.OverlayIndexError("Overlay fingerprint is invalid")
    # Round-trip through JSON so tuples and implementation-specific integer
    # subclasses compare exactly with the persisted representation.
    return json.loads(json.dumps(fingerprint, sort_keys=True))


def _index_bounds(details: object) -> dict:
    bounds = _object_value(details, "bounds")
    if bounds is None:
        values = [
            _object_value(details, "min_x"),
            _object_value(details, "min_y"),
            _object_value(details, "max_x"),
            _object_value(details, "max_y"),
        ]
    elif isinstance(bounds, dict):
        values = [
            bounds.get("min_x", bounds.get("minX")),
            bounds.get("min_y", bounds.get("minY")),
            bounds.get("max_x", bounds.get("maxX")),
            bounds.get("max_y", bounds.get("maxY")),
        ]
    elif all(hasattr(bounds, name) for name in ("min_x", "min_y", "max_x", "max_y")):
        values = [bounds.min_x, bounds.min_y, bounds.max_x, bounds.max_y]
    else:
        try:
            values = list(bounds)
        except TypeError as exc:
            raise overlay_index.OverlayIndexError("Overlay index bounds are invalid") from exc
    try:
        valid_values = len(values) == 4 and all(math.isfinite(float(value)) for value in values)
    except (TypeError, ValueError):
        valid_values = False
    if not valid_values:
        raise overlay_index.OverlayIndexError("Overlay index bounds are invalid")
    min_x, min_y, max_x, max_y = map(float, values)
    if min_x > max_x or min_y > max_y:
        raise overlay_index.OverlayIndexError("Overlay index bounds are invalid")
    return {"minX": min_x, "minY": min_y, "maxX": max_x, "maxY": max_y}


def _index_metadata_fields(details: object) -> dict:
    segment_count = int(_object_value(details, "segment_count", 0))
    primitive_count = int(_object_value(details, "primitive_count", segment_count))
    fields = {
        "featureCount": int(_object_value(details, "feature_count", 0)),
        "primitiveCount": primitive_count,
        "segmentCount": segment_count,
        "vertexCount": int(_object_value(details, "vertex_count", 0)),
        "bounds": _index_bounds(details),
    }
    if min(fields[name] for name in ("featureCount", "primitiveCount", "segmentCount", "vertexCount")) < 0:
        raise overlay_index.OverlayIndexError("Overlay index counts are invalid")
    return fields


def validated_overlay_source(overlay_id: str, metadata: dict) -> Path:
    """Validate an upload or mounted source before every indexed query."""
    raw_source = metadata.get("_source")
    if not isinstance(raw_source, str) or "\x00" in raw_source:
        raise ValueError("Missing private overlay source")
    requested = Path(raw_source)
    if not requested.is_absolute() or requested.suffix.lower() != ".json":
        raise ValueError("Invalid overlay source")
    try:
        record_root = overlay_record_dir(overlay_id).resolve(strict=True)
        requested_parent = requested.parent.resolve(strict=True)
        resolved = requested.resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise ValueError("Overlay source is unavailable") from exc
    if requested_parent != record_root or not resolved.is_file():
        raise ValueError("Overlay source leaves its record")

    source_kind = metadata.get("sourceKind")
    if source_kind == "mounted":
        mount_id = metadata.get("mountId")
        relative_path = metadata.get("mountedPath")
        if not requested.is_symlink() or not isinstance(mount_id, str) or not isinstance(relative_path, str):
            raise ValueError("Invalid mounted overlay source")
        try:
            expected = resolve_mounted_path(mount_id, relative_path, require_directory=False)
        except HTTPException as exc:
            raise ValueError("Mounted overlay source is unavailable") from exc
        if resolved != expected:
            raise ValueError("Mounted overlay source changed location")
    elif source_kind == "upload":
        if requested.is_symlink() or (resolved != record_root and record_root not in resolved.parents):
            raise ValueError("Invalid uploaded overlay source")
    else:
        raise ValueError("Unknown overlay source kind")

    stored_fingerprint = metadata.get("_sourceFingerprint")
    if not isinstance(stored_fingerprint, dict):
        raise ValueError("Indexed overlay has no source fingerprint")
    if _overlay_fingerprint_dict(resolved) != stored_fingerprint:
        raise OverlaySourceChangedError("Indexed overlay source changed")
    return resolved


def validated_overlay_geometry(overlay_id: str, metadata: dict) -> Path:
    raw_index = metadata.get("_index")
    if not isinstance(raw_index, str) or "\x00" in raw_index:
        raise ValueError("Missing private overlay index")
    requested = Path(raw_index)
    expected = overlay_geometry_path(overlay_id)
    try:
        record_root = overlay_record_dir(overlay_id).resolve(strict=True)
        requested_parent = requested.parent.resolve(strict=True)
        resolved = requested.resolve(strict=True)
        expected_resolved = expected.resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise ValueError("Overlay index is unavailable") from exc
    if (
        not requested.is_absolute()
        or requested.is_symlink()
        or requested_parent != record_root
        or resolved != expected_resolved
        or not resolved.is_file()
    ):
        raise ValueError("Overlay index leaves its record")
    return resolved


def register_overlay_source(
    overlay_id: str,
    filename: str,
    source: Path,
    file_size: int,
    *,
    source_kind: str,
    expected_fingerprint: dict | None = None,
    extra: dict | None = None,
) -> dict:
    """Build a bounded-query spatial index for one immutable GeoJSON source."""
    now = utc_now()
    try:
        created_at = read_overlay_metadata(overlay_id).get("createdAt", now)
    except (FileNotFoundError, ValueError, json.JSONDecodeError):
        created_at = now
    resolved_source = source.resolve(strict=True)
    fingerprint = _overlay_fingerprint_dict(resolved_source)
    if expected_fingerprint is not None and fingerprint != expected_fingerprint:
        raise OverlaySourceChangedError("Overlay source changed before indexing")
    index_path = overlay_geometry_path(overlay_id)
    metadata = {
        "id": overlay_id,
        "kind": "indexed-geojson",
        "filename": filename,
        "fileSize": file_size,
        "status": "indexing",
        "progress": 90,
        "message": "Building spatial overlay index",
        "createdAt": created_at,
        "updatedAt": now,
        "sourceKind": source_kind,
        "featureCount": None,
        "primitiveCount": None,
        "segmentCount": None,
        "vertexCount": None,
        "bounds": None,
        "_source": str(source),
        "_sourceFingerprint": fingerprint,
        "_index": str(index_path),
    }
    if extra:
        metadata.update(extra)
    write_overlay_metadata(overlay_id, metadata)

    # Index builds are deliberately serialized across both mounted and raw
    # registrations. The optimized helper keeps browser memory flat, but a
    # single build can still use substantial server RAM while V8 compacts the
    # 10M+ segment source. The lock is re-entrant because mounted registration
    # already holds it while checking and populating the shared cache.
    with OVERLAY_REGISTRATION_LOCK:
        overlay_index.build_index(resolved_source, index_path)
    if _overlay_fingerprint_dict(resolved_source) != fingerprint:
        index_path.unlink(missing_ok=True)
        raise OverlaySourceChangedError("Overlay source changed during indexing")
    details = overlay_index.inspect_index(index_path, expected_fingerprint=fingerprint)
    metadata.update(
        _index_metadata_fields(details),
        status="ready",
        progress=100,
        message="Ready · spatial geometry indexed",
        updatedAt=utc_now(),
        readyAt=utc_now(),
    )
    write_overlay_metadata(overlay_id, metadata)
    return metadata


def find_cached_mounted_overlay(mount_id: str, relative_path: str, fingerprint: dict) -> dict | None:
    root = overlay_records_root()
    if not root.is_dir():
        return None
    for directory in root.iterdir():
        if directory.is_symlink() or not directory.is_dir() or not is_uuid_record_name(directory.name):
            continue
        path = directory / "metadata.json"
        try:
            metadata = json.loads(path.read_text(encoding="utf-8"))
            overlay_id = metadata["id"]
            if (
                path.parent.name != overlay_id
                or metadata.get("kind") != "indexed-geojson"
                or metadata.get("status") != "ready"
                or metadata.get("sourceKind") != "mounted"
                or metadata.get("mountId") != mount_id
                or metadata.get("mountedPath") != relative_path
                or metadata.get("_sourceFingerprint") != fingerprint
            ):
                continue
            validated_overlay_source(overlay_id, metadata)
            index_path = validated_overlay_geometry(overlay_id, metadata)
            overlay_index.inspect_index(index_path, expected_fingerprint=fingerprint)
            return metadata
        except (
            FileNotFoundError,
            KeyError,
            OSError,
            TypeError,
            ValueError,
            json.JSONDecodeError,
            OverlaySourceChangedError,
            overlay_index.OverlayIndexError,
        ):
            continue
    return None


def find_cached_mounted_image(
    mount_id: str,
    relative_path: str,
    source: Path,
    fingerprint: dict,
) -> dict | None:
    """Return an unchanged mounted image record without trusting stored paths."""
    if not DATA_ROOT.is_dir():
        return None
    try:
        directories = DATA_ROOT.iterdir()
        for directory in directories:
            if directory.is_symlink() or not directory.is_dir() or not is_uuid_record_name(directory.name):
                continue
            path = directory / "metadata.json"
            try:
                if path.is_symlink() or not path.is_file():
                    continue
                size = path.stat().st_size
                if size <= 0 or size > MAX_IMAGE_METADATA_BYTES:
                    continue
                metadata = json.loads(path.read_text(encoding="utf-8"))
                image_id = metadata["id"]
                if (
                    image_id != directory.name
                    or metadata.get("status") not in {"queued", "processing", "ready"}
                    or metadata.get("sourceKind") != "mounted"
                    or metadata.get("mountId") != mount_id
                    or metadata.get("mountedPath") != relative_path
                    or metadata.get("_sourceFingerprint") != fingerprint
                ):
                    continue
                alias = validated_record_source(image_id, metadata)
                if alias.resolve(strict=True) != source:
                    continue
                if metadata.get("status") in {"queued", "processing"}:
                    queue_processing(image_id)
                return metadata
            except (
                FileNotFoundError,
                KeyError,
                OSError,
                TypeError,
                ValueError,
                json.JSONDecodeError,
                SourceChangedError,
            ):
                continue
    except OSError:
        return None
    return None



def record_dir(image_id: str) -> Path:
    if not IMAGE_ID_RE.fullmatch(image_id):
        raise ValueError("Invalid image id")
    return DATA_ROOT / image_id


def metadata_path(image_id: str) -> Path:
    return record_dir(image_id) / "metadata.json"


def read_metadata(image_id: str) -> dict:
    with metadata_path(image_id).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_metadata(image_id: str, metadata: dict) -> None:
    directory = record_dir(image_id)
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / "metadata.json"
    temporary = directory / "metadata.json.tmp"
    with RECORD_LOCK:
        with temporary.open("w", encoding="utf-8") as handle:
            json.dump(metadata, handle, indent=2, sort_keys=True)
        temporary.replace(target)


def public_metadata(metadata: dict) -> dict:
    result = {key: value for key, value in metadata.items() if not key.startswith("_")}
    image_id = metadata.get("id")
    with JOB_LOCK:
        try:
            queue_position = QUEUED_JOBS.index(image_id) + 1
        except ValueError:
            queue_position = None
        queue_depth = len(QUEUED_JOBS)
        active = image_id in ACTIVE_JOBS

    # Queue state is deliberately derived from the in-memory scheduler instead
    # of persisted metadata. This keeps recovered jobs and changing positions
    # accurate without continually rewriting every queued record.
    result["queuePosition"] = queue_position
    result["queueDepth"] = queue_depth
    if result.get("status") in {"queued", "processing"}:
        if queue_position is not None:
            result["status"] = "queued"
            if metadata.get("status") == "processing":
                result["message"] = "Queued for processing"
        elif active:
            result["status"] = "processing"
    return result


def image_library_timestamp(metadata: dict) -> float:
    """Return a sortable UTC timestamp without trusting persisted metadata."""
    for key in ("updatedAt", "createdAt"):
        raw_value = metadata.get(key)
        if not isinstance(raw_value, str):
            continue
        try:
            parsed = datetime.fromisoformat(raw_value.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            value = parsed.timestamp()
            if math.isfinite(value):
                return value
        except (OSError, OverflowError, ValueError):
            continue
    return float("-inf")


def image_library_records(limit: int) -> tuple[list[dict], int]:
    """Read valid top-level image records without exposing server-only fields."""
    records: list[tuple[float, str, dict]] = []
    total = 0
    try:
        directories = DATA_ROOT.iterdir()
        for directory in directories:
            try:
                image_id = directory.name
                if (
                    image_id.startswith(("_", "."))
                    or not IMAGE_ID_RE.fullmatch(image_id)
                    or directory.is_symlink()
                    or not directory.is_dir()
                ):
                    continue
                path = directory / "metadata.json"
                if path.is_symlink() or not path.is_file():
                    continue
                size = path.stat().st_size
                if size <= 0 or size > MAX_IMAGE_METADATA_BYTES:
                    continue
                with path.open("r", encoding="utf-8") as handle:
                    metadata = json.load(handle)
                if (
                    not isinstance(metadata, dict)
                    or metadata.get("id") != image_id
                    or metadata.get("status") not in IMAGE_RECORD_STATUSES
                    or not isinstance(metadata.get("filename"), str)
                    or not metadata["filename"]
                ):
                    continue

                public = public_metadata(metadata)
                # Python's JSON decoder accepts NaN and Infinity by default,
                # but Starlette correctly refuses to serialize them. Reject a
                # damaged record here so it cannot break the entire catalog.
                json.dumps(public, allow_nan=False)
                total += 1
                insort(
                    records,
                    (
                        -image_library_timestamp(metadata),
                        image_id,
                        public,
                    ),
                )
                if len(records) > limit:
                    records.pop()
            except (
                OSError,
                OverflowError,
                RecursionError,
                UnicodeError,
                ValueError,
                TypeError,
                json.JSONDecodeError,
            ):
                # A damaged or concurrently removed record must not make the
                # whole library unavailable.
                continue
    except OSError:
        return [], 0

    return [item[2] for item in records], total


def update_metadata(image_id: str, **changes: object) -> dict:
    with RECORD_LOCK:
        metadata = read_metadata(image_id)
        metadata.update(changes)
        metadata["updatedAt"] = utc_now()
        write_metadata(image_id, metadata)
        return metadata

def iip_ready_fields(
    details: IIPMetadata,
    display_windows: tuple[tuple[float, float], ...] | None = None,
    window_source: str = "iip-metadata",
) -> dict:
    selected_windows = display_windows or details.display_windows
    windows = [
        {"channel": channel, "min": minimum, "max": maximum}
        for channel, (minimum, maximum) in enumerate(selected_windows)
    ]
    if details.bits_per_channel <= 8:
        pixel_format = "uchar"
    elif details.bits_per_channel <= 16:
        pixel_format = "ushort"
    else:
        pixel_format = f"uint{details.bits_per_channel}"
    return {
        "status": "ready",
        "progress": 100,
        "message": "Ready · tiles generated on demand",
        "width": details.width,
        "height": details.height,
        "bands": len(windows),
        "pixelFormat": pixel_format,
        "bitsPerChannel": details.bits_per_channel,
        "interpretation": "sRGB" if len(windows) >= 3 else "b-w",
        "pages": 1,
        "tileSize": details.tile_width,
        "tileWidth": details.tile_width,
        "tileHeight": details.tile_height,
        "tileFormat": "jpg",
        "maxLevel": details.max_level,
        "displayWindows": windows,
        "displayWindowSource": window_source,
        "tileBackend": "iip",
        "decoder": "IIPImage / Kakadu",
        "readyAt": utc_now(),
    }


def iip_level_geometry(
    width: int,
    height: int,
    tile_width: int,
    tile_height: int,
    max_level: int,
    level: int,
) -> tuple[int, int, int, int]:
    """Return IIP/Kakadu reduced dimensions and its row-major tile grid."""
    if (
        not 0 <= level <= max_level <= 62
        or min(width, height, tile_width, tile_height) <= 0
    ):
        raise ValueError("Invalid IIP pyramid geometry")
    reduction = 1 << (max_level - level)
    # IIP's JTL grid uses Kakadu's floor-reduced dimensions. Deep Zoom's
    # conventional ceil reduction shifts every row after y=0 for odd images.
    level_width = max(1, width // reduction)
    level_height = max(1, height // reduction)
    columns = (level_width + tile_width - 1) // tile_width
    rows = (level_height + tile_height - 1) // tile_height
    return level_width, level_height, columns, rows


def prepared_iip_ready_fields(image_id: str, source: Path, details: IIPMetadata) -> dict:
    if details.bits_per_channel <= 8:
        return iip_ready_fields(details)
    try:
        display_windows = estimate_display_windows(
            KDU_EXPAND,
            source,
            record_dir(image_id),
            details.max_level,
            details.width,
            details.height,
            len(details.display_windows),
            details.display_windows,
            KAKADU_THREADS,
        )
        return iip_ready_fields(details, display_windows, "reduced-overview-p0.5-p98-shared-rgb")
    except Exception as exc:
        LOGGER.warning("Could not estimate auto-window for %s (%s), falling back to nominal windows: %s", image_id, source.name, exc)
        return iip_ready_fields(details, details.display_windows, "nominal")


def register_image_source(
    image_id: str,
    filename: str,
    extension: str,
    source: Path,
    file_size: int,
    *,
    source_kind: str,
    extra: dict | None = None,
) -> tuple[dict, int]:
    """Persist a source record, bypassing preprocessing for JPEG 2000."""
    now = utc_now()
    try:
        created_at = read_metadata(image_id).get("createdAt", now)
    except (FileNotFoundError, ValueError, json.JSONDecodeError):
        created_at = now
    fingerprint = source_fingerprint(source.resolve(strict=True))
    metadata = {
        "id": image_id,
        "filename": filename,
        "format": ALLOWED_EXTENSIONS[extension],
        "fileSize": file_size,
        "status": "processing" if extension == ".jp2" else "queued",
        "progress": 96 if extension == ".jp2" else 6,
        "message": "Registering on-demand tiles" if extension == ".jp2" else "Upload complete · queued for processing",
        "createdAt": created_at,
        "updatedAt": now,
        "sourceKind": source_kind,
        "_source": str(source),
        "_sourceFingerprint": fingerprint,
    }
    if extra:
        metadata.update(extra)
    # Persist before any IIP/Kakadu work so a force-stop leaves a recoverable record.
    write_metadata(image_id, metadata)

    if extension == ".jp2":
        details = IIP.metadata(source.resolve())
        ready_fields = prepared_iip_ready_fields(image_id, source, details)
        if fingerprint != source_fingerprint(source.resolve(strict=True)):
            raise SourceChangedError("Registered image source changed during registration")
        metadata.update(ready_fields)
        metadata["updatedAt"] = utc_now()
        write_metadata(image_id, metadata)
        LOGGER.info("JP2 registered for on-demand tiles as %s (%sx%s)", image_id, details.width, details.height)
        return metadata, 201

    queue_processing(image_id)
    return metadata, 202

class SourceChangedError(IIPError):
    """A registered source no longer matches its immutable fingerprint."""


def source_fingerprint(source: Path) -> dict:
    stats = source.stat()
    return {
        "device": stats.st_dev,
        "inode": stats.st_ino,
        "size": stats.st_size,
        "modifiedNs": stats.st_mtime_ns,
    }


def validated_record_source(image_id: str, metadata: dict) -> Path:
    """Validate a private source while retaining a unique mounted alias path."""
    raw_source = metadata.get("_source")
    if not isinstance(raw_source, str) or "\x00" in raw_source:
        raise ValueError("Missing private image source")
    requested = Path(raw_source)
    if not requested.is_absolute():
        raise ValueError("Image source must be absolute")
    try:
        record_root = record_dir(image_id).resolve(strict=True)
        requested_parent = requested.parent.resolve(strict=True)
        resolved = requested.resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise ValueError("Image source is unavailable") from exc
    if requested_parent != record_root or not resolved.is_file():
        if metadata.get("demo") and resolved == (STATIC_ROOT / "demo-section.svg").resolve():
            return resolved
        raise ValueError("Image source leaves its record")
    if requested.suffix.lower() not in ALLOWED_EXTENSIONS:
        raise ValueError("Invalid image source format")

    source_kind = metadata.get("sourceKind")
    if source_kind == "mounted":
        mount_id = metadata.get("mountId")
        if not requested.is_symlink() or not isinstance(mount_id, str) or mount_id not in MOUNT_ROOTS:
            raise ValueError("Invalid mounted image source")
        mount_root = MOUNT_ROOTS[mount_id].resolve()
        if resolved != mount_root and mount_root not in resolved.parents:
            raise ValueError("Mounted image source leaves its configured root")
    elif source_kind == "upload":
        if requested.is_symlink() or (resolved != record_root and record_root not in resolved.parents):
            raise ValueError("Invalid uploaded image source")
    elif requested.is_symlink() or (resolved != record_root and record_root not in resolved.parents):
        # Legacy records are accepted only when their location proves they are uploads.
        raise ValueError("Ambiguous legacy image source")

    stored_fingerprint = metadata.get("_sourceFingerprint")
    if stored_fingerprint is not None:
        if not isinstance(stored_fingerprint, dict) or stored_fingerprint != source_fingerprint(resolved):
            raise SourceChangedError("Registered image source changed")
    elif source_kind in {"mounted", "upload"}:
        raise ValueError("Registered image source has no fingerprint")
    return requested


def validated_iip_source(image_id: str, metadata: dict) -> Path:
    source = validated_record_source(image_id, metadata)
    if source.suffix.lower() != ".jp2":
        raise ValueError("Invalid JPEG 2000 source")
    return source.resolve()

def write_uploading_metadata(
    image_id: str,
    filename: str,
    extension: str,
    source: Path,
    declared_size: int = 0,
) -> None:
    now = utc_now()
    write_metadata(
        image_id,
        {
            "id": image_id,
            "filename": filename,
            "format": ALLOWED_EXTENSIONS[extension],
            "fileSize": declared_size,
            "status": "uploading",
            "progress": 0,
            "message": "Receiving upload",
            "createdAt": now,
            "updatedAt": now,
            "sourceKind": "upload",
            "_source": str(source),
        },
    )





def vips_field(source: Path, field: str, default: str = "") -> str:
    if not VIPSHEADER:
        raise RuntimeError("libvips is required but vipsheader was not found in PATH")
    result = subprocess.run(
        [VIPSHEADER, "-f", field, str(source)],
        check=False,
        capture_output=True,
        text=True,
        timeout=90,
    )
    if result.returncode != 0:
        if default != "":
            return default
        message = (result.stderr or result.stdout or "libvips could not inspect the image").strip()
        raise ValueError(message)
    return result.stdout.strip()


VIPS_FORMAT_MAP = {
    "0": "uchar",
    "1": "char",
    "2": "ushort",
    "3": "short",
    "4": "uint",
    "5": "int",
    "6": "float",
    "7": "complex",
    "8": "double",
    "9": "dpcomplex",
}

VIPS_INTERPRETATION_MAP = {
    "0": "error",
    "1": "multiband",
    "2": "b-w",
    "3": "histogram",
    "4": "fourier",
    "5": "xyz",
    "6": "lab",
    "7": "cmyk",
    "8": "labq",
    "9": "rgb",
    "10": "cmc",
    "11": "lch",
    "12": "labs",
    "13": "sRGB",
    "14": "yxy",
    "15": "fourier",
    "16": "rgb16",
    "17": "grey16",
    "18": "matrix",
    "19": "scrgb",
    "20": "hsv",
    "22": "sRGB",
}


def inspect_image(source: Path) -> dict:
    width = int(vips_field(source, "width"))
    height = int(vips_field(source, "height"))
    if width <= 0 or height <= 0:
        raise ValueError("The image has invalid dimensions")
    pixel_format = vips_field(source, "format", "unknown")
    format_match = re.search(r"VIPS_FORMAT_([A-Z0-9_]+)", pixel_format)
    normalized_format = format_match.group(1).lower() if format_match else VIPS_FORMAT_MAP.get(pixel_format, pixel_format)

    interpretation = vips_field(source, "interpretation", "unknown")
    interpretation_match = re.search(r"VIPS_INTERPRETATION_([A-Za-z0-9_]+)", interpretation)
    normalized_interpretation = interpretation_match.group(1) if interpretation_match else VIPS_INTERPRETATION_MAP.get(interpretation, interpretation)

    return {
        "width": width,
        "height": height,
        "bands": int(vips_field(source, "bands", "1") or "1"),
        "pixelFormat": normalized_format,
        "interpretation": normalized_interpretation,
        "pages": int(vips_field(source, "n-pages", "1") or "1"),
    }


def build_tile_pyramid(image_id: str) -> None:
    """Build one Deep Zoom pyramid without decoding the image in Python."""
    try:
        metadata = read_metadata(image_id)
        source = validated_record_source(image_id, metadata)
        update_metadata(
            image_id,
            status="processing",
            progress=12,
            message="Inspecting image metadata",
            error=None,
        )
        details = inspect_image(source)
        update_metadata(image_id, **details, progress=28, message="Building deep-zoom pyramid")

        if not VIPS:
            raise RuntimeError("libvips is required but the vips executable was not found in PATH")

        output_prefix = record_dir(image_id) / "image"
        clear_partial_pyramid(output_prefix)
        decoder = "libvips / OpenJPEG"
        result = run_dzsave(VIPS, source, output_prefix, TILE_SIZE)
        if result.returncode != 0:
            primary_error = (result.stderr or result.stdout or "Tile generation failed").strip()
            clear_partial_pyramid(output_prefix)
            if source.suffix.lower() != ".jp2":
                raise RuntimeError(primary_error)
            normalized = decode_jp2_with_kakadu(
                KDU_EXPAND,
                KAKADU_THREADS,
                record_dir(image_id),
                source,
                details,
                lambda: update_metadata(
                    image_id, progress=42, message="OpenJPEG compatibility issue · retrying with Kakadu"
                ),
            )
            try:
                result = run_dzsave(VIPS, normalized, output_prefix, TILE_SIZE)
            finally:
                normalized.unlink(missing_ok=True)
            if result.returncode != 0:
                fallback_error = (result.stderr or result.stdout or "Fallback tile generation failed").strip()
                raise RuntimeError(f"OpenJPEG: {primary_error}\nKakadu fallback: {fallback_error}")
            decoder = "Kakadu compatibility fallback"

        # With --depth onetile libvips numbers retained levels from zero,
        # so count generated directories instead of using absolute DZI levels.
        level_directories = [
            path for path in (record_dir(image_id) / "image_files").iterdir() if path.is_dir()
        ]
        max_level = max(0, len(level_directories) - 1)
        update_metadata(
            image_id,
            status="ready",
            progress=100,
            message="Ready",
            tileSize=TILE_SIZE,
            tileFormat="jpg",
            maxLevel=max_level,
            decoder=decoder,
            readyAt=utc_now(),
        )
        LOGGER.info("Tile pyramid ready for %s (%sx%s)", image_id, details["width"], details["height"])
    except Exception as exc:
        LOGGER.exception("Could not process image %s", image_id)
        try:
            clear_partial_pyramid(record_dir(image_id) / "image")
            update_metadata(
                image_id,
                status="error",
                progress=100,
                message="Image processing failed",
                error="The server could not decode this image. Verify that it is a supported, readable TIFF.",
            )
        except FileNotFoundError:
            pass


def _run_queued_job(image_id: str) -> None:
    with JOB_LOCK:
        if image_id not in QUEUED_JOBS:
            JOB_FUTURES.pop(image_id, None)
            return
        QUEUED_JOBS.remove(image_id)
        ACTIVE_JOBS.add(image_id)
    try:
        build_tile_pyramid(image_id)
    finally:
        with JOB_LOCK:
            ACTIVE_JOBS.discard(image_id)
            JOB_FUTURES.pop(image_id, None)


def queue_processing(image_id: str) -> None:
    with JOB_LOCK:
        if image_id in ACTIVE_JOBS or image_id in QUEUED_JOBS:
            return
        QUEUED_JOBS.append(image_id)
        try:
            # Submission happens while holding JOB_LOCK, so the worker cannot
            # transition the job to active before its Future is registered.
            JOB_FUTURES[image_id] = PROCESSORS.submit(_run_queued_job, image_id)
        except Exception:
            QUEUED_JOBS.remove(image_id)
            raise


def create_demo_record() -> dict:
    """Create (or reuse) a synthetic, non-sensitive scientific demo dataset."""
    image_id = "demo-neural-section-v1"
    with DEMO_LOCK:
        try:
            metadata = read_metadata(image_id)
            if metadata.get("status") in {"queued", "processing", "ready"}:
                return metadata
        except (FileNotFoundError, ValueError, json.JSONDecodeError):
            pass

        directory = record_dir(image_id)
        directory.mkdir(parents=True, exist_ok=True)
        source = STATIC_ROOT / "demo-section.svg"
        metadata = {
            "id": image_id,
            "filename": "synthetic_neural_section.tif",
            "format": "TIFF · demo",
            "fileSize": source.stat().st_size,
            "status": "queued",
            "progress": 5,
            "message": "Preparing demo dataset",
            "createdAt": utc_now(),
            "updatedAt": utc_now(),
            "demo": True,
            "_source": str(source),
        }
        write_metadata(image_id, metadata)
        queue_processing(image_id)
        return metadata


def is_uuid_record_name(value: str) -> bool:
    try:
        return str(uuid.UUID(value)) == value
    except ValueError:
        return False


def sweep_incomplete_overlay_records() -> None:
    """Remove only UUID-scoped overlay ingests that cannot be resumed safely."""
    root = overlay_records_root()
    if not root.is_dir():
        return
    for directory in root.iterdir():
        if directory.is_symlink() or not directory.is_dir() or not is_uuid_record_name(directory.name):
            continue
        remove = False
        try:
            metadata = json.loads((directory / "metadata.json").read_text(encoding="utf-8"))
            if metadata.get("id") != directory.name or metadata.get("kind") != "indexed-geojson":
                remove = True
            elif metadata.get("status") in {"uploading", "indexing"}:
                remove = True
            elif metadata.get("status") == "ready":
                raw_index = metadata.get("_index")
                expected_index = directory / f"geometry{overlay_index.INDEX_SUFFIX}"
                remove = (
                    not isinstance(raw_index, str)
                    or Path(raw_index) != expected_index
                    or expected_index.is_symlink()
                    or not expected_index.is_file()
                )
                if not remove:
                    # Reject corrupt or obsolete on-disk formats during
                    # startup, before a viewport request can turn them into a
                    # late 500. Mounted sources can be re-registered and
                    # rebuilt from their current fingerprint on demand.
                    overlay_index.inspect_index(expected_index)
                if not remove and metadata.get("sourceKind") == "upload":
                    updated_at = metadata.get("updatedAt")
                    if not isinstance(updated_at, str):
                        remove = True
                    else:
                        updated = datetime.fromisoformat(updated_at)
                        if updated.tzinfo is None:
                            updated = updated.replace(tzinfo=timezone.utc)
                        age_seconds = (datetime.now(timezone.utc) - updated).total_seconds()
                        remove = age_seconds > MAX_UPLOADED_OVERLAY_AGE_SECONDS
        except (
            OSError,
            ValueError,
            TypeError,
            json.JSONDecodeError,
            overlay_index.OverlayIndexError,
        ):
            remove = True
        if remove:
            shutil.rmtree(directory)
            LOGGER.warning("Removed incomplete overlay record %s", directory.name)


def sweep_incomplete_records() -> None:
    """Remove only UUID-scoped records that cannot be tracked or resumed."""
    for directory in DATA_ROOT.iterdir():
        if (
            directory.is_symlink()
            or not directory.is_dir()
            or not is_uuid_record_name(directory.name)
        ):
            continue
        if not (directory / "metadata.json").is_file():
            shutil.rmtree(directory)
            LOGGER.warning("Removed incomplete image record %s", directory.name)


def recover_processing_jobs() -> None:
    for path in DATA_ROOT.glob("*/metadata.json"):
        try:
            metadata = json.loads(path.read_text(encoding="utf-8"))
            image_id = metadata["id"]
            if path.parent.name != image_id:
                raise ValueError("Record id does not match its directory")
            if metadata.get("status") == "uploading":
                if is_uuid_record_name(image_id):
                    shutil.rmtree(path.parent)
                    LOGGER.warning("Removed interrupted upload record %s", image_id)
                continue
            if metadata.get("status") not in {"queued", "processing"}:
                continue

            try:
                source = validated_record_source(image_id, metadata)
                if source.suffix.lower() == ".jp2":
                    details = IIP.metadata(source)
                    ready_fields = prepared_iip_ready_fields(image_id, source, details)
                    ready_fields["_sourceFingerprint"] = source_fingerprint(source.resolve(strict=True))
                    update_metadata(image_id, **ready_fields, error=None)
                else:
                    queue_processing(image_id)
            except (IIPError, OSError, ValueError):
                LOGGER.warning("Could not recover image record %s", image_id, exc_info=True)
                update_metadata(
                    image_id,
                    status="error",
                    progress=100,
                    message="Image recovery failed",
                    error="The saved source could not be validated. Register or upload the image again.",
                )
        except (OSError, ValueError, json.JSONDecodeError, KeyError):
            LOGGER.warning("Ignoring invalid record at %s", path)




@asynccontextmanager
async def lifespan(_: FastAPI):
    sweep_incomplete_records()
    sweep_incomplete_overlay_records()
    recover_processing_jobs()
    yield
    PROCESSORS.shutdown(wait=False, cancel_futures=True)


app = FastAPI(title="NeuroScope", version="1.0.0", docs_url=None, redoc_url=None, lifespan=lifespan)


@app.get("/api/health")
def health() -> JSONResponse:
    vips_ready = bool(VIPS and VIPSHEADER)
    kakadu_ready = bool(KDU_EXPAND)
    try:
        iip_ready = IIP.probe(timeout=min(1.0, IIP_TIMEOUT))
    except (IIPError, OSError, ValueError):
        iip_ready = False
    ready = vips_ready and kakadu_ready and iip_ready
    return JSONResponse(
        {
            "status": "ok" if ready else "degraded",
            "vips": vips_ready,
            "kakadu": kakadu_ready,
            "iip": iip_ready,
        },
        status_code=200 if ready else 503,
    )


@app.post("/api/images", status_code=202)
async def upload_image(file: UploadFile = File(...)) -> JSONResponse:
    """Compatibility multipart upload; raw uploads avoid an extra spool/copy."""
    filename = safe_filename(file.filename or "")
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="This file format is not supported. Upload a JP2, TIF, or TIFF image.",
        )

    image_id = str(uuid.uuid4())
    directory = record_dir(image_id)
    directory.mkdir(parents=True, exist_ok=False)
    source = directory / f"source{extension}"
    write_uploading_metadata(image_id, filename, extension, source)
    written = 0
    try:
        with source.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                written += len(chunk)
                if written > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="The uploaded image exceeds the server limit")
                output.write(chunk)
        if written == 0:
            raise HTTPException(status_code=400, detail="The uploaded file is empty")

        metadata, status_code = await run_in_threadpool(
            register_image_source,
            image_id,
            filename,
            extension,
            source,
            written,
            source_kind="upload",
        )
        return JSONResponse(public_metadata(metadata), status_code=status_code)
    except HTTPException:
        shutil.rmtree(directory, ignore_errors=True)
        raise
    except IIPError as exc:
        LOGGER.warning("JP2 registration failed for %s", image_id)
        shutil.rmtree(directory, ignore_errors=True)
        raise HTTPException(status_code=502, detail="The image tile service could not open this JP2") from exc
    except Exception as exc:
        LOGGER.exception("Upload failed")
        shutil.rmtree(directory, ignore_errors=True)
        raise HTTPException(status_code=500, detail="The image could not be uploaded") from exc
    finally:
        await file.close()

@app.post("/api/images/raw")
async def upload_image_raw(
    request: Request,
    filename: str = Query(..., min_length=1, max_length=512),
) -> JSONResponse:
    """Stream an unwrapped request body once, directly into its final source file."""
    filename = safe_filename(filename)
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="This file format is not supported. Upload a JP2, TIF, or TIFF image.",
        )
    if request.headers.get("content-encoding", "identity").lower() not in {"", "identity"}:
        raise HTTPException(status_code=415, detail="Compressed request bodies are not supported")

    declared_size = 0
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            declared_size = int(content_length)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid Content-Length header") from exc
        if declared_size < 0:
            raise HTTPException(status_code=400, detail="Invalid Content-Length header")
        if declared_size > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="The uploaded image exceeds the server limit")

    image_id = str(uuid.uuid4())
    directory = record_dir(image_id)
    directory.mkdir(parents=True, exist_ok=False)
    source = directory / f"source{extension}"
    write_uploading_metadata(image_id, filename, extension, source, declared_size)
    written = 0
    try:
        with source.open("xb") as output:
            async for chunk in request.stream():
                if not chunk:
                    continue
                written += len(chunk)
                if written > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="The uploaded image exceeds the server limit")
                output.write(chunk)
        if written == 0:
            raise HTTPException(status_code=400, detail="The uploaded file is empty")

        metadata, status_code = await run_in_threadpool(
            register_image_source,
            image_id,
            filename,
            extension,
            source,
            written,
            source_kind="upload",
        )
        return JSONResponse(public_metadata(metadata), status_code=status_code)
    except HTTPException:
        shutil.rmtree(directory, ignore_errors=True)
        raise
    except IIPError as exc:
        LOGGER.warning("Raw JP2 registration failed for %s", image_id)
        shutil.rmtree(directory, ignore_errors=True)
        raise HTTPException(status_code=502, detail="The image tile service could not open this JP2") from exc
    except Exception as exc:
        LOGGER.exception("Raw upload failed")
        shutil.rmtree(directory, ignore_errors=True)
        raise HTTPException(status_code=500, detail="The image could not be uploaded") from exc


@app.post("/api/overlays/raw")
async def upload_overlay_raw(
    request: Request,
    filename: str = Query(..., min_length=1, max_length=512),
) -> JSONResponse:
    """Stream a browser-local GeoJSON once, then build its server-side index."""
    filename = safe_filename(filename)
    if Path(filename).suffix.lower() != ".json":
        raise HTTPException(status_code=400, detail="Only GeoJSON/JSON overlays can be indexed")
    if request.headers.get("content-encoding", "identity").lower() not in {"", "identity"}:
        raise HTTPException(status_code=415, detail="Compressed request bodies are not supported")

    declared_size = 0
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            declared_size = int(content_length)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid Content-Length header") from exc
        if declared_size < 0:
            raise HTTPException(status_code=400, detail="Invalid Content-Length header")
        if declared_size > MAX_INDEXED_OVERLAY_BYTES:
            raise HTTPException(status_code=413, detail="The uploaded overlay exceeds the server limit")

    overlay_id = str(uuid.uuid4())
    directory = overlay_record_dir(overlay_id)
    directory.mkdir(parents=True, exist_ok=False)
    source = directory / "source.json"
    now = utc_now()
    write_overlay_metadata(
        overlay_id,
        {
            "id": overlay_id,
            "kind": "indexed-geojson",
            "filename": filename,
            "fileSize": declared_size,
            "status": "uploading",
            "progress": 0,
            "message": "Receiving overlay upload",
            "createdAt": now,
            "updatedAt": now,
            "sourceKind": "upload",
            "featureCount": None,
            "primitiveCount": None,
            "segmentCount": None,
            "vertexCount": None,
            "bounds": None,
            "_source": str(source),
        },
    )
    written = 0
    try:
        with source.open("xb") as output:
            async for chunk in request.stream():
                if not chunk:
                    continue
                written += len(chunk)
                if written > MAX_INDEXED_OVERLAY_BYTES:
                    raise HTTPException(status_code=413, detail="The uploaded overlay exceeds the server limit")
                output.write(chunk)
        if written == 0:
            raise HTTPException(status_code=400, detail="The uploaded overlay is empty")

        with exclusive_overlay_operation():
            metadata = await run_in_threadpool(
                register_overlay_source,
                overlay_id,
                filename,
                source,
                written,
                source_kind="upload",
            )
        return JSONResponse(public_overlay_metadata(metadata), status_code=201)
    except HTTPException:
        shutil.rmtree(directory, ignore_errors=True)
        raise
    except overlay_index.OverlayValidationError as exc:
        shutil.rmtree(directory, ignore_errors=True)
        raise HTTPException(status_code=400, detail=str(exc) or "The GeoJSON overlay is invalid") from exc
    except (OverlaySourceChangedError, overlay_index.OverlayIndexStaleError) as exc:
        shutil.rmtree(directory, ignore_errors=True)
        raise HTTPException(status_code=409, detail="The overlay changed during indexing") from exc
    except overlay_index.OverlayIndexError as exc:
        LOGGER.warning("Overlay indexing failed for %s", overlay_id, exc_info=True)
        shutil.rmtree(directory, ignore_errors=True)
        raise HTTPException(status_code=500, detail="The overlay could not be indexed") from exc
    except Exception as exc:
        LOGGER.exception("Raw overlay upload failed")
        shutil.rmtree(directory, ignore_errors=True)
        raise HTTPException(status_code=500, detail="The overlay could not be uploaded") from exc


@app.get("/api/mounts")
def list_mounts() -> dict:
    return {"mounts": [{"id": mount_id, "label": mount_id} for mount_id in sorted(MOUNT_ROOTS)]}


@app.get("/api/mounts/{mount_id}/browse")
def browse_mount(mount_id: str, path: str = Query("", max_length=4096)) -> dict:
    root = mounted_root(mount_id)
    directory = resolve_mounted_path(mount_id, path, require_directory=True)
    current_path = mounted_relative_path(root, directory)
    entries = []
    truncated = False
    try:
        # Bound NFS work before sorting. The UI deliberately browses one
        # directory at a time; it must never materialize an unbounded folder.
        sampled_candidates = list(islice(directory.iterdir(), 2001))
        truncated = len(sampled_candidates) > 2000
        candidates = sorted(sampled_candidates[:2000], key=lambda item: item.name.casefold())
        for candidate in candidates:
            try:
                resolved = candidate.resolve(strict=True)
                if resolved != root and root not in resolved.parents:
                    continue
                if resolved.is_dir():
                    kind = "directory"
                    image_format = None
                elif resolved.is_file():
                    extension = resolved.suffix.lower()
                    image_format = ALLOWED_EXTENSIONS.get(extension) or ALLOWED_OVERLAY_EXTENSIONS.get(extension)
                    if not image_format:
                        continue
                    kind = "file"
                else:
                    continue
                stats = resolved.stat()
                relative = mounted_relative_path(root, resolved)
                entry = {
                    "name": candidate.name,
                    "path": relative,
                    "type": kind,
                    "modifiedAt": datetime.fromtimestamp(stats.st_mtime, timezone.utc).isoformat(),
                }
                if kind == "file":
                    entry["size"] = stats.st_size
                    entry["format"] = image_format
                elif kind == "directory":
                    name_lower = candidate.name.lower()
                    if any(k in name_lower for k in ["jp2", "compressed", "converted", "mba"]) or re.match(r"^MD\d+", candidate.name, re.IGNORECASE):
                        entry["isBrainSeries"] = True
                entries.append(entry)
            except (OSError, RuntimeError, ValueError):
                continue
    except OSError as exc:
        raise HTTPException(status_code=503, detail="Mounted directory could not be read") from exc

    return {
        "mount": {"id": mount_id, "label": mount_id},
        "path": current_path,
        "parent": None if directory == root else mounted_relative_path(root, directory.parent),
        "entries": entries,
        "truncated": truncated,
    }


@app.get("/api/mounts/{mount_id}/file")
def get_mounted_overlay(mount_id: str, path: str = Query(..., min_length=1, max_length=4096)) -> FileResponse:
    source = resolve_mounted_path(mount_id, path, require_directory=False)
    extension = source.suffix.lower()
    if extension not in ALLOWED_OVERLAY_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only mounted JSON and SWC overlays can be opened directly")
    try:
        size = source.stat().st_size
    except OSError as exc:
        raise HTTPException(status_code=404, detail="Mounted file not found") from exc
    if size > MAX_OVERLAY_BYTES:
        raise HTTPException(status_code=413, detail="The mounted overlay exceeds the server limit")
    media_type = "application/json" if extension == ".json" else "text/plain"
    return FileResponse(
        source,
        media_type=media_type,
        filename=source.name,
        content_disposition_type="inline",
        headers={"Cache-Control": "private, max-age=0, must-revalidate"},
    )


@app.post("/api/mounts/resolve-overlay-path")
def resolve_mounted_overlay_path(payload: dict = Body(...)) -> dict:
    """Describe an absolute mounted overlay using only its public relative path."""
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="A valid absolute overlay path is required")
    mount_id, source = resolve_absolute_mounted_file_path(payload.get("path"))
    extension = source.suffix.lower()
    overlay_format = ALLOWED_OVERLAY_EXTENSIONS.get(extension)
    if overlay_format is None:
        raise HTTPException(status_code=400, detail="Select a JSON or SWC overlay")
    try:
        stats = source.stat()
        modified_at = datetime.fromtimestamp(stats.st_mtime, timezone.utc).isoformat()
    except (OSError, OverflowError, ValueError) as exc:
        raise HTTPException(status_code=404, detail="Mounted overlay not found") from exc
    if stats.st_size <= 0:
        raise HTTPException(status_code=400, detail="The mounted overlay is empty")
    size_limit = MAX_INDEXED_OVERLAY_BYTES if extension == ".json" else MAX_OVERLAY_BYTES
    if stats.st_size > size_limit:
        raise HTTPException(status_code=413, detail="The mounted overlay exceeds the server limit")

    root = mounted_root(mount_id)
    return {
        "mountId": mount_id,
        "path": mounted_relative_path(root, source),
        "name": source.name,
        "size": stats.st_size,
        "format": overlay_format,
        "type": "file",
        "kind": "overlay",
        "modifiedAt": modified_at,
    }


@app.post("/api/mounts/{mount_id}/register-overlay")
def register_mounted_overlay(mount_id: str, payload: dict = Body(...)) -> JSONResponse:
    """Index a mounted GeoJSON in place and reuse an unchanged cached index."""
    relative_path = payload.get("path")
    if not isinstance(relative_path, str) or not relative_path:
        raise HTTPException(status_code=400, detail="A relative mounted overlay path is required")
    root = mounted_root(mount_id)
    mounted_source = resolve_mounted_path(mount_id, relative_path, require_directory=False)
    if mounted_source.suffix.lower() != ".json":
        raise HTTPException(status_code=400, detail="Select a JSON overlay")
    try:
        file_size = mounted_source.stat().st_size
        fingerprint = _overlay_fingerprint_dict(mounted_source)
    except OSError as exc:
        raise HTTPException(status_code=404, detail="Mounted overlay not found") from exc
    if file_size <= 0:
        raise HTTPException(status_code=400, detail="The mounted overlay is empty")
    if file_size > MAX_INDEXED_OVERLAY_BYTES:
        raise HTTPException(status_code=413, detail="The mounted overlay exceeds the indexing limit")
    normalized_path = mounted_relative_path(root, mounted_source)

    with exclusive_overlay_operation(), OVERLAY_REGISTRATION_LOCK:
        cached = find_cached_mounted_overlay(mount_id, normalized_path, fingerprint)
        if cached is not None:
            return JSONResponse(public_overlay_metadata(cached), status_code=200)

        overlay_id = str(uuid.uuid4())
        directory = overlay_record_dir(overlay_id)
        try:
            directory.mkdir(parents=True, exist_ok=False)
            source_alias = directory / "source.json"
            source_alias.symlink_to(mounted_source)
            metadata = register_overlay_source(
                overlay_id,
                safe_filename(mounted_source.name),
                source_alias,
                file_size,
                source_kind="mounted",
                expected_fingerprint=fingerprint,
                extra={"mountId": mount_id, "mountedPath": normalized_path},
            )
            return JSONResponse(public_overlay_metadata(metadata), status_code=201)
        except overlay_index.OverlayValidationError as exc:
            shutil.rmtree(directory, ignore_errors=True)
            raise HTTPException(status_code=400, detail=str(exc) or "The GeoJSON overlay is invalid") from exc
        except (OverlaySourceChangedError, overlay_index.OverlayIndexStaleError) as exc:
            shutil.rmtree(directory, ignore_errors=True)
            raise HTTPException(status_code=409, detail="The mounted overlay changed during indexing") from exc
        except overlay_index.OverlayIndexError as exc:
            LOGGER.warning("Mounted overlay indexing failed for %s", overlay_id, exc_info=True)
            shutil.rmtree(directory, ignore_errors=True)
            raise HTTPException(status_code=500, detail="The mounted overlay could not be indexed") from exc
        except HTTPException:
            shutil.rmtree(directory, ignore_errors=True)
            raise
        except Exception as exc:
            LOGGER.exception("Mounted overlay registration failed")
            shutil.rmtree(directory, ignore_errors=True)
            raise HTTPException(status_code=500, detail="The mounted overlay could not be registered") from exc


def register_resolved_mounted_image(mount_id: str, mounted_source: Path) -> JSONResponse:
    """Register or reuse a canonical image already inside a mounted root."""
    root = mounted_root(mount_id)
    extension = mounted_source.suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Select a JP2, TIF, or TIFF image")
    try:
        file_size = mounted_source.stat().st_size
        fingerprint = source_fingerprint(mounted_source)
    except OSError as exc:
        raise HTTPException(status_code=404, detail="Mounted file not found") from exc
    if file_size <= 0:
        raise HTTPException(status_code=400, detail="The mounted image is empty")
    normalized_path = mounted_relative_path(root, mounted_source)

    with MOUNTED_IMAGE_REGISTRATION_LOCK:
        cached = find_cached_mounted_image(mount_id, normalized_path, mounted_source, fingerprint)
        if cached is not None:
            return JSONResponse(public_metadata(cached), status_code=200)

        image_id = str(uuid.uuid4())
        directory = record_dir(image_id)
        try:
            directory.mkdir(parents=True, exist_ok=False)
            source_alias = directory / f"source{extension}"
            source_alias.symlink_to(mounted_source)
            metadata, status_code = register_image_source(
                image_id,
                safe_filename(mounted_source.name),
                extension,
                source_alias,
                file_size,
                source_kind="mounted",
                extra={"mountId": mount_id, "mountedPath": normalized_path},
            )
            return JSONResponse(public_metadata(metadata), status_code=status_code)
        except SourceChangedError as exc:
            shutil.rmtree(directory, ignore_errors=True)
            raise HTTPException(status_code=409, detail="The mounted image changed during registration") from exc
        except IIPError as exc:
            shutil.rmtree(directory, ignore_errors=True)
            raise HTTPException(status_code=502, detail="The image tile service could not open this JP2") from exc
        except HTTPException:
            shutil.rmtree(directory, ignore_errors=True)
            raise
        except Exception as exc:
            LOGGER.exception("Mounted image registration failed")
            shutil.rmtree(directory, ignore_errors=True)
            raise HTTPException(status_code=500, detail="The mounted image could not be registered") from exc


@app.post("/api/mounts/{mount_id}/register")
def register_mounted_image(mount_id: str, payload: dict = Body(...)) -> JSONResponse:
    relative_path = payload.get("path")
    if not isinstance(relative_path, str) or not relative_path:
        raise HTTPException(status_code=400, detail="A relative mounted file path is required")
    mounted_source = resolve_mounted_path(mount_id, relative_path, require_directory=False)
    return register_resolved_mounted_image(mount_id, mounted_source)


@app.post("/api/mounts/register-path")
def register_mounted_image_path(payload: dict = Body(...)) -> JSONResponse:
    """Register an absolute server path only when it is inside a configured root."""
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="A valid absolute image path is required")
    mount_id, mounted_source = resolve_absolute_mounted_image_path(payload.get("path"))
    return register_resolved_mounted_image(mount_id, mounted_source)



@app.post("/api/demo", status_code=202)
def create_demo() -> JSONResponse:
    try:
        return JSONResponse(public_metadata(create_demo_record()), status_code=202)
    except Exception as exc:
        LOGGER.exception("Could not create demo")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/images")
def list_images(
    limit: int = Query(
        IMAGE_LIBRARY_DEFAULT_LIMIT,
        ge=1,
        le=IMAGE_LIBRARY_MAX_LIMIT,
    ),
) -> dict:
    """List a bounded page of viewable or in-progress image records."""
    if not isinstance(limit, int) or not 1 <= limit <= IMAGE_LIBRARY_MAX_LIMIT:
        raise HTTPException(
            status_code=400,
            detail=f"limit must be between 1 and {IMAGE_LIBRARY_MAX_LIMIT}",
        )
    records, total = image_library_records(limit)
    return {
        "images": records,
        "total": total,
        "truncated": total > len(records),
    }


@app.get("/api/images/{image_id}/companions")
def get_image_companions(image_id: str) -> dict:
    """Auto-discover matching .json and .swc companion overlays for an active image."""
    try:
        metadata = resolve_image_record(image_id)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Image record not found") from exc

    if metadata.get("isDemo") or image_id == "demo-neu":
        return {
            "imageId": image_id,
            "imageStem": "synthetic_neural_section",
            "companions": [
                {
                    "filename": "demo_neuron.swc",
                    "path": "demo_neuron.swc",
                    "mountId": "demo",
                    "kind": "swc",
                    "typeLabel": "SWC Skeleton",
                    "size": 1840,
                    "isIndexed": False,
                    "isDemo": True,
                },
                {
                    "filename": "cell_detections.json",
                    "path": "cell_detections.json",
                    "mountId": "demo",
                    "kind": "json",
                    "typeLabel": "Spatial JSON",
                    "size": 2480,
                    "isIndexed": False,
                    "isDemo": True,
                },
            ],
        }

    mount_id = metadata.get("mountId")
    relative_path = metadata.get("mountedPath")
    if not mount_id or not relative_path:
        return {"imageId": image_id, "imageStem": Path(metadata.get("filename", "")).stem, "companions": []}

    try:
        mounted_source = resolve_mounted_path(mount_id, relative_path, require_directory=False)
        companions = find_companion_overlays_for_source(mounted_source, mount_id)

        brain_series_info = None
        parent_dir = mounted_source.parent
        brain_match = re.search(r"(MD\d+)", mounted_source.stem, flags=re.IGNORECASE)
        if brain_match or parent_dir.name in {"compressed_jp2", "converted_jp2", "jp2"}:
            root = mounted_root(mount_id)
            brain_id = brain_match.group(1).upper() if brain_match else parent_dir.parent.name
            brain_series_info = {
                "brainId": brain_id,
                "path": mounted_relative_path(root, parent_dir),
                "mountId": mount_id,
            }

        return {
            "imageId": image_id,
            "imageStem": mounted_source.stem,
            "companions": companions,
            "brainSeries": brain_series_info,
        }
    except Exception as exc:
        LOGGER.warning("Could not search companion overlays for %s: %s", image_id, exc)
        return {"imageId": image_id, "imageStem": Path(metadata.get("filename", "")).stem, "companions": []}


def find_companion_overlays_for_source(
    mounted_source: Path,
    mount_id: str | None = None,
    limit: int = 12,
) -> list[dict]:
    """Find matching .json and .swc overlay files for an image source."""
    if not mounted_source.exists():
        return []

    stem = mounted_source.stem
    clean_stem = re.sub(r"(_lossy|_lossless)$", "", stem, flags=re.IGNORECASE)
    section_match = re.search(r"(MD\d+-F\d+)", stem, flags=re.IGNORECASE)
    section_token = section_match.group(1) if section_match else clean_stem

    candidates: list[Path] = []
    seen: set[str] = set()

    def add_candidate(path: Path):
        try:
            resolved = path.resolve()
            key = str(resolved)
            if key in seen:
                return
            if not path.is_file() or path.is_symlink():
                return
            suffix = path.suffix.lower()
            if suffix not in {".json", ".swc"}:
                return
            sz = path.stat().st_size
            if sz <= 0 or sz > MAX_INDEXED_OVERLAY_BYTES:
                return
            seen.add(key)
            candidates.append(path)
        except OSError:
            return

    parent = mounted_source.parent

    # 1. Same directory (prioritizing matching tokens, then all overlays in same folder)
    for f in parent.glob(f"*{section_token}*.json"):
        add_candidate(f)
    for f in parent.glob(f"*{section_token}*.swc"):
        add_candidate(f)
    for f in parent.glob("*.json"):
        add_candidate(f)
    for f in parent.glob("*.swc"):
        add_candidate(f)

    # 2. Subdirectories in parent (whole_image, swc, annotations, pmd, stp, etc.)
    for sub in ["whole_image", "swc", "annotations", "json", "pmd", "stp"]:
        subdir = parent / sub
        if subdir.is_dir():
            for f in subdir.glob(f"*{section_token}*.json"):
                add_candidate(f)
            for f in subdir.glob(f"*{section_token}*.swc"):
                add_candidate(f)

    # 3. Known sibling pipeline directories (e.g. ancestor / dm2doutputs / ... / whole_image)
    for ancestor in [parent, parent.parent, parent.parent.parent, parent.parent.parent.parent]:
        if not ancestor.is_dir():
            continue
        for pipeline_dir_name in ["dm2doutputs", "outputs", "segmentations", "swc"]:
            pipeline_dir = ancestor / pipeline_dir_name
            if pipeline_dir.is_dir():
                for match in pipeline_dir.glob(f"*/{clean_stem}*"):
                    if match.is_dir():
                        for f in match.rglob("*.json"):
                            add_candidate(f)
                        for f in match.rglob("*.swc"):
                            add_candidate(f)
                for match in pipeline_dir.glob(f"*{section_token}*"):
                    if match.is_file():
                        add_candidate(match)
                    elif match.is_dir():
                        for f in match.glob(f"*{section_token}*.json"):
                            add_candidate(f)
                        for f in match.glob(f"*{section_token}*.swc"):
                            add_candidate(f)
                        for f in (match / "whole_image").glob("*.json"):
                            add_candidate(f)

    results = []
    for cand in candidates[:limit]:
        cand_mount_id = mount_id
        cand_rel_path = None
        if cand_mount_id:
            try:
                root = mounted_root(cand_mount_id)
                cand_rel_path = mounted_relative_path(root, cand)
            except Exception:
                cand_mount_id = None
        if not cand_mount_id:
            for m_id, m_root in MOUNT_ROOTS.items():
                try:
                    rel = mounted_relative_path(m_root, cand)
                    cand_mount_id = m_id
                    cand_rel_path = rel
                    break
                except Exception:
                    continue

        if not cand_mount_id or not cand_rel_path:
            continue

        try:
            sz = cand.stat().st_size
        except OSError:
            continue

        kind = cand.suffix.lower().lstrip(".")
        name_lower = cand.name.lower()
        if kind == "swc":
            type_label = "SWC Skeleton"
        elif "lossy" in name_lower or "pmd" in name_lower or "segment" in name_lower:
            type_label = "PMD Segmentation"
        else:
            type_label = "Spatial JSON"

        results.append({
            "filename": cand.name,
            "path": cand_rel_path,
            "mountId": cand_mount_id,
            "kind": kind,
            "typeLabel": type_label,
            "size": sz,
            "isIndexed": kind == "json" and sz >= 32 * 1024 * 1024,
        })

    results.sort(key=lambda item: (
        0 if clean_stem in item["filename"] else 1,
        -item["size"]
    ))
    return results


@app.post("/api/mounts/{mount_id}/find-companions")
def find_mount_companions(mount_id: str, payload: dict = Body(...)) -> dict:
    """Find companion overlays for an arbitrary mounted path."""
    relative_path = payload.get("path")
    if not isinstance(relative_path, str) or not relative_path:
        raise HTTPException(status_code=400, detail="A relative mounted file path is required")
    mounted_source = resolve_mounted_path(mount_id, relative_path, require_directory=False)
    companions = find_companion_overlays_for_source(mounted_source, mount_id)
    return {
        "path": relative_path,
        "mountId": mount_id,
        "imageStem": mounted_source.stem,
        "companions": companions,
    }


def natural_slice_key(filename: str) -> tuple:
    f_match = re.search(r"-F(\d+)-", filename, flags=re.IGNORECASE)
    f_num = int(f_match.group(1)) if f_match else 0
    idx_match = re.search(r"_(\d+)(?:\.|\_|$)", filename)
    idx_num = int(idx_match.group(1)) if idx_match else 0
    return (f_num, idx_num, filename)


def extract_section_label(filename: str) -> str:
    match = re.search(r"(F\d+)", filename, flags=re.IGNORECASE)
    if match:
        return match.group(1).upper()
    return Path(filename).stem[:8]


_BRAIN_SERIES_CACHE: dict[str, tuple[float, dict]] = {}
_BRAIN_SERIES_CACHE_TTL = 300.0  # 5 minutes


@app.get("/api/mounts/{mount_id}/brain-series")
def get_brain_series(mount_id: str, path: str = Query(..., description="Relative path to brain directory or section")) -> dict:
    """Discover all serial slices and paired companion segmentations in a brain series."""
    root = mounted_root(mount_id)
    target = resolve_mounted_path(mount_id, path, require_directory=None)

    if target.is_file():
        target_dir = target.parent
    else:
        target_dir = target

    if not target_dir.is_dir():
        raise HTTPException(status_code=404, detail="Brain series directory not found")

    cache_key = f"{mount_id}:{target_dir.as_posix()}"
    now = time.time()
    if cache_key in _BRAIN_SERIES_CACHE:
        cached_time, cached_val = _BRAIN_SERIES_CACHE[cache_key]
        if now - cached_time < _BRAIN_SERIES_CACHE_TTL:
            return cached_val

    brain_name = target_dir.name
    image_dir = target_dir

    if target_dir.name in {"compressed_jp2", "converted_jp2", "jp2", "whole_image", "ROI_QC"}:
        brain_name = target_dir.parent.name
        image_dir = target_dir
    elif (target_dir / "compressed_jp2").is_dir():
        brain_name = target_dir.name
        image_dir = target_dir / "compressed_jp2"
    elif (target_dir / "converted_jp2").is_dir():
        brain_name = target_dir.name
        image_dir = target_dir / "converted_jp2"

    slice_entries = []
    try:
        with os.scandir(image_dir) as it:
            for entry in it:
                if entry.is_file() and not entry.name.startswith("."):
                    name_lower = entry.name.lower()
                    if name_lower.endswith(".jp2") or name_lower.endswith(".tif") or name_lower.endswith(".tiff"):
                        try:
                            slice_entries.append((entry.name, entry.path, entry.stat().st_size))
                        except OSError:
                            pass
    except OSError:
        pass

    if not slice_entries and image_dir != target_dir:
        image_dir = target_dir
        try:
            with os.scandir(image_dir) as it:
                for entry in it:
                    if entry.is_file() and not entry.name.startswith("."):
                        name_lower = entry.name.lower()
                        if name_lower.endswith(".jp2") or name_lower.endswith(".tif") or name_lower.endswith(".tiff"):
                            try:
                                slice_entries.append((entry.name, entry.path, entry.stat().st_size))
                            except OSError:
                                pass
        except OSError:
            pass

    slice_entries.sort(key=lambda item: natural_slice_key(item[0]))

    # Fast scan of companion overlay directories
    overlay_map: dict[str, list[dict]] = {}
    for ancestor in [target_dir, target_dir.parent, target_dir.parent.parent, target_dir.parent.parent.parent, target_dir.parent.parent.parent.parent]:
        dm_dir = ancestor / "dm2doutputs"
        if dm_dir.is_dir():
            try:
                for pmd_name in os.listdir(dm_dir):
                    if brain_name.lower() in pmd_name.lower():
                        pmd_path = dm_dir / pmd_name
                        if pmd_path.is_dir():
                            for sub_name in os.listdir(pmd_path):
                                sub_path = pmd_path / sub_name
                                if sub_path.is_dir():
                                    wi_path = sub_path / "whole_image"
                                    if wi_path.is_dir():
                                        try:
                                            with os.scandir(wi_path) as wi_it:
                                                for f in wi_it:
                                                    if f.name.endswith(".json"):
                                                        clean_stem = re.sub(r"(_lossy|_lossless|_0|_1|\.json)$", "", f.name, flags=re.IGNORECASE)
                                                        clean_stem = re.sub(r"(_lossy|_lossless)$", "", clean_stem, flags=re.IGNORECASE)
                                                        overlay_map.setdefault(clean_stem, []).append({
                                                            "filename": f.name,
                                                            "path": mounted_relative_path(root, Path(f.path)),
                                                            "mountId": mount_id,
                                                            "kind": "json",
                                                            "typeLabel": "PMD Segmentation",
                                                            "size": f.stat().st_size,
                                                        })
                                        except OSError:
                                            pass
            except OSError:
                pass

    slices = []
    for name, abs_path, sz in slice_entries:
        try:
            clean_stem = re.sub(r"(_lossy|_lossless)$", "", Path(name).stem, flags=re.IGNORECASE)
            rel_path = mounted_relative_path(root, Path(abs_path))
            comps = overlay_map.get(clean_stem)
            if not comps:
                # Same directory check
                parent_p = Path(abs_path).parent
                comps = [
                    {
                        "filename": f.name,
                        "path": mounted_relative_path(root, f),
                        "mountId": mount_id,
                        "kind": "swc" if f.suffix.lower() == ".swc" else "json",
                        "typeLabel": "SWC Skeleton" if f.suffix.lower() == ".swc" else "Spatial JSON",
                        "size": f.stat().st_size,
                    }
                    for f in parent_p.glob(f"{clean_stem}*")
                    if f.is_file() and f.name != name and f.suffix.lower() in {".json", ".swc"}
                ]
            slices.append({
                "section": extract_section_label(name),
                "filename": name,
                "path": rel_path,
                "mountId": mount_id,
                "size": sz,
                "companions": comps or [],
            })
        except Exception:
            continue

    total_companions = sum(len(s["companions"]) for s in slices)

    res = {
        "brainId": brain_name,
        "rootPath": mounted_relative_path(root, target_dir),
        "mountId": mount_id,
        "sliceCount": len(slices),
        "totalOverlays": total_companions,
        "slices": slices,
    }
    _BRAIN_SERIES_CACHE[cache_key] = (now, res)
    return res


def resolve_image_record(identifier: str) -> dict:
    """Find an image record by UUID, demo alias, exact filename, stem, or mounted storage path."""
    clean = str(identifier or "").strip()
    if not clean:
        raise HTTPException(status_code=400, detail="Image identifier cannot be empty")

    # 1. Direct UUID lookup
    if IMAGE_ID_RE.fullmatch(clean):
        try:
            return read_metadata(clean)
        except (FileNotFoundError, ValueError, json.JSONDecodeError):
            pass

    # 2. Demo alias
    if clean.lower() in {"demo", "demo-neural-section-v1", "synthetic_neural_section.tif", "synthetic_neural_section"}:
        return create_demo_record()

    # 3. Search registered images in DATA_ROOT
    clean_lower = clean.lower()
    clean_stem = Path(clean).stem.lower()
    best_match = None
    most_recent_ts = float("-inf")

    try:
        if DATA_ROOT.is_dir():
            for directory in DATA_ROOT.iterdir():
                if (
                    directory.name.startswith(("_", "."))
                    or not IMAGE_ID_RE.fullmatch(directory.name)
                    or directory.is_symlink()
                    or not directory.is_dir()
                ):
                    continue
                path = directory / "metadata.json"
                if not path.is_file():
                    continue
                try:
                    with path.open("r", encoding="utf-8") as handle:
                        meta = json.load(handle)
                except Exception:
                    continue

                if not isinstance(meta, dict) or meta.get("status") not in IMAGE_RECORD_STATUSES:
                    continue

                fname = meta.get("filename", "")
                fname_lower = fname.lower()
                fname_stem = Path(fname).stem.lower()
                mounted_p = meta.get("mountedPath", "").lower()
                ts = image_library_timestamp(meta)

                # Highest priority: exact filename match
                if fname_lower == clean_lower or fname == clean:
                    if ts > most_recent_ts:
                        most_recent_ts = ts
                        best_match = meta
                # Match mounted relative path
                elif mounted_p and (mounted_p == clean_lower or mounted_p.endswith("/" + clean_lower)):
                    if ts > most_recent_ts:
                        most_recent_ts = ts
                        best_match = meta
                # Match stem (e.g. MD1021_F1 matching MD1021_F1.jp2)
                elif not best_match and (fname_stem == clean_stem or fname_stem == clean_lower):
                    if ts > most_recent_ts:
                        most_recent_ts = ts
                        best_match = meta
    except Exception as exc:
        LOGGER.warning("Error scanning image library for %s: %s", clean, exc)

    if best_match is not None:
        return best_match

    # 4. If identifier looks like an absolute server path inside mounts
    if clean.startswith("/"):
        try:
            mount_id, mounted_source = resolve_absolute_mounted_image_path(clean)
            res = register_resolved_mounted_image(mount_id, mounted_source)
            if res.status_code in (200, 201, 202):
                return json.loads(res.body.decode("utf-8"))
        except Exception:
            pass

    # 5. Search configured storage mounts for a file with this name
    clean_name = Path(clean).name
    if clean_name:
        for mount_id, root in MOUNT_ROOTS.items():
            if not root.is_dir():
                continue
            # Try direct root / clean
            direct = root / clean.lstrip("/")
            if direct.is_file() and direct.suffix.lower() in ALLOWED_EXTENSIONS:
                try:
                    res = register_resolved_mounted_image(mount_id, direct)
                    if res.status_code in (200, 201, 202):
                        return json.loads(res.body.decode("utf-8"))
                except Exception:
                    pass

            # Search mount root for file matching clean_name
            try:
                for candidate in root.glob(f"**/{clean_name}"):
                    if candidate.is_file() and candidate.suffix.lower() in ALLOWED_EXTENSIONS:
                        try:
                            res = register_resolved_mounted_image(mount_id, candidate)
                            if res.status_code in (200, 201, 202):
                                return json.loads(res.body.decode("utf-8"))
                        except Exception:
                            pass
                        break
            except Exception:
                pass

    raise HTTPException(status_code=404, detail=f"Image not found: {clean}")


@app.get("/api/images/{image_id}")
def get_image(image_id: str) -> dict:
    try:
        return public_metadata(resolve_image_record(image_id))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Image not found") from exc


@app.get("/api/overlays/{overlay_id}/geometry")
def get_overlay_geometry(
    overlay_id: str,
    min_x: float = Query(..., alias="minX"),
    min_y: float = Query(..., alias="minY"),
    max_x: float = Query(..., alias="maxX"),
    max_y: float = Query(..., alias="maxY"),
    max_segments: int = Query(50_000, alias="maxSegments", ge=1, le=MAX_OVERLAY_QUERY_SEGMENTS),
) -> JSONResponse:
    """Return a bounded, spatially representative set of visible line segments."""
    requested_bounds = (min_x, min_y, max_x, max_y)
    if not all(math.isfinite(float(value)) for value in requested_bounds):
        raise HTTPException(status_code=400, detail="Overlay query bounds must be finite")
    min_x, min_y, max_x, max_y = map(float, requested_bounds)
    if min_x >= max_x or min_y >= max_y:
        raise HTTPException(status_code=400, detail="Overlay query bounds must have positive area")
    if not isinstance(max_segments, int) or not 1 <= max_segments <= MAX_OVERLAY_QUERY_SEGMENTS:
        raise HTTPException(
            status_code=400,
            detail=f"maxSegments must be between 1 and {MAX_OVERLAY_QUERY_SEGMENTS}",
        )

    try:
        metadata = read_overlay_metadata(overlay_id)
    except (FileNotFoundError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=404, detail="Overlay not found") from exc
    if metadata.get("kind") != "indexed-geojson" or metadata.get("status") != "ready":
        raise HTTPException(status_code=409, detail="Overlay index is not ready")

    try:
        validated_overlay_source(overlay_id, metadata)
    except (OverlaySourceChangedError, OSError, ValueError) as exc:
        raise HTTPException(status_code=409, detail="The indexed overlay changed; register it again") from exc

    try:
        index_path = validated_overlay_geometry(overlay_id, metadata)
        fingerprint = metadata.get("_sourceFingerprint")
        if not isinstance(fingerprint, dict):
            raise ValueError("Indexed overlay has no source fingerprint")

        saved_bounds = metadata.get("bounds")
        if not isinstance(saved_bounds, dict):
            raise ValueError("Indexed overlay has invalid bounds")
        overlay_bounds = tuple(float(saved_bounds[name]) for name in ("minX", "minY", "maxX", "maxY"))
        if not all(math.isfinite(value) for value in overlay_bounds):
            raise ValueError("Indexed overlay has invalid bounds")
        overlay_min_x, overlay_min_y, overlay_max_x, overlay_max_y = overlay_bounds
        # Keep the caller's positive-area viewport intact. Indexed geometry can
        # legitimately have a zero-width/height extent (a point, horizontal
        # line, or vertical line), and Float32 storage may round a coordinate
        # just outside the exact source bounds retained for display. The index
        # performs its own padded intersection against stored coordinates.
        if (
            max_x < overlay_min_x
            or min_x > overlay_max_x
            or max_y < overlay_min_y
            or min_y > overlay_max_y
        ):
            return JSONResponse(
                {
                    "segments": [],
                    "segmentCount": 0,
                    "matchingFeatureCount": 0,
                    "matchingPrimitiveCount": 0,
                    "approximate": False,
                }
            )

        with overlay_index.read_index(index_path, expected_fingerprint=fingerprint) as index:
            result = index.query(
                min_x,
                min_y,
                max_x,
                max_y,
                limit=max_segments,
            )

        flat_segments: list[float] = []
        for segment in result.segments:
            flat_segments.extend(
                (float(segment.x1), float(segment.y1), float(segment.x2), float(segment.y2))
            )
        if len(flat_segments) // 4 > max_segments:
            raise overlay_index.OverlayIndexFormatError("Overlay query exceeded its response bound")
        return JSONResponse(
            {
                "segments": flat_segments,
                "segmentCount": len(flat_segments) // 4,
                "matchingFeatureCount": int(result.matching_feature_count),
                "matchingPrimitiveCount": int(result.matching_primitive_count),
                "approximate": bool(result.approximate or result.sampled),
            },
            headers={"Cache-Control": "private, max-age=0, must-revalidate"},
        )
    except overlay_index.OverlayIndexStaleError as exc:
        raise HTTPException(status_code=409, detail="The overlay index is stale; register it again") from exc
    except (overlay_index.OverlayIndexFormatError, OSError, ValueError, KeyError, TypeError) as exc:
        LOGGER.warning("Indexed overlay %s could not be queried", overlay_id, exc_info=True)
        raise HTTPException(status_code=500, detail="The overlay index could not be read") from exc
    except overlay_index.OverlayIndexError as exc:
        LOGGER.warning("Indexed overlay query failed for %s", overlay_id, exc_info=True)
        raise HTTPException(status_code=500, detail="The overlay query failed") from exc


@app.delete("/api/overlays/{overlay_id}", status_code=204)
def delete_overlay(overlay_id: str) -> Response:
    """Release storage owned by a browser-uploaded indexed overlay."""
    if not is_uuid_record_name(overlay_id):
        raise HTTPException(status_code=404, detail="Overlay not found")
    directory = overlay_record_dir(overlay_id)
    with RECORD_LOCK:
        try:
            metadata = read_overlay_metadata(overlay_id)
        except (FileNotFoundError, ValueError, json.JSONDecodeError) as exc:
            raise HTTPException(status_code=404, detail="Overlay not found") from exc
        if (
            directory.is_symlink()
            or metadata.get("id") != overlay_id
            or metadata.get("kind") != "indexed-geojson"
        ):
            raise HTTPException(status_code=404, detail="Overlay not found")
        if metadata.get("sourceKind") != "upload":
            raise HTTPException(status_code=409, detail="Mounted overlay indexes are shared caches")
        shutil.rmtree(directory)
    return Response(status_code=204)


@app.get("/api/images/{image_id}/tiles/{level}/{tile_name}")
def get_tile(
    image_id: str,
    level: int,
    tile_name: str,
    min: Optional[str] = None,
    max: Optional[str] = None,
    gam: Optional[float] = None,
) -> Response:
    match = TILE_NAME_RE.fullmatch(tile_name)
    if level < 0 or not match:
        raise HTTPException(status_code=400, detail="Invalid tile path")
    try:
        metadata = read_metadata(image_id)
    except (FileNotFoundError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=404, detail="Tile not found") from exc

    if metadata.get("tileBackend") == "iip":
        if metadata.get("status") != "ready":
            raise HTTPException(status_code=409, detail="Image tiles are not ready")
        if match.group(3).lower() not in {"jpg", "jpeg"}:
            raise HTTPException(status_code=400, detail="On-demand tiles use JPEG format")
        try:
            max_level = int(metadata["maxLevel"])
            width = int(metadata["width"])
            height = int(metadata["height"])
            tile_width = int(metadata.get("tileWidth", metadata["tileSize"]))
            tile_height = int(metadata.get("tileHeight", metadata["tileSize"]))
            _, _, columns, rows = iip_level_geometry(
                width,
                height,
                tile_width,
                tile_height,
                max_level,
                level,
            )
            tile_x, tile_y = int(match.group(1)), int(match.group(2))
            if tile_x >= columns or tile_y >= rows:
                raise HTTPException(status_code=404, detail="Tile not found")
            windows = metadata.get("displayWindows")
            if not isinstance(windows, list) or not windows:
                raise ValueError

            if isinstance(min, str) and isinstance(max, str):
                try:
                    mins = [float(v) for v in min.split(",")]
                    maxs = [float(v) for v in max.split(",")]
                    if len(mins) == 1 and len(windows) > 1:
                        mins = mins * len(windows)
                    if len(maxs) == 1 and len(windows) > 1:
                        maxs = maxs * len(windows)
                    if len(mins) == len(windows) and len(maxs) == len(windows):
                        custom_windows = []
                        for ch, (c_min, c_max) in enumerate(zip(mins, maxs)):
                            if math.isfinite(c_min) and math.isfinite(c_max) and c_max > c_min:
                                custom_windows.append({"channel": ch, "min": c_min, "max": c_max})
                        if len(custom_windows) == len(windows):
                            windows = custom_windows
                except (ValueError, TypeError):
                    pass

            try:
                gamma = float(gam) if (gam is not None and math.isfinite(float(gam)) and float(gam) > 0) else 1.0
            except (TypeError, ValueError):
                gamma = 1.0

            source = validated_iip_source(image_id, metadata)
            tile_index = tile_y * columns + tile_x
            body, media_type = IIP.tile(source, level, tile_index, windows, gamma=gamma)
        except HTTPException:
            raise
        except SourceChangedError as exc:
            raise HTTPException(status_code=409, detail="The registered image changed; register it again") from exc
        except IIPError as exc:
            raise HTTPException(status_code=502, detail="The image tile service is unavailable") from exc
        except (KeyError, TypeError, ValueError) as exc:
            raise HTTPException(status_code=404, detail="Tile not found") from exc
        return Response(
            content=body,
            media_type=media_type,
            headers={"Cache-Control": "public, max-age=31536000, immutable"},
        )

    try:
        max_level = int(metadata["maxLevel"])
        if level > max_level:
            raise FileNotFoundError
        base = (record_dir(image_id) / "image_files").resolve()
        target = (base / str(level) / tile_name).resolve()
        if base not in target.parents or not target.is_file():
            raise FileNotFoundError
        media_type = "image/png" if target.suffix.lower() == ".png" else "image/jpeg"
        return FileResponse(
            target,
            media_type=media_type,
            headers={"Cache-Control": "public, max-age=31536000, immutable"},
        )
    except (FileNotFoundError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=404, detail="Tile not found") from exc


@app.delete("/api/images/{image_id}")
def delete_image(image_id: str) -> dict:
    if image_id.startswith("demo-"):
        raise HTTPException(status_code=400, detail="The built-in demo is shared and cannot be removed")
    try:
        target = record_dir(image_id)
        with JOB_LOCK:
            if image_id in ACTIVE_JOBS:
                raise HTTPException(
                    status_code=409,
                    detail="This image is currently processing and cannot be removed",
                )
            if not target.is_dir():
                raise FileNotFoundError
            if image_id in QUEUED_JOBS:
                QUEUED_JOBS.remove(image_id)
                future = JOB_FUTURES.pop(image_id, None)
                if future is not None:
                    future.cancel()
            # Hold the lock through removal so a starting Future cannot race it.
            shutil.rmtree(target)
        return {"removed": image_id}
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=404, detail="Image not found") from exc


# API routes are registered before this catch-all static mount.
app.mount("/", StaticFiles(directory=STATIC_ROOT, html=True), name="static")


def main() -> None:
    if not VIPS or not VIPSHEADER:
        LOGGER.warning("libvips was not found; TIFF preparation will fail until it is installed")
    LOGGER.info("NeuroScope running at http://%s:%s", HOST, PORT)
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")


if __name__ == "__main__":
    main()
