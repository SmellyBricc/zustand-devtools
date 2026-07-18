// Panel controller: wires the pure model to the DOM and to the extension
// runtime. All state values are rendered via textContent — imported and
// page-supplied strings are never interpreted as HTML.

import {
  createModel,
  applyMessage,
  filterTraceEntries,
  traceConsumesPreview,
  prepareSessionsForPersist,
  hydratePersistedSessions,
  invalidateSessionReplay,
  diffBaseFor,
  TIMELINE_DISPLAY_CAP,
} from "./model.js";
import { deepDiff, shortLabel, isMarker } from "../lib/deep-diff.js";
import { buildTraceBundle, validateTraceBundle, checkImportSize } from "../lib/trace-schema.js";
import "../lib/protocol.js"; // assigns globalThis.ZDTProtocol (dual classic/ESM module)

const { validatePageMessage, validateBridgeMessage } = globalThis.ZDTProtocol;

import { LICENSE_CONFIG, checkActivationResponse } from "./license-config.js";

const EXTENSION_VERSION = "1.1.0";
const PREVIEW_SESSIONS = 3;
const PREVIEW_ENTRY_LIMIT = 150;
const PRO_ENTRY_LIMIT = 2000;

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Chrome adapter (a test harness can predefine window.chrome)
// ---------------------------------------------------------------------------
const isDevtools = !!(chrome.devtools && chrome.devtools.inspectedWindow);
document.documentElement.dataset.theme =
  chrome.devtools && chrome.devtools.panels && chrome.devtools.panels.themeName === "dark"
    ? "dark"
    : "light";

const tabId = isDevtools ? chrome.devtools.inspectedWindow.tabId : 0;
const port = chrome.runtime.connect({ name: "zdt-panel-" + tabId });

function sendControl(message) {
  try {
    port.postMessage(message);
  } catch {
    setStatus("Disconnected — reopen DevTools to reconnect.", false);
  }
}

// ---------------------------------------------------------------------------
// Model + batched message pump
// ---------------------------------------------------------------------------
const model = createModel();
let licensed = false;
let previewUsed = 0;
const pendingDirty = new Set();
let flushScheduled = false;

function markDirty(views) {
  for (const v of views) pendingDirty.add(v);
  if (!flushScheduled) {
    flushScheduled = true;
    requestAnimationFrame(flushDirty);
  }
}

function flushDirty() {
  flushScheduled = false;
  const dirty = new Set(pendingDirty);
  pendingDirty.clear();
  if (dirty.has("status")) renderStatus();
  if (dirty.has("stores")) renderStores();
  if (dirty.has("hooks")) renderHooks();
  if (dirty.has("timeline")) renderTimeline();
  if (dirty.has("trace")) renderTrace();
  if (dirty.has("sessions")) renderSessions();
}

port.onMessage.addListener((msg) => {
  if (!msg) return;
  // Second validation layer: even though the content script filters, the
  // panel model only ever folds in messages that pass the protocol checks.
  if (msg.source === "zustand-devtools-page") {
    if (!validatePageMessage(msg)) return;
  } else if (msg.source === "zustand-devtools-bridge") {
    if (!validateBridgeMessage(msg)) return;
  } else {
    return;
  }
  const before = model.trace;
  const dirty = applyMessage(model, msg);
  if (msg.type === "TRACE_STOPPED" && before.status === "recording") {
    onTraceFinished(before, msg);
  }
  if (dirty.length) markDirty(dirty);
});

port.onDisconnect.addListener(() => {
  setStatus("Disconnected — reopen DevTools to reconnect.", false);
});

// ---------------------------------------------------------------------------
// Status bar
// ---------------------------------------------------------------------------
function setStatus(text, live) {
  $("status").textContent = text;
  const dot = $("live-indicator");
  dot.classList.toggle("live", !!live);
  dot.title = live ? "Connected" : "Not connected";
}

function renderStatus() {
  const stores = model.stores.size;
  if (stores > 0) {
    setStatus(
      `React ${model.reactVersion || "?"} · ${stores} registered store${stores === 1 ? "" : "s"}`,
      true
    );
  } else if (model.reactVersion) {
    setStatus(`React ${model.reactVersion} detected — no registered stores yet.`, true);
  } else {
    setStatus("Waiting for a React renderer on this page…", false);
  }
  if (model.lastRejection && Date.now() - model.lastRejection.at < 6000) {
    const why =
      model.lastRejection.reason === "raw-unavailable"
        ? "Replay unavailable: that entry's original state is gone (recorded before the last reload)."
        : "Replay unavailable: unknown action.";
    setStatus(why, true);
  }
}

