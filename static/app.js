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
  resolutionLabel: $("#resolution-chip-label") || $("#resolution-label"),
  scaleBar: $("#scale-bar"),
  scaleLabel: $("#scale-bar-label") || $("#scale-label"),
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
  contrastSection: $("#contrast-section"),
  brightnessRange: $("#brightness-range"),
  brightnessOutput: $("#brightness-output"),
  contrastRange: $("#contrast-range"),
  contrastOutput: $("#contrast-output"),
  gammaRange: $("#gamma-range"),
  gammaOutput: $("#gamma-output"),
  resetContrastButton: $("#reset-contrast-button"),
  serverPathDialog: $("#server-path-dialog"),
  serverPathForm: $("#server-path-form"),
  serverPathInput: $("#server-path-input"),
  serverPathSubmit: $("#open-server-path"),
  serverPathSubmitLabel: $("#server-path-submit-label"),
  serverPathHelp: $("#server-path-help"),
  serverPathStatus: $("#server-path-status"),
  closeServerPath: $("#close-server-path"),
  mountPills: $("#mount-pills"),
  fileBrowserBreadcrumbs: $("#file-browser-breadcrumbs"),
  fileBrowserUp: $("#file-browser-up"),
  fileBrowserFilter: $("#file-browser-filter"),
  fileBrowserList: $("#file-browser-list"),
  swcAppearance: $("#swc-appearance"),
  swcColorMode: $("#swc-color-mode"),
  swcCompartments: $("#swc-compartments"),
  lutPreset: $("#lut-preset"),
  pinButton: $("#pin-button"),
  addOverlayBtn: $("#add-overlay-btn"),
  companionOverlayCard: $("#companion-overlay-card"),
  companionCount: $("#companion-count"),
  companionList: $("#companion-list"),
  companionPickerDialog: $("#companion-picker-dialog"),
  companionPickerList: $("#companion-picker-list"),
  closeCompanionPicker: $("#close-companion-picker"),
  cancelCompanionPicker: $("#cancel-companion-picker"),
  loadAllCompanionsBtn: $("#load-all-companions-btn"),
  sectionNavGroup: $("#section-nav-group"),
  navPrevSection: $("#nav-prev-section"),
  navSectionLabel: $("#nav-section-label"),
  navNextSection: $("#nav-next-section"),
  sectionNavHud: $("#section-nav-hud"),
  hudNavPrev: $("#hud-nav-prev"),
  hudNavLabel: $("#hud-nav-label"),
  hudNavNext: $("#hud-nav-next"),
  alignOverlayButton: $("#align-overlay-button"),
  btn1to1Overlay: $("#btn-1to1-overlay"),
  btnFitOverlay: $("#btn-fit-overlay"),
  btnFlipVertical: $("#btn-flip-vertical"),
  btnResetAlignment: $("#btn-reset-alignment"),
  btnScaleDown: $("#btn-scale-down"),
  btnScaleUp: $("#btn-scale-up"),
  overlayScaleDisplay: $("#overlay-scale-display"),
  btnNudgeLeft: $("#btn-nudge-left"),
  btnNudgeUp: $("#btn-nudge-up"),
  btnNudgeDown: $("#btn-nudge-down"),
  clearAllOverlaysBtn: $("#clear-all-overlays-btn"),
  layersSectionSync: $("#layers-section-sync"),
  autoClearOverlaysCheckbox: $("#auto-clear-overlays-checkbox"),
  alignmentOrientationLabel: $("#alignment-orientation-label"),
};

