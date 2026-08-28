# NeuroScope scientific image viewer

NeuroScope is an internal browser viewer for large JP2 and TIFF microscopy images with aligned SWC and spatial JSON overlays. JP2 files open through on-demand Kakadu/IIPImage tiles; they are not expanded into a local pyramid. TIFF files use the compatibility preparation queue and a libvips Deep Zoom pyramid.

## Start, stop, and connect

On the application server:

```bash
cd /home/mitralab/scientific-image-viewer
./run.sh start
./run.sh status
```

The application listens on `127.0.0.1:8088` by default. From another computer, forward that loopback port over SSH and open the forwarded address in your local browser:

```bash
ssh -N -L 8088:127.0.0.1:8088 USER@mitragpu6
```

Then visit `http://127.0.0.1:8088`. If local port 8088 is occupied, use (for example) `-L 18088:127.0.0.1:8088` and visit port 18088.

Lifecycle commands:

```bash
./run.sh                 # start in the background
./run.sh stop            # stop the server and any active TIFF conversion
./run.sh restart
./run.sh status          # process and API health
./run.sh logs            # follow .runtime/neuroscope.log
./run.sh foreground      # attached terminal mode
```

`run.sh` rejects a busy port and validates stale PID files. A background launch has an isolated process group and per-launch identity token; `stop` signals the validated group so a libvips or overlay-index child cannot remain after the API exits. A reused or unrelated process group is left untouched.

## Image and overlay workflows

- **Open server path:** this is the sole image and overlay workflow in the web interface. Paste the exact absolute path to a JP2/TIF/TIFF/JSON/SWC inside a root configured by `NEUROSCOPE_MOUNT_ROOTS`; the dialog does not list server folders. An image opens in place without uploading or copying it, and reopening an unchanged image reuses its existing registration. With a base image open, a JSON or SWC path adds that file as an overlay from the same mounted source. Large GeoJSON automatically uses the reusable spatial-index path instead of being transferred and parsed in full by the browser. TIFF preparation may still create derived viewer tiles under `NEUROSCOPE_DATA_DIR`. Traversal and symlink escapes are rejected.
- **Available images:** click **Images** in the header, use **Available images** on the empty screen, or press `L` to see recent server registrations and any retained compatibility records. The library shows status, source, dimensions, size, and added time; supports filename/ID search and one-click reopening; and makes repeated filenames visible with their short record IDs. Removing a mounted registration never deletes the original mounted file. The built-in demo, currently open image, and active processing jobs are guarded from deletion.
- **Very large JSON overlays:** GeoJSON LineString/MultiLineString data at least 32 MiB, or smaller linework that exceeds the normal browser geometry budget, is streamed into a persistent spatial index. Broad views request an adaptive sample of at most 80,000 visible segments; zoomed views return full detail when the visible geometry fits that budget. Small Point/Polygon JSON uses the mounted-file fetch path.
- **Explore demo:** create the synthetic, non-sensitive image with aligned SWC and cell-detection overlays.

For scientific JP2 data above 8 bits, registration decodes a small reduced-resolution overview with Kakadu and estimates a robust 0.5th–98th percentile display window. RGB channels share one window to preserve color balance. The original samples are unchanged; the window is applied only when IIPImage produces display tiles.

The viewer supports progressive visible-tile rendering, pan/zoom, fit and 1:1 views, a minimap, scale bar, cursor coordinates, and multiple editable overlays. Coordinates use floating-point image pixels with a top-left origin. For both small and indexed JSON, an all-nonpositive Y range is detected only when X and negated Y bounds fit completely inside the base image; the viewer then applies `imageY = -sourceY`, announces the detected transform, and leaves the source coordinates unchanged. It does not infer scale, swapped axes, a CRS, or positive bottom-left coordinates. Editing either offset or **Flip Y axis** clears the detected-alignment mode and keeps the user's transform. **Flip Y axis** by itself maps positive bottom-left data with `imageY = imageHeight - sourceY`.

## Architecture and prerequisites

The JP2 path is `browser -> FastAPI -> loopback Nginx -> IIPImage/Kakadu -> requested tile`. FastAPI validates the stored source and tile bounds; Nginx caches successful tiles. The TIFF path is `browser -> FastAPI -> single preparation worker -> libvips Deep Zoom files -> browser`.

Python dependencies are listed in `requirements.txt`; TIFF preparation also requires `vips` and `vipsheader`. JP2 viewing requires the host's IIPImage/Kakadu service and `kdu_expand` for 16-bit auto-windowing. Install and verify the protected loopback Nginx location using [deploy/nginx/README.md](deploy/nginx/README.md). The browser never contacts IIPImage directly.

## Configuration