// ---------------------------------------------------------------------------
// Value tree rendering (marker-aware, textContent only)
// ---------------------------------------------------------------------------
function renderValue(value, container, depth = 0) {
  const span = (cls, text) => {
    const s = document.createElement("span");
    s.className = cls;
    s.textContent = text;
    container.appendChild(s);
  };
  if (value === null) return span("v-null", "null");
  const t = typeof value;
  if (t === "string") return span("v-string", JSON.stringify(value));
  if (t === "number") return span("v-number", String(value));
  if (t === "boolean") return span("v-boolean", String(value));
  if (Array.isArray(value)) {
    if (!value.length) return span("v-key", "[]");
    const details = document.createElement("details");
    details.open = depth < 2;
    const summary = document.createElement("summary");
    summary.textContent = `[ ${value.length} items ]`;
    details.appendChild(summary);
    value.forEach((v, i) => {
      const row = document.createElement("div");
      const k = document.createElement("span");
      k.className = "v-key";
      k.textContent = i + ": ";
      row.appendChild(k);
      renderValue(v, row, depth + 1);
      details.appendChild(row);
    });
    container.appendChild(details);
    return;
  }
  if (t === "object") {
    if (isMarker(value)) return span("v-marker", shortLabel(value, 120));
    const keys = Object.keys(value);
    if (!keys.length) return span("v-key", "{}");
    const details = document.createElement("details");
    details.open = depth < 2;
    const summary = document.createElement("summary");
    summary.textContent = `{ ${keys.length} keys }`;
    details.appendChild(summary);
    for (const k of keys) {
      const row = document.createElement("div");
      const ks = document.createElement("span");
      ks.className = "v-key";
      ks.textContent = k + ": ";
      row.appendChild(ks);
      renderValue(value[k], row, depth + 1);
      details.appendChild(row);
    }
    container.appendChild(details);
    return;
  }
  span("v-null", String(value));
}

// ---------------------------------------------------------------------------
// Stores view (free, accurate)
// ---------------------------------------------------------------------------
function renderStores() {
  const list = $("stores-list");
  list.textContent = "";
  const stores = [...model.stores.values()];
  $("stores-empty").style.display = stores.length ? "none" : "block";
  for (const s of stores) {
    const card = document.createElement("div");
    card.className = "component";
    const name = document.createElement("div");
    name.className = "component-name";
    name.textContent = s.storeName;
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = `bridge ${s.bridgeVersion || "?"}`;
    name.appendChild(badge);
    const tree = document.createElement("div");
    tree.className = "value-tree";
    renderValue(s.state, tree);
    card.append(name, tree);
    list.appendChild(card);
  }
  renderStatus();
}

// ---------------------------------------------------------------------------
// Component Hooks view (experimental, honestly labelled)
// ---------------------------------------------------------------------------
function renderHooks() {
  const list = $("hooks-list");
  const filter = currentSearch().toLowerCase();
  const items = filter
    ? model.hooks.filter((c) => c.component.toLowerCase().includes(filter))
    : model.hooks;
  list.textContent = "";
  $("hooks-empty").style.display = items.length ? "none" : "block";
  for (const c of items) {
    const div = document.createElement("div");
    div.className = "component";
    const name = document.createElement("div");
    name.className = "component-name";
    name.textContent = c.component;
    const tree = document.createElement("div");
    tree.className = "value-tree";
    c.values.forEach((v, i) => {
      const row = document.createElement("div");
      const k = document.createElement("span");
      k.className = "v-key";
      k.textContent = `#${i}: `;
      row.appendChild(k);
      renderValue(v, row, 1);
      tree.appendChild(row);
    });
    div.append(name, tree);
    list.appendChild(div);
  }
}

// ---------------------------------------------------------------------------
// Timeline view (free)
// ---------------------------------------------------------------------------
function renderTimeline() {
  const list = $("timeline-list");
  const filter = currentSearch().toLowerCase();
  let entries = model.timeline;
  if (filter) {
    entries = entries.filter((e) =>
      `${e.actionName} ${e.storeName}`.toLowerCase().includes(filter)
    );
  }
  const capped = entries.slice(-TIMELINE_DISPLAY_CAP);
  $("timeline-note").textContent =
    entries.length > capped.length
      ? `Showing the latest ${capped.length} of ${entries.length} actions.`
      : "";
  $("timeline-empty").style.display = capped.length ? "none" : "block";
  list.textContent = "";
  const frag = document.createDocumentFragment();
  for (let i = capped.length - 1; i >= 0; i--) frag.appendChild(timelineRow(capped[i]));
  list.appendChild(frag);
}