const state = {
  image: null,
  layers: [],
  selectedLayerId: null,
  companions: [],
  brainSeries: null,
  autoClearOverlaysOnSectionChange: true,
  browserMounts: [],
  browserMountId: null,
  browserPath: "",
  browserParent: null,
  browserEntries: [],
  browserFilter: "",
  pins: [],
  isPinning: false,
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
  contrast: { brightness: 0, contrast: 0, gamma: 1.0 },
  contrastKey: "default",
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

function setImageUrl(value) {
  const url = new URL(window.location.href);
  if (!value) {
    url.searchParams.delete("image");
  } else if (typeof value === "object") {
    const readable = value.filename || value.name || value.id;
    if (readable) url.searchParams.set("image", readable);
    else url.searchParams.delete("image");
  } else if (typeof value === "string" && value.trim()) {
    url.searchParams.set("image", value.trim());
  } else {
    url.searchParams.delete("image");
  }
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function readViewportFromHash() {
  try {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const x = parseFloat(params.get("x"));
    const y = parseFloat(params.get("y"));
    const scale = parseFloat(params.get("scale") || params.get("s") || params.get("zoom"));
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(scale) && scale > 0) {
      return { x, y, scale };
    }
  } catch (e) {}
  return null;
}

let updateHashTimeout = null;
function syncViewportToUrl() {
  if (!state.image) return;
  if (updateHashTimeout) clearTimeout(updateHashTimeout);
  updateHashTimeout = setTimeout(() => {
    if (!state.image) return;
    const url = new URL(window.location.href);
    url.hash = `x=${Math.round(state.view.x)}&y=${Math.round(state.view.y)}&scale=${state.view.scale.toFixed(4)}`;
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, 400);
}


async function reopenImageFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const requested = (params.get("image") || params.get("file") || params.get("path") || "").trim();
  if (!requested) return false;

  const operationToken = beginImageOperation();
  try {
    showProcessing({ filename: requested, status: "reopening" });
    const metadata = await responseJson(
      await fetch(`/api/images/${encodeURIComponent(requested)}`, { cache: "no-store" })
    );
    ensureCurrentImageOperation(operationToken);
    const ready = await pollUntilReady(metadata, operationToken);
    ensureCurrentImageOperation(operationToken);
    await activateImage(ready);
    toast("Image opened", `${ready.filename} loaded successfully.`);
    return true;
  } catch (error) {
    if (imageOperationWasSuperseded(error, operationToken)) return false;
    hideProcessing();
    if (!state.image) els.empty.classList.remove("hidden");
    toast("Could not open image", error.message, "error", 7000);
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

async function loadFileBrowserMounts() {
  try {
    const res = await fetch("/api/mounts");
    if (!res || !res.ok) return;
    const data = await res.json();
    state.browserMounts = data.mounts || [];
    if (state.browserMounts.length > 0 && !state.browserMountId) {
      state.browserMountId = state.browserMounts[0].id;
    }
    renderMountPills();
    if (state.browserMountId) {
      void loadFileBrowserDirectory(state.browserMountId, state.browserPath || "");
    }
  } catch (err) {
    // Silently ignore network failures in offline tests
  }
}

function renderMountPills() {
  if (!els.mountPills) return;
  els.mountPills.innerHTML = "";
  for (const m of state.browserMounts) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `mount-pill${m.id === state.browserMountId ? " active" : ""}`;
    btn.textContent = m.label || m.id;
    btn.addEventListener("click", () => {
      state.browserMountId = m.id;
      renderMountPills();
      void loadFileBrowserDirectory(m.id, "");
    });
    els.mountPills.appendChild(btn);
  }
}

async function loadFileBrowserDirectory(mountId, path = "") {
  if (!mountId) return;
  state.browserMountId = mountId;
  state.browserPath = path;
  renderMountPills();
  if (els.fileBrowserList) {
    els.fileBrowserList.innerHTML = `<div class="file-browser-loading">Loading directory…</div>`;
  }
  try {
    const res = await fetch(`/api/mounts/${encodeURIComponent(mountId)}/browse?path=${encodeURIComponent(path)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Could not open directory" }));
      if (els.fileBrowserList) {
        els.fileBrowserList.innerHTML = `<div class="file-browser-empty"><span>${escapeHtml(err.detail || "Could not read directory")}</span></div>`;
      }
      return;
    }
    const data = await res.json();
    state.browserParent = data.parent;
    state.browserEntries = data.entries || [];
    renderFileBrowserBreadcrumbs(data.path);
    renderFileBrowserList();
    if (els.fileBrowserUp) {
      els.fileBrowserUp.disabled = data.parent === null || data.parent === undefined;
    }
  } catch (err) {
    if (els.fileBrowserList) {
      els.fileBrowserList.innerHTML = `<div class="file-browser-empty"><span>Failed to connect to storage.</span></div>`;
    }
  }
}

function renderFileBrowserBreadcrumbs(currentPath) {
  if (!els.fileBrowserBreadcrumbs) return;
  els.fileBrowserBreadcrumbs.innerHTML = "";
  const rootBtn = document.createElement("button");
  rootBtn.type = "button";
  rootBtn.className = `breadcrumb-item${!currentPath ? " active" : ""}`;
  rootBtn.textContent = state.browserMountId;
  rootBtn.addEventListener("click", () => void loadFileBrowserDirectory(state.browserMountId, ""));
  els.fileBrowserBreadcrumbs.appendChild(rootBtn);

  if (!currentPath) return;
  const parts = currentPath.split("/").filter(Boolean);
  let accumulated = "";
  for (let i = 0; i < parts.length; i++) {
    const sep = document.createElement("span");
    sep.className = "breadcrumb-separator";
    sep.textContent = "/";
    els.fileBrowserBreadcrumbs.appendChild(sep);

    accumulated = accumulated ? `${accumulated}/${parts[i]}` : parts[i];
    const target = accumulated;
    const isLast = i === parts.length - 1;
    const item = document.createElement("button");
    item.type = "button";
    item.className = `breadcrumb-item${isLast ? " active" : ""}`;
    item.textContent = parts[i];
    if (!isLast) {
      item.addEventListener("click", () => void loadFileBrowserDirectory(state.browserMountId, target));
    }
    els.fileBrowserBreadcrumbs.appendChild(item);
  }
}

function renderFileBrowserList() {
  if (!els.fileBrowserList) return;
  els.fileBrowserList.innerHTML = "";
  const filter = (state.browserFilter || "").toLowerCase().trim();
  const filtered = state.browserEntries.filter(e => !filter || e.name.toLowerCase().includes(filter));

  if (filtered.length === 0) {
    els.fileBrowserList.innerHTML = `<div class="file-browser-empty">
      <svg><use href="#i-folder"></use></svg>
      <span>No matching images or overlays in this directory</span>
    </div>`;
    return;
  }

  const sorted = [...filtered].sort((a, b) => {
    if (a.type === "directory" && b.type !== "directory") return -1;
    if (a.type !== "directory" && b.type === "directory") return 1;
    return a.name.localeCompare(b.name);
  });

  const imageFilesCount = state.browserEntries.filter(e => e.type === "file" && IMAGE_EXTENSIONS.has(extensionOf(e.name))).length;
  if (imageFilesCount >= 3) {
    const seriesHeader = document.createElement("div");
    seriesHeader.className = "file-browser-series-banner";
    seriesHeader.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:8px 12px; margin-bottom:8px; background:rgba(64,218,206,0.12); border:1px solid rgba(64,218,206,0.3); border-radius:7px;";
    seriesHeader.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; font-size:11.5px; color:#c9e5e3;">
        <span>🧠</span>
        <span>Folder contains <strong>${imageFilesCount}</strong> image sections</span>
      </div>
      <button class="btn-open-series" data-action="open-current-series">
        Open as Brain Series
      </button>
    `;
    const openCurrentBtn = seriesHeader.querySelector('[data-action="open-current-series"]');
    if (openCurrentBtn) {
      openCurrentBtn.addEventListener("click", () => {
        closeServerPathDialog();
        void openBrainSeries(state.browserMountId, state.browserPath);
      });
    }
    els.fileBrowserList.append(seriesHeader);
  }

  for (const item of sorted) {
    const row = document.createElement("div");
    row.className = `file-browser-row${item.type === "directory" ? " is-folder" : ""}`;

    if (item.type === "directory") {
      const isBrain = Boolean(item.isBrainSeries);
      row.innerHTML = `
        <span class="file-icon folder"><svg><use href="#i-folder"></use></svg></span>
        <span class="file-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
        <span class="file-size">${isBrain ? "Brain Dataset" : "Folder"}</span>
        <div class="file-actions">
          ${isBrain ? `<button class="btn-open-series" data-action="open-series" title="Open entire brain volume in Section Filmstrip">🧠 Open Series</button>` : ""}
          <button class="button button-ghost compact" data-action="browse-folder">Browse</button>
        </div>
      `;

      const seriesBtn = row.querySelector('[data-action="open-series"]');
      if (seriesBtn) {
        seriesBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          closeServerPathDialog();
          void openBrainSeries(state.browserMountId, item.path);
        });
      }

      const browseBtn = row.querySelector('[data-action="browse-folder"]');
      if (browseBtn) {
        browseBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          void loadFileBrowserDirectory(state.browserMountId, item.path);
        });
      }

      row.addEventListener("click", () => void loadFileBrowserDirectory(state.browserMountId, item.path));
    } else {
      const ext = extensionOf(item.name);
      const isImg = IMAGE_EXTENSIONS.has(ext);
      const isOvl = OVERLAY_EXTENSIONS.has(ext);
      const iconClass = isImg ? "image" : "overlay";
      const iconId = isImg ? "#i-image" : "#i-points";
      const badgeClass = isImg ? "badge-image" : "badge-overlay";
      const badgeText = item.format || ext.toUpperCase();

      row.innerHTML = `
        <span class="file-icon ${iconClass}"><svg><use href="${iconId}"></use></svg></span>
        <span class="file-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
        <span class="file-badge ${badgeClass}">${escapeHtml(badgeText)}</span>
        <span class="file-size">${formatBytes(item.size || 0)}</span>
        <div class="file-actions">
          ${isImg ? `<button class="button button-primary compact" data-action="open-img">Open Image</button>` : ""}
          ${isOvl ? `<button class="button button-secondary compact" data-action="add-ovl">Add Overlay</button>` : ""}
        </div>
      `;

      const imgBtn = row.querySelector('[data-action="open-img"]');
      if (imgBtn) {
        imgBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          closeServerPathDialog();
          void registerAndOpenServerImage({
            url: `/api/mounts/${encodeURIComponent(state.browserMountId)}/register`,
            body: { path: item.path },
            filename: item.name,
            errorTitle: "Could not open server image",
            onError: (err) => toast("Could not open server image", err.message, "error"),
          });
        });
      }

      const ovlBtn = row.querySelector('[data-action="add-ovl"]');
      if (ovlBtn) {
        ovlBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          closeServerPathDialog();
          void openResolvedServerOverlay(
            {
              name: item.name,
              path: item.path,
              type: "file",
              kind: "overlay",
              format: item.format || ext.toUpperCase(),
              size: item.size || 1000,
            },
            state.browserMountId,
          );
        });
      }
    }
    els.fileBrowserList.appendChild(row);
  }
}

function showServerPathDialog() {
  setServerPathStatus();
  updateServerPathSubmit();
  if (!els.serverPathDialog.open) els.serverPathDialog.showModal();
  els.serverPathInput.focus();
  void loadFileBrowserMounts();
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
    setImageUrl(registered.filename || registered.id);
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

async function activateImage(metadata, options = {}) {
  const preservedOverlays = options.preserveOverlays ? state.layers.filter(l => l.kind !== "base") : [];
  if (!options.preserveOverlays) {
    state.layers.forEach(disposeIndexedLayer);
  }
  state.image = metadata;
  setImageUrl(metadata.filename || metadata.id);
  state.tileCache.clear();
  state.overview = null;
  state.overviewLoading = false;
  overviewGammaCanvas = null;
  overviewAppliedGamma = 1.0;
  state.contrast = { brightness: 0, contrast: 0, gamma: 1.0, lut: "normal" };
  state.contrastKey = "default";
  state.pins = [];
  state.isPinning = false;
  if (els.shell) {
    els.shell.classList.remove("pinning");
  }
  if (els.pinButton) els.pinButton.classList.remove("active");
  if (els.lutPreset) els.lutPreset.value = "normal";

  state.layers = [{
    id: "base",
    kind: "base",
    name: metadata.filename,
    visible: true,
    opacity: 1,
    color: "#91aab8",
    size: 1,
  }, ...preservedOverlays];
  state.selectedLayerId = preservedOverlays.length > 0 ? preservedOverlays[preservedOverlays.length - 1].id : "base";
  els.empty.classList.add("hidden");
  hideProcessing();
  els.shell.classList.add("has-image");
  [els.zoomIn, els.zoomOut, els.fit, els.reset, els.pinButton].forEach((button) => {
    if (button) button.disabled = false;
  });
  els.workspaceTitle.textContent = fileStem(metadata.filename);
  els.statusFormat.textContent = metadata.format;
  els.statusDimensions.textContent = `${formatNumber(metadata.width)} × ${formatNumber(metadata.height)}`;
  els.resolutionChip.classList.remove("hidden");
  els.scaleBar.classList.remove("hidden");
  els.minimap.classList.remove("hidden");
  renderLayerList();
  updateInspector();
  resizeCanvas();

  if (!options.preserveView) {
    fitImage();
    const savedView = readViewportFromHash();
    if (savedView) {
      state.view = savedView;
      scheduleRender();
    }
  } else {
    constrainView();
    scheduleRender();
  }

  loadOverview();
  void checkImageCompanions(metadata.id);
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
    image.crossOrigin = "anonymous";
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
    syncViewportToUrl();
  });
}

let currentGammaLUT = null;
let currentGammaVal = 1.0;

function getGammaLUT(gamma) {
  if (Math.abs(gamma - 1.0) <= 0.01) {
    return null;
  }
  if (currentGammaLUT && Math.abs(currentGammaVal - gamma) < 0.001) {
    return currentGammaLUT;
  }
  const lut = new Uint8ClampedArray(256);
  const invGamma = 1 / Math.max(0.05, gamma);
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.round(255 * Math.pow(i / 255, invGamma));
  }
  currentGammaLUT = lut;
  currentGammaVal = gamma;
  return lut;
}