Environment variables are read when NeuroScope starts:

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEUROSCOPE_HOST` | `127.0.0.1` | FastAPI bind address |
| `NEUROSCOPE_PORT` | `8088` | FastAPI port |
| `NEUROSCOPE_DATA_DIR` | `./data` | Registration metadata, derived TIFF tiles, overlay indexes, and compatibility-API sources |
| `NEUROSCOPE_MOUNT_ROOTS` | `nfs:/nfs/data` | Comma-separated `id:/absolute/path` roots allowed by the server-path dialog |
| `NEUROSCOPE_MAX_UPLOAD_BYTES` | 20 GiB | Maximum image body accepted by the retained raw compatibility API |
| `NEUROSCOPE_MAX_OVERLAY_BYTES` | 256 MiB | Maximum mounted SWC/JSON response |
| `NEUROSCOPE_MAX_INDEXED_OVERLAY_BYTES` | 2 GiB | Maximum mounted or compatibility-API GeoJSON accepted by the spatial indexer |
| `NEUROSCOPE_MAX_UPLOADED_OVERLAY_AGE_SECONDS` | 86,400 | Startup retention limit for orphaned compatibility-API overlay records |
| `NEUROSCOPE_OVERLAY_INDEX_TIMEOUT_SECONDS` | 300 | Hard time limit for one large-overlay index build |
| `NEUROSCOPE_PROCESSORS` | `1` | Concurrent TIFF preparation workers |
| `NEUROSCOPE_IIP_URL` | `http://127.0.0.1/neuroscope-iip` | Protected loopback IIPImage endpoint |
| `NEUROSCOPE_IIP_TIMEOUT` | `15` | IIP request timeout in seconds |
| `NEUROSCOPE_IIP_RETRIES` | `1` | IIP retry count |
| `NEUROSCOPE_KDU_EXPAND` | `kdu_expand` from `PATH` | Kakadu decoder executable |
| `NEUROSCOPE_KAKADU_THREADS` | `8` | Threads for reduced-overview decoding |
| `NEUROSCOPE_RUNTIME_DIR` | `./.runtime` | PID, process-group, and log files |
| `NEUROSCOPE_PYTHON` | `python3` | Python executable used by `run.sh` |

Example with two server locations:

```bash
NEUROSCOPE_MOUNT_ROOTS='nfs:/nfs/data,scratch:/mnt/lab-scratch' ./run.sh start
```

## Storage and retention

The web interface registers server files in place and never copies their sources. Mounted TIFFs can have derived tiles, and large mounted GeoJSON can have a reusable `.nsovl` spatial index under `data/_overlays`; both live under `data/` (or `NEUROSCOPE_DATA_DIR`). Historical records or records created through the retained raw compatibility API can also contain a copied JP2/TIFF source under `data/<image-id>/`.

`DELETE /api/images/<image-id>` removes a stored compatibility record or mounted registration and its derived files; it never deletes an original mounted file. The raw image and overlay endpoints remain available for API compatibility but are not exposed by the web UI. Startup retention still removes abandoned compatibility overlay records older than 24 hours by default. Mounted overlay indexes are shared caches and remain reusable. The shared built-in demo cannot be deleted through the API.

## Security boundary and logging

NeuroScope currently has no user authentication. Keep `NEUROSCOPE_HOST=127.0.0.1`, use SSH forwarding, and **never bind the app or `/neuroscope-iip` to an external interface**. Until authentication is added, every account able to connect locally is effectively trusted, including local processes that can reach the IIP route. Configure only trusted, preferably read-only mounted roots; safe path resolution is not a substitute for isolating files from hostile writers who can replace them during a request.

Absolute source paths are private metadata and are removed from API responses. IIP client errors do not include request URLs. The protected Nginx location disables access logging because its `FIF` query contains an absolute path. Mounted small-overlay fetches currently place a relative mount path in the application query string, so keep application logs private and rotated when project names are sensitive. Do not enable query-string logging for `/neuroscope-iip`.

## Verification

```bash
python3 -m unittest discover -s tests -v
node --check static/app.js
node --check overlay_index_fast.js
node tests/browser-smoke.js
tests/test_run_lifecycle.sh
./run.sh status
curl -fsS http://127.0.0.1:8088/api/health
```

The backend tests also cover the bounded image library, direct-path mount containment and reuse, retained compatibility endpoints, IIP/Kakadu reduced-level tile geometry, large-overlay format parity, corruption/staleness rejection, bounded sparse-grid queries, Float32 coordinate edges, registration admission, cleanup, and cache migration. The browser smoke test covers path-dialog controls, focus, close/race recovery and shortcuts, safe local-file drop handling, available-image search/open/removal, direct mounted image/overlay opening, small/indexed negative-Y alignment parity and manual overrides, adaptive indexed geometry, retries, stale-operation protection, and SWC/JSON parsing. The lifecycle test verifies safe orphan cleanup without signaling a recycled process group. Nginx syntax, loopback access, and the required non-loopback HTTP 403 check are documented in [deploy/nginx/README.md](deploy/nginx/README.md).