function timelineRow(e) {
  const row = document.createElement("div");
  row.className = "action-entry";
  const head = document.createElement("div");
  head.className = "action-header";
  const store = document.createElement("span");
  store.className = "action-store";
  store.textContent = `[${e.storeName}]`;
  const name = document.createElement("span");
  name.className = "action-name";
  name.textContent = e.actionName;
  const time = document.createElement("span");
  time.className = "action-time";
  time.textContent = new Date(e.timestamp).toLocaleTimeString();
  head.append(store, name, time);
  const jump = document.createElement("button");
  jump.className = "mini-btn";
  if (e.rawAvailable) {
    jump.textContent = "Jump here";
    jump.title = "Restore this exact state (kept in the page's memory — no serialization)";
    jump.addEventListener("click", () => {
      sendControl({ type: "TIME_TRAVEL_JUMP", storeId: e.storeId, actionId: e.actionId });
    });
  } else {
    jump.textContent = "View-only";
    jump.disabled = true;
    jump.title =
      "Replay unavailable: this entry was recorded before the last reload, so its original in-memory state no longer exists. Displayed values are a lossy copy and will never be restored.";
  }
  head.appendChild(jump);
  row.appendChild(head);
  return row;
}

// ---------------------------------------------------------------------------
// Trace Sessions
// ---------------------------------------------------------------------------
let activeSession = null; // session being viewed (from model.sessions or import)
let selectedEntry = null;
let compareA = null;
let compareB = null;
let traceFilters = { storeId: "", text: "", path: "", callsite: "", bookmarked: false };
let recordingTimer = null;

// Lazy diff cache per session: actionId -> {changes, truncated} | undefined
const diffCache = new Map();
let diffQueueRunning = false;

function sessionKey(session, actionId) {
  return `${session.traceId}:${actionId}`;
}

function diffFor(session, entry) {
  const key = sessionKey(session, entry.actionId);
  if (diffCache.has(key)) return diffCache.get(key);
  return null;
}

function computeDiff(session, entry) {
  const key = sessionKey(session, entry.actionId);
  if (diffCache.has(key)) return diffCache.get(key);
  const pick = diffBaseFor(session, entry);
  const result = pick.unavailable
    ? { changes: [], truncated: false, unavailable: true }
    : pick.noBaseline
      ? { changes: [], truncated: false, noBaseline: true }
      : deepDiff(pick.base, entry.state);
  diffCache.set(key, result);
  return result;
}

/** Compute remaining diffs in idle-sized batches so path filtering over a
 * large trace never freezes the panel. */
function ensureDiffsComputed(session, onProgress) {
  if (diffQueueRunning) return;
  diffQueueRunning = true;
  const queue = session.entries.filter((e) => !diffCache.has(sessionKey(session, e.actionId)));
  function step() {
    const slice = queue.splice(0, 40);
    for (const e of slice) computeDiff(session, e);
    if (onProgress) onProgress(queue.length);
    if (queue.length && activeSession === session) setTimeout(step, 0);
    else diffQueueRunning = false;
  }
  step();
}

function renderTrace() {
  const t = model.trace;
  $("trace-idle").style.display = t.status === "idle" && !activeSession ? "block" : "none";
  $("trace-recording").style.display = t.status === "recording" ? "block" : "none";
  $("trace-session").style.display = activeSession ? "flex" : "none";

  if (t.status === "recording") {
    $("trace-rec-count").textContent = String(t.entries.length);
    $("trace-rec-limit").textContent = String(t.limit);
    if (!recordingTimer) {
      recordingTimer = setInterval(() => {
        if (model.trace.status !== "recording") {
          clearInterval(recordingTimer);
          recordingTimer = null;
          return;
        }
        const s = Math.floor((Date.now() - model.trace.startedAt) / 1000);
        $("trace-rec-elapsed").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      }, 1000);
    }
  }

  if (t.status === "idle" && !activeSession) renderTraceIdle();
  if (activeSession) renderSessionView();
}

function renderTraceIdle() {
  const left = Math.max(0, PREVIEW_SESSIONS - previewUsed);
  const gated = !licensed && left === 0;
  $("preview-status").textContent = licensed
    ? "Pro unlocked — unlimited Trace Sessions."
    : `Free preview: ${left} of ${PREVIEW_SESSIONS} full Trace Sessions left (up to ${PREVIEW_ENTRY_LIMIT} actions each).`;
  $("start-trace-btn").disabled = gated || model.stores.size === 0;
  $("start-trace-btn").title =
    model.stores.size === 0
      ? "Register at least one store with zustand-devtools-bridge first."
      : "";
  $("trace-paywall").style.display = gated ? "block" : "none";
  $("trace-no-stores").style.display = model.stores.size === 0 ? "block" : "none";
}

