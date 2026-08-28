"""Small, path-private client for the loopback IIPImage service."""

from __future__ import annotations

import ipaddress
import math
import re
import socket
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit, urlunsplit
from urllib.request import ProxyHandler, Request, build_opener


class IIPError(RuntimeError):
    """An IIPImage request failed or returned an invalid response."""


@dataclass(frozen=True)
class IIPMetadata:
    width: int
    height: int
    tile_width: int
    tile_height: int
    resolutions: int
    bits_per_channel: int
    display_windows: tuple[tuple[float, float], ...]

    @property
    def max_level(self) -> int:
        return self.resolutions - 1


def _format_number(value: float) -> str:
    if value.is_integer():
        return str(int(value))
    return format(value, ".9g")


def _encode_query(pairs: list[tuple[str, str]]) -> str:
    """Encode paths normally while preserving IIP command delimiters."""
    command_safe = {"OBJ": ",", "MINMAX": ":,", "JTL": ","}
    return "&".join(
        f"{quote(key, safe='')}={quote(value, safe=command_safe.get(key, ''))}"
        for key, value in pairs
    )


class IIPClient:
    """Issue ordered IIP requests to a service reachable only on loopback."""

    METADATA_LIMIT = 64 * 1024
    TILE_LIMIT = 32 * 1024 * 1024

    def __init__(self, base_url: str, timeout: float = 15.0, retries: int = 1):
        parsed = urlsplit(base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("NEUROSCOPE_IIP_URL must be an HTTP loopback URL")
        try:
            is_loopback = ipaddress.ip_address(parsed.hostname).is_loopback
        except ValueError:
            is_loopback = parsed.hostname.lower() == "localhost"
        if not is_loopback or parsed.username or parsed.password or parsed.fragment:
            raise ValueError("NEUROSCOPE_IIP_URL must point to loopback without credentials")
        if timeout <= 0 or retries < 0:
            raise ValueError("Invalid IIP timeout or retry count")

        # Discard a configured query so callers fully control command ordering.
        self.base_url = urlunsplit((parsed.scheme, parsed.netloc, parsed.path or "/", "", ""))
        self.timeout = timeout
        self.retries = retries
        # Never send private FIF paths through an environment-configured proxy.
        self._opener = build_opener(ProxyHandler({}))

    def _get(
        self,
        pairs: list[tuple[str, str]],
        limit: int,
        *,
        timeout: float | None = None,
        retries: int | None = None,
    ) -> tuple[bytes, str]:
        url = f"{self.base_url}?{_encode_query(pairs)}"
        request_timeout = self.timeout if timeout is None else timeout
        request_retries = self.retries if retries is None else retries
        for attempt in range(request_retries + 1):
            try:
                request = Request(url, headers={"Accept": "*/*", "User-Agent": "NeuroScope/1.0"})
                with self._opener.open(request, timeout=request_timeout) as response:
                    body = response.read(limit + 1)
                    if len(body) > limit:
                        raise IIPError("IIPImage response exceeded the safety limit")
                    return body, response.headers.get_content_type()
            except IIPError:
                raise
            except (HTTPError, URLError, TimeoutError, socket.timeout, OSError):
                if attempt >= request_retries:
                    break
                time.sleep(0.05 * (attempt + 1))
        # Do not include the URL: its FIF query contains a private filesystem path.
        raise IIPError("The image tile service is unavailable")

    def probe(self, timeout: float = 1.0) -> bool:
        """Check the loopback gateway without placing a private FIF in the URL."""
        if timeout <= 0:
            raise ValueError("Probe timeout must be positive")
        body, _ = self._get([], 16 * 1024, timeout=timeout, retries=0)
        return bool(body)

    def metadata(self, source: Path) -> IIPMetadata:
        pairs = [
            ("FIF", str(source)),
            ("OBJ", "Max-size"),
            ("OBJ", "Tile-size"),
            ("OBJ", "Resolution-number"),
            ("OBJ", "Bits-per-channel"),
            ("OBJ", "Min-Max-sample-values"),
        ]
        body, _ = self._get(pairs, self.METADATA_LIMIT)
        try:
            text = body.decode("utf-8", errors="strict")
        except UnicodeDecodeError as exc:
            raise IIPError("IIPImage returned invalid metadata") from exc

        def numbers(label: str) -> list[float]:
            match = re.search(rf"(?im)^\s*{re.escape(label)}\s*:\s*([^\r\n]+)", text)
            if not match:
                raise IIPError(f"IIPImage metadata omitted {label}")
            try:
                return [float(value) for value in match.group(1).split()]
            except ValueError as exc:
                raise IIPError(f"IIPImage returned invalid {label} metadata") from exc

        max_size = numbers("Max-size")
        tile_size = numbers("Tile-size")
        resolution_values = numbers("Resolution-number")
        bits_values = numbers("Bits-per-channel")
        sample_values = numbers("Min-Max-sample-values")
        if len(max_size) != 2 or len(tile_size) != 2 or len(resolution_values) != 1:
            raise IIPError("IIPImage returned incomplete geometry metadata")

        width, height = (int(value) for value in max_size)
        tile_width, tile_height = (int(value) for value in tile_size)
        resolutions = int(resolution_values[0])
        bits = int(bits_values[0]) if len(bits_values) == 1 else 8
        if min(width, height, tile_width, tile_height, resolutions, bits) <= 0:
            raise IIPError("IIPImage returned invalid geometry metadata")
        if len(sample_values) < 2 or len(sample_values) % 2:
            sample_values = [0.0, float((1 << min(bits, 30)) - 1)]

        windows = []
        for index in range(0, len(sample_values), 2):
            minimum, maximum = sample_values[index : index + 2]
            if not math.isfinite(minimum) or not math.isfinite(maximum) or maximum <= minimum:
                minimum, maximum = 0.0, float((1 << min(bits, 30)) - 1)
            windows.append((minimum, maximum))
        return IIPMetadata(
            width=width,
            height=height,
            tile_width=tile_width,
            tile_height=tile_height,
            resolutions=resolutions,
            bits_per_channel=bits,
            display_windows=tuple(windows),
        )

    def tile(
        self,
        source: Path,
        level: int,
        tile_index: int,
        display_windows: list[dict] | tuple[tuple[float, float], ...],
    ) -> tuple[bytes, str]:
        pairs: list[tuple[str, str]] = [("FIF", str(source)), ("GAM", "1")]
        for index, window in enumerate(display_windows):
            if isinstance(window, dict):
                channel = int(window.get("channel", index))
                minimum = float(window["min"])
                maximum = float(window["max"])
            else:
                channel = index
                minimum, maximum = map(float, window)
            if channel != index or not math.isfinite(minimum) or not math.isfinite(maximum) or maximum <= minimum:
                raise IIPError("Invalid stored display window")
            value = f"{channel}:{_format_number(minimum)},{_format_number(maximum)}"
            pairs.append(("MINMAX", value))
        pairs.append(("JTL", f"{level},{tile_index}"))

        body, content_type = self._get(pairs, self.TILE_LIMIT)
        if not body or not content_type.startswith("image/"):
            raise IIPError("IIPImage did not return an image tile")
        return body, content_type