function getAdjustedTileSource(entry, gamma) {
  if (!entry || !entry.image) return null;
  const lut = getGammaLUT(gamma);
  if (!lut) return entry.image;

  if (entry.gammaCanvas && Math.abs((entry.appliedGamma || 1.0) - gamma) < 0.001) {
    return entry.gammaCanvas;
  }

  const width = entry.image.naturalWidth || 256;
  const height = entry.image.naturalHeight || 256;
  if (!entry.gammaCanvas) {
    entry.gammaCanvas = document.createElement("canvas");
    entry.gammaCanvas.width = width;
    entry.gammaCanvas.height = height;
  } else if (entry.gammaCanvas.width !== width || entry.gammaCanvas.height !== height) {
    entry.gammaCanvas.width = width;
    entry.gammaCanvas.height = height;
  }

  const gCtx = entry.gammaCanvas.getContext("2d", { willReadFrequently: true });
  gCtx.drawImage(entry.image, 0, 0);
  try {
    const imgData = gCtx.getImageData(0, 0, width, height);
    const d = imgData.data;
    const len = d.length;
    for (let i = 0; i < len; i += 4) {
      d[i] = lut[d[i]];
      d[i + 1] = lut[d[i + 1]];
      d[i + 2] = lut[d[i + 2]];
    }
    gCtx.putImageData(imgData, 0, 0);
    entry.appliedGamma = gamma;
    return entry.gammaCanvas;
  } catch (err) {
    return entry.image;
  }
}

let overviewGammaCanvas = null;
let overviewAppliedGamma = 1.0;

function getAdjustedOverviewSource(gamma) {
  if (!state.overview) return null;
  const lut = getGammaLUT(gamma);
  if (!lut) return state.overview;

  if (overviewGammaCanvas && Math.abs(overviewAppliedGamma - gamma) < 0.001) {
    return overviewGammaCanvas;
  }

  const width = state.overview.naturalWidth || state.overview.width;
  const height = state.overview.naturalHeight || state.overview.height;
  if (!width || !height) return state.overview;

  if (!overviewGammaCanvas) {
    overviewGammaCanvas = document.createElement("canvas");
    overviewGammaCanvas.width = width;
    overviewGammaCanvas.height = height;
  } else if (overviewGammaCanvas.width !== width || overviewGammaCanvas.height !== height) {
    overviewGammaCanvas.width = width;
    overviewGammaCanvas.height = height;
  }

  const oCtx = overviewGammaCanvas.getContext("2d", { willReadFrequently: true });
  oCtx.drawImage(state.overview, 0, 0);
  try {
    const imgData = oCtx.getImageData(0, 0, width, height);
    const d = imgData.data;
    const len = d.length;
    for (let i = 0; i < len; i += 4) {
      d[i] = lut[d[i]];
      d[i + 1] = lut[d[i + 1]];
      d[i + 2] = lut[d[i + 2]];
    }
    oCtx.putImageData(imgData, 0, 0);
    overviewAppliedGamma = gamma;
    return overviewGammaCanvas;
  } catch (err) {
    return state.overview;
  }
}

function getCanvasFilter(contrastState) {
  const { brightness = 0, contrast = 0, lut = "normal" } = contrastState || {};
  const bPct = Math.max(0, 100 + brightness);
  const cPct = Math.max(0, 100 + contrast);
  let baseFilter = `brightness(${bPct}%) contrast(${cPct}%)`;

  switch (lut) {
    case "invert":
      return `${baseFilter} invert(100%)`;
    case "gfp":
      return `${baseFilter} grayscale(100%) sepia(100%) hue-rotate(80deg) saturate(400%)`;
    case "rfp":
      return `${baseFilter} grayscale(100%) sepia(100%) hue-rotate(320deg) saturate(500%)`;
    case "dapi":
      return `${baseFilter} grayscale(100%) sepia(100%) hue-rotate(150deg) saturate(400%)`;
    case "thermal":
      return `${baseFilter} sepia(100%) saturate(600%) hue-rotate(340deg) contrast(150%)`;
    case "viridis":
      return `${baseFilter} sepia(70%) saturate(300%) hue-rotate(110deg)`;
    default:
      return (brightness !== 0 || contrast !== 0) ? baseFilter : "none";
  }
}