function onTraceFinished(traceState, stopMsg) {
  const session = model.sessions[0];
  if (stopMsg.reason !== "cancel" && session && traceConsumesPreview(session) && !licensed) {
    previewUsed += 1;
    chrome.storage.local.set({ zdtPreview: { used: previewUsed } });
  }
  if (session && stopMsg.reason !== "cancel") {
    openSession(session);
  }
  persistSessions();
}

function openSession(session) {
  activeSession = session;
  selectedEntry = null;
  compareA = compareB = null;
  // Reset the virtual list viewport — a stale scrollTop from a previously
  // opened (larger) session would otherwise render the wrong window.
  $("trace-vlist").scrollTop = 0;
  traceFilters = { storeId: "", text: "", path: "", callsite: "", bookmarked: false };
  $("trace-filter-text").value = "";
  $("trace-filter-path").value = "";
  $("trace-filter-callsite").value = "";
  $("trace-filter-bookmarked").checked = false;
  const stores = new Map(session.entries.map((e) => [e.storeId, e.storeName]));
  const sel = $("trace-filter-store");
  sel.textContent = "";
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "All stores";
  sel.appendChild(all);
  for (const [id, name] of stores) {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = name;
    sel.appendChild(o);
  }
  $("session-title").textContent = session.imported
    ? `Imported: ${session.name || session.traceId} (view-only)`
    : `Trace ${new Date(session.startedAt).toLocaleTimeString()} — ${session.entries.length} actions${
        session.reason === "limit" ? " (stopped at limit)" : ""
      }${session.preview ? " · preview" : ""}`;
  $("session-imported-note").style.display = session.imported ? "block" : "none";
  // Pre-compute diffs in idle-sized batches so rows show change counts and
  // path filtering is instant; safe for the capped session sizes.
  ensureDiffsComputed(session, (left) => {
    if (left === 0 && activeSession === session) markDirty(["trace"]);
  });
  markDirty(["trace"]);
}

function closeSession() {
  activeSession = null;
  markDirty(["trace", "sessions"]);
}

// --- virtual list ---------------------------------------------------------
const ROW_H = 46;
let vlistEntries = [];

function renderSessionView() {
  const session = activeSession;
  vlistEntries = filterTraceEntries(session.entries, traceFilters, (id) =>
    diffCache.get(sessionKey(session, id)) || null
  );
  if (traceFilters.path) {
    ensureDiffsComputed(session, (left) => {
      $("trace-filter-pending").textContent = left ? `computing diffs… ${left} left` : "";
      if (left === 0) markDirty(["trace"]);
    });
  }
  $("trace-count").textContent = `${vlistEntries.length} / ${session.entries.length}`;
  $("vlist-spacer").style.height = `${vlistEntries.length * ROW_H}px`;
  renderVisibleRows();
  renderDetail();
}

function renderVisibleRows() {
  const viewport = $("trace-vlist");
  const layer = $("vlist-layer");
  const start = Math.max(0, Math.floor(viewport.scrollTop / ROW_H) - 5);
  const end = Math.min(vlistEntries.length, start + Math.ceil(viewport.clientHeight / ROW_H) + 10);
  layer.textContent = "";
  for (let i = start; i < end; i++) {
    layer.appendChild(traceRow(vlistEntries[i], i));
  }
}

function traceRow(e, index) {
  // A non-interactive positioning container holding two SIBLING controls:
  // a bookmark toggle and a select button. Never nest a button inside
  // another button (or role="button") — screen readers can't operate the
  // inner control.
  const row = document.createElement("div");
  row.className = "trace-row" + (selectedEntry === e ? " selected" : "");
  row.style.top = `${index * ROW_H}px`;

  const star = document.createElement("button");
  star.type = "button";
  star.className = "star" + (e.bookmarked ? " on" : "");
  const starName = e.bookmarked
    ? `Remove bookmark from ${e.storeName} ${e.actionName}`
    : `Bookmark ${e.storeName} ${e.actionName}`;
  star.setAttribute("aria-label", starName);
  star.title = starName;
  star.setAttribute("aria-pressed", e.bookmarked ? "true" : "false");
  const glyph = document.createElement("span");
  glyph.setAttribute("aria-hidden", "true");
  glyph.textContent = e.bookmarked ? "★" : "☆";
  star.appendChild(glyph);
  star.addEventListener("click", () => {
    e.bookmarked = !e.bookmarked;
    persistSessions();
    markDirty(["trace"]);
  });

  const selectBtn = document.createElement("button");
  selectBtn.type = "button";
  selectBtn.className = "trace-row-select";
  if (selectedEntry === e) selectBtn.setAttribute("aria-current", "true");
  const line1 = document.createElement("div");
  line1.className = "action-header";
  const store = document.createElement("span");
  store.className = "action-store";
  store.textContent = `[${e.storeName}]`;
  const name = document.createElement("span");
  name.className = "action-name";
  name.textContent = e.actionName;
  const time = document.createElement("span");
  time.className = "action-time";
  time.textContent = new Date(e.timestamp).toLocaleTimeString();
  line1.append(store, name, time);
  const line2 = document.createElement("div");
  line2.className = "trace-row-sub";
  const diff = diffCache.get(sessionKey(activeSession, e.actionId));
  const cs = e.callSite ? ` · ${e.callSite.label} @ ${fileName(e.callSite.url)}:${e.callSite.line}` : "";
  line2.textContent = (diff ? `${diff.changes.length} change${diff.changes.length === 1 ? "" : "s"}` : "…") + cs;
  selectBtn.append(line1, line2);
  selectBtn.addEventListener("click", () => {
    selectedEntry = e;
    computeDiff(activeSession, e);
    markDirty(["trace"]);
  });

  row.append(star, selectBtn);
  return row;
}

