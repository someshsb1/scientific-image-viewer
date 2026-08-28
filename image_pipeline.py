"""Native image-processing helpers used by the NeuroScope ingestion worker."""

from __future__ import annotations

import shutil
import subprocess
from collections.abc import Callable
from pathlib import Path


def clear_partial_pyramid(output_prefix: Path) -> None:
    """Remove only generated output for an incomplete pyramid attempt."""
    shutil.rmtree(output_prefix.with_name(f"{output_prefix.name}_files"), ignore_errors=True)
    output_prefix.with_suffix(".dzi").unlink(missing_ok=True)


def run_dzsave(
    vips: str,
    source: Path,
    output_prefix: Path,
    tile_size: int,
) -> subprocess.CompletedProcess[str]:
    command = [
        vips,
        "dzsave",
        str(source),
        str(output_prefix),
        "--layout",
        "dz",
        "--tile-size",
        str(tile_size),
        "--overlap",
        "0",
        "--depth",
        "onetile",
        "--suffix",
        ".jpg[Q=90,strip,optimize_coding]",
        "--background",
        "0",
    ]
    return subprocess.run(command, check=False, capture_output=True, text=True)


def decode_jp2_with_kakadu(
    kdu_expand: str | None,
    thread_count: int,
    directory: Path,
    source: Path,
    details: dict,
    progress_callback: Callable[[], None] | None = None,
) -> Path:
    """Decode JP2s that expose OpenJPEG tile-part compatibility errors."""
    if not kdu_expand:
        raise RuntimeError("OpenJPEG could not decode this JP2 and Kakadu is not available")

    bytes_per_sample = 2 if details.get("pixelFormat") in {"ushort", "short"} else 1
    estimated_bytes = details["width"] * details["height"] * max(1, details["bands"]) * bytes_per_sample
    free_bytes = shutil.disk_usage(directory).free
    if free_bytes < estimated_bytes * 1.3 + 512 * 1024**2:
        raise RuntimeError("Not enough temporary disk space for the JP2 compatibility decoder")

    normalized = directory / "kakadu-decoded.tif"
    if progress_callback:
        progress_callback()
    result = subprocess.run(
        [
            kdu_expand,
            "-i",
            str(source),
            "-o",
            str(normalized),
            "-num_threads",
            str(thread_count),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        normalized.unlink(missing_ok=True)
        raise RuntimeError((result.stderr or result.stdout or "Kakadu could not decode the JP2 file").strip())
    return normalized
