# NeuroScope loopback IIPImage route

The NeuroScope backend calls exactly:

```text
http://127.0.0.1/neuroscope-iip
```

The browser never calls this endpoint. The location accepts only loopback GET
and HEAD requests, forwards them to the existing `local_iipsrv` FastCGI pool,
and reuses the existing `iip_local` cache. It deliberately passes the original
query string unchanged because IIP command order and repeated `MINMAX`
parameters are significant.

The snippet must be included inside the existing port-80 `server` block in
`/etc/nginx/sites-enabled/iipsrv`. The site's `local_iipsrv` upstream and
`iip_local` cache zone must remain at `http` scope. Do not add `internal` to the
location: NeuroScope reaches it as a separate HTTP request over loopback.

## Offline syntax validation

This checks the tracked snippet through an isolated configuration. It neither
reads nor changes the live Nginx configuration and does not start or reload a
server:

```bash
cd /home/mitralab/scientific-image-viewer
mkdir -p /tmp/neuroscope-nginx-validation-cache
nginx -p "$PWD/deploy/nginx/" -c syntax-test.conf -t
rmdir /tmp/neuroscope-nginx-validation-cache
```

## Apply

These are deployment instructions only; repository setup does not run them.
First install the reviewed snippet and make a fixed rollback copy outside
`sites-enabled` (where an extra copy could itself be loaded by Nginx):

```bash
cd /home/mitralab/scientific-image-viewer
sudo install -D -o root -g root -m 0644 \
  deploy/nginx/neuroscope-iip.location.conf \
  /etc/nginx/snippets/neuroscope-iip.location.conf
sudo install -d -o root -g root -m 0750 /var/backups/neuroscope
sudo test ! -e /var/backups/neuroscope/iipsrv.pre-neuroscope
sudo cp --archive \
  /etc/nginx/sites-enabled/iipsrv \
  /var/backups/neuroscope/iipsrv.pre-neuroscope
```

Review the exact one-line site change, test it as a dry run, and apply it:

```bash
sed -n '1,120p' deploy/nginx/iipsrv.include.patch
sudo patch --dry-run -p0 -d / < deploy/nginx/iipsrv.include.patch
sudo patch -p0 -d / < deploy/nginx/iipsrv.include.patch
```

Validate the complete live configuration before any reload:

```bash
sudo nginx -t
```

Only after that command succeeds:

```bash
sudo systemctl reload nginx
```

Confirm loopback access with a known allowlisted source. `--data-urlencode`
preserves special characters in mounted paths:

```bash
curl --fail-with-body --get \
  --data-urlencode 'FIF=/nfs/data/main/path/to/image.jp2' \
  --data-urlencode 'OBJ=Max-size' \
  --data-urlencode 'OBJ=Tile-size' \
  --data-urlencode 'OBJ=Resolution-number' \
  http://127.0.0.1/neuroscope-iip
```

From another machine, the same path through the server's non-loopback address
must return HTTP 403. The Nginx access rules use the socket peer address, not a
caller-controlled forwarding header.

## Roll back

Restore the exact pre-deployment site, validate, and then reload:

```bash
sudo cp --archive \
  /var/backups/neuroscope/iipsrv.pre-neuroscope \
  /etc/nginx/sites-enabled/iipsrv
sudo nginx -t
sudo systemctl reload nginx
sudo rm /etc/nginx/snippets/neuroscope-iip.location.conf
```

Once rollback has been verified, the backup may be retained for audit or
removed in a separate maintenance step.

## Operational notes

- `NEUROSCOPE_IIP_URL` should remain
  `http://127.0.0.1/neuroscope-iip`; there is no trailing slash.
- The application, not Nginx, validates and allowlists every `FIF` path. The
  loopback route trusts local processes, so it must not be exposed by a proxy.
- A request gets at most two upstream attempts and a 25-second aggregate
  failover window. A stalled NFS read may leave an IIP worker busy after Nginx
  times out, but it cannot hold the application request indefinitely.
- Cache identity includes the unmodified query string. Mounted-file records
  must continue to use immutable, version-specific IIP source paths so that a
  replaced source cannot reuse stale tiles.
- The backend needs the upstream response body and `Content-Type`; Nginx also
  supplies stable cache headers and `X-Cache-Status` for diagnostics.