function fileName(url) {
  try {
    return String(url).split("/").pop().split("?")[0] || url;
  } catch {
    return String(url);
  }
}

// --- detail + compare ------------------------------------------------------
function renderDetail() {
  const box = $("trace-detail");
  box.textContent = "";
  if (compareA && compareB) return renderCompare(box);
  const e = selectedEntry;
  if (!e) {
    const p = document.createElement("p");
    p.className = "empty-state";
    p.textContent = "Select an entry to see its deep diff, call-site and notes. Use “A/B” on two entries to compare them.";
    box.appendChild(p);
    return;
  }
  const session = activeSession;

  const head = document.createElement("div");
  head.className = "detail-head";
  const title = document.createElement("div");
  title.className = "action-name";
  title.textContent = `[${e.storeName}] ${e.actionName}`;
  const time = document.createElement("div");
  time.className = "action-time";
  time.textContent = new Date(e.timestamp).toLocaleString();
  head.append(title, time);
  box.appendChild(head);

  // call-site
  const csRow = document.createElement("div");
  csRow.className = "detail-row";
  if (e.callSite) {
    const btn = document.createElement("button");
    btn.className = "mini-btn";
    btn.textContent = `${e.callSite.label} — ${fileName(e.callSite.url)}:${e.callSite.line}:${e.callSite.column}`;
    btn.title = `${e.callSite.url}\nOpens in the Sources panel when Chrome can resolve it. Best-effort: accuracy depends on dev builds and source maps.`;
    btn.addEventListener("click", () => openCallSite(e.callSite));
    csRow.append(labelSpan("Call-site "), btn);
  } else {
    csRow.append(labelSpan("Call-site "), textSpan("unavailable (no useful stack frame — expected outside dev builds)"));
  }
  box.appendChild(csRow);

  // controls: compare, replay, bookmark, note
  const controls = document.createElement("div");
  controls.className = "detail-row";
  const abBtn = document.createElement("button");
  abBtn.className = "mini-btn";
  abBtn.textContent = compareA === e ? "Selected as A" : compareA ? "Set as B & compare" : "Set as A (compare)";
  abBtn.addEventListener("click", () => {
    if (!compareA) compareA = e;
    else if (compareA !== e) compareB = e;
    markDirty(["trace"]);
  });
  controls.appendChild(abBtn);
  if (compareA) {
    const clear = document.createElement("button");
    clear.className = "mini-btn";
    clear.textContent = "Clear A/B";
    clear.addEventListener("click", () => {
      compareA = compareB = null;
      markDirty(["trace"]);
    });
    controls.appendChild(clear);
  }
  const replay = document.createElement("button");
  replay.className = "mini-btn";
  if (e.rawAvailable && !session.imported) {
    replay.textContent = "Time-travel here";
    replay.addEventListener("click", () =>
      sendControl({ type: "TIME_TRAVEL_JUMP", storeId: e.storeId, actionId: e.actionId })
    );
  } else {
    replay.textContent = "Replay unavailable";
    replay.disabled = true;
    replay.title = session.imported
      ? "Imported traces are view-only: the original in-memory state exists only in the page that recorded them."
      : session.persisted
        ? "Saved sessions are view-only: the page that held this state is gone. Only entries the live bridge currently retains can replay."
        : "The original state for this entry is no longer held by the page (evicted from the raw-state registry, or recorded before the last reload).";
  }
  controls.appendChild(replay);
  box.appendChild(controls);

  const noteRow = document.createElement("div");
  noteRow.className = "detail-row";
  const note = document.createElement("textarea");
  note.className = "note-input";
  note.placeholder = "Local note for this entry (included in exports).";
  note.value = e.note || "";
  note.setAttribute("aria-label", "Entry note");
  note.addEventListener("change", () => {
    e.note = note.value.slice(0, 4000);
    persistSessions();
  });
  noteRow.appendChild(note);
  box.appendChild(noteRow);

  // deep diff
  const diff = computeDiff(session, e);
  const diffHead = document.createElement("div");
  diffHead.className = "detail-subhead";
  if (diff.unavailable) {
    diffHead.textContent = session.stateStripped
      ? "State values were dropped when this session was saved locally (size limit) — diffs and comparison are unavailable."
      : "State not included in this trace (metadata-only export).";
  } else if (diff.noBaseline) {
    diffHead.textContent =
      "First diff unavailable: no trace-start baseline for this store (metadata-only trace, or the store registered mid-trace). Later entries diff against their predecessor as usual.";
  } else {
    diffHead.textContent = `Changed paths (${diff.changes.length}${diff.truncated ? ", truncated" : ""}) vs ${
      isFirstOfStore(session, e) ? "trace-start baseline" : `previous ${e.storeName} entry`
    }:`;
  }
  box.appendChild(diffHead);
  if (!diff.noBaseline) box.appendChild(renderDiffList(diff));
}

