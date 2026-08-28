const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const els = {
  shell: $("#canvas-shell"),
  canvas: $("#viewer-canvas"),
  empty: $("#empty-state"),
  processing: $("#processing-state"),
  imageLibraryButton: $("#image-library-button"),
  emptyImageLibrary: $("#empty-image-library"),
  serverOpenButton: $("#server-open-button"),
  emptyServerOpen: $("#empty-server-open"),
  demoButton: $("#demo-button"),
  zoomIn: $("#zoom-in"),
  zoomOut: $("#zoom-out"),
  fit: $("#fit-button"),
  reset: $("#reset-button"),
  grid: $("#grid-button"),
  layerList: $("#layer-list"),
  layersEmpty: $("#layers-empty"),
  layerCount: $("#layer-count"),
  inspectorEmpty: $("#inspector-empty"),
  inspectorContent: $("#inspector-content"),
  workspaceTitle: $("#workspace-title"),
  toolbarZoom: $("#toolbar-zoom"),
  statusZoom: $("#status-zoom"),
  statusFormat: $("#status-format"),
  statusDimensions: $("#status-dimensions"),
  cursorX: $("#cursor-x"),
  cursorY: $("#cursor-y"),
  tileStatus: $("#tile-status"),
  resolutionChip: $("#resolution-chip"),
  resolutionLabel: $("#resolution-label"),
  scaleBar: $("#scale-bar"),
  scaleLabel: $("#scale-label"),
  minimap: $("#minimap"),
  minimapCanvas: $("#minimap-canvas"),
  minimapClose: $("#minimap-close"),
  processingTitle: $("#processing-title"),
  processingMessage: $("#processing-message"),
  processingKicker: $("#processing-kicker"),
  processingSteps: $$("[data-processing-step]"),
  progressTrack: $("#progress-track"),
  progressBar: $("#progress-bar"),
  progressFile: $("#progress-file"),
  progressValue: $("#progress-value"),
  selectedName: $("#selected-name"),
  selectedType: $("#selected-type"),
  selectedSwatch: $("#selected-swatch"),
  selectedVisibility: $("#selected-visibility"),
  opacityRange: $("#opacity-range"),
  opacityOutput: $("#opacity-output"),
  colorInput: $("#color-input"),
  colorValue: $("#color-value"),
  sizeOutput: $("#size-output"),
  sizeDown: $("#size-down"),
  sizeUp: $("#size-up"),
  offsetX: $("#offset-x"),
  offsetY: $("#offset-y"),
  flipY: $("#flip-y"),
  boundsNote: $("#bounds-note"),
  metadataList: $("#metadata-list"),
  removeLayer: $("#remove-layer"),
  toastRegion: $("#toast-region"),
  shortcutsButton: $("#shortcuts-button"),
  shortcutsDialog: $("#shortcuts-dialog"),
  closeShortcuts: $("#close-shortcuts"),
  imageLibraryDialog: $("#image-library-dialog"),
  imageLibraryList: $("#image-library-list"),
  imageLibraryEmpty: $("#image-library-empty"),
  imageLibraryTotal: $("#image-library-total"),
  imageLibrarySearch: $("#image-library-search"),
  refreshImageLibrary: $("#refresh-image-library"),
  closeImageLibrary: $("#close-image-library"),
  doneImageLibrary: $("#done-image-library"),
  libraryServerOpen: $("#library-server-open"),
  serverPathDialog: $("#server-path-dialog"),
  serverPathForm: $("#server-path-form"),
  serverPathInput: $("#server-path-input"),
  serverPathSubmit: $("#open-server-path"),
  serverPathSubmitLabel: $("#server-path-submit-label"),
  serverPathHelp: $("#server-path-help"),
  serverPathStatus: $("#server-path-status"),
  closeServerPath: $("#close-server-path"),
};

const state = {
  image: null,
  layers: [],
  selectedLayerId: null,
  view: { x: 0, y: 0, scale: 1 },
  fitScale: 1,
  dpr: Math.min(window.devicePixelRatio || 1, 2),
  viewportWidth: 0,
  viewportHeight: 0,
  tileCache: new Map(),
  tileFrame: 0,
  tileStats: { requested: 0, loaded: 0 },
  overview: null,
  overviewLevel: 0,
  overviewLoading: false,
  minimapTransform: null,
  showTileGrid: false,
  pointer: null,
  moved: false,
  renderQueued: false,
  pollToken: 0,
  imageOperationToken: 0,
  overlayOperationToken: 0,
  overlayProcessingToken: null,
  imageLibrary: {
    images: [],
    total: 0,
    truncated: false,
    requestToken: 0,
    query: "",
  },
  serverPathRequestToken: 0,
};

const ctx = els.canvas.getContext("2d", { alpha: false });
const miniCtx = els.minimapCanvas.getContext("2d");
const IMAGE_EXTENSIONS = new Set(["jp2", "tif", "tiff"]);
const OVERLAY_EXTENSIONS = new Set(["swc", "json"]);
const MAX_FEATURES = 500_000;
const MAX_JSON_VERTICES = MAX_FEATURES * 2;
const INDEXED_JSON_THRESHOLD_BYTES = 32 * 1024 * 1024;
const INDEXED_GEOMETRY_MAX_SEGMENTS = 80_000;
const INDEXED_GEOMETRY_DEBOUNCE_MS = 120;
const INDEXED_GEOMETRY_RETRY_DELAYS = [250, 500, 1_000];
const IMAGE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGE_RECORD_ID_PATTERN = /^[a-zA-Z0-9-]{1,64}$/;
const TILE_RETRY_LIMIT = 3;
const TILE_RETRY_BASE_MS = 250;
const TILE_RETRY_MAX_MS = 2_000;
const TILE_ERROR_COOLDOWN_MS = 10_000;

function extensionOf(name = "") {
  return name.toLowerCase().split(".").pop();
}

function shouldUseIndexedJson(name, size) {
  return extensionOf(name) === "json"
    && Number.isFinite(Number(size))
    && Number(size) >= INDEXED_JSON_THRESHOLD_BYTES;
}

function indexedOverlayFailureMessage(error) {
  const message = error?.message || "The overlay could not be indexed.";
  return `${message} Large-overlay indexing accepts only GeoJSON LineString/MultiLineString geometry. Point and Polygon overlays remain supported through the regular client path when the JSON is under 32 MiB and within the ${formatNumber(MAX_FEATURES)}-feature and ${formatNumber(MAX_JSON_VERTICES)} stored-vertex browser safety budgets.`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value, maximumFractionDigits = 0) {
  if (!Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(Number(value));
}

function formatBytes(bytes) {
  if (!Number.isFinite(Number(bytes))) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
}

function fileStem(name) {
  return name.replace(/\.[^.]+$/, "");
}

function iconUse(name) {
  return `<svg aria-hidden="true"><use href="#${name}"></use></svg>`;
}

function toast(title, message, type = "success", duration = 4200) {
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  const icon = type === "error" || type === "warning" ? "i-warning" : "i-check";
  item.innerHTML = `
    <span class="toast-icon">${iconUse(icon)}</span>
    <span class="toast-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></span>
    <button aria-label="Dismiss">${iconUse("i-close")}</button>`;
  item.querySelector("button").addEventListener("click", () => item.remove());
  els.toastRegion.append(item);
  const timer = window.setTimeout(() => item.remove(), duration);
  item.addEventListener("mouseenter", () => window.clearTimeout(timer), { once: true });
}

async function responseJson(response) {
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // The fallback below is intentionally generic.
  }
  if (!response.ok) throw new Error(payload.detail || payload.error || "The request could not be completed.");
  return payload;
}

function processingPresentation(metadata = {}) {
  const status = String(metadata.status || "processing").toLowerCase();
  const numericProgress = Number(metadata.progress);
  const progress = Number.isFinite(numericProgress) ? Math.max(0, Math.min(100, numericProgress)) : 0;
  const queuePosition = Number.isInteger(Number(metadata.queuePosition)) && Number(metadata.queuePosition) > 0
    ? Number(metadata.queuePosition)
    : null;
  const queueDepth = Number.isInteger(Number(metadata.queueDepth)) && Number(metadata.queueDepth) > 0
    ? Number(metadata.queueDepth)
    : null;

  if (status === "overlay-indexing") {
    return {
      status,
      mode: "overlay",
      kicker: metadata.mounted ? "Mounted overlay" : "2 of 3 · Indexing overlay",
      title: "Indexing overlay geometry",
      message: metadata.message || "Building a spatial index so the viewer only requests geometry in the visible area.",
      progress: 100,
      progressLabel: "Indexing",
      indeterminate: true,
      step: 1,
    };
  }

  if (status === "registering") {
    return {
      status: "registering",
      kicker: "2 of 3 · Registering",
      title: "Registering image",
      message: metadata.message || "Reading image dimensions and connecting the source to the tile service. No pyramid build is required.",
      progress: 100,
      progressLabel: "Reading metadata",
      indeterminate: true,
      step: 1,
    };
  }
  if (status === "queued") {
    const positionText = queuePosition
      ? `Queue position ${queuePosition}${queueDepth ? ` of ${Math.max(queuePosition, queueDepth)}` : ""}. `
      : "";
    return {
      status,
      kicker: "2 of 3 · Queued",
      title: queuePosition ? `Queued · position ${queuePosition}` : "Queued for TIFF preparation",
      message: `${positionText}The source is registered and is waiting for a TIFF preparation slot.`,
      progress,
      progressLabel: queuePosition ? `Queue #${queuePosition}` : "Waiting",
      indeterminate: true,
      step: 1,
    };
  }
  if (status === "ready") {
    return {
      status,
      kicker: "3 of 3 · Ready",
      title: "Image ready",
      message: "The tile service is ready. Opening the image now.",
      progress: 100,
      progressLabel: "Ready",
      indeterminate: false,
      step: 2,
    };
  }
  if (status === "reopening") {
    return {
      status,
      kicker: "Saved image",
      title: "Opening saved image",
      message: "Checking the server registration and tile service for this image.",
      progress: 0,
      progressLabel: "Checking",
      indeterminate: true,
      step: 1,
    };
  }

  const retrying = /kakadu|compatibility|retry/i.test(metadata.message || "");
  const inspecting = /inspect/i.test(metadata.message || "");
  return {
    status: "processing",
    kicker: "2 of 3 · Preparing",
    title: retrying ? "Retrying image decode" : inspecting ? "Inspecting source image" : "Preparing TIFF for deep zoom",
    message: retrying
      ? "The primary decoder could not read this JP2. The server is retrying with its compatibility decoder."
      : inspecting
        ? "Reading dimensions and pixel metadata before tile generation begins."
        : "Preparing this TIFF for efficient tile access. JP2 images skip this step and open directly.",
    progress,
    progressLabel: "Processing",
    indeterminate: true,
    step: 1,
  };
}

function showProcessing(metadata) {
  const presentation = processingPresentation(metadata);
  els.processing.classList.remove("hidden");
  els.empty.classList.add("hidden");
  els.processing.dataset.status = presentation.status;
  els.processingKicker.textContent = presentation.kicker;
  els.processingTitle.textContent = presentation.title;
  els.processingMessage.textContent = presentation.message;
  els.progressFile.textContent = metadata.filename || "Image";
  els.progressTrack.classList.toggle("indeterminate", presentation.indeterminate);
  els.progressTrack.toggleAttribute("aria-busy", presentation.indeterminate);
  if (presentation.indeterminate) els.progressTrack.removeAttribute("aria-valuenow");
  else els.progressTrack.setAttribute("aria-valuenow", String(Math.round(presentation.progress)));
  els.progressBar.style.width = `${presentation.progress}%`;
  els.progressValue.textContent = presentation.progressLabel;
  const stepLabels = presentation.mode === "overlay" ? ["Source", "Index", "Ready"] : ["Source", "Register", "Ready"];
  els.processingSteps[0]?.parentElement?.setAttribute(
    "aria-label",
    presentation.mode === "overlay" ? "Overlay indexing stages" : "Image preparation stages",
  );
  els.progressTrack.setAttribute(
    "aria-label",
    presentation.mode === "overlay" ? "Overlay indexing progress" : "Image preparation progress",
  );
  els.processingSteps.forEach((step, index) => {
    const label = $("b", step);
    if (label) label.textContent = stepLabels[index];
    step.classList.toggle("complete", index < presentation.step);
    step.classList.toggle("current", index === presentation.step);
    if (index === presentation.step) step.setAttribute("aria-current", "step");
    else step.removeAttribute("aria-current");
  });
}

function hideProcessing() {
  els.processing.classList.add("hidden");
}

function supersededOperationError() {
  const error = new Error("Image loading was superseded by another request.");
  error.code = "IMAGE_OPERATION_SUPERSEDED";
  return error;
}

function beginImageOperation() {
  state.imageOperationToken += 1;
  state.pollToken += 1;
  state.overlayOperationToken += 1;
  state.overlayProcessingToken = null;
  return state.imageOperationToken;
}

