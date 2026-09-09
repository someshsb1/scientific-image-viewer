/* Browser-module smoke and parser tests using the locally installed jsdom. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "static", "index.html"), "utf8");
const source = fs.readFileSync(path.join(root, "static", "app.js"), "utf8");
const dom = new JSDOM(html, {
  url: "http://127.0.0.1:8088/",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const { window } = dom;

if (!window.String.prototype.replaceAll) {
  window.String.prototype.replaceAll = function replaceAll(search, replacement) {
    return this.split(search).join(replacement);
  };
}

const drawingContext = new Proxy({}, {
  get(target, property) {
    if (!(property in target)) target[property] = () => undefined;
    return target[property];
  },
  set(target, property, value) {
    target[property] = value;
    return true;
  },
});
window.HTMLCanvasElement.prototype.getContext = () => drawingContext;
window.ResizeObserver = class { observe() {} disconnect() {} };
window.requestAnimationFrame = () => 1;
window.cancelAnimationFrame = () => {};
let generatedUuid = 0;
Object.defineProperty(window, "crypto", {
  configurable: true,
  value: {
    randomUUID: () => `00000000-0000-4000-8000-${String(++generatedUuid).padStart(12, "0")}`,
  },
});
window.fetch = async () => { throw new Error("Unexpected network call in smoke test"); };
window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
window.HTMLDialogElement.prototype.close = function close() {
  this.open = false;
  this.dispatchEvent(new window.Event("close"));
};

window.eval(`${source}\nwindow.__testApi = {
  parseSwc,
  parseJsonOverlay,
  niceScaleDistance,
  processingPresentation,
  beginImageOperation,
  imageOperationIsCurrent,
  normalizeImageLibrary,
  imageLibraryCanOpen,
  imageLibraryDeleteReason,
  loadImageLibrary,
  openImageLibraryRecord,
  deleteImageLibraryRecord,
  levelDimensions,
  tileDimensions,
  tileRetryDelay,
  requestTile,
  shouldUseIndexedJson,
  inverseOverlayBounds,
  normalizeIndexedSegments,
  acceptIndexedGeometry,
  suggestedJsonAlignment,
  addJsonLayer,
  outsideRatio,
  validateServerPath,
  normalizeResolvedOverlayPath,
  openServerPath,
  openResolvedServerOverlay,
  indexedOverlayFailureMessage,
  queueIndexedGeometry,
  viewerState: state,
  validImageId,
  setImageUrl,
  reopenImageFromUrl,
};`);
const {
  parseSwc,
  parseJsonOverlay,
  niceScaleDistance,
  processingPresentation,
  beginImageOperation,
  imageOperationIsCurrent,
  normalizeImageLibrary,
  imageLibraryCanOpen,
  imageLibraryDeleteReason,
  loadImageLibrary,
  openImageLibraryRecord,
  deleteImageLibraryRecord,
  levelDimensions,
  tileDimensions,
  tileRetryDelay,
  requestTile,
  shouldUseIndexedJson,
  inverseOverlayBounds,
  normalizeIndexedSegments,
  acceptIndexedGeometry,
  suggestedJsonAlignment,
  addJsonLayer,
  outsideRatio,
  validateServerPath,
  normalizeResolvedOverlayPath,
  openServerPath,
  openResolvedServerOverlay,
  indexedOverlayFailureMessage,
  queueIndexedGeometry,
  viewerState,
  validImageId,
  setImageUrl,
  reopenImageFromUrl,
} = window.__testApi;

const serverPathInput = window.document.querySelector("#server-path-input");
const serverPathHelp = window.document.querySelector("#server-path-help");
const serverPathSubmit = window.document.querySelector("#open-server-path");
assert(serverPathInput);
assert.equal(window.document.querySelector('label[for="server-path-input"]')?.textContent, "Absolute server file path");
assert.match(serverPathHelp.textContent, /source stays in place/i);
assert.equal(serverPathInput.getAttribute("aria-describedby"), "server-path-help server-path-status");
assert.equal(serverPathInput.hasAttribute("autofocus"), true);
assert.equal(serverPathSubmit.disabled, true);
assert.match(validateServerPath("relative/section.jp2").error, /absolute path/i);
assert.match(validateServerPath("/nfs/data/section.csv").error, /JP2, TIF, TIFF, JSON, or SWC/i);
assert.deepEqual(
  Object.fromEntries(Object.entries(validateServerPath("  /nfs/data/sections/section 1.jp2  "))),
  { path: "/nfs/data/sections/section 1.jp2", filename: "section 1.jp2", kind: "image" },
);
assert.deepEqual(
  Object.fromEntries(Object.entries(validateServerPath("/nfs/data/overlays/cells.json"))),
  { path: "/nfs/data/overlays/cells.json", filename: "cells.json", kind: "overlay" },
);
const normalizedResolvedOverlay = normalizeResolvedOverlayPath({
  mountId: "main",
  path: "overlays/cells.json",
  name: "cells.json",
  size: 128,
  format: "JSON",
  type: "file",
  kind: "overlay",
  modifiedAt: "2026-08-11T12:00:00Z",
});
assert.equal(normalizedResolvedOverlay.mountId, "main");
assert.equal(normalizedResolvedOverlay.entry.path, "overlays/cells.json");
assert.throws(() => normalizeResolvedOverlayPath({
  mountId: "main",
  path: "/nfs/data/overlays/cells.json",
  name: "cells.json",
  size: 128,
  type: "file",
  kind: "overlay",
}), /invalid mounted overlay path/i);
assert.throws(() => normalizeResolvedOverlayPath({
  mountId: "main",
  path: "overlays/cells.json",
  name: "cells.json",
  size: null,
  type: "file",
  kind: "overlay",
}), /invalid mounted overlay path/i);

const demoSwc = fs.readFileSync(path.join(root, "static", "demo.swc"), "utf8");
const skeleton = parseSwc(demoSwc);
assert.equal(skeleton.nodes.length, 28);
assert.equal(skeleton.roots, 1);
assert.equal(skeleton.missingParents, 0);

const offsetSkeleton = parseSwc("# OFFSET 10 -5 2\n1 1 3 7 0 1 -1\n2 3 5 8 1 1 1");
assert.deepEqual(
  [offsetSkeleton.nodes[0].x, offsetSkeleton.nodes[0].y, offsetSkeleton.nodes[0].z],
  [13, 2, 2],
);

const demoJson = fs.readFileSync(path.join(root, "static", "demo-points.json"), "utf8");
const detections = parseJsonOverlay(demoJson);
assert.equal(detections.points.length, 14);
assert.equal(detections.featureCount, 14);

const geoJson = parseJsonOverlay(JSON.stringify({
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { id: 385 }, geometry: { type: "Point", coordinates: [12, 30] } },
    { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] } },
  ],
}));
assert.equal(geoJson.points.length, 1);
assert.equal(geoJson.polygons.length, 1);
assert.equal(geoJson.featureCount, 2);

const twoLineFeatures = JSON.stringify({
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] } },
    { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[2, 2], [3, 3]] } },
  ],
});
assert.throws(
  () => parseJsonOverlay(twoLineFeatures, 1),
  (error) => error.code === "JSON_FEATURE_LIMIT" && /1 feature safety limit/.test(error.message),
);
const singleHugeLine = JSON.stringify({
  type: "LineString",
  coordinates: [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]],
});
assert.throws(
  () => parseJsonOverlay(singleHugeLine, 10, 4),
  (error) => error.code === "JSON_FEATURE_LIMIT" && /4 stored line\/polygon vertex safety limit/.test(error.message),
);
const strictCoordinates = parseJsonOverlay(JSON.stringify({
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [null, 4] } },
    { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [false, 4] } },
    { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: ["", 4] } },
    { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: ["   ", 4] } },
    { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: ["2.5", "-3.5"] } },
  ],
}));
assert.deepEqual(
  Array.from(strictCoordinates.points, (point) => [point.x, point.y]),
  [[2.5, -3.5]],
);
const incrementalBounds = parseJsonOverlay(JSON.stringify({
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [-5, 8] } },
    { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[10, -3], [2, 12]] } },
    { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[0, 1], [4, 1], [4, 6], [0, 1]]] } },
  ],
}));
assert.deepEqual(
  Array.from(Object.values(incrementalBounds.bounds)),
  [-5, -3, 10, 12],
);

assert.throws(() => parseSwc("1 2 three 4 5 6 -1"), /Invalid numeric value/);
assert.throws(
  () => parseJsonOverlay('{"metadata": true}', 1),
  (error) => error.code !== "JSON_FEATURE_LIMIT" && /No supported/.test(error.message),
);
assert.match(indexedOverlayFailureMessage(new Error("Index rejected.")), /only GeoJSON LineString\/MultiLineString/);
assert.match(indexedOverlayFailureMessage(new Error("Index rejected.")), /Point and Polygon overlays remain supported/);
assert.equal(niceScaleDistance(430), 500);

const registering = processingPresentation({ status: "registering", message: "Opening in place" });
assert.equal(registering.title, "Registering image");
assert.equal(registering.message, "Opening in place");
assert.equal(registering.step, 1);

const queued = processingPresentation({ status: "queued", queuePosition: 2, queueDepth: 4 });
assert.equal(queued.title, "Queued · position 2");
assert.match(queued.message, /Queue position 2 of 4/);
assert.match(queued.message, /source is registered/i);
assert.doesNotMatch(queued.message, /upload/i);
assert.equal(queued.progressLabel, "Queue #2");

const building = processingPresentation({ status: "processing", message: "Building deep-zoom pyramid", progress: 28 });
assert.equal(building.title, "Preparing TIFF for deep zoom");
assert.equal(building.progressLabel, "Processing");
assert.equal(building.indeterminate, true);
assert.equal(building.step, 1);

const ready = processingPresentation({ status: "ready", progress: 100 });
assert.equal(ready.title, "Image ready");
assert.equal(ready.step, 2);

const overlayIndexing = processingPresentation({ status: "overlay-indexing" });
assert.equal(overlayIndexing.title, "Indexing overlay geometry");
assert.equal(overlayIndexing.indeterminate, true);

assert.equal(shouldUseIndexedJson("cells.json", 32 * 1024 * 1024 - 1), false);
assert.equal(shouldUseIndexedJson("cells.json", 32 * 1024 * 1024), true);
assert.equal(shouldUseIndexedJson("cells.swc", 64 * 1024 * 1024), false);
assert.deepEqual(
  Array.from(Object.values(inverseOverlayBounds(
    { offsetX: 10, offsetY: 20, flipY: true },
    { minX: 100, minY: 100, maxX: 200, maxY: 200 },
    512,
  ))),
  [90, 332, 190, 432],
);
assert.deepEqual(
  Array.from(Object.values(inverseOverlayBounds(
    { offsetX: 0, offsetY: -512, flipY: true },
    { minX: 0, minY: 0, maxX: 1024, maxY: 512 },
    512,
  ))),
  [0, -512, 1024, 0],
);
assert.deepEqual(
  Array.from(Object.values(suggestedJsonAlignment(
    { minX: 0, minY: -400, maxX: 800, maxY: 0 },
    { width: 1000, height: 500 },
  ))),
  ["negative-y", true, -500],
);
const latestJsonAlignment = suggestedJsonAlignment(
  { minX: 7113, minY: -33910, maxX: 34188, maxY: -9396 },
  { width: 60601, height: 48385 },
);
assert.deepEqual(
  [latestJsonAlignment.mode, latestJsonAlignment.flipY, latestJsonAlignment.offsetY],
  ["negative-y", true, -48385],
);
for (const unresolvedBounds of [
  { minX: 0, minY: 0, maxX: 800, maxY: 400 },
  { minX: 0, minY: -400, maxX: 800, maxY: 1 },
  { minX: 1001, minY: -400, maxX: 1100, maxY: -1 },
  { minX: -0.001, minY: -400, maxX: 800, maxY: -1 },
  { minX: 0, minY: -501, maxX: 800, maxY: -1 },
]) {
  assert.deepEqual(
    Array.from(Object.values(suggestedJsonAlignment(
      unresolvedBounds,
      { width: 1000, height: 500 },
    ))),
    [null, false, 0],
  );
}
assert.deepEqual(
  Array.from(Object.values(suggestedJsonAlignment(
    { minX: 0, minY: 0, maxX: 800, maxY: 400 },
    null,
  ))),
  [null, false, 0],
);
assert.deepEqual(
  Array.from(normalizeIndexedSegments([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 2)),
  [0, 1, 2, 3, 4, 5, 6, 7],
);
const staleLayer = {
  geometryRequestToken: 2,
  geometryRequestKey: "new-view",
  geometrySegments: new Float32Array([99, 99, 99, 99]),
};
assert.equal(acceptIndexedGeometry(
  staleLayer,
  { segments: [0, 0, 1, 1], segmentCount: 1, approximate: false },
  1,
  "old-view",
), false);
assert.deepEqual(Array.from(staleLayer.geometrySegments), [99, 99, 99, 99]);
assert.equal(acceptIndexedGeometry(
  staleLayer,
  { segments: [0, 0, 1, 1], segmentCount: 1, approximate: false },
  2,
  "new-view",
), true);
assert.deepEqual(Array.from(staleLayer.geometrySegments), [0, 0, 1, 1]);

const normalizedLibrary = normalizeImageLibrary({ images: [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    filename: "older.jp2",
    sourceKind: "upload",
    status: "ready",
    width: 100,
    height: 50,
    fileSize: 2048,
    createdAt: "2026-08-10T10:00:00Z",
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    filename: "newer.jp2",
    sourceKind: "mounted",
    status: "processing",
    fileSize: null,
    createdAt: "not-a-date",
    updatedAt: "2026-08-11T10:00:00Z",
  },
  { id: "../../metadata.json", filename: "unsafe.jp2", status: "ready" },
] });
assert.deepEqual(Array.from(normalizedLibrary, (image) => image.filename), ["newer.jp2", "older.jp2"]);
assert.equal(normalizedLibrary[0].sourceKind, "mounted");
assert.equal(normalizedLibrary[0].width, null);
assert.equal(normalizedLibrary[0].fileSize, null);
assert.equal(normalizedLibrary[0].createdAt, null);
assert.equal(normalizedLibrary[0].updatedAt, "2026-08-11T10:00:00Z");
assert.equal(imageLibraryCanOpen(normalizedLibrary[0]), true);
assert.equal(imageLibraryDeleteReason({ id: "demo-neural-section-v1", demo: true, status: "ready" }), "The built-in demo is shared and cannot be removed.");
const iipOddLevel = levelDimensions(3, {
  width: 57369,
  height: 46849,
  maxLevel: 8,
  tileBackend: "iip",
});
assert.equal(iipOddLevel.width, 1792);
assert.equal(iipOddLevel.height, 1464);
assert.equal(Math.ceil(iipOddLevel.width / 256), 7);
const tiffOddLevel = levelDimensions(3, {
  width: 57369,
  height: 46849,
  maxLevel: 8,
  tileBackend: "vips",
});
assert.equal(tiffOddLevel.width, 1793);
assert.equal(tiffOddLevel.height, 1465);
assert.equal(Math.ceil(tiffOddLevel.width / 256), 8);
assert.equal(levelDimensions(0, { width: 1, height: 1, maxLevel: 8, tileBackend: "iip" }).width, 1);
assert.equal(levelDimensions(3, { width: 57369, height: 46849, maxLevel: 8 }).width, 1793);
assert.deepEqual(Array.from(Object.values(tileDimensions({ tileSize: 256, tileWidth: 512, tileHeight: 128 }))), [512, 128]);
assert.deepEqual(Array.from(Object.values(tileDimensions({ tileSize: 384 }))), [384, 384]);
assert.deepEqual([1, 2, 3, 4, 5].map(tileRetryDelay), [250, 500, 1000, 2000, 2000]);
assert(!source.includes("new FormData"));
assert(!source.includes("XMLHttpRequest"));
assert(!source.includes("/api/images/raw"));
assert(!source.includes("/api/overlays/raw"));
assert(!source.includes('key === "o"'));
assert(!source.includes('key === "a"'));
assert(!source.includes("coordinatePoints"));
assert(window.document.querySelector("#server-path-dialog"));
assert.equal(window.document.querySelector("#server-path-dialog").getAttribute("aria-labelledby"), "server-path-title");
for (const removedId of [
  "image-input",
  "overlay-input",
  "upload-button",
  "empty-upload",
  "add-overlay-button",
  "sidebar-add",
  "library-upload",
  "drop-state",
]) {
  assert.equal(window.document.getElementById(removedId), null, `${removedId} must not be present`);
}
assert.equal(window.document.querySelector('input[type="file"]'), null);
assert.doesNotMatch(window.document.querySelector("#shortcuts-dialog").textContent, /upload from computer|add overlay/i);
assert.equal(window.document.querySelector("#image-library-list").getAttribute("role"), "list");
assert.equal(window.document.querySelector("#image-library-list").hasAttribute("aria-live"), false);

const imageId = "00000000-0000-4000-8000-000000000000";
assert.equal(validImageId(imageId), imageId);
assert.equal(validImageId("../../metadata.json"), null);
assert.equal(validImageId("demo-neural-section-v1"), null);
setImageUrl(imageId);
assert.equal(new URLSearchParams(window.location.search).get("image"), imageId);
setImageUrl(null);
assert.equal(window.location.search, "");

(async () => {
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const fetchBeforeNoBaseGuard = window.fetch;
  let noBaseResolveRequests = 0;
  window.fetch = async () => {
    noBaseResolveRequests += 1;
    throw new Error("No request expected without a base image");
  };
  serverPathInput.value = "/nfs/data/overlays/cells.json";
  serverPathInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(window.document.querySelector("#server-path-submit-label").textContent, "Add overlay");
  assert.match(serverPathHelp.textContent, /open a base image first/i);
  assert.equal(await openServerPath(), false);
  assert.equal(noBaseResolveRequests, 0);
  assert.equal(serverPathInput.value, "/nfs/data/overlays/cells.json");
  assert.equal(serverPathInput.getAttribute("aria-invalid"), "true");
  assert.match(window.document.querySelector("#server-path-status").textContent, /open a base image/i);
  serverPathInput.value = "";
  serverPathInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  window.fetch = fetchBeforeNoBaseGuard;

  const activeToken = beginImageOperation();
  assert.equal(imageOperationIsCurrent(activeToken), true);

  const mountedRequests = [];
  const readyMetadata = {
    id: imageId,
    filename: "mounted-section.jp2",
    format: "JP2",
    fileSize: 4096,
    status: "ready",
    progress: 100,
    width: 1024,
    height: 512,
    bands: 3,
    pixelFormat: "ushort",
    pages: 8,
    tileSize: 256,
    tileWidth: 512,
    tileHeight: 128,
    tileFormat: "jpg",
    maxLevel: 10,
  };
  const mountedOverlayId = "22222222-2222-4222-8222-222222222222";
  const mountedOverlayMetadata = {
    id: mountedOverlayId,
    kind: "indexed-geojson",
    filename: "large-boundaries.json",
    sourceKind: "mounted",
    status: "ready",
    fileSize: 40 * 1024 * 1024,
    featureCount: 750000,
    primitiveCount: 700000,
    vertexCount: 1400000,
    segmentCount: 700000,
    bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 500 },
  };
  const fallbackMountedOverlayMetadata = {
    ...mountedOverlayMetadata,
    id: "55555555-5555-4555-8555-555555555555",
    filename: "fallback-lines.json",
    fileSize: 1024,
    featureCount: 2,
    primitiveCount: 2,
    vertexCount: 4,
    segmentCount: 2,
    bounds: { minX: 0, minY: 0, maxX: 3, maxY: 3 },
  };
  const directPathMetadata = {
    ...readyMetadata,
    id: "77777777-7777-4777-8777-777777777777",
    filename: "direct-section.jp2",
    sourceKind: "mounted",
    width: 60601,
    height: 48385,
  };
  const directLargeOverlayMetadata = {
    ...mountedOverlayMetadata,
    id: "88888888-8888-4888-8888-888888888888",
    filename: "direct-large.json",
    featureCount: 800000,
    primitiveCount: 600000,
    vertexCount: 1200000,
    segmentCount: 600000,
    bounds: { minX: 7113, minY: -33910, maxX: 34188, maxY: -9396 },
  };
  let resolveDirectOverlayDescriptor = null;
  const mountedFetch = async (url, options = {}) => {
    const request = { url: String(url), options };
    mountedRequests.push(request);
    if (request.url === "/api/mounts/register-path") {
      const requestedPath = JSON.parse(options.body).path;
      if (requestedPath === "/outside/missing.jp2") {
        return { ok: false, json: async () => ({ detail: "The path is outside configured server locations." }) };
      }
      return { ok: true, json: async () => directPathMetadata };
    }
    if (request.url === "/api/mounts/resolve-overlay-path") {
      const requestedPath = JSON.parse(options.body).path;
      if (requestedPath === "/outside/missing.json") {
        return { ok: false, json: async () => ({ detail: "The overlay path is outside configured server locations." }) };
      }
      const descriptor = {
        mountId: "main",
        path: "",
        name: "",
        size: 128,
        format: "JSON",
        type: "file",
        kind: "overlay",
        modifiedAt: "2026-08-11T12:00:00Z",
      };
      if (requestedPath.endsWith("/direct-cells.json")) {
        return { ok: true, json: async () => ({ ...descriptor, path: "overlays/direct-cells.json", name: "direct-cells.json" }) };
      }
      if (requestedPath.endsWith("/direct-neuron.swc")) {
        return { ok: true, json: async () => ({ ...descriptor, path: "overlays/direct-neuron.swc", name: "direct-neuron.swc", format: "SWC" }) };
      }
      if (requestedPath.endsWith("/direct-large.json")) {
        return { ok: true, json: async () => ({
          ...descriptor,
          path: "overlays/direct-large.json",
          name: "direct-large.json",
          size: 40 * 1024 * 1024,
        }) };
      }
      if (requestedPath.endsWith("/large-boundaries.json")) {
        return { ok: true, json: async () => ({
          ...descriptor,
          path: "overlays/large-boundaries.json",
          name: "large-boundaries.json",
          size: 40 * 1024 * 1024,
        }) };
      }
      if (requestedPath.endsWith("/fallback-lines.json")) {
        return { ok: true, json: async () => ({
          ...descriptor,
          path: "overlays/fallback-lines.json",
          name: "fallback-lines.json",
          size: 1024,
        }) };
      }
      if (requestedPath.endsWith("/unreadable.swc")) {
        return { ok: true, json: async () => ({ ...descriptor, path: "overlays/unreadable.swc", name: "unreadable.swc", format: "SWC" }) };
      }
      if (requestedPath.includes("/resolve-race-")) {
        return new Promise((resolve) => {
          resolveDirectOverlayDescriptor = () => resolve({
            ok: true,
            json: async () => ({ ...descriptor, path: "overlays/direct-cells.json", name: "direct-cells.json" }),
          });
        });
      }
      throw new Error(`Unexpected absolute overlay path: ${requestedPath}`);
    }
    if (request.url === "/api/mounts/main/register-overlay") {
      if (JSON.parse(options.body).path === "overlays/direct-large.json") {
        return { ok: true, json: async () => directLargeOverlayMetadata };
      }
      if (JSON.parse(options.body).path === "overlays/fallback-lines.json") {
        return { ok: true, json: async () => fallbackMountedOverlayMetadata };
      }
      return { ok: true, json: async () => mountedOverlayMetadata };
    }
    if (request.url.startsWith(`/api/overlays/${mountedOverlayId}/geometry?`)) {
      return {
        ok: true,
        json: async () => ({
          segments: [0, 0, 10, 10, 10, 10, 20, 15],
          segmentCount: 2,
          matchingFeatureCount: 2,
          matchingPrimitiveCount: 2,
          approximate: false,
        }),
      };
    }
    if (request.url.startsWith(`/api/overlays/${fallbackMountedOverlayMetadata.id}/geometry?`)) {
      return {
        ok: true,
        json: async () => ({
          segments: [0, 0, 1, 1, 2, 2, 3, 3],
          segmentCount: 2,
          matchingFeatureCount: 2,
          matchingPrimitiveCount: 2,
          approximate: false,
        }),
      };
    }
    if (request.url.startsWith(`/api/overlays/${directLargeOverlayMetadata.id}/geometry?`)) {
      return {
        ok: true,
        json: async () => ({
          segments: [7113, -9396, 34188, -33910],
          segmentCount: 1,
          matchingFeatureCount: 1,
          matchingPrimitiveCount: 1,
          approximate: false,
        }),
      };
    }
    if (request.url === "/api/mounts/main/file?path=overlays%2Ffallback-lines.json") {
      return { ok: true, text: async () => twoLineFeatures };
    }
    if (request.url === "/api/mounts/main/file?path=overlays%2Fdirect-cells.json") {
      return {
        ok: true,
        text: async () => JSON.stringify({
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            properties: { class: "direct" },
            geometry: { type: "LineString", coordinates: [[7113, -33910], [34188, -9396]] },
          }],
        }),
      };
    }
    if (request.url === "/api/mounts/main/file?path=overlays%2Fdirect-neuron.swc") {
      return { ok: true, text: async () => "1 1 10 20 0 1 -1\n2 3 20 30 0 1 1" };
    }
    if (request.url === "/api/mounts") {
      return { ok: true, json: async () => ({ mounts: [{ id: "main", label: "main" }] }) };
    }
    if (request.url.startsWith("/api/mounts/main/browse")) {
      return {
        ok: true,
        json: async () => ({
          mount: { id: "main", label: "main" },
          path: "",
          parent: null,
          entries: [
            { name: "M38", path: "M38", type: "directory", modifiedAt: "2026-01-01T00:00:00Z" },
            { name: "direct-section.jp2", path: "direct-section.jp2", type: "file", format: "JP2", size: 1000, modifiedAt: "2026-01-01T00:00:00Z" },
          ],
        }),
      };
    }
    if (request.url === "/api/mounts/main/file?path=overlays%2Funreadable.swc") {
      return { ok: false, json: async () => ({ detail: "The mounted overlay could not be read." }) };
    }
    throw new Error(`Unexpected mounted request: ${request.url}`);
  };
  window.fetch = mountedFetch;
  window.document.querySelector("#server-open-button").click();
  assert.equal(window.document.querySelector("#server-path-dialog").open, true);
  assert.strictEqual(window.document.activeElement, serverPathInput);
  assert.equal(mountedRequests.filter((r) => r.url === "/api/mounts/register-path").length, 0);
  const directPathInput = window.document.querySelector("#server-path-input");
  const directPathForm = window.document.querySelector("#server-path-form");
  directPathInput.value = "main/direct-section.jp2";
  directPathInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  directPathForm.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  assert.equal(directPathInput.getAttribute("aria-invalid"), "true");
  assert.match(window.document.querySelector("#server-path-status").textContent, /absolute path/i);
  assert.equal(mountedRequests.some((request) => request.url === "/api/mounts/register-path"), false);

  const directPath = "/nfs/data/main/M38/MD1022 sections/direct-section.jp2";
  directPathInput.value = directPath;
  directPathInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(directPathInput.getAttribute("aria-invalid"), "false");
  assert.equal(serverPathSubmit.disabled, false);
  directPathForm.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  await flush();
  const directPathRequest = mountedRequests.find((request) => request.url === "/api/mounts/register-path");
  assert(directPathRequest);
  assert.equal(directPathRequest.options.method, "POST");
  assert.deepEqual(JSON.parse(directPathRequest.options.body), { path: directPath });
  assert.equal(mountedRequests.some((request) => request.url.startsWith("/api/images/raw")), false);
  assert.equal(window.document.querySelector("#workspace-title").textContent, "direct-section");
  assert.equal(new URLSearchParams(window.location.search).get("image"), "direct-section.jp2");
  assert.equal(serverPathSubmit.disabled, true);
  const details = Object.fromEntries([...window.document.querySelectorAll("#metadata-list dt")].map((term) => [
    term.textContent,
    term.nextElementSibling.textContent,
  ]));
  assert.equal(details["Tile pyramid"], "11 levels · 512 × 128px");
  assert.equal(details["JP2 source"], "11 resolution levels");

  const directTiffPath = "/nfs/data/main/M38/MD1022 sections/direct-stack.tiff";
  assert.deepEqual(
    Object.fromEntries(Object.entries(validateServerPath(directTiffPath))),
    { path: directTiffPath, filename: "direct-stack.tiff", kind: "image" },
  );
  assert.equal(await openServerPath(directTiffPath), true);
  const directTiffRequest = mountedRequests.find((request) => request.url === "/api/mounts/register-path"
    && JSON.parse(request.options.body).path === directTiffPath);
  assert(directTiffRequest);
  assert.equal(directTiffRequest.options.method, "POST");

  const directJsonPath = "/nfs/data/main/M38/overlays/direct-cells.json";
  window.document.querySelector("#server-open-button").click();
  await flush();
  await flush();
  directPathInput.value = directJsonPath;
  directPathInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(window.document.querySelector("#server-path-submit-label").textContent, "Add overlay");
  assert.match(serverPathHelp.textContent, /add this server JSON or SWC/i);
  const toastsBeforeDirectJson = window.document.querySelectorAll(".toast").length;
  assert.equal(await openServerPath(), true);
  await flush();
  const directJsonResolve = mountedRequests.find((request) => request.url === "/api/mounts/resolve-overlay-path"
    && JSON.parse(request.options.body).path === directJsonPath);
  assert(directJsonResolve);
  assert.equal(directJsonResolve.options.method, "POST");
  assert.equal(directJsonResolve.options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(directJsonResolve.options.body), { path: directJsonPath });
  assert(mountedRequests.some((request) => request.url === "/api/mounts/main/file?path=overlays%2Fdirect-cells.json"));
  assert.equal(directPathInput.value, "");
  assert.equal(window.document.querySelector("#layer-count").textContent, "2");
  const smallNegativeLayer = viewerState.layers.find((layer) => layer.name === "direct-cells.json");
  assert(smallNegativeLayer);
  assert.equal(Boolean(smallNegativeLayer.indexed), false);
  assert.equal(smallNegativeLayer.alignmentMode, "negative-y");
  assert.deepEqual([smallNegativeLayer.flipY, smallNegativeLayer.offsetY], [true, -48385]);
  assert.deepEqual(
    Array.from(smallNegativeLayer.lines[0].coordinates, ([x, y]) => [x, y]),
    [[7113, -33910], [34188, -9396]],
  );
  assert.equal(outsideRatio(smallNegativeLayer), 0);
  assert.equal(window.document.querySelector("#flip-y").checked, true);
  assert.equal(Number(window.document.querySelector("#offset-y").value), -48385);
  assert.match(window.document.querySelector("#bounds-note").textContent, /display Y = −source Y/i);
  const directJsonToasts = [...window.document.querySelectorAll(".toast")].slice(toastsBeforeDirectJson);
  assert(directJsonToasts.some((item) => /JSON overlay auto-aligned/.test(item.textContent)));
  assert(directJsonToasts.some((item) => /display Y = −source Y/.test(item.textContent)));
  assert(directJsonToasts.every((item) => !/Overlay may not align/.test(item.textContent)));

  const offsetYControl = window.document.querySelector("#offset-y");
  offsetYControl.value = "-48385";
  offsetYControl.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(smallNegativeLayer.alignmentMode, null);
  assert.doesNotMatch(window.document.querySelector("#bounds-note").textContent, /Detected negative Y/i);
  const flipYControl = window.document.querySelector("#flip-y");
  flipYControl.checked = false;
  flipYControl.dispatchEvent(new window.Event("change", { bubbles: true }));
  offsetYControl.value = "0";
  offsetYControl.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.deepEqual([smallNegativeLayer.flipY, smallNegativeLayer.offsetY], [false, 0]);
  assert.equal(smallNegativeLayer.alignmentMode, null);
  assert.equal(outsideRatio(smallNegativeLayer), 1);
  window.document.querySelector('[data-layer-id="base"]').click();
  window.document.querySelector(`[data-layer-id="${smallNegativeLayer.id}"]`).click();
  assert.equal(flipYControl.checked, false);
  assert.equal(Number(offsetYControl.value), 0);
  assert.match(window.document.querySelector("#bounds-note").textContent, /100% of coordinates are outside/i);

  addJsonLayer("positive-top-left.json", JSON.stringify({
    type: "MultiPoint",
    coordinates: [[100, 200], [300, 400]],
  }));
  const positiveLayer = viewerState.layers.find((layer) => layer.name === "positive-top-left.json");
  assert(positiveLayer);
  assert.deepEqual([positiveLayer.alignmentMode, positiveLayer.flipY, positiveLayer.offsetY], [null, false, 0]);
  assert.equal(outsideRatio(positiveLayer), 0);
  assert.match(window.document.querySelector("#bounds-note").textContent, /Coordinates fit image bounds/i);
  window.document.querySelector("#remove-layer").click();

  const toastsBeforeUnresolved = window.document.querySelectorAll(".toast").length;
  addJsonLayer("unresolved-negative-y.json", JSON.stringify({
    type: "MultiPoint",
    coordinates: [[70000, -100], [71000, 200]],
  }));
  const unresolvedLayer = viewerState.layers.find((layer) => layer.name === "unresolved-negative-y.json");
  assert(unresolvedLayer);
  assert.deepEqual([unresolvedLayer.alignmentMode, unresolvedLayer.flipY, unresolvedLayer.offsetY], [null, false, 0]);
  assert.equal(outsideRatio(unresolvedLayer), 1);
  assert.match(window.document.querySelector("#bounds-note").textContent, /100% of coordinates are outside/i);
  const unresolvedToasts = [...window.document.querySelectorAll(".toast")].slice(toastsBeforeUnresolved);
  assert(unresolvedToasts.some((item) => /Overlay may not align/.test(item.textContent)));
  window.document.querySelector("#remove-layer").click();
  assert.equal(window.document.querySelector("#layer-count").textContent, "2");

  const directSwcPath = "/nfs/data/main/M38/overlays/direct-neuron.swc";
  window.document.querySelector("#server-open-button").click();
  await flush();
  await flush();
  directPathInput.value = directSwcPath;
  directPathInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(window.document.querySelector("#server-path-submit-label").textContent, "Add overlay");
  assert.equal(await openServerPath(), true);
  assert(mountedRequests.some((request) => request.url === "/api/mounts/main/file?path=overlays%2Fdirect-neuron.swc"));
  assert.equal(directPathInput.value, "");
  assert.equal(window.document.querySelector("#layer-count").textContent, "3");

  const directLargePath = "/nfs/data/main/M38/overlays/direct-large.json";
  window.document.querySelector("#server-open-button").click();
  await flush();
  await flush();
  directPathInput.value = directLargePath;
  directPathInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(await openServerPath(), true);
  await flush();
  await flush();
  const directLargeRegister = mountedRequests.find((request) => request.url === "/api/mounts/main/register-overlay"
    && JSON.parse(request.options.body).path === "overlays/direct-large.json");
  assert(directLargeRegister);
  assert(!mountedRequests.some((request) => request.url === "/api/mounts/main/file?path=overlays%2Fdirect-large.json"));
  assert(viewerState.layers.some((layer) => layer.overlayId === directLargeOverlayMetadata.id));
  const directLargeLayer = viewerState.layers.find((layer) => layer.overlayId === directLargeOverlayMetadata.id);
  assert.equal(directLargeLayer.alignmentMode, "negative-y");
  assert.deepEqual([directLargeLayer.flipY, directLargeLayer.offsetY], [true, -48385]);
  assert.equal(outsideRatio(directLargeLayer), 0);
  assert.match(window.document.querySelector("#bounds-note").textContent, /display Y = −source Y/i);
  assert.equal(window.document.querySelector("#layer-count").textContent, "4");
  assert.equal(mountedRequests.some((request) => request.url.startsWith("/api/overlays/raw")), false);
  for (const absoluteOverlayPath of [directJsonPath, directSwcPath, directLargePath]) {
    const pathUses = mountedRequests.filter((request) => request.url.includes(absoluteOverlayPath)
      || String(request.options.body || "").includes(absoluteOverlayPath));
    assert.equal(pathUses.length, 1);
    assert.equal(pathUses[0].url, "/api/mounts/resolve-overlay-path");
  }

  const pathDialog = window.document.querySelector("#server-path-dialog");
  const closePendingPath = async (suffix, closeDialog) => {
    window.document.querySelector("#server-open-button").click();
    const pendingPath = `/nfs/data/main/M38/overlays/resolve-race-${suffix}.json`;
    directPathInput.value = pendingPath;
    directPathInput.dispatchEvent(new window.Event("input", { bubbles: true }));
    resolveDirectOverlayDescriptor = null;
    const pendingOpen = openServerPath();
    await flush();
    assert(resolveDirectOverlayDescriptor);
    const fileRequestsBeforeClose = mountedRequests.filter((request) => request.url.includes("/file?path=")).length;
    closeDialog();
    assert.equal(pathDialog.open, false);
    resolveDirectOverlayDescriptor();
    assert.equal(await pendingOpen, false);
    assert.equal(mountedRequests.filter((request) => request.url.includes("/file?path=")).length, fileRequestsBeforeClose);
    assert.equal(directPathInput.value, pendingPath);
  };
  await closePendingPath("close", () => window.document.querySelector("#close-server-path").click());
  await closePendingPath("backdrop", () => pathDialog.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
  await closePendingPath("escape", () => {
    const cancelEvent = new window.Event("cancel", { cancelable: true });
    pathDialog.dispatchEvent(cancelEvent);
    if (!cancelEvent.defaultPrevented) pathDialog.close();
  });

  window.document.querySelector("#server-open-button").click();
  directPathInput.value = "/nfs/data/main/M38/overlays/resolve-race-old.json";
  directPathInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  resolveDirectOverlayDescriptor = null;
  const oldPendingOpen = openServerPath();
  await flush();
  const resolveOldDescriptor = resolveDirectOverlayDescriptor;
  assert(resolveOldDescriptor);
  window.document.querySelector("#close-server-path").click();
  window.document.querySelector("#server-open-button").click();
  assert.equal(pathDialog.open, true);
  assert.strictEqual(window.document.activeElement, directPathInput);
  assert.equal(serverPathSubmit.getAttribute("aria-busy"), null);
  assert.equal(serverPathSubmit.disabled, false);

  directPathInput.value = "/nfs/data/main/M38/overlays/resolve-race-new.json";
  directPathInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  resolveDirectOverlayDescriptor = null;
  const newPendingOpen = openServerPath();
  await flush();
  const resolveNewDescriptor = resolveDirectOverlayDescriptor;
  assert(resolveNewDescriptor);
  assert.equal(serverPathSubmit.getAttribute("aria-busy"), "true");
  resolveOldDescriptor();
  assert.equal(await oldPendingOpen, false);
  assert.equal(serverPathSubmit.getAttribute("aria-busy"), "true");
  assert.equal(serverPathSubmit.disabled, true);
  window.document.querySelector("#close-server-path").click();
  resolveNewDescriptor();
  assert.equal(await newPendingOpen, false);
  assert.equal(directPathInput.value, "/nfs/data/main/M38/overlays/resolve-race-new.json");

  window.document.querySelector("#server-open-button").click();
  await flush();
  await flush();
  directPathInput.value = "/outside/missing.json";
  directPathInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(await openServerPath(), false);
  assert.equal(window.document.querySelector("#server-path-dialog").open, true);
  assert.strictEqual(window.document.activeElement, directPathInput);
  assert.equal(directPathInput.value, "/outside/missing.json");
  assert.equal(directPathInput.getAttribute("aria-invalid"), "true");
  assert.match(window.document.querySelector("#server-path-status").textContent, /outside configured server locations/i);
  window.document.querySelector("#close-server-path").click();

  const unreadableOverlayPath = "/nfs/data/main/M38/overlays/unreadable.swc";
  window.document.querySelector("#server-open-button").click();
  await flush();
  await flush();
  directPathInput.value = unreadableOverlayPath;
  directPathInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(await openServerPath(), false);
  assert.equal(window.document.querySelector("#server-path-dialog").open, true);
  assert.strictEqual(window.document.activeElement, directPathInput);
  assert.equal(directPathInput.value, unreadableOverlayPath);
  assert.equal(directPathInput.getAttribute("aria-invalid"), "true");
  assert.match(window.document.querySelector("#server-path-status").textContent, /could not be read/i);
  assert(mountedRequests.some((request) => request.url === "/api/mounts/main/file?path=overlays%2Funreadable.swc"));
  window.document.querySelector("#close-server-path").click();

  assert.equal(await openServerPath(directPath), true);
  assert.equal(window.document.querySelector("#workspace-title").textContent, "direct-section");
  assert.equal(window.document.querySelector("#layer-count").textContent, "1");

  window.document.querySelector("#server-open-button").click();
  await flush();
  await flush();
  directPathInput.value = "/outside/missing.jp2";
  directPathInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(await openServerPath(), false);
  assert.equal(window.document.querySelector("#server-path-dialog").open, true);
  assert.strictEqual(window.document.activeElement, directPathInput);
  assert.equal(directPathInput.getAttribute("aria-invalid"), "true");
  assert.match(window.document.querySelector("#server-path-status").textContent, /outside configured server locations/i);
  assert.equal(window.document.querySelector("#workspace-title").textContent, "direct-section");
  window.document.querySelector("#close-server-path").click();

  window.document.querySelector("#server-open-button").click();
  await flush();
  await flush();
  window.document.querySelector("#server-open-button").click();
  await flush();
  await flush();
  const largeMountedPath = "/nfs/data/main/M38/overlays/large-boundaries.json";
  directPathInput.value = largeMountedPath;
  directPathInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(await openServerPath(), true);
  await flush();
  await flush();
  const mountedOverlayRequest = mountedRequests.find((request) => request.url === "/api/mounts/main/register-overlay"
    && JSON.parse(request.options.body).path === "overlays/large-boundaries.json");
  assert(mountedOverlayRequest);
  assert.equal(mountedOverlayRequest.options.method, "POST");
  assert.deepEqual(JSON.parse(mountedOverlayRequest.options.body), { path: "overlays/large-boundaries.json" });
  assert(!mountedRequests.some((request) => request.url === "/api/mounts/main/file?path=overlays%2Flarge-boundaries.json"));
  assert.equal(window.document.querySelector("#layer-count").textContent, "2");
  const mountedOverlayDetails = Object.fromEntries([...window.document.querySelectorAll("#metadata-list dt")].map((term) => [
    term.textContent,
    term.nextElementSibling.textContent,
  ]));
  assert.equal(mountedOverlayDetails["Source features"], "750,000");
  assert.equal(mountedOverlayDetails["Visible segments"], "2");
  assert.match(mountedOverlayDetails.Detail, /Full detail/);

  const indexedLayer = viewerState.layers.find((layer) => layer.overlayId === mountedOverlayId);
  assert(indexedLayer);
  const nativeGeometrySetTimeout = window.setTimeout;
  const geometryRetryTimers = [];
  let geometryAttempts = 0;
  window.setTimeout = (callback, delay) => {
    geometryRetryTimers.push({ callback, delay });
    return geometryRetryTimers.length;
  };
  window.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (!requestUrl.startsWith(`/api/overlays/${mountedOverlayId}/geometry?`)) {
      return mountedFetch(url, options);
    }
    geometryAttempts += 1;
    if (geometryAttempts <= 3) {
      return { ok: false, json: async () => ({ detail: "Temporary geometry failure" }) };
    }
    return {
      ok: true,
      json: async () => ({
        segments: [20, 20, 30, 30],
        segmentCount: 1,
        matchingFeatureCount: 1,
        matchingPrimitiveCount: 1,
        approximate: false,
      }),
    };
  };
  indexedLayer.geometryRequestKey = null;
  queueIndexedGeometry(indexedLayer, true);
  await flush();
  await flush();
  assert.equal(geometryAttempts, 1);
  for (const expectedDelay of [250, 500, 1000]) {
    const timer = geometryRetryTimers.shift();
    assert(timer);
    assert.equal(timer.delay, expectedDelay);
    timer.callback();
    await flush();
    await flush();
  }
  assert.equal(geometryAttempts, 4);
  assert.equal(indexedLayer.geometryRetryCount, 0);
  assert.equal(indexedLayer.geometryLoading, false);
  assert.equal(indexedLayer.geometryError, null);
  assert.equal(indexedLayer.visibleSegmentCount, 1);
  window.fetch = mountedFetch;
  window.setTimeout = nativeGeometrySetTimeout;

  window.document.querySelector("#server-open-button").click();
  await flush();
  await flush();
  const fallbackMountedPath = "/nfs/data/main/M38/overlays/fallback-lines.json";
  directPathInput.value = fallbackMountedPath;
  directPathInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(await openServerPath(undefined, 1), true);
  await flush();
  assert(mountedRequests.some((request) => request.url === "/api/mounts/main/file?path=overlays%2Ffallback-lines.json"));
  assert(mountedRequests.some((request) => request.url === "/api/mounts/main/register-overlay"
    && JSON.parse(request.options.body).path === "overlays/fallback-lines.json"));
  assert(viewerState.layers.some((layer) => layer.overlayId === fallbackMountedOverlayMetadata.id));
  assert.equal(window.document.querySelector("#layer-count").textContent, "3");

  const retryImages = [];
  const retryTimers = [];
  const NativeImage = window.Image;
  const nativeSetTimeout = window.setTimeout;
  window.Image = class RetryImage {
    constructor() { retryImages.push(this); }
    set src(value) { this._src = value; }
    get src() { return this._src; }
  };
  window.setTimeout = (callback, delay) => {
    retryTimers.push({ callback, delay });
    return retryTimers.length;
  };
  const retryEntry = requestTile(10, 7, 5);
  for (const expectedDelay of [250, 500, 1000]) {
    retryImages[retryImages.length - 1].onerror();
    assert.equal(retryEntry.status, "retrying");
    const timer = retryTimers.shift();
    assert.equal(timer.delay, expectedDelay);
    timer.callback();
  }
  retryImages[retryImages.length - 1].onerror();
  assert.equal(retryEntry.status, "error");
  assert.equal(retryEntry.attempts, 4);
  assert.strictEqual(requestTile(10, 7, 5), retryEntry);
  window.Image = NativeImage;
  window.setTimeout = nativeSetTimeout;

  const requestedUrls = [];
  window.fetch = async (url) => {
    const urlStr = String(url);
    requestedUrls.push(urlStr);
    if (urlStr.endsWith("/companions")) {
      return {
        ok: true,
        json: async () => ({
          imageId,
          imageStem: "saved-section",
          companions: [
            {
              filename: "saved-section_0.json",
              path: "saved-section_0.json",
              mountId: "main",
              kind: "json",
              typeLabel: "PMD Segmentation",
              size: 5000,
            }
          ]
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        id: imageId,
        filename: "saved-section.jp2",
        format: "JP2",
        fileSize: 4096,
        status: "ready",
        progress: 100,
        width: 1024,
        height: 512,
        bands: 3,
        pixelFormat: "ushort",
        pages: 1,
        tileSize: 512,
        tileFormat: "jpg",
        maxLevel: 1,
      }),
    };
  };
  setImageUrl(imageId);
  assert.equal(await reopenImageFromUrl(), true);
  assert.ok(requestedUrls.includes("/api/images/" + imageId));
  assert.equal(window.document.querySelector("#workspace-title").textContent, "saved-section");
  assert.equal(new URLSearchParams(window.location.search).get("image"), "saved-section.jp2");

  const mountedLibraryId = "66666666-6666-4666-8666-666666666666";
  const readyLibraryId = "77777777-7777-4777-8777-777777777777";
  const queuedLibraryId = "88888888-8888-4888-8888-888888888888";
  const processingLibraryId = "99999999-9999-4999-8999-999999999999";
  const replacementLibraryId = "abababab-abab-4bab-8bab-abababababab";
  let libraryImages = [
    {
      ...readyMetadata,
      id: imageId,
      filename: "saved-section.jp2",
      sourceKind: "upload",
      createdAt: "2026-08-11T14:00:00Z",
    },
    {
      ...readyMetadata,
      id: mountedLibraryId,
      filename: "saved-section.jp2",
      sourceKind: "mounted",
      fileSize: 8192,
      createdAt: "2026-08-11T13:00:00Z",
    },
    {
      ...readyMetadata,
      id: readyLibraryId,
      filename: "saved-section.jp2",
      sourceKind: "upload",
      createdAt: "2026-08-11T12:00:00Z",
    },
    {
      id: queuedLibraryId,
      filename: "queued-slide.tif",
      format: "TIFF",
      fileSize: 16384,
      status: "queued",
      progress: 8,
      sourceKind: "upload",
      message: "Waiting for TIFF preparation",
      createdAt: "2026-08-11T11:00:00Z",
    },
    {
      id: processingLibraryId,
      filename: "processing-slide.tif",
      format: "TIFF",
      fileSize: 32768,
      status: "processing",
      sourceKind: "upload",
      createdAt: "2026-08-11T10:00:00Z",
    },
    {
      id: "demo-neural-section-v1",
      filename: "synthetic_neural_section.tif",
      format: "TIFF · demo",
      fileSize: 1024,
      width: 1600,
      height: 1100,
      status: "ready",
      demo: true,
      createdAt: "2026-08-11T09:00:00Z",
    },
    {
      ...readyMetadata,
      id: replacementLibraryId,
      filename: "replacement-section.jp2",
      sourceKind: "upload",
      fileSize: null,
      createdAt: "invalid-date",
      updatedAt: "2026-08-11T08:00:00Z",
    },
  ];
  const libraryRequests = [];
  let libraryError = false;
  let confirmation = "";
  window.confirm = (message) => {
    confirmation = String(message);
    return true;
  };
  window.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    libraryRequests.push({ url: requestUrl, options });
    if (requestUrl === "/api/images" && !options.method) {
      if (libraryError) return { ok: false, json: async () => ({ detail: "Library temporarily unavailable" }) };
      const images = libraryImages.slice(0, 6);
      return { ok: true, json: async () => ({ images, total: libraryImages.length, truncated: libraryImages.length > images.length }) };
    }
    if (requestUrl === `/api/images/${mountedLibraryId}` && options.method === "DELETE") {
      libraryImages = libraryImages.filter((image) => image.id !== mountedLibraryId);
      return { ok: true, json: async () => ({ removed: mountedLibraryId }) };
    }
    if (requestUrl === `/api/images/${readyLibraryId}` && !options.method) {
      return { ok: true, json: async () => libraryImages.find((image) => image.id === readyLibraryId) };
    }
    throw new Error(`Unexpected image library request: ${requestUrl}`);
  };

  window.document.querySelector("#image-library-button").click();
  await flush();
  await flush();
  assert(window.document.querySelector("#image-library-dialog").open);
  assert.equal(window.document.querySelectorAll(".image-library-item").length, 6);
  assert.equal(window.document.querySelector("#image-library-total").textContent, "Showing 6 of 7 images");
  assert([...window.document.querySelectorAll(".image-library-item")].every((item) => item.getAttribute("role") === "listitem"));
  assert.equal(window.document.querySelectorAll(".image-library-same-name").length, 3);
  assert.equal(window.document.querySelector(".image-library-same-name").textContent, "3 with same name");

  const currentLibraryRow = window.document.querySelector(`[data-image-id="${imageId}"]`);
  assert(currentLibraryRow.classList.contains("current"));
  assert.equal(currentLibraryRow.querySelector(".image-library-open").textContent, "Viewing");
  assert.equal(currentLibraryRow.querySelector(".image-library-remove").disabled, true);
  assert.match(currentLibraryRow.querySelector(".image-library-remove").title, /currently open/i);
  const demoLibraryRow = window.document.querySelector('[data-image-id="demo-neural-section-v1"]');
  assert.equal(demoLibraryRow.querySelector(".image-library-remove").disabled, true);
  assert.match(demoLibraryRow.querySelector(".image-library-remove").title, /built-in demo/i);
  const processingLibraryRow = window.document.querySelector(`[data-image-id="${processingLibraryId}"]`);
  assert.equal(processingLibraryRow.querySelector(".image-library-remove").disabled, true);
  const queuedLibraryRow = window.document.querySelector(`[data-image-id="${queuedLibraryId}"]`);
  assert.equal(queuedLibraryRow.querySelector(".image-library-open").textContent, "Open when ready");
  assert.equal(queuedLibraryRow.querySelector(".image-library-open").disabled, false);

  const librarySearch = window.document.querySelector("#image-library-search");
  librarySearch.value = mountedLibraryId.slice(0, 8);
  librarySearch.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(window.document.querySelectorAll(".image-library-item").length, 1);
  assert.match(window.document.querySelector("#image-library-total").textContent, /1 match/);
  librarySearch.value = "no such image";
  librarySearch.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.match(window.document.querySelector(".image-library-message.empty").textContent, /No images match/);
  window.document.querySelector(".image-library-message.empty button").click();
  assert.equal(window.document.querySelectorAll(".image-library-item").length, 6);

  window.document.querySelector(`[data-image-id="${mountedLibraryId}"] .image-library-remove`).click();
  await flush();
  await flush();
  assert.match(confirmation, /mounted source file will stay untouched/i);
  assert(libraryRequests.some((request) => request.url === `/api/images/${mountedLibraryId}` && request.options.method === "DELETE"));
  assert.equal(window.document.querySelector(`[data-image-id="${mountedLibraryId}"]`), null);
  assert.equal(libraryRequests.filter((request) => request.url === "/api/images" && !request.options.method).length, 2);
  assert.equal(window.document.querySelector("#image-library-total").textContent, "6 images");
  const replacementLibraryRow = window.document.querySelector(`[data-image-id="${replacementLibraryId}"]`);
  assert(replacementLibraryRow);
  const replacementFacts = [...replacementLibraryRow.querySelectorAll(".image-library-facts span")].map((item) => item.textContent);
  assert(replacementFacts.includes("Size pending"));
  assert(replacementFacts.some((value) => value.startsWith("Updated ")));
  assert(!replacementFacts.includes("0 B"));

  window.document.querySelector(`[data-image-id="${readyLibraryId}"] .image-library-open`).click();
  await flush();
  await flush();
  assert.equal(window.document.querySelector("#image-library-dialog").open, false);
  assert.equal(window.document.querySelector("#workspace-title").textContent, "saved-section");
  assert.equal(viewerState.image.id, readyLibraryId);
  assert(libraryRequests.some((request) => request.url === `/api/images/${readyLibraryId}` && !request.options.method));

  libraryError = true;
  window.document.querySelector("#image-library-button").click();
  await flush();
  await flush();
  assert.match(window.document.querySelector(".image-library-message.error").textContent, /temporarily unavailable/i);
  assert(window.document.querySelector(".image-library-message.error [role='alert']"));
  assert.equal(window.document.querySelector("#image-library-total").textContent, "Unavailable");
  libraryError = false;
  window.document.querySelector(".image-library-message.error button").click();
  await flush();
  await flush();
  assert.equal(window.document.querySelectorAll(".image-library-item").length, 6);

  window.document.querySelector("#done-image-library").click();

  const ctaRequests = [];
  window.fetch = async (url) => {
    const requestUrl = String(url);
    ctaRequests.push(requestUrl);
    if (requestUrl === "/api/images") {
      return { ok: true, json: async () => ({ images: [], total: 0, truncated: false }) };
    }
    if (requestUrl === "/api/mounts") {
      return { ok: true, json: async () => ({ mounts: [] }) };
    }
    throw new Error(`Unexpected server-only CTA request: ${requestUrl}`);
  };

  window.document.querySelector("#empty-server-open").click();
  assert.equal(window.document.querySelector("#server-path-dialog").open, true);
  assert.strictEqual(window.document.activeElement, serverPathInput);
  assert.equal(ctaRequests.filter((u) => u !== "/api/mounts").length, 0);
  window.document.querySelector("#close-server-path").click();

  window.document.querySelector("#empty-image-library").click();
  await flush();
  await flush();
  assert.equal(window.document.querySelector("#image-library-dialog").open, true);
  assert.equal(window.document.querySelector("#image-library-empty").classList.contains("hidden"), false);
  assert.match(window.document.querySelector("#image-library-empty").textContent, /configured server location/i);
  assert.doesNotMatch(window.document.querySelector("#image-library-empty").textContent, /upload/i);
  window.document.querySelector("#library-server-open").click();
  assert.equal(window.document.querySelector("#image-library-dialog").open, false);
  assert.equal(window.document.querySelector("#server-path-dialog").open, true);
  assert.strictEqual(window.document.activeElement, serverPathInput);
  window.document.querySelector("#close-server-path").click();
  assert.equal(ctaRequests.some((url) => url.startsWith("/api/images/raw") || url.startsWith("/api/overlays/raw")), false);

  const shortcutRequests = [];
  window.fetch = async (url) => {
    const requestUrl = String(url);
    shortcutRequests.push(requestUrl);
    if (requestUrl === "/api/images") {
      return { ok: true, json: async () => ({ images: [], total: 0, truncated: false }) };
    }
    if (requestUrl === "/api/mounts") {
      return { ok: true, json: async () => ({ mounts: [] }) };
    }
    throw new Error(`Unexpected shortcut request: ${requestUrl}`);
  };
  const serverShortcut = new window.KeyboardEvent("keydown", { key: "s", bubbles: true, cancelable: true });
  assert.equal(window.document.dispatchEvent(serverShortcut), false);
  assert.equal(serverShortcut.defaultPrevented, true);
  assert(window.document.querySelector("#server-path-dialog").open);
  assert.strictEqual(window.document.activeElement, serverPathInput);
  assert.equal(shortcutRequests.filter((u) => u !== "/api/mounts").length, 0);
  window.document.querySelector("#close-server-path").click();

  const libraryShortcut = new window.KeyboardEvent("keydown", { key: "l", bubbles: true, cancelable: true });
  assert.equal(window.document.dispatchEvent(libraryShortcut), false);
  assert.equal(libraryShortcut.defaultPrevented, true);
  await flush();
  assert(window.document.querySelector("#image-library-dialog").open);
  assert(shortcutRequests.includes("/api/images"));
  window.document.querySelector("#done-image-library").click();

  const shortcutRequestCount = shortcutRequests.length;
  for (const removedKey of ["o", "a"]) {
    const removedShortcut = new window.KeyboardEvent("keydown", { key: removedKey, bubbles: true, cancelable: true });
    assert.equal(window.document.dispatchEvent(removedShortcut), true);
    assert.equal(removedShortcut.defaultPrevented, false);
  }
  assert.equal(shortcutRequests.length, shortcutRequestCount);

  const toastsBeforeDrop = window.document.querySelectorAll(".toast").length;
  const droppedFile = new window.Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(droppedFile, "dataTransfer", {
    value: { files: [new window.File(["local"], "local.jp2", { type: "image/jp2" })] },
  });
  assert.equal(window.document.dispatchEvent(droppedFile), false);
  assert.equal(droppedFile.defaultPrevented, true);
  const dropToasts = [...window.document.querySelectorAll(".toast")].slice(toastsBeforeDrop);
  assert.equal(dropToasts.length, 1);
  assert.match(dropToasts[0].textContent, /Local files aren’t accepted/i);
  assert.match(dropToasts[0].textContent, /Open server path/i);
  assert.equal(shortcutRequests.length, shortcutRequestCount);

  let modifiedShortcutRequests = 0;
  window.fetch = async () => {
    modifiedShortcutRequests += 1;
    throw new Error("A modified browser shortcut must not trigger an app request");
  };
  for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
    const shortcut = new window.KeyboardEvent("keydown", { key: "l", bubbles: true, cancelable: true, ...modifiers });
    assert.equal(window.document.dispatchEvent(shortcut), true);
    assert.equal(shortcut.defaultPrevented, false);
  }
  assert.equal(window.document.querySelector("#image-library-dialog").open, false);
  assert.equal(modifiedShortcutRequests, 0);
  window.close();
  console.log("browser smoke: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