function isFirstOfStore(session, entry) {
  for (const e of session.entries) {
    if (e.storeId === entry.storeId) return e === entry;
  }
  return false;
}

function renderDiffList(diff) {
  const wrap = document.createElement("div");
  wrap.className = "diff-list";
  for (const c of diff.changes.slice(0, 200)) {
    const row = document.createElement("div");
    row.className = "diff-row " + c.kind;
    const path = document.createElement("span");
    path.className = "diff-path";
    path.textContent = c.path;
    const val = document.createElement("span");
    val.className = "diff-vals";
    if (c.kind === "added") val.textContent = ` + ${shortLabel(c.after)}`;
    else if (c.kind === "removed") val.textContent = ` − ${shortLabel(c.before)}`;
    else val.textContent = ` ${shortLabel(c.before)} → ${shortLabel(c.after)}`;
    row.append(path, val);
    wrap.appendChild(row);
  }
  if (!diff.changes.length && !diff.unavailable) {
    const none = document.createElement("div");
    none.className = "diff-row";
    none.textContent = "(no change)";
    wrap.appendChild(none);
  }
  return wrap;
}

function renderCompare(box) {
  const head = document.createElement("div");
  head.className = "detail-head";
  const title = document.createElement("div");
  title.className = "action-name";
  title.textContent = "Compare A → B";
  head.appendChild(title);
  const clear = document.createElement("button");
  clear.className = "mini-btn";
  clear.textContent = "Close compare";
  clear.addEventListener("click", () => {
    compareA = compareB = null;
    markDirty(["trace"]);
  });
  head.appendChild(clear);
  box.appendChild(head);

  for (const [label, e] of [["A", compareA], ["B", compareB]]) {
    const row = document.createElement("div");
    row.className = "detail-row";
    const cs = e.callSite ? ` · ${e.callSite.label} @ ${fileName(e.callSite.url)}:${e.callSite.line}` : "";
    row.textContent = `${label}: [${e.storeName}] ${e.actionName} — ${new Date(e.timestamp).toLocaleTimeString()}${cs}`;
    box.appendChild(row);
  }

  if (compareA.storeId !== compareB.storeId) {
    const warn = document.createElement("p");
    warn.className = "empty-state";
    warn.textContent =
      "These entries belong to different stores, so a path-level state comparison isn't meaningful. Pick two entries from the same store — the chronological trace already shows cross-store ordering.";
    box.appendChild(warn);
    return;
  }
  if (compareA.state === undefined || compareB.state === undefined) {
    const warn = document.createElement("p");
    warn.className = "empty-state";
    warn.textContent = "State values are not included in this trace, so snapshots can't be compared.";
    box.appendChild(warn);
    return;
  }
  const [first, second] =
    compareA.timestamp <= compareB.timestamp ? [compareA, compareB] : [compareB, compareA];
  const diff = deepDiff(first.state, second.state);
  const sub = document.createElement("div");
  sub.className = "detail-subhead";
  sub.textContent = `Changed paths (${diff.changes.length}${diff.truncated ? ", truncated" : ""}):`;
  box.appendChild(sub);
  box.appendChild(renderDiffList(diff));
}

function labelSpan(text) {
  const s = document.createElement("span");
  s.className = "v-key";
  s.textContent = text;
  return s;
}
function textSpan(text) {
  const s = document.createElement("span");
  s.textContent = text;
  return s;
}