function imageOperationIsCurrent(token) {
  return token === state.imageOperationToken;
}

function ensureCurrentImageOperation(token) {
  if (!imageOperationIsCurrent(token)) throw supersededOperationError();
}

function imageOperationWasSuperseded(error, token) {
  return !imageOperationIsCurrent(token) || error?.code === "IMAGE_OPERATION_SUPERSEDED";
}

function supersededOverlayOperationError() {
  const error = new Error("Overlay loading was superseded by another request.");
  error.code = "OVERLAY_OPERATION_SUPERSEDED";
  return error;
}

function beginOverlayOperation() {
  state.overlayOperationToken += 1;
  if (state.overlayProcessingToken !== null) {
    state.overlayProcessingToken = null;
    hideProcessing();
  }
  return state.overlayOperationToken;
}

function overlayOperationIsCurrent(token) {
  return token === state.overlayOperationToken;
}

function showOverlayProcessing(metadata, operationToken) {
  if (!overlayOperationIsCurrent(operationToken)) return;
  state.overlayProcessingToken = operationToken;
  showProcessing(metadata);
}

function hideOverlayProcessing(operationToken) {
  if (state.overlayProcessingToken !== operationToken) return;
  state.overlayProcessingToken = null;
  hideProcessing();
}

async function pollUntilReady(metadata, operationToken = state.imageOperationToken) {
  const token = ++state.pollToken;
  let current = metadata;
  while (token === state.pollToken && imageOperationIsCurrent(operationToken)) {
    const status = String(current.status || "").toLowerCase();
    if (status === "error") throw new Error(current.error || "The image could not be processed.");
    showProcessing(current);
    if (status === "ready") return current;
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    ensureCurrentImageOperation(operationToken);
    if (token !== state.pollToken) throw supersededOperationError();
    const response = await fetch(`/api/images/${encodeURIComponent(current.id)}`, { cache: "no-store" });
    current = await responseJson(response);
  }
  if (token !== state.pollToken || !imageOperationIsCurrent(operationToken)) throw supersededOperationError();
  return current;
}

function validImageId(value) {
  const candidate = String(value || "").trim();
  return IMAGE_ID_PATTERN.test(candidate) ? candidate : null;
}

