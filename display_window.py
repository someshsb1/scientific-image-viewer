"""Fast reduced-resolution sampling for scientific JP2 display windows."""

from __future__ import annotations

import math
import struct
import subprocess
import time
from pathlib import Path


class DisplayWindowError(RuntimeError):
    """A reduced-resolution display window could not be estimated."""


MAX_REDUCTION_ATTEMPTS = 4
MAX_PREVIEW_PIXELS = 300_000


def _pnm_token(data: bytes, offset: int) -> tuple[bytes, int]:
    length = len(data)
    while offset < length:
        if data[offset] == 35:  # '#': PNM comment
            newline = data.find(b"\n", offset)
            if newline < 0:
                raise DisplayWindowError("Invalid overview header")
            offset = newline + 1
        elif data[offset] in b" \t\r\n":
            offset += 1
        else:
            break
    start = offset
    while offset < length and data[offset] not in b" \t\r\n#":
        offset += 1
    if start == offset:
        raise DisplayWindowError("Invalid overview header")
    return data[start:offset], offset


def _read_pnm(path: Path) -> tuple[int, list[list[int]]]:
    data = path.read_bytes()
    offset = 0
    tokens = []
    for _ in range(4):
        token, offset = _pnm_token(data, offset)
        tokens.append(token)
    magic, width_raw, height_raw, maximum_raw = tokens
    if magic not in {b"P5", b"P6"}:
        raise DisplayWindowError("Unsupported overview format")
    try:
        width, height, maximum = int(width_raw), int(height_raw), int(maximum_raw)
    except ValueError as exc:
        raise DisplayWindowError("Invalid overview geometry") from exc
    channels = 3 if magic == b"P6" else 1
    if min(width, height, maximum) <= 0 or maximum > 65535:
        raise DisplayWindowError("Invalid overview geometry")

    # The binary raster starts after the single required whitespace separator.
    if offset >= len(data) or data[offset] not in b" \t\r\n":
        raise DisplayWindowError("Invalid overview raster")
    if data[offset : offset + 2] == b"\r\n":
        offset += 2
    else:
        offset += 1
    sample_count = width * height * channels
    bytes_per_sample = 1 if maximum < 256 else 2
    expected = sample_count * bytes_per_sample
    raster = data[offset : offset + expected]
    if len(raster) != expected:
        raise DisplayWindowError("Incomplete overview raster")

    samples: list[list[int]] = [[] for _ in range(channels)]
    if bytes_per_sample == 1:
        for index, value in enumerate(raster):
            samples[index % channels].append(value)
    else:
        for index, (value,) in enumerate(struct.iter_unpack(">H", raster)):
            samples[index % channels].append(value)
    return maximum, samples


def _percentile(values: list[int], fraction: float) -> int:
    ordered = sorted(values)
    return ordered[round((len(ordered) - 1) * fraction)]

def _preview_region(image_width: int, image_height: int, reduction: int) -> str | None:
    divisor = 1 << max(0, reduction)
    level_width = (image_width + divisor - 1) // divisor
    level_height = (image_height + divisor - 1) // divisor
    pixels = level_width * level_height
    if pixels <= MAX_PREVIEW_PIXELS:
        return None

    aspect = level_width / level_height
    crop_width = min(level_width, max(1, int(math.sqrt(MAX_PREVIEW_PIXELS * aspect))))
    crop_height = min(level_height, max(1, MAX_PREVIEW_PIXELS // crop_width))
    crop_width = min(crop_width, max(1, MAX_PREVIEW_PIXELS // crop_height))
    width_fraction = crop_width / level_width
    height_fraction = crop_height / level_height
    left = (1.0 - width_fraction) / 2.0
    top = (1.0 - height_fraction) / 2.0
    return (
        f"{{{top:.12g},{left:.12g}}},"
        f"{{{height_fraction:.12g},{width_fraction:.12g}}}"
    )



def estimate_display_windows(
    kdu_expand: str | None,
    source: Path,
    working_directory: Path,
    reduction_levels: int,
    image_width: int,
    image_height: int,
    channel_count: int,
    nominal_windows: tuple[tuple[float, float], ...],
    threads: int,
    timeout: float = 30.0,
) -> tuple[tuple[float, float], ...]:
    """Decode only the smallest JP2 overview and estimate robust channel ranges."""
    if image_width <= 0 or image_height <= 0:
        raise DisplayWindowError("Invalid image dimensions for auto-windowing")
    if not kdu_expand:
        raise DisplayWindowError("Kakadu is required for scientific JP2 auto-windowing")
    working_directory.mkdir(parents=True, exist_ok=True)
    overview = working_directory / (".window-overview.ppm" if channel_count >= 3 else ".window-overview.pgm")
    deadline = time.monotonic() + timeout
    first_reduction = max(0, reduction_levels)
    attempts = min(first_reduction + 1, MAX_REDUCTION_ATTEMPTS)
    samples = None
    try:
        for reduction in range(first_reduction, first_reduction - attempts, -1):
            overview.unlink(missing_ok=True)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise DisplayWindowError("Reduced-resolution auto-windowing timed out")
            command = [
                kdu_expand,
                "-i",
                str(source),
                "-o",
                str(overview),
                "-reduce",
                str(reduction),
            ]
            region = _preview_region(image_width, image_height, reduction)
            if region is not None:
                command.extend(["-region", region])
            command.extend(["-num_threads", str(max(1, threads))])
            try:
                result = subprocess.run(
                    command,
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=remaining,
                )
            except subprocess.TimeoutExpired as exc:
                raise DisplayWindowError("Reduced-resolution auto-windowing timed out") from exc
            if result.returncode != 0 or not overview.is_file():
                continue
            try:
                _, samples = _read_pnm(overview)
            except DisplayWindowError:
                continue
            break
        if samples is None:
            raise DisplayWindowError("Kakadu could not decode a reduced-resolution overview")
    except OSError as exc:
        raise DisplayWindowError("Reduced-resolution auto-windowing failed") from exc
    finally:
        overview.unlink(missing_ok=True)

    windows = list(nominal_windows)
    sampled_channels = samples[: len(windows)]
    combined = [value for channel in sampled_channels for value in channel]
    if not combined:
        return tuple(windows)
    minimum = _percentile(combined, 0.005)
    maximum = _percentile(combined, 0.98)
    if maximum <= minimum:
        minimum, maximum = min(combined), max(combined)
    if maximum > minimum:
        # Use one shared RGB window so auto-contrast does not alter color balance.
        for channel in range(len(sampled_channels)):
            windows[channel] = (float(minimum), float(maximum))
    return tuple(windows)