function openCallSite(cs) {
  try {
    if (isDevtools && chrome.devtools.panels.openResource) {
      // Callback form keeps compatibility; failures must never break the panel.
      chrome.devtools.panels.openResource(cs.url, Math.max(0, cs.line - 1), () => void 0);
    } else {
      setStatus(`Call-site: ${cs.url}:${cs.line}`, true);
    }
  } catch {
    setStatus("Chrome could not open that source location.", true);
  }
}

// ---------------------------------------------------------------------------
// Sessions list, export, import
// ---------------------------------------------------------------------------
function renderSessions() {
  const list = $("sessions-list");
  list.textContent = "";
  $("sessions-empty").style.display = model.sessions.length ? "none" : "block";
  for (const s of model.sessions) {
    const row = document.createElement("div");
    row.className = "action-entry";
    const head = document.createElement("div");
    head.className = "action-header";
    const name = document.createElement("span");
    name.className = "action-name";
    name.textContent = s.imported
      ? `Imported: ${s.name || s.traceId}`
      : `Trace ${new Date(s.startedAt).toLocaleTimeString()}`;
    const meta = document.createElement("span");
    meta.className = "action-time";
    meta.textContent = `${s.entries.length} actions${s.imported ? " · view-only" : ""}${s.preview ? " · preview" : ""}`;
    head.append(name, meta);
    const open = document.createElement("button");
    open.className = "mini-btn";
    open.textContent = "Open";
    open.addEventListener("click", () => openSession(s));
    head.appendChild(open);
    row.appendChild(head);
    list.appendChild(row);
  }
}