function setImageUrl(imageId) {
  const url = new URL(window.location.href);
  const safeId = validImageId(imageId);
  if (safeId) url.searchParams.set("image", safeId);
  else url.searchParams.delete("image");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

async function reopenImageFromUrl() {
  const requestedId = new URLSearchParams(window.location.search).get("image");
  if (!requestedId) return false;
  const imageId = validImageId(requestedId);
  if (!imageId) {
    setImageUrl(null);
    toast("Invalid image link", "The image ID in this URL is not a valid UUID.", "error", 7000);
    return false;
  }
  const operationToken = beginImageOperation();
  try {
    showProcessing({ filename: "Saved image", status: "reopening" });
    const metadata = await responseJson(await fetch(`/api/images/${encodeURIComponent(imageId)}`, { cache: "no-store" }));
    ensureCurrentImageOperation(operationToken);
    const ready = await pollUntilReady(metadata, operationToken);
    ensureCurrentImageOperation(operationToken);
    await activateImage(ready);
    toast("Image reopened", `${ready.filename} loaded from its saved server job.`);
    return true;
  } catch (error) {
    if (imageOperationWasSuperseded(error, operationToken)) return false;
    hideProcessing();
    if (!state.image) els.empty.classList.remove("hidden");
    toast("Could not reopen image", error.message, "error", 7000);
    return false;
  }
}

function formatDisplayDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function validImageLibraryDate(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text && Number.isFinite(Date.parse(text)) ? text : null;
}

function normalizeImageLibrary(payload = {}) {
  const records = Array.isArray(payload) ? payload : payload.images;
  if (!Array.isArray(records)) return [];
  return records
    .map((record) => {
      const id = String(record?.id || "").trim();
      const filename = String(record?.filename || "Untitled image").trim() || "Untitled image";
      const demo = Boolean(record?.demo) || id.startsWith("demo-");
      const width = Number(record?.width);
      const height = Number(record?.height);
      const rawFileSize = record?.fileSize;
      const fileSize = typeof rawFileSize === "number"
        || (typeof rawFileSize === "string" && rawFileSize.trim())
        ? Number(rawFileSize)
        : Number.NaN;
      const createdAt = validImageLibraryDate(record?.createdAt);
      const updatedAt = validImageLibraryDate(record?.updatedAt);
      const rawSourceKind = String(record?.sourceKind || "").toLowerCase();
      return {
        id,
        filename,
        format: String(record?.format || extensionOf(filename) || "Image").toUpperCase(),
        status: String(record?.status || "unknown").toLowerCase(),
        width: Number.isFinite(width) && width > 0 ? width : null,
        height: Number.isFinite(height) && height > 0 ? height : null,
        fileSize: Number.isFinite(fileSize) && fileSize >= 0 ? fileSize : null,
        createdAt,
        updatedAt,
        sourceKind: demo ? "demo" : ["upload", "mounted"].includes(rawSourceKind) ? rawSourceKind : "saved",
        demo,
        message: String(record?.error || record?.message || "").trim(),
      };
    })
    .filter((record) => IMAGE_RECORD_ID_PATTERN.test(record.id))
    .sort((left, right) => {
      const leftTime = Date.parse(left.createdAt || left.updatedAt || "") || 0;
      const rightTime = Date.parse(right.createdAt || right.updatedAt || "") || 0;
      return rightTime - leftTime
        || left.filename.localeCompare(right.filename, undefined, { numeric: true, sensitivity: "base" })
        || left.id.localeCompare(right.id);
    });
}

function imageLibrarySourceLabel(image) {
  if (image.sourceKind === "upload") return "Stored source";
  if (image.sourceKind === "mounted") return "Mounted file";
  if (image.sourceKind === "demo") return "Built-in demo";
  return "Saved image";
}

function imageLibraryStatusLabel(status) {
  return ({
    ready: "Ready",
    queued: "Queued",
    processing: "Processing",
    uploading: "Receiving",
    error: "Needs attention",
  })[status] || "Unavailable";
}

function imageLibraryCanOpen(image) {
  return ["ready", "queued", "processing"].includes(image.status);
}

function imageLibraryDeleteReason(image) {
  if (image.demo) return "The built-in demo is shared and cannot be removed.";
  if (state.image?.id === image.id) return "This image is currently open. Open another image before removing it.";
  if (["uploading", "processing"].includes(image.status)) return "This image is still being prepared and cannot be removed yet.";
  return "";
}

function updateImageLibrarySummary(matchCount = null) {
  const shown = state.imageLibrary.images.length;
  const total = Math.max(shown, Number(state.imageLibrary.total) || 0);
  if (matchCount !== null) {
    els.imageLibraryTotal.textContent = `${formatNumber(matchCount)} ${matchCount === 1 ? "match" : "matches"} · ${formatNumber(total)} total`;
  } else if (state.imageLibrary.truncated || total > shown) {
    els.imageLibraryTotal.textContent = `Showing ${formatNumber(shown)} of ${formatNumber(total)} images`;
  } else {
    els.imageLibraryTotal.textContent = `${formatNumber(total)} ${total === 1 ? "image" : "images"}`;
  }
}

function setImageLibraryMessage(message, kind = "loading") {
  els.imageLibraryEmpty.classList.add("hidden");
  els.imageLibraryList.classList.remove("hidden");
  els.imageLibraryList.replaceChildren();
  const item = document.createElement("div");
  item.className = `image-library-message ${kind}`;
  item.setAttribute("role", "listitem");
  if (kind === "loading") {
    const spinner = document.createElement("span");
    spinner.className = "request-spinner";
    item.append(spinner);
  }
  const copy = document.createElement("span");
  copy.textContent = message;
  copy.setAttribute("role", kind === "error" ? "alert" : "status");
  item.append(copy);
  if (kind === "error") {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "button button-secondary";
    retry.textContent = "Try again";
    retry.addEventListener("click", () => void loadImageLibrary());
    item.append(retry);
  }
  els.imageLibraryList.append(item);
  els.imageLibraryList.toggleAttribute("aria-busy", kind === "loading");
}

function renderImageLibrary() {
  const allImages = state.imageLibrary.images;
  const query = state.imageLibrary.query.trim().toLocaleLowerCase();
  const images = query ? allImages.filter((image) => [
    image.filename,
    image.id,
    image.format,
    imageLibrarySourceLabel(image),
  ].some((value) => value.toLocaleLowerCase().includes(query))) : allImages;
  updateImageLibrarySummary(query ? images.length : null);
  els.imageLibraryList.removeAttribute("aria-busy");
  els.imageLibraryList.replaceChildren();
  if (!allImages.length) {
    els.imageLibraryList.classList.add("hidden");
    els.imageLibraryEmpty.classList.remove("hidden");
    return;
  }
  els.imageLibraryList.classList.remove("hidden");
  els.imageLibraryEmpty.classList.add("hidden");
  const sameNameCounts = new Map();
  for (const image of allImages) {
    const key = image.filename.toLocaleLowerCase();
    sameNameCounts.set(key, (sameNameCounts.get(key) || 0) + 1);
  }
  if (!images.length) {
    const noMatches = document.createElement("div");
    noMatches.className = "image-library-message empty";
    noMatches.setAttribute("role", "listitem");
    const copy = document.createElement("span");
    copy.textContent = `No images match “${state.imageLibrary.query.trim()}”.`;
    copy.setAttribute("role", "status");
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "button button-secondary";
    clear.textContent = "Clear search";
    clear.addEventListener("click", () => {
      state.imageLibrary.query = "";
      els.imageLibrarySearch.value = "";
      renderImageLibrary();
      els.imageLibrarySearch.focus();
    });
    noMatches.append(copy, clear);
    els.imageLibraryList.append(noMatches);
    return;
  }

  for (const image of images) {
    const current = state.image?.id === image.id;
    const openable = imageLibraryCanOpen(image);
    const removeReason = imageLibraryDeleteReason(image);
    const item = document.createElement("article");
    item.className = "image-library-item";
    item.setAttribute("role", "listitem");
    item.classList.toggle("current", current);
    item.dataset.imageId = image.id;

    const identity = document.createElement("div");
    identity.className = "image-library-identity";
    const glyph = document.createElement("span");
    glyph.className = "image-library-glyph";
    glyph.innerHTML = iconUse("i-image");
    const copy = document.createElement("div");
    copy.className = "image-library-copy";
    const titleLine = document.createElement("div");
    titleLine.className = "image-library-title-line";
    const name = document.createElement("strong");
    name.textContent = image.filename;
    name.title = image.filename;
    titleLine.append(name);
    if (current) {
      const currentBadge = document.createElement("span");
      currentBadge.className = "image-library-current-badge";
      currentBadge.textContent = "Open now";
      titleLine.append(currentBadge);
    }
    const sameNameCount = sameNameCounts.get(image.filename.toLocaleLowerCase()) || 0;
    if (sameNameCount > 1) {
      const sameNameBadge = document.createElement("span");
      sameNameBadge.className = "image-library-same-name";
      sameNameBadge.textContent = `${sameNameCount} with same name`;
      titleLine.append(sameNameBadge);
    }
    const source = document.createElement("small");
    source.textContent = `${imageLibrarySourceLabel(image)} · ${image.format} · ID ${image.id.slice(0, 8)}`;
    copy.append(titleLine, source);
    identity.append(glyph, copy);

    const facts = document.createElement("div");
    facts.className = "image-library-facts";
    const dimensions = image.width && image.height
      ? `${formatNumber(image.width)} × ${formatNumber(image.height)}`
      : "Dimensions pending";
    const dateValue = image.createdAt || image.updatedAt;
    const dateLabel = image.createdAt ? "Added" : "Updated";
    for (const value of [dimensions, image.fileSize === null ? "Size pending" : formatBytes(image.fileSize), dateValue ? `${dateLabel} ${formatDisplayDate(dateValue)}` : "Date unavailable"]) {
      const fact = document.createElement("span");
      fact.textContent = value;
      facts.append(fact);
    }

    const stateCell = document.createElement("div");
    stateCell.className = "image-library-state";
    const status = document.createElement("span");
    const statusClass = ["ready", "queued", "processing", "uploading", "error"].includes(image.status) ? image.status : "unknown";
    status.className = `image-library-status ${statusClass}`;
    status.textContent = imageLibraryStatusLabel(image.status);
    stateCell.append(status);
    if (image.message && image.status !== "ready") {
      const message = document.createElement("small");
      message.textContent = image.message;
      message.title = image.message;
      stateCell.append(message);
    }

    const actions = document.createElement("div");
    actions.className = "image-library-actions";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "button button-secondary image-library-open";
    open.textContent = current ? "Viewing" : ["queued", "processing"].includes(image.status) ? "Open when ready" : "Open";
    open.disabled = current || !openable;
    open.title = current ? "This image is already open" : openable ? `Open ${image.filename}` : "This image is not ready to open";
    open.setAttribute("aria-label", open.title);
    open.addEventListener("click", () => void openImageLibraryRecord(image));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "image-library-remove";
    remove.innerHTML = iconUse("i-trash");
    remove.disabled = Boolean(removeReason);
    remove.title = removeReason || `Remove ${image.filename}`;
    remove.setAttribute("aria-label", remove.title);
    remove.addEventListener("click", () => void deleteImageLibraryRecord(image, remove));
    actions.append(open, remove);
    item.append(identity, facts, stateCell, actions);
    els.imageLibraryList.append(item);
  }
}

async function loadImageLibrary() {
  const token = ++state.imageLibrary.requestToken;
  els.refreshImageLibrary.disabled = true;
  els.imageLibraryTotal.textContent = "Loading…";
  setImageLibraryMessage("Loading available images…");
  try {
    const payload = await responseJson(await fetch("/api/images", { cache: "no-store" }));
    if (token !== state.imageLibrary.requestToken || !els.imageLibraryDialog.open) return false;
    state.imageLibrary.images = normalizeImageLibrary(payload);
    state.imageLibrary.total = Number.isFinite(Number(payload?.total)) ? Number(payload.total) : state.imageLibrary.images.length;
    state.imageLibrary.truncated = Boolean(payload?.truncated);
    renderImageLibrary();
    return true;
  } catch (error) {
    if (token !== state.imageLibrary.requestToken || !els.imageLibraryDialog.open) return false;
    els.imageLibraryTotal.textContent = "Unavailable";
    setImageLibraryMessage(error.message, "error");
    return false;
  } finally {
    if (token === state.imageLibrary.requestToken) els.refreshImageLibrary.disabled = false;
  }
}

function showImageLibrary() {
  state.imageLibrary.query = "";
  els.imageLibrarySearch.value = "";
  if (!els.imageLibraryDialog.open) els.imageLibraryDialog.showModal();
  void loadImageLibrary();
}

function closeImageLibrary() {
  state.imageLibrary.requestToken += 1;
  if (els.imageLibraryDialog.open) els.imageLibraryDialog.close();
}

async function openImageLibraryRecord(image) {
  if (!image || !IMAGE_RECORD_ID_PATTERN.test(image.id) || !imageLibraryCanOpen(image)) return false;
  if (state.image?.id === image.id) return true;
  closeImageLibrary();
  if (image.demo) {
    await openDemo();
    return state.image?.id === image.id;
  }
  const operationToken = beginImageOperation();
  try {
    showProcessing({ filename: image.filename, status: "reopening" });
    const metadata = await responseJson(await fetch(`/api/images/${encodeURIComponent(image.id)}`, { cache: "no-store" }));
    ensureCurrentImageOperation(operationToken);
    const ready = await pollUntilReady(metadata, operationToken);
    ensureCurrentImageOperation(operationToken);
    await activateImage(ready);
    toast("Image opened", `${ready.filename} loaded from available images.`);
    return true;
  } catch (error) {
    if (imageOperationWasSuperseded(error, operationToken)) return false;
    hideProcessing();
    if (!state.image) els.empty.classList.remove("hidden");
    toast("Could not open image", error.message, "error", 7000);
    return false;
  }
}

async function deleteImageLibraryRecord(image, button) {
  if (!image || !IMAGE_RECORD_ID_PATTERN.test(image.id)) return false;
  const removeReason = imageLibraryDeleteReason(image);
  if (removeReason) {
    toast("Image cannot be removed", removeReason, "warning", 6000);
    return false;
  }
  const consequence = image.sourceKind === "mounted"
    ? "This removes only its NeuroScope registration and cached tiles. The mounted source file will stay untouched."
    : image.sourceKind === "upload"
      ? "This permanently removes the stored source and its generated tiles from NeuroScope."
      : "This removes the saved NeuroScope record and its generated tiles.";
  if (!window.confirm(`Remove “${image.filename}”?\n\n${consequence}`)) return false;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  const refillTruncatedCatalog = state.imageLibrary.truncated;
  try {
    await responseJson(await fetch(`/api/images/${encodeURIComponent(image.id)}`, { method: "DELETE" }));
    state.imageLibrary.images = state.imageLibrary.images.filter((candidate) => candidate.id !== image.id);
    state.imageLibrary.total = Math.max(0, state.imageLibrary.total - 1);
    renderImageLibrary();
    toast("Image removed", image.sourceKind === "mounted"
      ? `${image.filename} was unregistered; the mounted source file was not changed.`
      : image.filename);
    if (refillTruncatedCatalog && els.imageLibraryDialog.open) await loadImageLibrary();
    return true;
  } catch (error) {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    toast("Could not remove image", error.message, "error", 7000);
    return false;
  }
}

function serverPathKind(value) {
  const filename = String(value || "").trim().split("/").filter(Boolean).pop() || "";
  const extension = extensionOf(filename);
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (OVERLAY_EXTENSIONS.has(extension)) return "overlay";
  return null;
}

function validateServerPath(value) {
  const path = String(value || "").trim();
  if (!path) return { error: "Paste an absolute server file path." };
  if (!path.startsWith("/") || /[\0\r\n]/.test(path)) {
    return { error: "Enter an absolute path beginning with /, such as /nfs/data/section.jp2." };
  }
  const filename = path.split("/").filter(Boolean).pop() || "";
  const kind = serverPathKind(filename);
  if (!kind) {
    return { error: "The path must identify a JP2, TIF, TIFF, JSON, or SWC file." };
  }
  return { path, filename, kind };
}

function normalizeResolvedOverlayPath(payload = {}) {
  const mountId = String(payload?.mountId || "").trim();
  const relativePath = String(payload?.path || "");
  const name = String(payload?.name || "").trim();
  const type = String(payload?.type || "").toLowerCase();
  const kind = String(payload?.kind || "").toLowerCase();
  const sourceSize = payload?.size;
  const extension = extensionOf(name);
  const escapesRoot = relativePath.startsWith("/") || relativePath.split("/").includes("..");
  if (
    !/^[a-zA-Z0-9_-]{1,40}$/.test(mountId)
    || !relativePath
    || !name
    || type !== "file"
    || kind !== "overlay"
    || !OVERLAY_EXTENSIONS.has(extension)
    || typeof sourceSize !== "number"
    || !Number.isFinite(sourceSize)
    || sourceSize <= 0
    || escapesRoot
  ) {
    throw new Error("The server returned an invalid mounted overlay path.");
  }
  return {
    mountId,
    entry: {
      name,
      path: relativePath,
      type,
      size: sourceSize,
      modifiedAt: payload?.modifiedAt ? String(payload.modifiedAt) : null,
      format: String(payload?.format || extension).toUpperCase(),
      kind,
    },
  };
}

function setServerPathStatus(message = "", kind = "") {
  els.serverPathStatus.textContent = message;
  els.serverPathStatus.className = `server-path-status${kind ? ` ${kind}` : ""}`;
  els.serverPathInput.setAttribute("aria-invalid", String(kind === "error"));
}

function updateServerPathSubmit() {
  const busy = els.serverPathSubmit.getAttribute("aria-busy") === "true";
  const value = els.serverPathInput.value.trim();
  const kind = serverPathKind(value);
  els.serverPathSubmitLabel.textContent = kind === "overlay" ? "Add overlay" : kind === "image" ? "Open image" : "Open path";
  els.serverPathHelp.textContent = kind === "overlay"
    ? state.image
      ? "Add this server JSON or SWC as an overlay. The source stays in place and is not uploaded or copied."
      : "Open a base image first, then add this server JSON or SWC. The source will stay in place."
    : kind === "image"
      ? "Open this server JP2 or TIFF in place. The source is not uploaded or copied."
      : "Use an absolute JP2, TIFF, JSON, or SWC path inside a configured server location. Nothing is uploaded or copied.";
  els.serverPathSubmit.disabled = busy || !value;
}

function showServerPathDialog() {
  setServerPathStatus();
  updateServerPathSubmit();
  if (!els.serverPathDialog.open) els.serverPathDialog.showModal();
  els.serverPathInput.focus();
}

function invalidateServerPathRequest() {
  state.serverPathRequestToken += 1;
  els.serverPathSubmit.removeAttribute("aria-busy");
  updateServerPathSubmit();
}

function closeServerPathDialog() {
  invalidateServerPathRequest();
  if (els.serverPathDialog.open) els.serverPathDialog.close();
}

async function registerAndOpenServerImage({ url, body, filename, errorTitle, onError = null }) {
  const operationToken = beginImageOperation();
  try {
    setImageUrl(null);
    showProcessing({
      filename,
      progress: 100,
      status: "registering",
      message: "Connecting this server image directly to the tile service. The source stays in place and is not uploaded or copied.",
    });
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const registered = await responseJson(response);
    ensureCurrentImageOperation(operationToken);
    setImageUrl(registered.id);
    const ready = await pollUntilReady(registered, operationToken);
    ensureCurrentImageOperation(operationToken);
    await activateImage(ready);
    toast("Server image ready", `${ready.filename} opened in place without an upload.`);
    return true;
  } catch (error) {
    if (imageOperationWasSuperseded(error, operationToken)) return false;
    hideProcessing();
    if (!state.image) els.empty.classList.remove("hidden");
    if (typeof onError === "function") onError(error);
    toast(errorTitle, error.message, "error", 7000);
    return false;
  }
}

async function openServerPath(value = els.serverPathInput.value, jsonFeatureLimit = MAX_FEATURES) {
  if (els.serverPathSubmit.getAttribute("aria-busy") === "true") return false;
  const candidate = validateServerPath(value);
  if (candidate.error) {
    setServerPathStatus(candidate.error, "error");
    updateServerPathSubmit();
    els.serverPathInput.focus();
    return false;
  }
  if (candidate.kind === "overlay" && !state.image) {
    setServerPathStatus("Open a base image before adding a scientific overlay.", "error");
    updateServerPathSubmit();
    els.serverPathInput.focus();
    return false;
  }

  const pathRequestToken = ++state.serverPathRequestToken;
  els.serverPathSubmit.setAttribute("aria-busy", "true");
  updateServerPathSubmit();
  setServerPathStatus(candidate.kind === "overlay" ? "Checking this server overlay path…" : "Opening this image in place…", "loading");
  try {
    let opened = false;
    const restoreError = (error) => {
      if (els.serverPathInput.value.trim() !== candidate.path) return;
      if (!els.serverPathDialog.open) els.serverPathDialog.showModal();
      setServerPathStatus(error.message, "error");
      els.serverPathInput.focus();
    };
    if (candidate.kind === "image") {
      closeServerPathDialog();
      opened = await registerAndOpenServerImage({
        url: "/api/mounts/register-path",
        body: { path: candidate.path },
        filename: candidate.filename,
        errorTitle: "Could not open server path",
        onError: restoreError,
      });
    } else {
      const operationToken = beginOverlayOperation();
      try {
        const response = await fetch("/api/mounts/resolve-overlay-path", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: candidate.path }),
        });
        const descriptor = await responseJson(response);
        if (
          pathRequestToken !== state.serverPathRequestToken
          || !overlayOperationIsCurrent(operationToken)
        ) throw supersededOverlayOperationError();
        const resolved = normalizeResolvedOverlayPath(descriptor);
        closeServerPathDialog();
        opened = await openResolvedServerOverlay(
          resolved.entry,
          resolved.mountId,
          jsonFeatureLimit,
          operationToken,
          restoreError,
        );
      } catch (error) {
        if (
          error?.code === "OVERLAY_OPERATION_SUPERSEDED"
          || pathRequestToken !== state.serverPathRequestToken
          || !overlayOperationIsCurrent(operationToken)
        ) return false;
        restoreError(error);
        toast("Could not open server overlay path", error.message, "error", 7000);
      }
    }
    if (opened && els.serverPathInput.value.trim() === candidate.path) {
      els.serverPathInput.value = "";
      setServerPathStatus();
      updateServerPathSubmit();
    }
    return opened;
  } finally {
    if (pathRequestToken === state.serverPathRequestToken) {
      els.serverPathSubmit.removeAttribute("aria-busy");
      updateServerPathSubmit();
    }
  }
}