function drawPinsOverlay() {
  if (!state.pins || state.pins.length === 0) return;
  ctx.save();
  for (const pin of state.pins) {
    const screen = imageToScreen(pin.x, pin.y);
    if (screen.x < -40 || screen.y < -40 || screen.x > state.viewportWidth + 40 || screen.y > state.viewportHeight + 40) continue;

    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 145, 0, 0.28)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = pin.color || "#ff9100";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (pin.label) {
      ctx.font = "bold 10px system-ui, sans-serif";
      const metrics = ctx.measureText(pin.label);
      const w = metrics.width + 10;
      const h = 17;
      const lx = screen.x + 8;
      const ly = screen.y - 8;

      ctx.fillStyle = "rgba(9, 20, 27, 0.92)";
      ctx.strokeStyle = pin.color || "#ff9100";
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(lx, ly - h / 2, w, h, 4);
      else ctx.rect(lx, ly - h / 2, w, h);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(pin.label, lx + 5, ly);
    }
  }
  ctx.restore();
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
    const filterStr = getCanvasFilter(state.contrast);
    if (filterStr !== "none") {
      ctx.filter = filterStr;
    }
    const overviewSource = getAdjustedOverviewSource(state.contrast.gamma);
    if (overviewSource) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(overviewSource, state.view.x, state.view.y, imageWidth, imageHeight);
    }
    drawVisibleTiles();
    ctx.restore();
  } else {
    state.tileStats = { requested: 0, loaded: 0 };
  }

  renderOverlays();
  if (state.pins && state.pins.length > 0) {
    drawPinsOverlay();
  }

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

  const centerX = (xStart + xEnd) / 2;
  const centerY = (yStart + yEnd) / 2;
  const tileCoords = [];
  for (let y = yStart; y <= yEnd; y += 1) {
    for (let x = xStart; x <= xEnd; x += 1) {
      tileCoords.push({ x, y, dist: (x - centerX) ** 2 + (y - centerY) ** 2 });
    }
  }
  // Center-outward priority sorting: closest to viewport center loads first
  tileCoords.sort((a, b) => a.dist - b.dist);

  let requested = 0;
  let loaded = 0;

  for (const { x, y } of tileCoords) {
    requested += 1;
    const entry = requestTile(level, x, y);
    const levelX = x * tiles.width;
    const levelY = y * tiles.height;
    const sourceWidth = Math.min(tiles.width, dims.width - levelX);
    const sourceHeight = Math.min(tiles.height, dims.height - levelY);
    const imageX = levelX / dims.scale;
    const imageY = levelY / dims.scale;
    const destination = imageToScreen(imageX, imageY);
    const destinationWidth = (sourceWidth / dims.scale) * state.view.scale;
    const destinationHeight = (sourceHeight / dims.scale) * state.view.scale;

    if (entry.status === "ready") {
      loaded += 1;
      ctx.imageSmoothingEnabled = true;
      const tileSource = getAdjustedTileSource(entry, state.contrast.gamma);
      ctx.drawImage(tileSource, destination.x, destination.y, destinationWidth + 0.35, destinationHeight + 0.35);
    } else if (level > 0) {
      // Ancestor fallback: render scaled parent tile subregion while loading to prevent black flashes
      const parentKey = `${state.image.id}:${level - 1}:${Math.floor(x / 2)}:${Math.floor(y / 2)}`;
      const parentEntry = state.tileCache.get(parentKey);
      if (parentEntry?.status === "ready" && parentEntry.image) {
        const subX = (x % 2) * (tiles.width / 2);
        const subY = (y % 2) * (tiles.height / 2);
        const subW = Math.min(tiles.width / 2, (parentEntry.image.naturalWidth || tiles.width) - subX);
        const subH = Math.min(tiles.height / 2, (parentEntry.image.naturalHeight || tiles.height) - subY);
        if (subW > 0 && subH > 0) {
          ctx.imageSmoothingEnabled = true;
          const parentSource = getAdjustedTileSource(parentEntry, state.contrast.gamma);
          ctx.drawImage(
            parentSource,
            subX, subY, subW, subH,
            destination.x, destination.y, destinationWidth + 0.35, destinationHeight + 0.35
          );
        }
      }
    }

    if (state.showTileGrid) {
      ctx.strokeStyle = "rgba(85, 226, 214, .38)";
      ctx.lineWidth = 0.75;
      ctx.strokeRect(destination.x + 0.5, destination.y + 0.5, destinationWidth - 1, destinationHeight - 1);
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
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (state.image?.id !== sourceImageId) return;
      overviewCtx.drawImage(image, x * tiles.width, y * tiles.height);
      loaded += 1;
      remaining -= 1;
      if (loaded > 0) {
        state.overview = overview;
        overviewAppliedGamma = 0;
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
  const scaleX = layer.scaleX !== undefined ? layer.scaleX : 1;
  const scaleY = layer.scaleY !== undefined ? layer.scaleY : 1;
  const offsetX = layer.offsetX || 0;
  const offsetY = layer.offsetY || 0;
  if (scaleY === 1 && layer.flipY && !layer.autoFitted) {
    return {
      x: x * scaleX + offsetX,
      y: (state.image ? state.image.height - y : y) + offsetY,
    };
  }
  return {
    x: x * scaleX + offsetX,
    y: y * scaleY + offsetY,
  };
}

function inverseOverlayBounds(layer, bounds, imageHeight = state.image?.height) {
  const scaleX = layer.scaleX !== undefined ? layer.scaleX : 1;
  const scaleY = layer.scaleY !== undefined ? layer.scaleY : 1;
  const offsetX = layer.offsetX || 0;
  const offsetY = layer.offsetY || 0;
  if (scaleY === 1 && layer.flipY && !layer.autoFitted) {
    const sourceX1 = (Number(bounds.minX) - offsetX) / scaleX;
    const sourceX2 = (Number(bounds.maxX) - offsetX) / scaleX;
    const displayY1 = Number(bounds.minY) - offsetY;
    const displayY2 = Number(bounds.maxY) - offsetY;
    const sourceY1 = Number(imageHeight) - displayY1;
    const sourceY2 = Number(imageHeight) - displayY2;
    return {
      minX: Math.min(sourceX1, sourceX2),
      minY: Math.min(sourceY1, sourceY2),
      maxX: Math.max(sourceX1, sourceX2),
      maxY: Math.max(sourceY1, sourceY2),
    };
  }
  const sourceX1 = (Number(bounds.minX) - offsetX) / scaleX;
  const sourceX2 = (Number(bounds.maxX) - offsetX) / scaleX;
  const sourceY1 = (Number(bounds.minY) - offsetY) / scaleY;
  const sourceY2 = (Number(bounds.maxY) - offsetY) / scaleY;
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

const SWC_TYPE_COLORS = {
  1: "#38d1c4", // Soma (cyan)
  2: "#ff5252", // Axon (red)
  3: "#e040fb", // Basal Dendrite (magenta)
  4: "#69f0ae", // Apical Dendrite (green)
  5: "#ff9100", // Fork point (orange)
  6: "#ffd600", // End point (yellow)
  7: "#ffd740", // Custom/other (gold)
};

function renderSwc(layer) {
  const isAuto = (layer.colorMode || "auto") === "auto";
  const hidden = layer.hiddenTypes || new Set();
  const scale = state.view.scale;
  const viewX = state.view.x;
  const viewY = state.view.y;
  const offsetX = layer.offsetX;
  const offsetY = layer.offsetY;
  const flipY = layer.flipY;
  const imgHeight = state.image?.height || 0;
  const vpW = state.viewportWidth + 10;
  const vpH = state.viewportHeight + 10;
  const radius = Math.max(1.3, layer.size * 0.65);

  if (isAuto) {
    const typeSegments = new Map();
    for (const node of layer.nodes) {
      if (node.parent < 0) continue;
      const type = node.type || 7;
      const typeKey = String(type);
      if (hidden.has(typeKey) || (type > 4 && hidden.has("other"))) continue;

      const parent = layer.nodeMap.get(node.parent);
      if (!parent) continue;
      const startX = viewX + (parent.x + offsetX) * scale;
      const startY = viewY + ((flipY ? imgHeight - parent.y : parent.y) + offsetY) * scale;
      const endX = viewX + (node.x + offsetX) * scale;
      const endY = viewY + ((flipY ? imgHeight - node.y : node.y) + offsetY) * scale;

      if (!typeSegments.has(type)) typeSegments.set(type, []);
      typeSegments.get(type).push(startX, startY, endX, endY);
    }

    for (const [type, coords] of typeSegments.entries()) {
      ctx.beginPath();
      ctx.strokeStyle = SWC_TYPE_COLORS[type] || SWC_TYPE_COLORS[7];
      ctx.lineWidth = layer.size;
      for (let i = 0; i < coords.length; i += 4) {
        ctx.moveTo(coords[i], coords[i + 1]);
        ctx.lineTo(coords[i + 2], coords[i + 3]);
      }
      ctx.stroke();
    }

    const step = layer.nodes.length > 80_000 ? Math.ceil(layer.nodes.length / 80_000) : 1;
    const typeNodes = new Map();
    for (let index = 0; index < layer.nodes.length; index += step) {
      const node = layer.nodes[index];
      const type = node.type || 7;
      const typeKey = String(type);
      if (hidden.has(typeKey) || (type > 4 && hidden.has("other"))) continue;

      const ptX = viewX + (node.x + offsetX) * scale;
      const ptY = viewY + ((flipY ? imgHeight - node.y : node.y) + offsetY) * scale;
      if (ptX < -10 || ptY < -10 || ptX > vpW || ptY > vpH) continue;

      if (!typeNodes.has(type)) typeNodes.set(type, []);
      typeNodes.get(type).push(ptX, ptY);
    }

    for (const [type, pts] of typeNodes.entries()) {
      ctx.beginPath();
      ctx.fillStyle = SWC_TYPE_COLORS[type] || SWC_TYPE_COLORS[7];
      for (let i = 0; i < pts.length; i += 2) {
        ctx.moveTo(pts[i] + radius, pts[i + 1]);
        ctx.arc(pts[i], pts[i + 1], radius, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  } else {
    ctx.strokeStyle = layer.color;
    ctx.fillStyle = layer.color;
    ctx.lineWidth = layer.size;
    ctx.beginPath();
    for (const node of layer.nodes) {
      if (node.parent < 0) continue;
      const parent = layer.nodeMap.get(node.parent);
      if (!parent) continue;
      const startX = viewX + (parent.x + offsetX) * scale;
      const startY = viewY + ((flipY ? imgHeight - parent.y : parent.y) + offsetY) * scale;
      const endX = viewX + (node.x + offsetX) * scale;
      const endY = viewY + ((flipY ? imgHeight - node.y : node.y) + offsetY) * scale;
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
    }
    ctx.stroke();

    const step = layer.nodes.length > 80_000 ? Math.ceil(layer.nodes.length / 80_000) : 1;
    ctx.beginPath();
    for (let index = 0; index < layer.nodes.length; index += step) {
      const node = layer.nodes[index];
      const ptX = viewX + (node.x + offsetX) * scale;
      const ptY = viewY + ((flipY ? imgHeight - node.y : node.y) + offsetY) * scale;
      if (ptX < -10 || ptY < -10 || ptX > vpW || ptY > vpH) continue;
      ctx.moveTo(ptX + radius, ptY);
      ctx.arc(ptX, ptY, radius, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

function renderJson(layer) {
  if (layer.indexed) {
    queueIndexedGeometry(layer);
    const segments = layer.geometrySegments;
    if (!segments?.length) return;
    const scale = state.view.scale;
    const viewX = state.view.x;
    const viewY = state.view.y;
    const offsetX = layer.offsetX;
    const offsetY = layer.offsetY;
    const flipY = layer.flipY;
    const imgHeight = state.image.height;
    const vpW = state.viewportWidth + 8;
    const vpH = state.viewportHeight + 8;

    ctx.beginPath();
    for (let index = 0; index < segments.length; index += 4) {
      if (segments[index] === segments[index + 2] && segments[index + 1] === segments[index + 3]) continue;
      const x1 = viewX + (segments[index] + offsetX) * scale;
      const y1 = viewY + ((flipY ? imgHeight - segments[index + 1] : segments[index + 1]) + offsetY) * scale;
      const x2 = viewX + (segments[index + 2] + offsetX) * scale;
      const y2 = viewY + ((flipY ? imgHeight - segments[index + 3] : segments[index + 3]) + offsetY) * scale;
      if ((x1 < -8 && x2 < -8) || (y1 < -8 && y2 < -8) || (x1 > vpW && x2 > vpW) || (y1 > vpH && y2 > vpH)) continue;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();

    const radius = Math.max(1.2, layer.size * 0.7);
    ctx.beginPath();
    for (let index = 0; index < segments.length; index += 4) {
      if (segments[index] !== segments[index + 2] || segments[index + 1] !== segments[index + 3]) continue;
      const x = viewX + (segments[index] + offsetX) * scale;
      const y = viewY + ((flipY ? imgHeight - segments[index + 1] : segments[index + 1]) + offsetY) * scale;
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
  if (els.statusZoom) els.statusZoom.textContent = zoomLabel;
  const level = deepZoomLevel();
  if (els.resolutionLabel && state.image?.maxLevel) {
    els.resolutionLabel.textContent = `Pyramid level ${level} / ${state.image.maxLevel}`;
  }
  const nicePixels = niceScaleDistance(105 / state.view.scale);
  const barWidth = Math.max(44, nicePixels * state.view.scale);
  if (els.scaleBar) els.scaleBar.style.width = `${barWidth}px`;
  if (els.scaleLabel) els.scaleLabel.textContent = `${formatNumber(nicePixels)} px`;
  if (els.tileStatus) {
    const { requested, loaded } = state.tileStats;
    els.tileStatus.classList.toggle("loading", requested > loaded);
    const textNode = els.tileStatus.lastChild || els.tileStatus;
    if (requested === 0) textNode.textContent = "Base layer hidden";
    else if (loaded < requested) textNode.textContent = `Loading tiles ${loaded}/${requested}`;
    else textNode.textContent = `${loaded} visible tile${loaded === 1 ? "" : "s"} · cached`;
  }
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
  const miniOverview = getAdjustedOverviewSource(state.contrast.gamma);
  if (miniOverview) {
    miniCtx.save();
    const filterStr = getCanvasFilter(state.contrast);
    if (filterStr !== "none") {
      miniCtx.filter = filterStr;
    }
    miniCtx.drawImage(miniOverview, x, y, drawWidth, drawHeight);
    miniCtx.restore();
  } else {
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
    color: nextLayerColor("swc"), colorMode: "auto", hiddenTypes: new Set(),
    size: 2, offsetX: 0, offsetY: 0, flipY: false, ...parsed,
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
    scaleX: 1,
    scaleY: 1,
    offsetX: 0,
    offsetY: alignment.offsetY,
    flipY: Boolean(alignment.flipY),
    alignmentMode: alignment.mode,
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
    scaleX: 1,
    scaleY: 1,
    offsetX: 0,
    offsetY: alignment.offsetY,
    flipY: Boolean(alignment.flipY),
    alignmentMode: alignment.mode,
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
  const overlayCount = state.layers.filter((l) => l.kind !== "base").length;
  if (els.clearAllOverlaysBtn) els.clearAllOverlaysBtn.classList.toggle("hidden", overlayCount === 0);
  const hasSeries = Boolean(state.brainSeries && state.brainSeries.slices?.length > 0);
  if (els.layersSectionSync) els.layersSectionSync.classList.toggle("hidden", !hasSeries);

  els.layerList.innerHTML = state.layers.map((layer) => {
    const icon = layer.kind === "base" ? "i-image" : layer.kind === "swc" ? "i-network" : "i-points";
    const eye = layer.visible ? "i-eye" : "i-eye-off";
    return `<div class="layer-item ${layer.id === state.selectedLayerId ? "selected" : ""} ${layer.visible ? "" : "is-hidden"}" data-layer-id="${layer.id}">
      <span class="layer-symbol ${layer.kind === "base" ? "base" : ""}" style="--layer-color:${layer.color}">${iconUse(icon)}</span>
      <span class="layer-copy"><strong title="${escapeHtml(layer.name)}">${escapeHtml(layer.name)}</strong><span>${escapeHtml(layerTypeLabel(layer))}</span></span>
      ${layer.kind !== "base" ? `<button class="icon-button compact align-layer-button" data-action="align" title="Align overlay (Flip Y)">🔄</button>` : ""}
      <button class="icon-button visibility-button" data-action="visibility" title="${layer.visible ? "Hide" : "Show"} layer">${iconUse(eye)}</button>
      <span class="layer-opacity">${Math.round(layer.opacity * 100)}%</span>
    </div>`;
  }).join("");
  renderCompanionsCard();
}

async function checkImageCompanions(imageId) {
  if (!imageId) return;
  try {
    const response = await fetch(`/api/images/${encodeURIComponent(imageId)}/companions`);
    if (!response.ok) return;
    const data = await response.json();
    if (state.image?.id !== imageId) return;
    state.companions = Array.isArray(data?.companions) ? data.companions : [];
    renderCompanionsCard();

    // Auto-discover and populate brain series filmstrip if not already loaded for this series
    if (data?.brainSeries) {
      if (!state.brainSeries || state.brainSeries.brainId !== data.brainSeries.brainId) {
        void openBrainSeries(data.brainSeries.mountId, data.brainSeries.path, undefined, false);
      } else {
        const sliceIdx = state.brainSeries.slices.findIndex(s => s.filename === state.image?.filename || (state.image?.filename && s.filename && state.image.filename.replace(/(_lossy|_lossless)/i, "") === s.filename.replace(/(_lossy|_lossless)/i, "")));
        if (sliceIdx !== -1 && sliceIdx !== state.brainSeries.activeSliceIndex) {
          state.brainSeries.activeSliceIndex = sliceIdx;
          renderFilmstrip();
        }
      }
    }
  } catch {
    // Non-blocking companion query
  }
}

function availableCompanions() {
  const loadedNames = new Set(state.layers.map((l) => l.name));
  return state.companions.filter((c) => !loadedNames.has(c.filename));
}

function renderCompanionsCard() {
  if (!els.companionOverlayCard) return;
  const available = availableCompanions();
  if (!state.image || available.length === 0) {
    els.companionOverlayCard.classList.add("hidden");
    return;
  }

  els.companionOverlayCard.classList.remove("hidden");
  els.companionCount.textContent = `${available.length} found`;

  els.companionList.innerHTML = available.slice(0, 3).map((comp) => {
    return `<div class="companion-item">
      <div class="companion-item-info">
        <span class="companion-item-name" title="${escapeHtml(comp.filename)}">${escapeHtml(comp.filename)}</span>
        <span class="companion-item-meta">${escapeHtml(comp.typeLabel)} · ${formatBytes(comp.size)}</span>
      </div>
      <button class="companion-load-btn" data-companion-file="${escapeHtml(comp.filename)}" title="Load ${escapeHtml(comp.filename)}">
        <svg aria-hidden="true" style="width:12px;height:12px"><use href="#i-plus"></use></svg>
        <span>Load</span>
      </button>
    </div>`;
  }).join("");

  $$(".companion-load-btn", els.companionList).forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const filename = btn.getAttribute("data-companion-file");
      const comp = state.companions.find((c) => c.filename === filename);
      if (!comp) return;
      btn.disabled = true;
      btn.textContent = "Loading…";
      await loadCompanionOverlay(comp);
    });
  });
}

async function loadCompanionOverlay(comp) {
  if (comp.isDemo) {
    if (comp.kind === "swc") {
      const text = await fetch("/demo.swc").then(r => r.text());
      addSwcLayer(comp.filename, text, true);
    } else {
      const text = await fetch("/demo-points.json").then(r => r.text());
      addJsonLayer(comp.filename, text, true);
    }
    renderCompanionsCard();
    return true;
  }
  const result = await openResolvedServerOverlay(
    { name: comp.filename, path: comp.path, size: comp.size },
    comp.mountId,
  );
  renderCompanionsCard();
  return result;
}

function openCompanionPicker() {
  if (!els.companionPickerDialog) return;
  const available = availableCompanions();
  if (available.length === 0) {
    showServerPathDialog();
    return;
  }

  els.companionPickerList.innerHTML = available.map((comp) => {
    const icon = comp.kind === "swc" ? "i-network" : "i-points";
    return `<div class="companion-picker-row">
      <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
        <span class="layer-symbol" style="width:28px;height:28px;"><svg style="width:15px;height:15px;"><use href="#${icon}"></use></svg></span>
        <div style="min-width:0; flex:1;">
          <strong style="display:block; font-size:12px; color:#d1dfe6; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(comp.filename)}</strong>
          <span style="font-size:10px; color:#6d8694;">${escapeHtml(comp.typeLabel)} · ${formatBytes(comp.size)}</span>
        </div>
      </div>
      <button class="button button-secondary companion-picker-item-load" data-companion-file="${escapeHtml(comp.filename)}">
        Load Overlay
      </button>
    </div>`;
  }).join("");

  $$(".companion-picker-item-load", els.companionPickerList).forEach((btn) => {
    btn.addEventListener("click", async () => {
      const filename = btn.getAttribute("data-companion-file");
      const comp = state.companions.find((c) => c.filename === filename);
      if (!comp) return;
      btn.disabled = true;
      btn.textContent = "Loading…";
      await loadCompanionOverlay(comp);
      openCompanionPicker();
    });
  });

  els.companionPickerDialog.showModal();
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
  const isBase = layer.kind === "base";
  const isSwc = layer.kind === "swc";
  $$(".overlay-only", els.inspectorContent).forEach((element) => element.classList.toggle("hidden", !overlay));
  $$(".base-only", els.inspectorContent).forEach((element) => element.classList.toggle("hidden", !isBase));
  $$(".swc-only", els.inspectorContent).forEach((element) => element.classList.toggle("hidden", !isSwc));
  if (isSwc) {
    if (els.swcColorMode) els.swcColorMode.value = layer.colorMode || "auto";
    if (els.swcCompartments) {
      const hidden = layer.hiddenTypes || new Set();
      $$("[data-swc-type]", els.swcCompartments).forEach((checkbox) => {
        const type = checkbox.getAttribute("data-swc-type");
        checkbox.checked = !hidden.has(type);
      });
    }
  }
  if (isBase && els.brightnessRange && els.contrastRange && els.gammaRange) {
    els.brightnessRange.value = state.contrast.brightness;
    els.brightnessOutput.textContent = `${state.contrast.brightness > 0 ? "+" : ""}${state.contrast.brightness}%`;
    els.contrastRange.value = state.contrast.contrast;
    els.contrastOutput.textContent = `${state.contrast.contrast > 0 ? "+" : ""}${state.contrast.contrast}%`;
    els.gammaRange.value = Math.round(state.contrast.gamma * 100);
    els.gammaOutput.textContent = state.contrast.gamma.toFixed(1);
    els.brightnessRange.style.setProperty("--range-progress", `${((state.contrast.brightness + 100) / 200) * 100}%`);
    els.contrastRange.style.setProperty("--range-progress", `${((state.contrast.contrast + 100) / 200) * 100}%`);
    els.gammaRange.style.setProperty("--range-progress", `${((els.gammaRange.value - 20) / 280) * 100}%`);
  }
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
    if (els.offsetX) els.offsetX.value = layer.offsetX;
    if (els.offsetY) els.offsetY.value = layer.offsetY;
    if (els.flipY) els.flipY.checked = layer.flipY;
    if (els.alignOverlayButton) {
      els.alignOverlayButton.classList.toggle("is-flipped", !!layer.flipY);
    }
    if (els.overlayScaleDisplay) {
      const curScale = Math.abs(layer.scaleX !== undefined ? layer.scaleX : 1);
      els.overlayScaleDisplay.textContent = `${Math.round(curScale * 100)}%`;
    }
    if (els.alignmentOrientationLabel) {
      if (layer.autoFitted) {
        els.alignmentOrientationLabel.textContent = `Auto-Fitted · Scale: ${(Math.abs(layer.scaleX || 1) * 100).toFixed(0)}%${(layer.scaleY || 1) < 0 ? " (Flipped Y)" : ""}`;
      } else if ((layer.scaleY !== undefined && layer.scaleY < 0) || layer.flipY || layer.alignmentMode === "negative-y") {
        els.alignmentOrientationLabel.textContent = `1:1 Native · Inverted Y (${(Math.abs(layer.scaleX || 1) * 100).toFixed(0)}%)`;
      } else {
        els.alignmentOrientationLabel.textContent = `1:1 Native · Standard (${(Math.abs(layer.scaleX || 1) * 100).toFixed(0)}%)`;
      }
    }
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
function layerBounds(layer) {
  if (!layer) return null;
  if (layer.bounds && Number.isFinite(Number(layer.bounds.minX)) && Number.isFinite(Number(layer.bounds.maxX))) {
    return {
      minX: Number(layer.bounds.minX),
      minY: Number(layer.bounds.minY),
      maxX: Number(layer.bounds.maxX),
      maxY: Number(layer.bounds.maxY),
    };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const update = (x, y) => {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  };
  if (layer.kind === "swc" && layer.nodes) {
    layer.nodes.forEach((n) => update(n.x, n.y));
  } else if (layer.polygons) {
    layer.polygons.forEach((p) => p.coordinates.forEach(([x, y]) => update(x, y)));
  }
  if (layer.lines) {
    layer.lines.forEach((l) => l.coordinates.forEach(([x, y]) => update(x, y)));
  }
  if (layer.points) {
    layer.points.forEach((p) => update(p.x, p.y));
  }
  if (Number.isFinite(minX) && Number.isFinite(maxX) && minX <= maxX && minY <= maxY) {
    return { minX, minY, maxX, maxY };
  }
  return null;
}

function autoFitToImage(layer = selectedLayer()) {
  if (!layer || layer.kind === "base" || !state.image) return;
  const bounds = layerBounds(layer);
  if (!bounds) {
    toast("Alignment Warning", "No coordinate bounds found for this overlay.", "warning");
    return;
  }

  const ovWidth = Math.max(1, bounds.maxX - bounds.minX);
  const ovHeight = Math.max(1, Math.abs(bounds.maxY - bounds.minY));
  const imgWidth = state.image.width;
  const imgHeight = state.image.height;

  const isNegativeY = bounds.maxY <= 0 || (bounds.minY < 0 && Math.abs(bounds.minY) > bounds.maxY);
  const fitScale = Math.min((imgWidth * 0.92) / ovWidth, (imgHeight * 0.92) / ovHeight);

  const ovCenterX = (bounds.minX + bounds.maxX) / 2;
  const ovCenterY = (bounds.minY + bounds.maxY) / 2;
  const imgCenterX = imgWidth / 2;
  const imgCenterY = imgHeight / 2;

  layer.scaleX = fitScale;
  layer.scaleY = isNegativeY ? -fitScale : fitScale;
  layer.offsetX = imgCenterX - ovCenterX * layer.scaleX;
  layer.offsetY = imgCenterY - ovCenterY * layer.scaleY;
  layer.flipY = false;
  layer.autoFitted = true;

  if (els.offsetX) els.offsetX.value = Math.round(layer.offsetX);
  if (els.offsetY) els.offsetY.value = Math.round(layer.offsetY);
  if (els.flipY) els.flipY.checked = false;

  updateInspector();
  renderLayerList();
  scheduleRender();
  toast("Overlay Aligned", "Auto-scaled and centered overlay onto image.", "success", 3000);
}

function flipVertical(layer = selectedLayer()) {
  if (!layer || layer.kind === "base" || !state.image) return;
  const bounds = layerBounds(layer);
  const imgCenterY = state.image.height / 2;

  if (layer.autoFitted && bounds) {
    const ovCenterY = (bounds.minY + bounds.maxY) / 2;
    layer.scaleY = -(layer.scaleY !== undefined ? layer.scaleY : 1);
    layer.offsetY = imgCenterY - ovCenterY * layer.scaleY;
  } else {
    layer.flipY = !layer.flipY;
    if (layer.alignmentMode === "negative-y") {
      layer.offsetY = layer.flipY ? -Number(state.image.height) : 0;
    }
  }

  if (els.offsetY) els.offsetY.value = Math.round(layer.offsetY);
  if (els.flipY) els.flipY.checked = !!layer.flipY;

  updateInspector();
  renderLayerList();
  scheduleRender();
  toast("Overlay Flipped", "Flipped vertical (Y axis) orientation.", "info", 3000);
}

function alignNative1to1(layer = selectedLayer()) {
  if (!layer || layer.kind === "base" || !state.image) return;
  const bounds = layerBounds(layer);
  const isNegativeY = bounds ? (bounds.maxY <= 0 || (bounds.minY < 0 && Math.abs(bounds.minY) > bounds.maxY)) : false;
  layer.scaleX = 1;
  layer.scaleY = 1;
  layer.offsetX = 0;
  layer.offsetY = isNegativeY ? -Number(state.image.height) : 0;
  layer.flipY = isNegativeY;
  layer.autoFitted = false;
  layer.alignmentMode = isNegativeY ? "negative-y" : null;

  if (els.offsetX) els.offsetX.value = 0;
  if (els.offsetY) els.offsetY.value = Math.round(layer.offsetY);
  if (els.flipY) els.flipY.checked = Boolean(layer.flipY);

  updateInspector();
  renderLayerList();
  scheduleRender();
  toast("Native 1:1 Alignment", isNegativeY ? "Applied native 1:1 scale with inverted Y." : "Reset to 1:1 native coordinates.", "success", 3000);
}

function adjustOverlayScale(delta, layer = selectedLayer()) {
  if (!layer || layer.kind === "base" || !state.image) return;
  const bounds = layerBounds(layer);
  const ovCenterX = bounds ? (bounds.minX + bounds.maxX) / 2 : 0;
  const ovCenterY = bounds ? (bounds.minY + bounds.maxY) / 2 : 0;
  const prevSx = layer.scaleX !== undefined ? layer.scaleX : 1;
  const prevSy = layer.scaleY !== undefined ? layer.scaleY : 1;

  const curCenterX = ovCenterX * prevSx + (layer.offsetX || 0);
  const curCenterY = ovCenterY * prevSy + (layer.offsetY || 0);

  const factor = 1 + delta;
  layer.scaleX = prevSx * factor;
  layer.scaleY = prevSy * factor;
  layer.offsetX = curCenterX - ovCenterX * layer.scaleX;
  layer.offsetY = curCenterY - ovCenterY * layer.scaleY;

  updateInspector();
  scheduleRender();
}

function nudgeOverlay(dx, dy, layer = selectedLayer()) {
  if (!layer || layer.kind === "base") return;
  layer.offsetX = (layer.offsetX || 0) + dx;
  layer.offsetY = (layer.offsetY || 0) + dy;
  if (els.offsetX) els.offsetX.value = Math.round(layer.offsetX);
  if (els.offsetY) els.offsetY.value = Math.round(layer.offsetY);
  updateInspector();
  scheduleRender();
}

function resetAlignment(layer = selectedLayer()) {
  if (!layer || layer.kind === "base") return;
  layer.scaleX = 1;
  layer.scaleY = 1;
  layer.offsetX = 0;
  layer.offsetY = 0;
  layer.flipY = false;
  layer.autoFitted = false;
  layer.alignmentMode = null;

  if (els.offsetX) els.offsetX.value = 0;
  if (els.offsetY) els.offsetY.value = 0;
  if (els.flipY) els.flipY.checked = false;

  updateInspector();
  renderLayerList();
  scheduleRender();
  toast("Overlay Reset", "Reset to raw file coordinates.", "info", 3000);
}

function clearAllOverlays() {
  const overlays = state.layers.filter((l) => l.kind !== "base");
  if (overlays.length === 0) return;
  overlays.forEach(disposeIndexedLayer);
  state.layers = state.layers.filter((l) => l.kind === "base");
  state.selectedLayerId = "base";
  renderLayerList();
  updateInspector();
  scheduleRender();
  toast("Overlays Cleared", `Removed ${overlays.length} overlay layer${overlays.length > 1 ? "s" : ""}.`, "info", 2500);
}

function alignOverlay(layer = selectedLayer()) {
  if (!layer || layer.kind === "base" || !state.image) return;
  const bounds = layerBounds(layer);
  const isNegativeY = bounds ? (bounds.maxY <= 0 || (bounds.minY < 0 && Math.abs(bounds.minY) > bounds.maxY)) : false;
  const ratio = outsideRatio(layer);

  // If overlay has negative Y and is currently auto-fitted or not 1:1 inverted Y, apply 1:1 native!
  if (isNegativeY && (layer.autoFitted || layer.scaleY !== -1 || layer.scaleX !== 1)) {
    alignNative1to1(layer);
    return;
  }

  // If overlay is outside bounds, auto-fit it to image
  if (ratio > 0.25 && !layer.autoFitted) {
    autoFitToImage(layer);
    return;
  }

  // Otherwise toggle vertical flip
  flipVertical(layer);
}

els.layerList.addEventListener("click", (event) => {
  const item = event.target.closest(".layer-item");
  if (!item) return;
  const layer = state.layers.find((candidate) => candidate.id === item.dataset.layerId);
  if (!layer) return;
  if (event.target.closest('[data-action="visibility"]')) toggleLayer(layer);
  else if (event.target.closest('[data-action="align"]')) alignOverlay(layer);
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
if (els.swcColorMode) {
  els.swcColorMode.addEventListener("change", () => {
    const layer = selectedLayer();
    if (!layer || layer.kind !== "swc") return;
    layer.colorMode = els.swcColorMode.value;
    scheduleRender();
  });
}
if (els.swcCompartments) {
  els.swcCompartments.addEventListener("change", (e) => {
    const layer = selectedLayer();
    if (!layer || layer.kind !== "swc") return;
    const type = e.target.getAttribute("data-swc-type");
    if (!type) return;
    if (!layer.hiddenTypes) layer.hiddenTypes = new Set();
    if (e.target.checked) {
      layer.hiddenTypes.delete(type);
    } else {
      layer.hiddenTypes.add(type);
    }
    scheduleRender();
  });
}
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

function togglePinMode() {
  if (!state.image) return;
  state.isPinning = !state.isPinning;
  if (state.isPinning) {
    if (els.shell) {
      els.shell.classList.add("pinning");
    }
    if (els.pinButton) els.pinButton.classList.add("active");
    toast("Landmark Pin Mode", "Click on the image to drop a labeled landmark pin.", "info", 3500);
  } else {
    if (els.shell) els.shell.classList.remove("pinning");
    if (els.pinButton) els.pinButton.classList.remove("active");
  }
}
if (els.pinButton) els.pinButton.addEventListener("click", togglePinMode);

function updateContrast() {
  const b = Number(els.brightnessRange.value) || 0;
  const c = Number(els.contrastRange.value) || 0;
  const g = (Number(els.gammaRange.value) || 100) / 100;
  const lut = els.lutPreset ? els.lutPreset.value : "normal";
  state.contrast = { brightness: b, contrast: c, gamma: g, lut };
  state.contrastKey = `${b}_${c}_${g}_${lut}`;
  els.brightnessOutput.textContent = `${b > 0 ? "+" : ""}${b}%`;
  els.contrastOutput.textContent = `${c > 0 ? "+" : ""}${c}%`;
  els.gammaOutput.textContent = g.toFixed(1);
  els.brightnessRange.style.setProperty("--range-progress", `${((b + 100) / 200) * 100}%`);
  els.contrastRange.style.setProperty("--range-progress", `${((c + 100) / 200) * 100}%`);
  els.gammaRange.style.setProperty("--range-progress", `${((els.gammaRange.value - 20) / 280) * 100}%`);
  scheduleRender();
}
if (els.lutPreset) els.lutPreset.addEventListener("change", updateContrast);
if (els.brightnessRange) els.brightnessRange.addEventListener("input", updateContrast);
if (els.contrastRange) els.contrastRange.addEventListener("input", updateContrast);
if (els.gammaRange) els.gammaRange.addEventListener("input", updateContrast);
if (els.resetContrastButton) {
  els.resetContrastButton.addEventListener("click", () => {
    if (els.lutPreset) els.lutPreset.value = "normal";
    if (els.brightnessRange) els.brightnessRange.value = 0;
    if (els.contrastRange) els.contrastRange.value = 0;
    if (els.gammaRange) els.gammaRange.value = 100;
    updateContrast();
  });
}

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
els.fileBrowserUp.addEventListener("click", () => {
  if (state.browserParent !== null && state.browserParent !== undefined) {
    void loadFileBrowserDirectory(state.browserMountId, state.browserParent);
  }
});
els.fileBrowserFilter.addEventListener("input", (e) => {
  state.browserFilter = e.target.value;
  renderFileBrowserList();
});
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
  if (event.target.closest("button") || event.target.closest(".hud-chip") || event.target.closest(".minimap") || event.target.closest(".section-nav-hud")) return;
  if (!state.image || event.button !== 0) return;
  if (state.isPinning) {
    const rect = els.shell.getBoundingClientRect();
    const imgPt = screenToImage(event.clientX - rect.left, event.clientY - rect.top);
    const defaultLabel = `Landmark ${state.pins.length + 1}`;
    const label = window.prompt(`Enter landmark label for (${Math.round(imgPt.x)}, ${Math.round(imgPt.y)}):`, defaultLabel);
    if (label !== null) {
      state.pins.push({
        id: crypto.randomUUID(),
        x: imgPt.x,
        y: imgPt.y,
        label: label.trim() || defaultLabel,
        color: "#ff9100",
        createdAt: new Date().toISOString(),
      });
      scheduleRender();
      toast("Landmark Placed", `Pinned "${label || defaultLabel}" at (${Math.round(imgPt.x)}, ${Math.round(imgPt.y)})`);
    }
    return;
  }
  els.shell.setPointerCapture(event.pointerId);
  state.pointer = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY, startX: event.clientX, startY: event.clientY };
  state.moved = false;
  els.shell.classList.add("is-panning");
  els.shell.focus({ preventScroll: true });
});

function navigateSerialSection(delta) {
  if (state.brainSeries && state.brainSeries.slices.length > 0) {
    const nextIdx = state.brainSeries.activeSliceIndex + delta;
    if (nextIdx >= 0 && nextIdx < state.brainSeries.slices.length) {
      void switchBrainSeriesSlice(nextIdx);
    }
    return;
  }
  if (!state.imageLibrary?.records || state.imageLibrary.records.length === 0) return;
  const currentIdx = state.imageLibrary.records.findIndex((img) => img.id === state.image?.id);
  if (currentIdx === -1) return;
  const nextIdx = currentIdx + delta;
  if (nextIdx >= 0 && nextIdx < state.imageLibrary.records.length) {
    const nextImg = state.imageLibrary.records[nextIdx];
    toast("Navigating section", `Opening slice ${nextIdx + 1}/${state.imageLibrary.records.length}: ${nextImg.filename}`);
    void openImageFromLibrary(nextImg.id);
  }
}

async function openBrainSeries(mountId, path, initialSliceIndex, autoActivate = true) {
  if (autoActivate) {
    showProcessing({ filename: "Discovering serial brain sections…", progress: 5, status: "processing" });
  }
  try {
    const url = `/api/mounts/${encodeURIComponent(mountId)}/brain-series?path=${encodeURIComponent(path)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Could not load brain series (HTTP ${response.status})`);
    }
    const data = await response.json();
    if (!data.slices || data.slices.length === 0) {
      throw new Error("No image slices found in this brain directory");
    }

    let activeIdx = 0;
    if (typeof initialSliceIndex === "number" && initialSliceIndex >= 0 && initialSliceIndex < data.slices.length) {
      activeIdx = initialSliceIndex;
    } else if (state.image?.filename) {
      const matchIdx = data.slices.findIndex(s => s.filename === state.image.filename || (state.image.filename && s.filename && state.image.filename.replace(/(_lossy|_lossless)/i, "") === s.filename.replace(/(_lossy|_lossless)/i, "")));
      if (matchIdx !== -1) activeIdx = matchIdx;
    }

    state.brainSeries = {
      brainId: data.brainId,
      rootPath: data.rootPath,
      mountId: data.mountId,
      sliceCount: data.sliceCount,
      totalOverlays: data.totalOverlays,
      slices: data.slices,
      activeSliceIndex: activeIdx,
    };

    renderFilmstrip();

    if (autoActivate) {
      hideProcessing();
      await switchBrainSeriesSlice(state.brainSeries.activeSliceIndex, false);
      toast(
        "Brain Series Loaded",
        `Opened ${data.brainId}: ${data.sliceCount} serial slices found (${data.totalOverlays} overlays available).`,
        "success",
        5000
      );
    }
  } catch (err) {
    if (autoActivate) hideProcessing();
    toast("Brain Series Error", err.message, "error");
  }
}

function renderSectionNav() {
  const hasSeries = !!(state.brainSeries && state.brainSeries.slices?.length > 0);
  if (els.sectionNavGroup) els.sectionNavGroup.classList.toggle("hidden", !hasSeries);
  if (els.sectionNavHud) els.sectionNavHud.classList.toggle("hidden", !hasSeries);
  if (!hasSeries) return;

  const activeIdx = state.brainSeries.activeSliceIndex;
  const total = state.brainSeries.sliceCount;
  const currentSlice = state.brainSeries.slices[activeIdx];
  const sectionName = currentSlice?.section || `#${activeIdx + 1}`;
  const labelText = `Section ${sectionName} · ${activeIdx + 1} / ${total}`;

  if (els.navSectionLabel) els.navSectionLabel.textContent = labelText;
  if (els.hudNavLabel) els.hudNavLabel.textContent = `🧠 ${state.brainSeries.brainId} · ${labelText}`;

  if (els.navPrevSection) els.navPrevSection.disabled = activeIdx <= 0;
  if (els.navNextSection) els.navNextSection.disabled = activeIdx >= total - 1;
  if (els.hudNavPrev) els.hudNavPrev.disabled = activeIdx <= 0;
  if (els.hudNavNext) els.hudNavNext.disabled = activeIdx >= total - 1;
}

const renderFilmstrip = renderSectionNav;

async function switchBrainSeriesSlice(index, preserveView = true) {
  if (!state.brainSeries || index < 0 || index >= state.brainSeries.slices.length) return;
  state.brainSeries.activeSliceIndex = index;
  renderSectionNav();

  const slice = state.brainSeries.slices[index];
  const operationToken = beginImageOperation();
  const hadOverlay = state.layers.some(l => l.kind !== "base" && l.visible);
  const shouldKeepOverlays = state.autoClearOverlaysOnSectionChange === false;

  try {
    const response = await fetch(`/api/mounts/${encodeURIComponent(slice.mountId)}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: slice.path }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Could not register slice ${slice.filename}`);
    }
    const metadata = await response.json();
    ensureCurrentImageOperation(operationToken);

    // Activate image: auto-remove previous overlays unless user chose to keep them
    await activateImage(metadata, { preserveView, preserveOverlays: shouldKeepOverlays });

    // Auto-populate companion card
    if (slice.companions && slice.companions.length > 0) {
      state.companions = slice.companions;
      renderCompanionsCard();
      // If previous slice had an overlay visible, automatically load matching companion for this slice!
      if (hadOverlay) {
        const primaryCompanion = slice.companions[0];
        if (primaryCompanion) {
          void loadCompanionOverlay(primaryCompanion);
        }
      }
    }
    renderSectionNav();
  } catch (err) {
    if (imageOperationWasSuperseded(err, operationToken)) return;
    renderSectionNav();
    toast("Slice Navigation Error", err.message, "error");
  }
}

function closeBrainSeries() {
  state.brainSeries = null;
  renderSectionNav();
}

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
  else if (key === "p") togglePinMode();
  else if (key === "[" || key === "]") navigateSerialSection(key === "]" ? 1 : -1);
  else if (key === "escape") {
    if (state.isPinning) togglePinMode();
  }
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

if (els.addOverlayBtn) {
  els.addOverlayBtn.addEventListener("click", () => {
    const available = availableCompanions();
    if (available.length > 0) {
      openCompanionPicker();
    } else {
      showServerPathDialog();
    }
  });
}

if (els.closeCompanionPicker) els.closeCompanionPicker.addEventListener("click", () => els.companionPickerDialog?.close());
if (els.cancelCompanionPicker) els.cancelCompanionPicker.addEventListener("click", () => els.companionPickerDialog?.close());
if (els.loadAllCompanionsBtn) {
  els.loadAllCompanionsBtn.addEventListener("click", async () => {
    const available = availableCompanions();
    els.loadAllCompanionsBtn.disabled = true;
    els.loadAllCompanionsBtn.textContent = "Loading All…";
    for (const comp of available) {
      await loadCompanionOverlay(comp);
    }
    els.loadAllCompanionsBtn.disabled = false;
    els.loadAllCompanionsBtn.textContent = "Load All Overlays";
    els.companionPickerDialog?.close();
  });
}

if (els.navPrevSection) els.navPrevSection.addEventListener("click", () => navigateSerialSection(-1));
if (els.navNextSection) els.navNextSection.addEventListener("click", () => navigateSerialSection(1));
if (els.hudNavPrev) els.hudNavPrev.addEventListener("click", (e) => { e.stopPropagation(); navigateSerialSection(-1); });
if (els.hudNavNext) els.hudNavNext.addEventListener("click", (e) => { e.stopPropagation(); navigateSerialSection(1); });
if (els.sectionNavHud) els.sectionNavHud.addEventListener("pointerdown", (e) => e.stopPropagation());
if (els.alignOverlayButton) els.alignOverlayButton.addEventListener("click", () => alignOverlay(selectedLayer()));
if (els.btn1to1Overlay) els.btn1to1Overlay.addEventListener("click", () => alignNative1to1(selectedLayer()));
if (els.btnFitOverlay) els.btnFitOverlay.addEventListener("click", () => autoFitToImage(selectedLayer()));
if (els.btnFlipVertical) els.btnFlipVertical.addEventListener("click", () => flipVertical(selectedLayer()));
if (els.btnResetAlignment) els.btnResetAlignment.addEventListener("click", () => resetAlignment(selectedLayer()));

if (els.btnScaleDown) els.btnScaleDown.addEventListener("click", (e) => adjustOverlayScale(e.shiftKey ? -0.1 : -0.02));
if (els.btnScaleUp) els.btnScaleUp.addEventListener("click", (e) => adjustOverlayScale(e.shiftKey ? 0.1 : 0.02));
if (els.btnNudgeLeft) els.btnNudgeLeft.addEventListener("click", (e) => nudgeOverlay(e.shiftKey ? -500 : -100, 0));
if (els.btnNudgeRight) els.btnNudgeRight.addEventListener("click", (e) => nudgeOverlay(e.shiftKey ? 500 : 100, 0));
if (els.btnNudgeUp) els.btnNudgeUp.addEventListener("click", (e) => nudgeOverlay(0, e.shiftKey ? -500 : -100));
if (els.btnNudgeDown) els.btnNudgeDown.addEventListener("click", (e) => nudgeOverlay(0, e.shiftKey ? 500 : 100));

if (els.clearAllOverlaysBtn) els.clearAllOverlaysBtn.addEventListener("click", clearAllOverlays);
if (els.autoClearOverlaysCheckbox) {
  els.autoClearOverlaysCheckbox.addEventListener("change", (e) => {
    state.autoClearOverlaysOnSectionChange = e.target.checked;
    toast(
      "Overlay Section Sync",
      e.target.checked ? "Previous section's overlays will be removed on section change." : "Overlays will be kept across section changes.",
      "info",
      2500
    );
  });
}

window.openBrainSeries = openBrainSeries;
window.clearAllOverlays = clearAllOverlays;
window.state = state;
window.scheduleRender = scheduleRender;
window.updateInspector = updateInspector;

new ResizeObserver(resizeCanvas).observe(els.shell);
resizeCanvas();
renderLayerList();
updateInspector();
void reopenImageFromUrl();