function exportSession(includeState) {
  const session = activeSession;
  if (!session) return;
  const stores = [...new Map(session.entries.map((e) => [e.storeId, e.storeName]))].map(
    ([storeId, storeName]) => ({ storeId, storeName })
  );
  for (const e of session.entries) computeDiff(session, e);
  const bundle = buildTraceBundle({
    extensionVersion: EXTENSION_VERSION,
    bridgeVersion: [...model.stores.values()][0]?.bridgeVersion,
    session,
    stores,
    baselines: includeState ? session.baselines : undefined,
    entries: session.entries.map((e) => ({
      ...e,
      diffSummary: diffCache.get(sessionKey(session, e.actionId))?.changes?.map((c) => ({
        path: c.path,
        kind: c.kind,
      })),
      state: includeState ? e.state : undefined,
    })),
    includeState,
  });
  const blob = new Blob([JSON.stringify(bundle, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `zustand-trace-${new Date(session.startedAt).toISOString().replace(/[:.]/g, "-")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function importSessionFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const sizeCheck = checkImportSize(String(reader.result || ""));
    if (!sizeCheck.ok) return setImportError(sizeCheck.error);
    let parsed;
    try {
      parsed = JSON.parse(String(reader.result));
    } catch {
      return setImportError("Not a trace file: invalid JSON.");
    }
    const res = validateTraceBundle(parsed);
    if (!res.ok) return setImportError(res.error);
    setImportError("");
    const b = res.bundle;
    const session = {
      traceId: b.session.traceId,
      name: b.session.name,
      startedAt: b.session.startedAt,
      stoppedAt: b.session.stoppedAt,
      reason: "imported",
      entries: b.entries,
      baselines: b.baselines || [],
      imported: true,
      preview: false,
    };
    model.sessions.unshift(session);
    if (model.sessions.length > 10) model.sessions.pop();
    openSession(session);
    markDirty(["sessions"]);
  };
  reader.onerror = () => setImportError("Could not read that file.");
  reader.readAsText(file);
}

function setImportError(text) {
  $("import-error").textContent = text;
}

function persistSessions() {
  // Best-effort local retention of recent sessions (preview access after the
  // limit is part of the deal). Persisted entries are ALWAYS stored
  // view-only — replay availability is a live property of the current page
  // and is never trusted from storage (see prepareSessionsForPersist).
  try {
    chrome.storage.local.set({ zdtSessions: prepareSessionsForPersist(model.sessions) });
  } catch {
    /* quota — memory-only is acceptable */
  }
}

// ---------------------------------------------------------------------------
// Licensing (unchanged flow; gate applies to Trace Sessions only)
// ---------------------------------------------------------------------------
function setLicensedUI(isLicensed) {
  licensed = isLicensed;
  markDirty(["trace"]);
}

$("buy-btn").addEventListener("click", () => {
  if (chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url: LICENSE_CONFIG.checkoutUrl });
  else window.open(LICENSE_CONFIG.checkoutUrl, "_blank");
});

$("activate-btn").addEventListener("click", async () => {
  const key = $("license-input").value.trim();
  if (!key) return;
  $("license-status").textContent = "Validating…";
  try {
    const res = await fetch(LICENSE_CONFIG.activateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ license_key: key, instance_name: "Zustand DevTools" }),
    });
    const data = await res.json();
    const outcome = checkActivationResponse(LICENSE_CONFIG, data);
    if (outcome.ok) {
      await chrome.storage.local.set({
        zdtLicense: {
          valid: true,
          key,
          instanceId: outcome.instanceId,
          productId: outcome.meta.product_id,
          variantId: outcome.meta.variant_id,
          validatedAt: Date.now(),
        },
      });
      $("license-status").textContent = "License activated.";
      setLicensedUI(true);
    } else {
      $("license-status").textContent = outcome.error;
    }
  } catch {
    $("license-status").textContent = "Couldn't reach the license server — check your connection.";
  }
});

// ---------------------------------------------------------------------------
// Wiring: tabs, search, trace controls, navigation reset
// ---------------------------------------------------------------------------
let activeTab = "stores";
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    activeTab = btn.dataset.tab;
    $("tab-" + activeTab).classList.add("active");
    markDirty(["hooks", "timeline", "trace", "stores", "sessions"]);
  });
});

function currentSearch() {
  return $("search").value.trim();
}
$("search").addEventListener("input", () => markDirty(["hooks", "timeline"]));

$("start-trace-btn").addEventListener("click", () => {
  const limit = licensed ? PRO_ENTRY_LIMIT : PREVIEW_ENTRY_LIMIT;
  activeSession = null;
  sendControl({ type: "TRACE_START", limit });
  // model flips to recording when TRACE_STARTED comes back; mark preview
  // status so the finished session records how it was captured.
  const check = setInterval(() => {
    if (model.trace.status === "recording") {
      model.trace.preview = !licensed;
      clearInterval(check);
    }
  }, 50);
  setTimeout(() => clearInterval(check), 2000);
});
$("stop-trace-btn").addEventListener("click", () => sendControl({ type: "TRACE_STOP" }));
$("cancel-trace-btn").addEventListener("click", () => sendControl({ type: "TRACE_CANCEL" }));
$("session-back").addEventListener("click", closeSession);
$("export-state-btn").addEventListener("click", () => exportSession(true));
$("export-meta-btn").addEventListener("click", () => exportSession(false));
$("import-input").addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) importSessionFile(f);
  e.target.value = "";
});

for (const [id, key] of [
  ["trace-filter-text", "text"],
  ["trace-filter-path", "path"],
  ["trace-filter-callsite", "callsite"],
]) {
  let deb;
  $(id).addEventListener("input", (e) => {
    clearTimeout(deb);
    deb = setTimeout(() => {
      traceFilters[key] = e.target.value.trim();
      markDirty(["trace"]);
    }, 150);
  });
}
$("trace-filter-store").addEventListener("change", (e) => {
  traceFilters.storeId = e.target.value;
  markDirty(["trace"]);
});
$("trace-filter-bookmarked").addEventListener("change", (e) => {
  traceFilters.bookmarked = e.target.checked;
  markDirty(["trace"]);
});
$("trace-vlist").addEventListener("scroll", () => requestAnimationFrame(renderVisibleRows));

// Page navigation resets live data (persisted history re-arrives via the
// content script's re-request); saved sessions survive.
if (isDevtools && chrome.devtools.network && chrome.devtools.network.onNavigated) {
  chrome.devtools.network.onNavigated.addListener(() => {
    model.stores.clear();
    model.hooks = [];
    model.timeline = [];
    model.timelineIds.clear();
    model.reactVersion = null;
    if (model.trace.status === "recording") model.trace = { status: "idle" };
    // Raw states from the previous page are gone — revoke replay on every
    // saved session so the UI never offers a jump the bridge can't honour.
    invalidateSessionReplay(model);
    persistSessions();
    markDirty(["stores", "hooks", "timeline", "trace", "status", "sessions"]);
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
chrome.storage.local.get(["zdtLicense", "zdtPreview", "zdtSessions"], (data = {}) => {
  licensed = !!(data.zdtLicense && data.zdtLicense.valid);
  previewUsed = (data.zdtPreview && data.zdtPreview.used) || 0;
  for (const s of hydratePersistedSessions(data.zdtSessions)) model.sessions.push(s);
  markDirty(["trace", "sessions"]);
});

renderStatus();
renderStores();
renderTrace();
renderSessions();
sendControl({ type: "REQUEST_STORES" });
sendControl({ type: "REQUEST_HISTORY" });