async function openResolvedServerOverlay(
  selected,
  mountId,
  jsonFeatureLimit = MAX_FEATURES,
  operationToken = beginOverlayOperation(),
  onError = null,
) {
    let indexedAttempt = shouldUseIndexedJson(selected.name, selected.size);
    const registerIndexed = async (message) => {
      showOverlayProcessing({
        filename: selected.name,
        progress: 100,
        status: "overlay-indexing",
        mounted: true,
        message,
      }, operationToken);
      const response = await fetch(`/api/mounts/${encodeURIComponent(mountId)}/register-overlay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selected.path }),
      });
      const metadata = await responseJson(response);
      if (!overlayOperationIsCurrent(operationToken)) throw supersededOverlayOperationError();
      addIndexedJsonLayer(metadata);
      hideOverlayProcessing(operationToken);
    };
    try {
      if (indexedAttempt) {
        await registerIndexed("Indexing this mounted GeoJSON in place. The source stays on the server and is not downloaded to your browser.");
        return true;
      }
      const url = `/api/mounts/${encodeURIComponent(mountId)}/file?path=${encodeURIComponent(selected.path)}`;
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) await responseJson(response);
      const content = await response.text();
      if (!overlayOperationIsCurrent(operationToken)) throw supersededOverlayOperationError();
      if (extensionOf(selected.name) === "swc") addSwcLayer(selected.name, content);
      else {
        try {
          addJsonLayer(selected.name, content, true, jsonFeatureLimit);
        } catch (error) {
          if (error?.code !== "JSON_FEATURE_LIMIT") throw error;
          indexedAttempt = true;
          await registerIndexed("This valid JSON exceeds the browser feature budget. Building a spatial index from the mounted source instead.");
        }
      }
      return true;
    } catch (error) {
      if (error?.code === "OVERLAY_OPERATION_SUPERSEDED" || !overlayOperationIsCurrent(operationToken)) return false;
      hideOverlayProcessing(operationToken);
      if (typeof onError === "function") onError(error);
      toast(
        `Could not load ${selected.name}`,
        indexedAttempt ? indexedOverlayFailureMessage(error) : error.message,
        "error",
        9000,
      );
      return false;
    }
}

async function openDemo() {
  const operationToken = beginImageOperation();
  try {
    showProcessing({ filename: "Synthetic neural section", progress: 3, status: "queued" });
    const queued = await responseJson(await fetch("/api/demo", { method: "POST" }));
    ensureCurrentImageOperation(operationToken);
    const ready = await pollUntilReady(queued, operationToken);
    ensureCurrentImageOperation(operationToken);
    await activateImage(ready);
    await addDemoOverlays(operationToken);
    ensureCurrentImageOperation(operationToken);
    selectLayer("base");
    toast("Demo loaded", "Pan, zoom, and inspect the two aligned scientific overlays.");
  } catch (error) {
    if (imageOperationWasSuperseded(error, operationToken)) return;
    hideProcessing();
    if (!state.image) els.empty.classList.remove("hidden");
    toast("Demo unavailable", error.message, "error", 7000);
  }
}

async function activateImage(metadata) {
  state.layers.forEach(disposeIndexedLayer);
  state.image = metadata;
  setImageUrl(metadata.id);
  state.tileCache.clear();
  state.overview = null;
  state.overviewLoading = false;
  state.layers = [{
    id: "base",
    kind: "base",
    name: metadata.filename,
    visible: true,
    opacity: 1,
    color: "#91aab8",
    size: 1,
  }];
  state.selectedLayerId = "base";
  els.empty.classList.add("hidden");
  hideProcessing();
  els.shell.classList.add("has-image");
  [els.zoomIn, els.zoomOut, els.fit, els.reset].forEach((button) => { button.disabled = false; });
  els.workspaceTitle.textContent = fileStem(metadata.filename);
  els.statusFormat.textContent = metadata.format;
  els.statusDimensions.textContent = `${formatNumber(metadata.width)} × ${formatNumber(metadata.height)}`;
  els.resolutionChip.classList.remove("hidden");
  els.scaleBar.classList.remove("hidden");
  els.minimap.classList.remove("hidden");
  renderLayerList();
  updateInspector();
  resizeCanvas();
  fitImage();
  loadOverview();
}

async function addDemoOverlays(operationToken = state.imageOperationToken) {
  const [swcText, jsonText] = await Promise.all([
    fetch("/demo.swc").then((response) => response.text()),
    fetch("/demo-points.json").then((response) => response.text()),
  ]);
  ensureCurrentImageOperation(operationToken);
  addSwcLayer("demo_neuron.swc", swcText, false);
  addJsonLayer("cell_detections.json", jsonText, false);
}

function resizeCanvas() {
  const rect = els.shell.getBoundingClientRect();
  state.viewportWidth = Math.max(1, rect.width);
  state.viewportHeight = Math.max(1, rect.height);
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.round(state.viewportWidth * state.dpr);
  const height = Math.round(state.viewportHeight * state.dpr);
  if (els.canvas.width !== width || els.canvas.height !== height) {
    els.canvas.width = width;
    els.canvas.height = height;
  }
  scheduleRender();
}

function fitImage() {
  if (!state.image) return;
  const margin = Math.min(64, state.viewportWidth * 0.08, state.viewportHeight * 0.08);
  const availableWidth = Math.max(50, state.viewportWidth - margin * 2);
  const availableHeight = Math.max(50, state.viewportHeight - margin * 2);
  state.fitScale = Math.min(availableWidth / state.image.width, availableHeight / state.image.height);
  state.view.scale = state.fitScale;
  state.view.x = (state.viewportWidth - state.image.width * state.view.scale) / 2;
  state.view.y = (state.viewportHeight - state.image.height * state.view.scale) / 2;
  scheduleRender();
}

function resetActualSize() {
  if (!state.image) return;
  const centre = screenToImage(state.viewportWidth / 2, state.viewportHeight / 2);
  state.view.scale = 1;
  state.view.x = state.viewportWidth / 2 - centre.x;
  state.view.y = state.viewportHeight / 2 - centre.y;
  constrainView();
  scheduleRender();
}

function zoomAt(factor, screenX = state.viewportWidth / 2, screenY = state.viewportHeight / 2) {
  if (!state.image) return;
  const before = screenToImage(screenX, screenY);
  const minScale = Math.max(0.000001, state.fitScale * 0.18);
  const next = Math.max(minScale, Math.min(32, state.view.scale * factor));
  state.view.scale = next;
  state.view.x = screenX - before.x * next;
  state.view.y = screenY - before.y * next;
  constrainView();
  scheduleRender();
}

function constrainView() {
  if (!state.image) return;
  const width = state.image.width * state.view.scale;
  const height = state.image.height * state.view.scale;
  const keep = 48;
  if (width <= state.viewportWidth - keep * 2) state.view.x = (state.viewportWidth - width) / 2;
  else state.view.x = Math.min(keep, Math.max(state.viewportWidth - width - keep, state.view.x));
  if (height <= state.viewportHeight - keep * 2) state.view.y = (state.viewportHeight - height) / 2;
  else state.view.y = Math.min(keep, Math.max(state.viewportHeight - height - keep, state.view.y));
}

function screenToImage(x, y) {
  return {
    x: (x - state.view.x) / state.view.scale,
    y: (y - state.view.y) / state.view.scale,
  };
}

function imageToScreen(x, y) {
  return {
    x: state.view.x + x * state.view.scale,
    y: state.view.y + y * state.view.scale,
  };
}

function deepZoomLevel() {
  if (!state.image) return 0;
  const ideal = state.image.maxLevel + Math.log2(Math.max(1e-8, state.view.scale * state.dpr));
  return Math.max(0, Math.min(state.image.maxLevel, Math.round(ideal)));
}

function levelDimensions(level, image = state.image) {
  const levelScale = 2 ** (level - image.maxLevel);
  const roundDimension = image.tileBackend === "iip" ? Math.floor : Math.ceil;
  return {
    scale: levelScale,
    width: Math.max(1, roundDimension(image.width * levelScale)),
    height: Math.max(1, roundDimension(image.height * levelScale)),
  };
}

function tileDimensions(image = state.image) {
  const fallback = Number(image?.tileSize);
  const safeFallback = Number.isFinite(fallback) && fallback > 0 ? fallback : 256;
  const width = Number(image?.tileWidth);
  const height = Number(image?.tileHeight);
  return {
    width: Number.isFinite(width) && width > 0 ? width : safeFallback,
    height: Number.isFinite(height) && height > 0 ? height : safeFallback,
  };
}

function tileRetryDelay(retryNumber) {
  const exponent = Math.max(0, Number(retryNumber) - 1);
  return Math.min(TILE_RETRY_MAX_MS, TILE_RETRY_BASE_MS * (2 ** exponent));
}

function tileUrl(level, x, y) {
  return `/api/images/${encodeURIComponent(state.image.id)}/tiles/${level}/${x}_${y}.${state.image.tileFormat}`;
}

function requestTile(level, x, y) {
  const key = `${state.image.id}:${level}:${x}:${y}`;
  let entry = state.tileCache.get(key);
  if (entry?.status === "error" && Date.now() >= entry.retryAfter) {
    state.tileCache.delete(key);
    entry = null;
  }
  if (entry) {
    entry.lastUsed = state.tileFrame;
    return entry;
  }
  const url = tileUrl(level, x, y);
  entry = {
    image: null,
    status: "loading",
    lastUsed: state.tileFrame,
    attempts: 0,
    retryAfter: 0,
    retryTimer: null,
  };
  state.tileCache.set(key, entry);
  const load = () => {
    if (state.tileCache.get(key) !== entry) return;
    const image = new Image();
    entry.image = image;
    entry.status = "loading";
    entry.attempts += 1;
    entry.retryTimer = null;
    image.decoding = "async";
    image.onload = () => {
      if (state.tileCache.get(key) !== entry || entry.image !== image) return;
      entry.status = "ready";
      scheduleRender();
    };
    image.onerror = () => {
      if (state.tileCache.get(key) !== entry || entry.image !== image) return;
      const retriesUsed = entry.attempts - 1;
      if (retriesUsed < TILE_RETRY_LIMIT) {
        entry.status = "retrying";
        entry.retryTimer = window.setTimeout(load, tileRetryDelay(entry.attempts));
      } else {
        entry.status = "error";
        entry.retryAfter = Date.now() + TILE_ERROR_COOLDOWN_MS;
      }
      scheduleRender();
    };
    image.src = url;
  };
  load();
  return entry;
}

function pruneTileCache() {
  if (state.tileCache.size <= 420) return;
  const candidates = [...state.tileCache.entries()]
    .filter(([, entry]) => entry.lastUsed < state.tileFrame - 2)
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  for (const [key] of candidates.slice(0, state.tileCache.size - 340)) state.tileCache.delete(key);
}

function scheduleRender() {
  if (state.renderQueued) return;
  state.renderQueued = true;
  requestAnimationFrame(() => {
    state.renderQueued = false;
    render();
  });
}

function render() {
  const { viewportWidth: width, viewportHeight: height, dpr } = state;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#060b11";
  ctx.fillRect(0, 0, width, height);
  if (!state.image) return;

  state.tileFrame += 1;
  const imageWidth = state.image.width * state.view.scale;
  const imageHeight = state.image.height * state.view.scale;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.65)";
  ctx.shadowBlur = 25;
  ctx.fillStyle = "#03070a";
  ctx.fillRect(state.view.x, state.view.y, imageWidth, imageHeight);
  ctx.restore();

  const base = state.layers.find((layer) => layer.kind === "base");
  if (base?.visible) {
    ctx.save();
    ctx.globalAlpha = base.opacity;
    if (state.overview) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(state.overview, state.view.x, state.view.y, imageWidth, imageHeight);
    }
    drawVisibleTiles();
    ctx.restore();
  } else {
    state.tileStats = { requested: 0, loaded: 0 };
  }

  renderOverlays();
  ctx.strokeStyle = "rgba(137, 165, 179, .18)";
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(state.view.x) + 0.5, Math.round(state.view.y) + 0.5, Math.round(imageWidth), Math.round(imageHeight));
  updateViewportUi();
  drawMinimap();
  pruneTileCache();
}

function drawVisibleTiles() {
  const level = deepZoomLevel();
  const dims = levelDimensions(level);
  const tiles = tileDimensions();
  const topLeft = screenToImage(0, 0);
  const bottomRight = screenToImage(state.viewportWidth, state.viewportHeight);
  const minX = Math.max(0, Math.min(state.image.width, topLeft.x));
  const minY = Math.max(0, Math.min(state.image.height, topLeft.y));
  const maxX = Math.max(0, Math.min(state.image.width, bottomRight.x));
  const maxY = Math.max(0, Math.min(state.image.height, bottomRight.y));
  const xStart = Math.max(0, Math.floor((minX * dims.scale) / tiles.width));
  const yStart = Math.max(0, Math.floor((minY * dims.scale) / tiles.height));
  const xEnd = Math.min(Math.ceil(dims.width / tiles.width) - 1, Math.floor((maxX * dims.scale) / tiles.width));
  const yEnd = Math.min(Math.ceil(dims.height / tiles.height) - 1, Math.floor((maxY * dims.scale) / tiles.height));
  let requested = 0;
  let loaded = 0;
  for (let y = yStart; y <= yEnd; y += 1) {
    for (let x = xStart; x <= xEnd; x += 1) {
      requested += 1;
      const entry = requestTile(level, x, y);
      if (entry.status !== "ready") continue;
      loaded += 1;
      const levelX = x * tiles.width;
      const levelY = y * tiles.height;
      const sourceWidth = Math.min(tiles.width, dims.width - levelX);
      const sourceHeight = Math.min(tiles.height, dims.height - levelY);
      const imageX = levelX / dims.scale;
      const imageY = levelY / dims.scale;
      const destination = imageToScreen(imageX, imageY);
      const destinationWidth = (sourceWidth / dims.scale) * state.view.scale;
      const destinationHeight = (sourceHeight / dims.scale) * state.view.scale;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(entry.image, destination.x, destination.y, destinationWidth + 0.35, destinationHeight + 0.35);
      if (state.showTileGrid) {
        ctx.strokeStyle = "rgba(85, 226, 214, .38)";
        ctx.lineWidth = 0.75;
        ctx.strokeRect(destination.x + 0.5, destination.y + 0.5, destinationWidth - 1, destinationHeight - 1);
      }
    }
  }
  state.tileStats = { requested, loaded };
}

function loadOverview() {
  if (!state.image || state.overviewLoading) return;
  state.overviewLoading = true;
  let level = state.image.maxLevel;
  while (level > 0) {
    const dims = levelDimensions(level);
    if (dims.width <= 1000 && dims.height <= 700) break;
    level -= 1;
  }
  state.overviewLevel = level;
  const dims = levelDimensions(level);
  const overview = document.createElement("canvas");
  overview.width = dims.width;
  overview.height = dims.height;
  const overviewCtx = overview.getContext("2d");
  const tiles = tileDimensions();
  const sourceImageId = state.image.id;
  const columns = Math.ceil(dims.width / tiles.width);
  const rows = Math.ceil(dims.height / tiles.height);
  let remaining = columns * rows;
  let loaded = 0;
  const loadOverviewTile = (x, y, retryNumber = 0) => {
    if (state.image?.id !== sourceImageId) return;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (state.image?.id !== sourceImageId) return;
      overviewCtx.drawImage(image, x * tiles.width, y * tiles.height);
      loaded += 1;
      remaining -= 1;
      if (loaded > 0) {
        state.overview = overview;
        scheduleRender();
      }
      if (remaining === 0) state.overviewLoading = false;
    };
    image.onerror = () => {
      if (state.image?.id !== sourceImageId) return;
      if (retryNumber < TILE_RETRY_LIMIT) {
        window.setTimeout(() => loadOverviewTile(x, y, retryNumber + 1), tileRetryDelay(retryNumber + 1));
      } else {
        remaining -= 1;
        if (remaining === 0) state.overviewLoading = false;
      }
    };
    image.src = tileUrl(level, x, y);
  };
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      loadOverviewTile(x, y);
    }
  }
}

function transformedPoint(layer, x, y) {
  return {
    x: x + layer.offsetX,
    y: (layer.flipY ? state.image.height - y : y) + layer.offsetY,
  };
}

function inverseOverlayBounds(layer, bounds, imageHeight = state.image?.height) {
  const sourceX1 = Number(bounds.minX) - layer.offsetX;
  const sourceX2 = Number(bounds.maxX) - layer.offsetX;
  const displayY1 = Number(bounds.minY) - layer.offsetY;
  const displayY2 = Number(bounds.maxY) - layer.offsetY;
  const sourceY1 = layer.flipY ? Number(imageHeight) - displayY1 : displayY1;
  const sourceY2 = layer.flipY ? Number(imageHeight) - displayY2 : displayY2;
  return {
    minX: Math.min(sourceX1, sourceX2),
    minY: Math.min(sourceY1, sourceY2),
    maxX: Math.max(sourceX1, sourceX2),
    maxY: Math.max(sourceY1, sourceY2),
  };
}

function indexedViewportBounds(layer) {
  const padding = 96;
  const topLeft = screenToImage(-padding, -padding);
  const bottomRight = screenToImage(state.viewportWidth + padding, state.viewportHeight + padding);
  return inverseOverlayBounds(layer, {
    minX: Math.min(topLeft.x, bottomRight.x),
    minY: Math.min(topLeft.y, bottomRight.y),
    maxX: Math.max(topLeft.x, bottomRight.x),
    maxY: Math.max(topLeft.y, bottomRight.y),
  });
}

function normalizeIndexedSegments(values, maxSegments = INDEXED_GEOMETRY_MAX_SEGMENTS) {
  if (!Array.isArray(values) && !ArrayBuffer.isView(values)) return new Float32Array(0);
  const limit = Math.max(0, Math.min(Math.floor(values.length / 4), Math.floor(maxSegments)));
  const output = new Float32Array(limit * 4);
  let count = 0;
  for (let index = 0; index < limit * 4; index += 4) {
    const x1 = Number(values[index]);
    const y1 = Number(values[index + 1]);
    const x2 = Number(values[index + 2]);
    const y2 = Number(values[index + 3]);
    if (![x1, y1, x2, y2].every(Number.isFinite)) continue;
    output[count * 4] = x1;
    output[count * 4 + 1] = y1;
    output[count * 4 + 2] = x2;
    output[count * 4 + 3] = y2;
    count += 1;
  }
  return count === limit ? output : output.slice(0, count * 4);
}

function indexedGeometryRequestKey(layer, bounds) {
  const coordinates = [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY]
    .map((value) => Number(value).toFixed(3));
  return [layer.offsetX, layer.offsetY, layer.flipY ? 1 : 0, ...coordinates].join(":");
}

function acceptIndexedGeometry(layer, payload, requestToken, requestKey) {
  if (layer.geometryDisposed || requestToken !== layer.geometryRequestToken || requestKey !== layer.geometryRequestKey) return false;
  const segments = normalizeIndexedSegments(payload?.segments);
  layer.geometrySegments = segments;
  layer.visibleSegmentCount = segments.length / 4;
  layer.matchingFeatureCount = Number.isFinite(Number(payload?.matchingFeatureCount))
    ? Number(payload.matchingFeatureCount)
    : null;
  layer.matchingPrimitiveCount = Number.isFinite(Number(payload?.matchingPrimitiveCount))
    ? Number(payload.matchingPrimitiveCount)
    : null;
  layer.geometryApproximate = Boolean(payload?.approximate)
    || Number(payload?.segmentCount) > layer.visibleSegmentCount;
  if (layer.geometryRetryTimer !== null && layer.geometryRetryTimer !== undefined) {
    window.clearTimeout(layer.geometryRetryTimer);
  }
  layer.geometryRetryTimer = null;
  layer.geometryRetryCount = 0;
  layer.geometryLoading = false;
  layer.geometryError = null;
  return true;
}

async function fetchIndexedGeometry(layer, bounds, requestToken, requestKey) {
  const params = new URLSearchParams({
    minX: String(bounds.minX),
    minY: String(bounds.minY),
    maxX: String(bounds.maxX),
    maxY: String(bounds.maxY),
    maxSegments: String(INDEXED_GEOMETRY_MAX_SEGMENTS),
  });
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  layer.geometryAbortController = controller;
  try {
    const response = await fetch(`/api/overlays/${encodeURIComponent(layer.overlayId)}/geometry?${params}`, {
      cache: "no-store",
      ...(controller ? { signal: controller.signal } : {}),
    });
    const payload = await responseJson(response);
    if (!state.layers.includes(layer)) return;
    if (!acceptIndexedGeometry(layer, payload, requestToken, requestKey)) return;
    if (state.selectedLayerId === layer.id) updateInspector();
    scheduleRender();
  } catch (error) {
    if (error?.name === "AbortError" || layer.geometryDisposed
      || requestToken !== layer.geometryRequestToken
      || requestKey !== layer.geometryRequestKey
      || !state.layers.includes(layer)) return;
    const retriesUsed = Number(layer.geometryRetryCount) || 0;
    if (retriesUsed < INDEXED_GEOMETRY_RETRY_DELAYS.length) {
      const delay = INDEXED_GEOMETRY_RETRY_DELAYS[retriesUsed];
      layer.geometryRetryCount = retriesUsed + 1;
      layer.geometryLoading = true;
      layer.geometryError = null;
      if (layer.geometryRetryTimer !== null) window.clearTimeout(layer.geometryRetryTimer);
      layer.geometryRetryTimer = window.setTimeout(() => {
        layer.geometryRetryTimer = null;
        if (layer.geometryDisposed
          || requestToken !== layer.geometryRequestToken
          || requestKey !== layer.geometryRequestKey
          || !state.layers.includes(layer)) return;
        if (!layer.visible) {
          layer.geometryRequestKey = null;
          layer.geometryRetryCount = 0;
          layer.geometryLoading = false;
          if (state.selectedLayerId === layer.id) updateInspector();
          return;
        }
        void fetchIndexedGeometry(layer, bounds, requestToken, requestKey);
      }, delay);
      if (state.selectedLayerId === layer.id) updateInspector();
      return;
    }
    layer.geometryLoading = false;
    layer.geometryError = error.message;
    if (state.selectedLayerId === layer.id) updateInspector();
    toast(`Could not load ${layer.name}`, `Visible overlay geometry failed: ${error.message}`, "error", 7000);
  } finally {
    if (layer.geometryAbortController === controller) layer.geometryAbortController = null;
  }
}

function queueIndexedGeometry(layer, immediate = false) {
  if (!state.image || !layer.visible || layer.geometryDisposed) return;
  const bounds = indexedViewportBounds(layer);
  const requestKey = indexedGeometryRequestKey(layer, bounds);
  if (requestKey === layer.geometryRequestKey) return;
  layer.geometryRequestKey = requestKey;
  layer.geometryRequestToken += 1;
  const requestToken = layer.geometryRequestToken;
  if (layer.geometryTimer !== null) window.clearTimeout(layer.geometryTimer);
  layer.geometryTimer = null;
  if (layer.geometryRetryTimer !== null) window.clearTimeout(layer.geometryRetryTimer);
  layer.geometryRetryTimer = null;
  layer.geometryRetryCount = 0;
  layer.geometryAbortController?.abort();
  layer.geometryLoading = true;
  layer.geometryError = null;
  if (state.selectedLayerId === layer.id) updateInspector();
  const run = () => {
    layer.geometryTimer = null;
    void fetchIndexedGeometry(layer, bounds, requestToken, requestKey);
  };
  if (immediate) run();
  else layer.geometryTimer = window.setTimeout(run, INDEXED_GEOMETRY_DEBOUNCE_MS);
}

function disposeIndexedLayer(layer) {
  if (!layer?.indexed) return;
  layer.geometryDisposed = true;
  layer.geometryRequestToken += 1;
  if (layer.geometryTimer !== null) window.clearTimeout(layer.geometryTimer);
  layer.geometryTimer = null;
  if (layer.geometryRetryTimer !== null) window.clearTimeout(layer.geometryRetryTimer);
  layer.geometryRetryTimer = null;
  layer.geometryAbortController?.abort();
  layer.geometryAbortController = null;
}

function renderOverlays() {
  for (const layer of state.layers) {
    if (!layer.visible || layer.kind === "base") continue;
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.strokeStyle = layer.color;
    ctx.fillStyle = layer.color;
    ctx.lineWidth = layer.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (layer.kind === "swc") renderSwc(layer);
    else if (layer.kind === "json") renderJson(layer);
    ctx.restore();
  }
}

function renderSwc(layer) {
  ctx.beginPath();
  for (const node of layer.nodes) {
    if (node.parent < 0) continue;
    const parent = layer.nodeMap.get(node.parent);
    if (!parent) continue;
    const startImage = transformedPoint(layer, parent.x, parent.y);
    const endImage = transformedPoint(layer, node.x, node.y);
    const start = imageToScreen(startImage.x, startImage.y);
    const end = imageToScreen(endImage.x, endImage.y);
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
  }
  ctx.stroke();
  const step = layer.nodes.length > 80_000 ? Math.ceil(layer.nodes.length / 80_000) : 1;
  const radius = Math.max(1.3, layer.size * 0.65);
  ctx.beginPath();
  for (let index = 0; index < layer.nodes.length; index += step) {
    const node = layer.nodes[index];
    const pointImage = transformedPoint(layer, node.x, node.y);
    const point = imageToScreen(pointImage.x, pointImage.y);
    if (point.x < -10 || point.y < -10 || point.x > state.viewportWidth + 10 || point.y > state.viewportHeight + 10) continue;
    ctx.moveTo(point.x + radius, point.y);
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  }
  ctx.fill();
}

function renderJson(layer) {
  if (layer.indexed) {
    queueIndexedGeometry(layer);
    const segments = layer.geometrySegments;
    if (!segments?.length) return;
    const scale = state.view.scale;
    const screenX = (x) => state.view.x + (x + layer.offsetX) * scale;
    const screenY = (y) => state.view.y + ((layer.flipY ? state.image.height - y : y) + layer.offsetY) * scale;
    ctx.beginPath();
    for (let index = 0; index < segments.length; index += 4) {
      if (segments[index] === segments[index + 2] && segments[index + 1] === segments[index + 3]) continue;
      const x1 = screenX(segments[index]);
      const y1 = screenY(segments[index + 1]);
      const x2 = screenX(segments[index + 2]);
      const y2 = screenY(segments[index + 3]);
      if ((x1 < -8 && x2 < -8) || (y1 < -8 && y2 < -8)
        || (x1 > state.viewportWidth + 8 && x2 > state.viewportWidth + 8)
        || (y1 > state.viewportHeight + 8 && y2 > state.viewportHeight + 8)) continue;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
    const radius = Math.max(1.2, layer.size * 0.7);
    ctx.beginPath();
    for (let index = 0; index < segments.length; index += 4) {
      if (segments[index] !== segments[index + 2] || segments[index + 1] !== segments[index + 3]) continue;
      const x = screenX(segments[index]);
      const y = screenY(segments[index + 1]);
      if (x < -radius || y < -radius || x > state.viewportWidth + radius || y > state.viewportHeight + radius) continue;
      ctx.moveTo(x + radius, y);
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
    ctx.fill();
    return;
  }
  for (const polygon of layer.polygons) {
    if (!polygon.coordinates.length) continue;
    ctx.beginPath();
    polygon.coordinates.forEach(([x, y], index) => {
      const imagePoint = transformedPoint(layer, x, y);
      const point = imageToScreen(imagePoint.x, imagePoint.y);
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.globalAlpha = layer.opacity * 0.16;
    ctx.fill();
    ctx.globalAlpha = layer.opacity;
    ctx.stroke();
  }
  if (layer.lines.length) {
    ctx.beginPath();
    for (const line of layer.lines) {
      line.coordinates.forEach(([x, y], index) => {
        const imagePoint = transformedPoint(layer, x, y);
        const point = imageToScreen(imagePoint.x, imagePoint.y);
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
    }
    ctx.stroke();
  }
  const step = layer.points.length > 120_000 ? Math.ceil(layer.points.length / 120_000) : 1;
  const radius = Math.max(1.4, layer.size);
  ctx.beginPath();
  for (let index = 0; index < layer.points.length; index += step) {
    const feature = layer.points[index];
    const imagePoint = transformedPoint(layer, feature.x, feature.y);
    const point = imageToScreen(imagePoint.x, imagePoint.y);
    if (point.x < -radius || point.y < -radius || point.x > state.viewportWidth + radius || point.y > state.viewportHeight + radius) continue;
    ctx.moveTo(point.x + radius, point.y);
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  }
  ctx.fill();
}

function updateViewportUi() {
  const zoom = state.view.scale * 100;
  const zoomLabel = zoom < 0.1 ? `${zoom.toFixed(2)}%` : zoom < 10 ? `${zoom.toFixed(1)}%` : `${Math.round(zoom)}%`;
  els.toolbarZoom.textContent = zoomLabel;
  els.statusZoom.textContent = zoomLabel;
  const level = deepZoomLevel();
  els.resolutionLabel.textContent = `Pyramid level ${level} / ${state.image.maxLevel}`;
  const nicePixels = niceScaleDistance(105 / state.view.scale);
  const barWidth = Math.max(44, nicePixels * state.view.scale);
  els.scaleBar.style.width = `${barWidth}px`;
  els.scaleLabel.textContent = `${formatNumber(nicePixels)} px`;
  const { requested, loaded } = state.tileStats;
  els.tileStatus.classList.toggle("loading", requested > loaded);
  if (requested === 0) els.tileStatus.lastChild.textContent = "Base layer hidden";
  else if (loaded < requested) els.tileStatus.lastChild.textContent = `Loading tiles ${loaded}/${requested}`;
  else els.tileStatus.lastChild.textContent = `${loaded} visible tile${loaded === 1 ? "" : "s"} · cached`;
}

function niceScaleDistance(target) {
  if (!Number.isFinite(target) || target <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(target));
  const fraction = target / exponent;
  const nice = fraction < 1.5 ? 1 : fraction < 3.5 ? 2 : fraction < 7.5 ? 5 : 10;
  return nice * exponent;
}

function drawMinimap() {
  if (!state.image || els.minimap.classList.contains("hidden")) return;
  const width = els.minimapCanvas.width;
  const height = els.minimapCanvas.height;
  miniCtx.clearRect(0, 0, width, height);
  miniCtx.fillStyle = "#050a0f";
  miniCtx.fillRect(0, 0, width, height);
  const scale = Math.min((width - 10) / state.image.width, (height - 10) / state.image.height);
  const drawWidth = state.image.width * scale;
  const drawHeight = state.image.height * scale;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;
  if (state.overview) miniCtx.drawImage(state.overview, x, y, drawWidth, drawHeight);
  else {
    miniCtx.fillStyle = "#13232d";
    miniCtx.fillRect(x, y, drawWidth, drawHeight);
  }
  const topLeft = screenToImage(0, 0);
  const bottomRight = screenToImage(state.viewportWidth, state.viewportHeight);
  const viewX = x + Math.max(0, topLeft.x) * scale;
  const viewY = y + Math.max(0, topLeft.y) * scale;
  const viewWidth = Math.max(4, (Math.min(state.image.width, bottomRight.x) - Math.max(0, topLeft.x)) * scale);
  const viewHeight = Math.max(4, (Math.min(state.image.height, bottomRight.y) - Math.max(0, topLeft.y)) * scale);
  miniCtx.fillStyle = "rgba(56, 209, 196, .08)";
  miniCtx.strokeStyle = "rgba(91, 232, 219, .9)";
  miniCtx.lineWidth = 1;
  miniCtx.fillRect(viewX, viewY, viewWidth, viewHeight);
  miniCtx.strokeRect(viewX + 0.5, viewY + 0.5, viewWidth - 1, viewHeight - 1);
  state.minimapTransform = { x, y, scale };
}

function parseSwc(text) {
  const nodes = [];
  let offset = [0, 0, 0];
  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      const match = line.match(/^#\s*OFFSET\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/i);
      if (match) offset = match.slice(1).map(Number);
      continue;
    }
    const fields = line.split(/\s+/);
    if (fields.length < 7) throw new Error(`Invalid SWC record on line ${index + 1}. Expected 7 fields.`);
    const values = fields.slice(0, 7).map(Number);
    if (!values.every(Number.isFinite)) throw new Error(`Invalid numeric value on SWC line ${index + 1}.`);
    const [id, type, x, y, z, radius, parent] = values;
    nodes.push({ id, type, x: x + offset[0], y: y + offset[1], z: z + offset[2], radius, parent });
    if (nodes.length > MAX_FEATURES) throw new Error(`SWC exceeds the ${formatNumber(MAX_FEATURES)} node safety limit.`);
  }
  if (!nodes.length) throw new Error("The SWC file contains no skeleton nodes.");
  const nodeMap = new Map();
  for (const node of nodes) {
    if (nodeMap.has(node.id)) throw new Error(`SWC node id ${node.id} is duplicated.`);
    nodeMap.set(node.id, node);
  }
  const roots = nodes.filter((node) => node.parent < 0).length;
  const missingParents = nodes.filter((node) => node.parent >= 0 && !nodeMap.has(node.parent)).length;
  return { nodes, nodeMap, roots, missingParents, bounds: boundsOfPoints(nodes) };
}

function finiteCoordinate(value) {
  return (typeof value === "number" && Number.isFinite(value))
    || (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)));
}

function finitePair(value) {
  return Array.isArray(value) && value.length >= 2
    && finiteCoordinate(value[0]) && finiteCoordinate(value[1]);
}

function parseJsonOverlay(text, featureLimit = MAX_FEATURES, vertexLimit = MAX_JSON_VERTICES) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("The JSON file could not be parsed."); }
  const normalized = { points: [], lines: [], polygons: [] };
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  let primitiveCount = 0;
  let storedVertexCount = 0;
  const budgetError = (message) => {
    const error = new Error(message);
    error.code = "JSON_FEATURE_LIMIT";
    return error;
  };
  const ensurePrimitiveBudget = () => {
    if (primitiveCount >= featureLimit) {
      throw budgetError(`JSON overlay exceeds the ${formatNumber(featureLimit)} feature safety limit.`);
    }
  };
  const includeCoordinate = (x, y) => {
    bounds.minX = Math.min(bounds.minX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.maxY = Math.max(bounds.maxY, y);
  };
  const collectPairs = (coordinates, minimum) => {
    const pairs = [];
    for (const coordinate of Array.isArray(coordinates) ? coordinates : []) {
      if (!finitePair(coordinate)) continue;
      pairs.push([Number(coordinate[0]), Number(coordinate[1])]);
      if (pairs.length >= minimum) {
        ensurePrimitiveBudget();
        if (storedVertexCount + pairs.length > vertexLimit) {
          throw budgetError(
            `JSON overlay exceeds the ${formatNumber(vertexLimit)} stored line/polygon vertex safety limit.`,
          );
        }
      }
    }
    return pairs;
  };
  const addPoint = (x, y, properties = {}) => {
    if (!finiteCoordinate(x) || !finiteCoordinate(y)) return;
    ensurePrimitiveBudget();
    const numericX = Number(x);
    const numericY = Number(y);
    normalized.points.push({ x: numericX, y: numericY, properties });
    primitiveCount += 1;
    includeCoordinate(numericX, numericY);
  };
  const addLine = (coordinates, properties = {}) => {
    const pairs = collectPairs(coordinates, 2);
    if (pairs.length < 2) return;
    ensurePrimitiveBudget();
    normalized.lines.push({ coordinates: pairs, properties });
    primitiveCount += 1;
    storedVertexCount += pairs.length;
    for (const [x, y] of pairs) includeCoordinate(x, y);
  };
  const addPolygon = (coordinates, properties = {}) => {
    const pairs = collectPairs(coordinates, 3);
    if (pairs.length < 3) return;
    ensurePrimitiveBudget();
    normalized.polygons.push({ coordinates: pairs, properties });
    primitiveCount += 1;
    storedVertexCount += pairs.length;
    for (const [x, y] of pairs) includeCoordinate(x, y);
  };
  const geometry = (item, properties = {}) => {
    if (!item || typeof item !== "object") return;
    const { type, coordinates } = item;
    if (type === "Point" && finitePair(coordinates)) addPoint(coordinates[0], coordinates[1], properties);
    else if (type === "MultiPoint") coordinates?.forEach((point) => finitePair(point) && addPoint(point[0], point[1], properties));
    else if (type === "LineString") addLine(coordinates || [], properties);
    else if (type === "MultiLineString") coordinates?.forEach((line) => addLine(line, properties));
    else if (type === "Polygon") coordinates?.forEach((ring) => addPolygon(ring, properties));
    else if (type === "MultiPolygon") coordinates?.forEach((polygon) => polygon.forEach((ring) => addPolygon(ring, properties)));
    else if (type === "GeometryCollection") item.geometries?.forEach((child) => geometry(child, properties));
  };

  if (data?.type === "FeatureCollection") {
    for (const feature of data.features || []) geometry(feature.geometry, feature.properties || {});
  } else if (data?.type === "Feature") geometry(data.geometry, data.properties || {});
  else if (typeof data?.type === "string" && "coordinates" in data) geometry(data);
  else {
    const seen = new WeakSet();
    const visit = (value, depth = 0) => {
      if (depth > 20 || value === null || typeof value !== "object") return;
      if (seen.has(value)) return;
      seen.add(value);
      if (!Array.isArray(value) && finiteCoordinate(value.x) && finiteCoordinate(value.y)) {
        addPoint(value.x, value.y, value);
        return;
      }
      if (Array.isArray(value) && value.length >= 2 && value.every(finitePair)) {
        addLine(value);
        return;
      }
      if (!Array.isArray(value)) {
        for (const key of ["polygon", "boundary", "outline"]) {
          if (Array.isArray(value[key]) && value[key].every(finitePair)) {
            addPolygon(value[key], value);
            return;
          }
        }
      }
      for (const child of Array.isArray(value) ? value : Object.values(value)) visit(child, depth + 1);
    };
    visit(data);
  }
  if (!primitiveCount) throw new Error("No supported X/Y coordinates, points, lines, or GeoJSON geometry were found.");
  return { ...normalized, featureCount: primitiveCount, bounds };
}

function boundsOfPoints(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
}

function nextLayerColor(kind) {
  const palette = kind === "swc" ? ["#45e0cb", "#ffd36b", "#ef7faf", "#7fa9ff"] : ["#f2b35d", "#a77be5", "#61d1f2", "#f27f75"];
  return palette[state.layers.filter((layer) => layer.kind === kind).length % palette.length];
}

function addSwcLayer(name, text, notify = true) {
  const parsed = parseSwc(text);
  const layer = {
    id: crypto.randomUUID(), kind: "swc", name, visible: true, opacity: 0.95,
    color: nextLayerColor("swc"), size: 2, offsetX: 0, offsetY: 0, flipY: false, ...parsed,
  };
  state.layers.push(layer);
  renderLayerList();
  selectLayer(layer.id);
  scheduleRender();
  const ratio = outsideRatio(layer);
  if (ratio > 0.5) toast("Overlay may not align", "Most SWC coordinates fall outside the current image. Use offsets or Y-axis flip.", "warning", 6500);
  else if (notify) toast("Skeleton added", `${formatNumber(layer.nodes.length)} nodes aligned in image coordinates.`);
}

function addJsonLayer(name, text, notify = true, featureLimit = MAX_FEATURES) {
  const parsed = parseJsonOverlay(text, featureLimit);
  const alignment = suggestedJsonAlignment(parsed.bounds);
  const layer = {
    id: crypto.randomUUID(), kind: "json", name, visible: true, opacity: 0.86,
    color: nextLayerColor("json"), size: 3, ...parsed,
    offsetX: 0, offsetY: alignment.offsetY, flipY: alignment.flipY, alignmentMode: alignment.mode,
  };
  state.layers.push(layer);
  renderLayerList();
  selectLayer(layer.id);
  scheduleRender();
  const ratio = outsideRatio(layer);
  if (ratio > 0.5) toast("Overlay may not align", "Most JSON coordinates fall outside the current image. Use offsets or Y-axis flip.", "warning", 6500);
  else if (notify && alignment.mode === "negative-y") {
    toast(
      "JSON overlay auto-aligned",
      `${formatNumber(layer.featureCount)} spatial features loaded. Negative Y coordinates were detected; display Y = −source Y.`,
    );
  } else if (notify) toast("JSON overlay added", `${formatNumber(layer.featureCount)} spatial features loaded.`);
}

function normalizedIndexedBounds(value) {
  const bounds = {
    minX: Number(value?.minX),
    minY: Number(value?.minY),
    maxX: Number(value?.maxX),
    maxY: Number(value?.maxY),
  };
  if (!Object.values(bounds).every(Number.isFinite) || bounds.minX > bounds.maxX || bounds.minY > bounds.maxY) {
    throw new Error("The indexed overlay did not report valid coordinate bounds.");
  }
  return bounds;
}

function suggestedJsonAlignment(bounds, image = state.image) {
  const unchanged = { mode: null, flipY: false, offsetY: 0 };
  const width = Number(image?.width);
  const height = Number(image?.height);
  const normalizedBounds = {
    minX: finiteCoordinate(bounds?.minX) ? Number(bounds.minX) : NaN,
    minY: finiteCoordinate(bounds?.minY) ? Number(bounds.minY) : NaN,
    maxX: finiteCoordinate(bounds?.maxX) ? Number(bounds.maxX) : NaN,
    maxY: finiteCoordinate(bounds?.maxY) ? Number(bounds.maxY) : NaN,
  };
  if (
    !Number.isFinite(width)
    || !Number.isFinite(height)
    || width <= 0
    || height <= 0
    || !Object.values(normalizedBounds).every(Number.isFinite)
    || normalizedBounds.minX > normalizedBounds.maxX
    || normalizedBounds.minY > normalizedBounds.maxY
  ) return unchanged;
  const xFits = normalizedBounds.minX >= 0 && normalizedBounds.maxX <= width;
  const { minY, maxY } = normalizedBounds;
  const invertedMinY = -maxY;
  const invertedMaxY = -minY;
  const negativeYFits = minY < 0
    && maxY <= 0
    && invertedMinY >= 0
    && invertedMaxY <= height;
  return xFits && negativeYFits
    ? { mode: "negative-y", flipY: true, offsetY: -height }
    : unchanged;
}

function addIndexedJsonLayer(metadata, notify = true) {
  const overlayId = String(metadata?.id || "");
  if (!overlayId) throw new Error("The indexed overlay response is missing its id.");
  const bounds = normalizedIndexedBounds(metadata.bounds);
  const alignment = suggestedJsonAlignment(bounds);
  const count = (value) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
  const layer = {
    id: `indexed-${overlayId}`,
    overlayId,
    sourceKind: String(metadata.sourceKind || ""),
    serverReleased: false,
    kind: "json",
    indexed: true,
    name: String(metadata.filename || "indexed-overlay.json"),
    visible: true,
    opacity: 0.86,
    color: nextLayerColor("json"),
    size: 2,
    offsetX: 0,
    offsetY: alignment.offsetY,
    flipY: alignment.flipY,
    alignmentMode: alignment.mode,
    points: [],
    lines: [],
    polygons: [],
    featureCount: count(metadata.featureCount),
    primitiveCount: count(metadata.primitiveCount),
    vertexCount: count(metadata.vertexCount),
    totalSegmentCount: Number.isFinite(Number(metadata.segmentCount)) ? Number(metadata.segmentCount) : null,
    fileSize: count(metadata.fileSize),
    bounds,
    geometrySegments: new Float32Array(0),
    visibleSegmentCount: 0,
    matchingFeatureCount: null,
    matchingPrimitiveCount: null,
    geometryApproximate: null,
    geometryLoading: true,
    geometryError: null,
    geometryRequestKey: null,
    geometryRequestToken: 0,
    geometryTimer: null,
    geometryRetryTimer: null,
    geometryRetryCount: 0,
    geometryAbortController: null,
    geometryDisposed: false,
  };
  state.layers.push(layer);
  renderLayerList();
  selectLayer(layer.id);
  scheduleRender();
  queueIndexedGeometry(layer, true);
  const alignmentMessage = alignment.mode === "negative-y"
    ? " Negative Y coordinates were detected; display Y = −source Y."
    : "";
  if (notify) {
    toast(
      "Large JSON overlay indexed",
      `${formatNumber(layer.featureCount)} source features are ready.${alignmentMessage} Broad views use adaptive previews; zoom in to reveal full detail.`,
      "success",
      7000,
    );
  }
  return layer;
}

function layerTypeLabel(layer) {
  if (layer.kind === "base") return `${state.image.format} · Base image`;
  if (layer.kind === "swc") return `SWC skeleton · ${formatNumber(layer.nodes.length)} nodes`;
  if (layer.indexed) return `Indexed GeoJSON · ${formatNumber(layer.featureCount)} features`;
  return `Spatial JSON · ${formatNumber(layer.featureCount)} features`;
}

function renderLayerList() {
  els.layersEmpty.classList.toggle("hidden", state.layers.length > 0);
  els.layerList.classList.toggle("hidden", state.layers.length === 0);
  els.layerCount.textContent = state.layers.length;
  els.layerList.innerHTML = state.layers.map((layer) => {
    const icon = layer.kind === "base" ? "i-image" : layer.kind === "swc" ? "i-network" : "i-points";
    const eye = layer.visible ? "i-eye" : "i-eye-off";
    return `<div class="layer-item ${layer.id === state.selectedLayerId ? "selected" : ""} ${layer.visible ? "" : "is-hidden"}" data-layer-id="${layer.id}">
      <span class="layer-symbol ${layer.kind === "base" ? "base" : ""}" style="--layer-color:${layer.color}">${iconUse(icon)}</span>
      <span class="layer-copy"><strong title="${escapeHtml(layer.name)}">${escapeHtml(layer.name)}</strong><span>${escapeHtml(layerTypeLabel(layer))}</span></span>
      <button class="icon-button visibility-button" data-action="visibility" title="${layer.visible ? "Hide" : "Show"} layer">${iconUse(eye)}</button>
      <span class="layer-opacity">${Math.round(layer.opacity * 100)}%</span>
    </div>`;
  }).join("");
}

function selectedLayer() {
  return state.layers.find((layer) => layer.id === state.selectedLayerId) || null;
}

function selectLayer(id) {
  state.selectedLayerId = id;
  renderLayerList();
  updateInspector();
}

function toggleLayer(layer) {
  layer.visible = !layer.visible;
  renderLayerList();
  updateInspector();
  scheduleRender();
}

function outsideRatio(layer) {
  if (!state.image) return 0;
  const samples = layer.kind === "swc"
    ? layer.nodes
    : layer.indexed
      ? [
        { x: layer.bounds.minX, y: layer.bounds.minY },
        { x: layer.bounds.minX, y: layer.bounds.maxY },
        { x: layer.bounds.maxX, y: layer.bounds.minY },
        { x: layer.bounds.maxX, y: layer.bounds.maxY },
        { x: (layer.bounds.minX + layer.bounds.maxX) / 2, y: (layer.bounds.minY + layer.bounds.maxY) / 2 },
      ]
      : [
        ...layer.points,
        ...layer.lines.flatMap((line) => line.coordinates.map(([x, y]) => ({ x, y }))),
        ...layer.polygons.flatMap((polygon) => polygon.coordinates.map(([x, y]) => ({ x, y }))),
      ];
  if (!samples.length) return 0;
  const step = Math.max(1, Math.floor(samples.length / 5000));
  let outside = 0;
  let total = 0;
  for (let index = 0; index < samples.length; index += step) {
    const raw = samples[index];
    const point = Array.isArray(raw) ? { x: raw[0], y: raw[1] } : raw;
    const transformed = transformedPoint(layer, point.x, point.y);
    total += 1;
    if (transformed.x < 0 || transformed.y < 0 || transformed.x > state.image.width || transformed.y > state.image.height) outside += 1;
  }
  return total ? outside / total : 0;
}

function updateInspector() {
  const layer = selectedLayer();
  els.inspectorEmpty.classList.toggle("hidden", Boolean(layer));
  els.inspectorContent.classList.toggle("hidden", !layer);
  if (!layer) return;
  const overlay = layer.kind !== "base";
  $$(".overlay-only", els.inspectorContent).forEach((element) => element.classList.toggle("hidden", !overlay));
  els.selectedName.textContent = layer.name;
  els.selectedType.textContent = layerTypeLabel(layer);
  els.selectedSwatch.style.setProperty("--swatch", layer.color);
  els.selectedVisibility.innerHTML = iconUse(layer.visible ? "i-eye" : "i-eye-off");
  els.opacityRange.value = Math.round(layer.opacity * 100);
  els.opacityRange.style.setProperty("--range-progress", `${Math.round(layer.opacity * 100)}%`);
  els.opacityOutput.textContent = `${Math.round(layer.opacity * 100)}%`;
  if (overlay) {
    els.colorInput.value = layer.color;
    els.colorValue.textContent = layer.color.toUpperCase();
    els.sizeOutput.textContent = `${layer.size.toFixed(layer.size % 1 ? 1 : 0)} px`;
    els.offsetX.value = layer.offsetX;
    els.offsetY.value = layer.offsetY;
    els.flipY.checked = layer.flipY;
    const ratio = outsideRatio(layer);
    const warning = ratio > 0.25;
    els.boundsNote.classList.toggle("warning", warning);
    els.boundsNote.innerHTML = warning
      ? `${iconUse("i-warning")}<span>${Math.round(ratio * 100)}% of coordinates are outside image bounds</span>`
      : layer.indexed && layer.geometryError
        ? `${iconUse("i-warning")}<span>Visible geometry failed to load</span>`
        : layer.indexed && layer.geometryLoading
          ? `${iconUse("i-check")}<span>${layer.geometryRetryCount
            ? `Retrying visible geometry (${layer.geometryRetryCount}/${INDEXED_GEOMETRY_RETRY_DELAYS.length})`
            : "Loading geometry for the visible area"}</span>`
          : layer.indexed && layer.geometryApproximate
            ? `${iconUse("i-check")}<span>Adaptive preview — zoom in to reveal full detail</span>`
            : layer.alignmentMode === "negative-y"
              ? `${iconUse("i-check")}<span>Detected negative Y coordinates · display Y = −source Y</span>`
              : layer.indexed
                ? `${iconUse("i-check")}<span>Full geometry detail in the visible area</span>`
                : `${iconUse("i-check")}<span>Coordinates fit image bounds</span>`;
  }
  const tiles = tileDimensions();
  const tileGeometry = tiles.width === tiles.height ? `${tiles.width}px` : `${tiles.width} × ${tiles.height}px`;
  const resolutionLevels = state.image.maxLevel + 1;
  const details = layer.kind === "base" ? [
    ["Filename", layer.name],
    ["Format", state.image.format],
    ["Dimensions", `${formatNumber(state.image.width)} × ${formatNumber(state.image.height)}`],
    ["Channels", `${state.image.bands || 1} · ${state.image.pixelFormat || "unknown"}`],
    ["Source size", formatBytes(state.image.fileSize)],
    ["Tile pyramid", `${resolutionLevels} levels · ${tileGeometry}`],
    ["Decoder", state.image.decoder || "libvips"],
    state.image.format.startsWith("TIFF")
      ? ["TIFF page", state.image.pages > 1 ? `1 of ${state.image.pages} (MVP)` : "1"]
      : ["JP2 source", `${resolutionLevels} resolution level${resolutionLevels === 1 ? "" : "s"}`],
  ] : layer.kind === "swc" ? [
    ["Nodes", formatNumber(layer.nodes.length)],
    ["Roots", formatNumber(layer.roots)],
    ["Missing parents", formatNumber(layer.missingParents)],
    ["X bounds", `${formatNumber(layer.bounds.minX, 2)} — ${formatNumber(layer.bounds.maxX, 2)}`],
    ["Y bounds", `${formatNumber(layer.bounds.minY, 2)} — ${formatNumber(layer.bounds.maxY, 2)}`],
  ] : layer.indexed ? [
    ["Source features", formatNumber(layer.featureCount)],
    ["Total segments", layer.totalSegmentCount === null ? "Not reported" : formatNumber(layer.totalSegmentCount)],
    ["Visible segments", formatNumber(layer.visibleSegmentCount)],
    ["Detail", layer.geometryError
      ? `Error · ${layer.geometryError}`
      : layer.geometryLoading
        ? layer.geometryRetryCount
          ? `Retrying visible area · ${layer.geometryRetryCount}/${INDEXED_GEOMETRY_RETRY_DELAYS.length}`
          : "Loading visible area"
        : layer.geometryApproximate
          ? "Adaptive preview · zoom in for full detail"
          : "Full detail in visible area"],
    ["Source primitives", formatNumber(layer.primitiveCount)],
    ["Vertices", formatNumber(layer.vertexCount)],
    ["Source size", formatBytes(layer.fileSize)],
    ["X bounds", `${formatNumber(layer.bounds.minX, 2)} — ${formatNumber(layer.bounds.maxX, 2)}`],
    ["Y bounds", `${formatNumber(layer.bounds.minY, 2)} — ${formatNumber(layer.bounds.maxY, 2)}`],
  ] : [
    ["Points", formatNumber(layer.points.length)],
    ["Lines", formatNumber(layer.lines.length)],
    ["Regions", formatNumber(layer.polygons.length)],
    ["X bounds", `${formatNumber(layer.bounds.minX, 2)} — ${formatNumber(layer.bounds.maxX, 2)}`],
    ["Y bounds", `${formatNumber(layer.bounds.minY, 2)} — ${formatNumber(layer.bounds.maxY, 2)}`],
  ];
  els.metadataList.innerHTML = details.map(([term, value]) => `<dt>${escapeHtml(term)}</dt><dd title="${escapeHtml(value)}">${escapeHtml(value)}</dd>`).join("");
}

function removeSelectedLayer() {
  const layer = selectedLayer();
  if (!layer || layer.kind === "base") return;
  disposeIndexedLayer(layer);
  state.layers = state.layers.filter((candidate) => candidate.id !== layer.id);
  state.selectedLayerId = "base";
  renderLayerList();
  updateInspector();
  scheduleRender();
  toast("Overlay removed", layer.name);
}

function inspectFeatureAt(screenX, screenY) {
  const thresholdSquared = 10 ** 2;
  let closest = null;
  let distance = thresholdSquared;
  for (const layer of [...state.layers].reverse()) {
    if (!layer.visible || layer.kind === "base") continue;
    if (layer.indexed) continue;
    const points = layer.kind === "swc" ? layer.nodes : layer.points;
    const step = Math.max(1, Math.floor(points.length / 100_000));
    for (let index = 0; index < points.length; index += step) {
      const feature = points[index];
      const transformed = transformedPoint(layer, feature.x, feature.y);
      const point = imageToScreen(transformed.x, transformed.y);
      const current = (point.x - screenX) ** 2 + (point.y - screenY) ** 2;
      if (current < distance) {
        distance = current;
        closest = { layer, feature, transformed };
      }
    }
  }
  if (!closest) return;
  selectLayer(closest.layer.id);
  const featureName = closest.layer.kind === "swc" ? `Node ${closest.feature.id}` : closest.feature.properties?.class || "Spatial feature";
  const suffix = closest.layer.kind === "swc"
    ? `type ${closest.feature.type} · radius ${formatNumber(closest.feature.radius, 2)}`
    : closest.feature.properties?.confidence ? `confidence ${formatNumber(closest.feature.properties.confidence * 100, 1)}%` : "JSON point";
  toast(featureName, `X ${formatNumber(closest.transformed.x, 2)} · Y ${formatNumber(closest.transformed.y, 2)} · ${suffix}`);
}

els.imageLibraryButton.addEventListener("click", showImageLibrary);
els.emptyImageLibrary.addEventListener("click", showImageLibrary);
els.serverOpenButton.addEventListener("click", showServerPathDialog);
els.emptyServerOpen.addEventListener("click", showServerPathDialog);
els.demoButton.addEventListener("click", openDemo);
els.zoomIn.addEventListener("click", () => zoomAt(1.4));
els.zoomOut.addEventListener("click", () => zoomAt(1 / 1.4));
els.fit.addEventListener("click", fitImage);
els.reset.addEventListener("click", resetActualSize);
els.grid.addEventListener("click", () => {
  state.showTileGrid = !state.showTileGrid;
  els.grid.classList.toggle("active", !state.showTileGrid);
  $("span", els.grid).textContent = state.showTileGrid ? "Tile grid" : "Seamless";
  scheduleRender();
});
els.minimapClose.addEventListener("click", () => els.minimap.classList.add("hidden"));
els.layerList.addEventListener("click", (event) => {
  const item = event.target.closest(".layer-item");
  if (!item) return;
  const layer = state.layers.find((candidate) => candidate.id === item.dataset.layerId);
  if (!layer) return;
  if (event.target.closest('[data-action="visibility"]')) toggleLayer(layer);
  else selectLayer(layer.id);
});
els.selectedVisibility.addEventListener("click", () => {
  const layer = selectedLayer();
  if (layer) toggleLayer(layer);
});
els.opacityRange.addEventListener("input", () => {
  const layer = selectedLayer();
  if (!layer) return;
  layer.opacity = Number(els.opacityRange.value) / 100;
  els.opacityOutput.textContent = `${els.opacityRange.value}%`;
  els.opacityRange.style.setProperty("--range-progress", `${els.opacityRange.value}%`);
  renderLayerList();
  scheduleRender();
});
els.colorInput.addEventListener("input", () => {
  const layer = selectedLayer();
  if (!layer || layer.kind === "base") return;
  layer.color = els.colorInput.value;
  els.colorValue.textContent = layer.color.toUpperCase();
  els.selectedSwatch.style.setProperty("--swatch", layer.color);
  renderLayerList();
  scheduleRender();
});
function changeSize(delta) {
  const layer = selectedLayer();
  if (!layer || layer.kind === "base") return;
  layer.size = Math.max(0.5, Math.min(12, layer.size + delta));
  els.sizeOutput.textContent = `${layer.size.toFixed(layer.size % 1 ? 1 : 0)} px`;
  scheduleRender();
}
els.sizeDown.addEventListener("click", () => changeSize(-0.5));
els.sizeUp.addEventListener("click", () => changeSize(0.5));
function updateOffsets() {
  const layer = selectedLayer();
  if (!layer || layer.kind === "base") return;
  layer.alignmentMode = null;
  layer.offsetX = Number(els.offsetX.value) || 0;
  layer.offsetY = Number(els.offsetY.value) || 0;
  updateInspector();
  if (layer.indexed) queueIndexedGeometry(layer);
  scheduleRender();
}
els.offsetX.addEventListener("change", updateOffsets);
els.offsetY.addEventListener("change", updateOffsets);
els.flipY.addEventListener("change", () => {
  const layer = selectedLayer();
  if (!layer || layer.kind === "base") return;
  layer.alignmentMode = null;
  layer.flipY = els.flipY.checked;
  updateInspector();
  if (layer.indexed) queueIndexedGeometry(layer);
  scheduleRender();
});
els.removeLayer.addEventListener("click", removeSelectedLayer);
els.shortcutsButton.addEventListener("click", () => els.shortcutsDialog.showModal());
els.closeShortcuts.addEventListener("click", () => els.shortcutsDialog.close());
els.shortcutsDialog.addEventListener("click", (event) => {
  if (event.target === els.shortcutsDialog) els.shortcutsDialog.close();
});
els.refreshImageLibrary.addEventListener("click", () => void loadImageLibrary());
els.closeImageLibrary.addEventListener("click", closeImageLibrary);
els.doneImageLibrary.addEventListener("click", closeImageLibrary);
els.imageLibrarySearch.addEventListener("input", () => {
  state.imageLibrary.query = els.imageLibrarySearch.value;
  renderImageLibrary();
});
els.libraryServerOpen.addEventListener("click", () => {
  closeImageLibrary();
  showServerPathDialog();
});
els.imageLibraryDialog.addEventListener("click", (event) => {
  if (event.target === els.imageLibraryDialog) closeImageLibrary();
});
els.imageLibraryDialog.addEventListener("close", () => { state.imageLibrary.requestToken += 1; });
els.closeServerPath.addEventListener("click", closeServerPathDialog);
els.serverPathForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void openServerPath();
});
els.serverPathInput.addEventListener("input", () => {
  setServerPathStatus();
  updateServerPathSubmit();
});
els.serverPathDialog.addEventListener("click", (event) => {
  if (event.target === els.serverPathDialog) closeServerPathDialog();
});
els.serverPathDialog.addEventListener("close", () => {
  invalidateServerPathRequest();
});

els.shell.addEventListener("wheel", (event) => {
  if (!state.image) return;
  event.preventDefault();
  const rect = els.shell.getBoundingClientRect();
  zoomAt(Math.exp(-event.deltaY * 0.0014), event.clientX - rect.left, event.clientY - rect.top);
}, { passive: false });

els.shell.addEventListener("pointerdown", (event) => {
  if (!state.image || event.button !== 0) return;
  els.shell.setPointerCapture(event.pointerId);
  state.pointer = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY, startX: event.clientX, startY: event.clientY };
  state.moved = false;
  els.shell.classList.add("is-panning");
  els.shell.focus({ preventScroll: true });
});

els.shell.addEventListener("pointermove", (event) => {
  const rect = els.shell.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  if (state.image) {
    const point = screenToImage(x, y);
    const inside = point.x >= 0 && point.y >= 0 && point.x <= state.image.width && point.y <= state.image.height;
    els.cursorX.textContent = inside ? formatNumber(point.x, 1) : "—";
    els.cursorY.textContent = inside ? formatNumber(point.y, 1) : "—";
  }
  if (!state.pointer || state.pointer.id !== event.pointerId) return;
  const dx = event.clientX - state.pointer.clientX;
  const dy = event.clientY - state.pointer.clientY;
  if (Math.abs(event.clientX - state.pointer.startX) + Math.abs(event.clientY - state.pointer.startY) > 4) state.moved = true;
  state.pointer.clientX = event.clientX;
  state.pointer.clientY = event.clientY;
  state.view.x += dx;
  state.view.y += dy;
  constrainView();
  scheduleRender();
});

function endPointer(event) {
  if (!state.pointer || state.pointer.id !== event.pointerId) return;
  const rect = els.shell.getBoundingClientRect();
  if (!state.moved) inspectFeatureAt(event.clientX - rect.left, event.clientY - rect.top);
  state.pointer = null;
  els.shell.classList.remove("is-panning");
}
els.shell.addEventListener("pointerup", endPointer);
els.shell.addEventListener("pointercancel", endPointer);
els.shell.addEventListener("pointerleave", () => {
  if (!state.pointer) {
    els.cursorX.textContent = "—";
    els.cursorY.textContent = "—";
  }
});

els.minimapCanvas.addEventListener("pointerdown", (event) => {
  if (!state.image || !state.minimapTransform) return;
  const rect = els.minimapCanvas.getBoundingClientRect();
  const canvasX = ((event.clientX - rect.left) / rect.width) * els.minimapCanvas.width;
  const canvasY = ((event.clientY - rect.top) / rect.height) * els.minimapCanvas.height;
  const imageX = (canvasX - state.minimapTransform.x) / state.minimapTransform.scale;
  const imageY = (canvasY - state.minimapTransform.y) / state.minimapTransform.scale;
  state.view.x = state.viewportWidth / 2 - imageX * state.view.scale;
  state.view.y = state.viewportHeight / 2 - imageY * state.view.scale;
  constrainView();
  scheduleRender();
});

document.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || els.shortcutsDialog.open || els.imageLibraryDialog.open || els.serverPathDialog.open) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === "+" || key === "=") zoomAt(1.4);
  else if (key === "-") zoomAt(1 / 1.4);
  else if (key === "f") fitImage();
  else if (key === "0") resetActualSize();
  else if (key === "l") showImageLibrary();
  else if (key === "s") showServerPathDialog();
  else if (key === "?") els.shortcutsDialog.showModal();
  else if (state.image && ["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
    const distance = event.shiftKey ? 120 : 38;
    if (key === "arrowup") state.view.y += distance;
    if (key === "arrowdown") state.view.y -= distance;
    if (key === "arrowleft") state.view.x += distance;
    if (key === "arrowright") state.view.x -= distance;
    constrainView();
    scheduleRender();
  } else return;
  event.preventDefault();
});

document.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
});
document.addEventListener("drop", (event) => {
  event.preventDefault();
  toast("Local files aren’t accepted", "Use Open server path for a JP2, TIFF, JSON, or SWC in configured storage.", "warning");
});

new ResizeObserver(resizeCanvas).observe(els.shell);
resizeCanvas();
renderLayerList();
updateInspector();
void reopenImageFromUrl();
