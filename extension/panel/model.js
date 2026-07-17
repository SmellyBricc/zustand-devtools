// Pure panel state model — no DOM, no chrome APIs, unit-testable.
// applyMessage() folds bridge/page messages into the model and returns a
// list of view names that need re-rendering.

export const TIMELINE_DISPLAY_CAP = 400;

export function createModel() {
  return {
    reactVersion: null,
    stores: new Map(), // storeId -> {storeId, storeName, state, registeredAt, bridgeVersion, capabilities, updatedAt}
    hooks: [], // fiber-walker components (experimental view)
    timeline: [], // chronological ACTION entries (all stores)
    timelineIds: new Set(), // stable-ID dedup
    trace: { status: "idle" }, // idle | recording | {status:'stopped', ...}
    sessions: [], // completed or imported trace sessions, newest first
    lastRejection: null,
  };
}

function timelineEntryFrom(msg) {
  return {
    actionId: msg.actionId,
    storeId: msg.storeId,
    storeName: msg.storeName,
    actionName: msg.actionName,
    timestamp: msg.timestamp,
    state: msg.state,
    rawAvailable: !!msg.rawAvailable,
    traceId: msg.traceId || null,
    callSite: msg.callSite || null,
    bookmarked: false,
    note: "",
  };
}

function insertByTimestamp(list, entry) {
  // Timeline arrives mostly ordered; walk back only as far as needed.
  let i = list.length;
  while (i > 0 && list[i - 1].timestamp > entry.timestamp) i -= 1;
  list.splice(i, 0, entry);
}

export function applyMessage(model, msg) {
  if (!msg || typeof msg !== "object") return [];
  switch (msg.type) {
    case "RENDERER_DETECTED":
      model.reactVersion = msg.version || "?";
      return ["status"];

    case "STATE_UPDATE":
      model.hooks = Array.isArray(msg.components) ? msg.components : [];
      return ["hooks"];

    case "STORE_REGISTERED": {
      model.stores.set(msg.storeId, {
        storeId: msg.storeId,
        storeName: msg.storeName,
        state: msg.state,
        registeredAt: msg.registeredAt,
        bridgeVersion: msg.bridgeVersion,
        capabilities: msg.capabilities || {},
        updatedAt: Date.now(),
      });
      // The trace idle view gates its Start button on store availability.
      return ["stores", "status", "trace"];
    }

    case "STORE_UNREGISTERED":
      model.stores.delete(msg.storeId);
      return ["stores", "trace"];

    case "STORE_UPDATE": {
      const store = model.stores.get(msg.storeId);
      if (store) {
        store.state = msg.state;
        store.updatedAt = Date.now();
      }
      return ["stores"];
    }

    case "ACTION": {
      if (!msg.actionId || model.timelineIds.has(msg.actionId)) return [];
      model.timelineIds.add(msg.actionId);
      const entry = timelineEntryFrom(msg);
      insertByTimestamp(model.timeline, entry);
      const dirty = ["timeline"];
      // An action carries the store's latest encoded state — the live
      // Stores view must reflect it, not wait for a separate STORE_UPDATE.
      const store = model.stores.get(msg.storeId);
      if (store && msg.state !== undefined) {
        store.state = msg.state;
        store.updatedAt = Date.now();
        dirty.push("stores");
      }
      if (
        model.trace.status === "recording" &&
        entry.traceId &&
        entry.traceId === model.trace.traceId
      ) {
        model.trace.entries.push(entry);
        dirty.push("trace");
      }
      return dirty;
    }

    case "RAW_EVICTED": {
      // The bridge no longer holds raw state for these actions: flip every
      // matching entry (timeline, active trace, saved sessions) to view-only
      // so the UI never offers a replay the bridge would reject.
      const ids = new Set(
        (Array.isArray(msg.evicted) ? msg.evicted : [])
          .map((e) => e && e.actionId)
          .filter(Boolean)
      );
      if (!ids.size) return [];
      let touched = false;
      const revoke = (entries) => {
        for (const e of entries) {
          if (e.rawAvailable && ids.has(e.actionId)) {
            e.rawAvailable = false;
            touched = true;
          }
        }
      };
      revoke(model.timeline);
      if (model.trace.status === "recording") revoke(model.trace.entries);
      for (const s of model.sessions) revoke(s.entries);
      return touched ? ["timeline", "trace", "sessions"] : [];
    }

    case "HISTORY": {
      let added = false;
      for (const e of msg.entries || []) {
        if (!e.actionId || model.timelineIds.has(e.actionId)) continue;
        model.timelineIds.add(e.actionId);
        insertByTimestamp(model.timeline, {
          ...timelineEntryFrom(e),
          storeId: msg.storeId,
          storeName: msg.storeName,
        });
        added = true;
      }
      return added ? ["timeline"] : [];
    }

    case "TRACE_STARTED": {
      if (model.trace.status === "recording" && model.trace.traceId === msg.traceId) return [];
      model.trace = {
        status: "recording",
        traceId: msg.traceId,
        startedAt: msg.startedAt,
        limit: msg.limit,
        entries: [],
        // Per-store display baselines captured at trace start — the first
        // diff of each store compares against these, never against {}.
        baselines: Array.isArray(msg.baselines) ? msg.baselines : [],
        preview: undefined, // set by the controller
      };
      return ["trace"];
    }

    case "TRACE_STOPPED": {
      if (model.trace.status !== "recording" || model.trace.traceId !== msg.traceId) return [];
      const finished = {
        traceId: msg.traceId,
        name: "",
        startedAt: model.trace.startedAt,
        stoppedAt: msg.stoppedAt || Date.now(),
        reason: msg.reason,
        entries: model.trace.entries,
        baselines: model.trace.baselines || [],
        preview: model.trace.preview,
        imported: false,
      };
      model.trace = { status: "idle" };
      if (msg.reason !== "cancel") {
        model.sessions.unshift(finished);
        if (model.sessions.length > 10) model.sessions.pop();
        return ["trace", "sessions"];
      }
      return ["trace"];
    }

    case "TIME_TRAVEL_REJECTED":
      model.lastRejection = {
        reason: msg.reason,
        storeId: msg.storeId,
        actionId: msg.actionId,
        at: Date.now(),
      };
      return ["status", "timeline"];

    default:
      return [];
  }
}

/** Is a completed trace "meaningful" for preview accounting? */
export function traceConsumesPreview(session) {
  return !!session && !session.imported && session.reason !== "cancel" && session.entries.length > 0;
}

/**
 * Prepare sessions for chrome.storage.local. Replay availability is a live
 * property of the current page's bridge — a persisted boolean is always a
 * lie later, so every persisted entry is stored view-only. If the payload
 * would be oversized, state values and baselines are stripped and the
 * session is marked so diff/compare views can say so honestly.
 */
export function prepareSessionsForPersist(sessions, maxJsonLength = 2_000_000) {
  const slim = sessions.slice(0, 5).map((s) => ({
    ...s,
    persisted: true,
    entries: s.entries.map((e) => ({ ...e, rawAvailable: false })),
  }));
  let json;
  try {
    json = JSON.stringify(slim);
  } catch {
    json = null;
  }
  if (json !== null && json.length <= maxJsonLength) return slim;
  return slim.map((s) => ({
    ...s,
    stateStripped: true,
    baselines: [],
    entries: s.entries.map(({ state, ...rest }) => rest),
  }));
}

/**
 * Rehydrate persisted sessions at panel boot. Never trusts a stored
 * rawAvailable flag: the raw objects lived in a page that is long gone.
 */
export function hydratePersistedSessions(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const s of value) {
    if (!s || typeof s !== "object" || !Array.isArray(s.entries)) continue;
    out.push({
      ...s,
      persisted: true,
      baselines: Array.isArray(s.baselines) ? s.baselines : [],
      entries: s.entries.map((e) => ({ ...e, rawAvailable: false })),
    });
  }
  return out;
}

/** Page navigation: raw states belong to the previous page — revoke replay
 * everywhere it could still be offered. */
export function invalidateSessionReplay(model) {
  for (const s of model.sessions) {
    for (const e of s.entries) e.rawAvailable = false;
  }
}

/**
 * Choose the comparison base for a trace entry's diff.
 * - Later entries of a store diff against their predecessor.
 * - The FIRST entry of a store diffs against the trace-start baseline —
 *   never against {}, which would falsely report every existing field.
 * @returns {{base: unknown} | {noBaseline: true} | {unavailable: true}}
 */
export function diffBaseFor(session, entry) {
  if (entry.state === undefined) return { unavailable: true };
  const idx = session.entries.indexOf(entry);
  for (let i = idx - 1; i >= 0; i--) {
    const prev = session.entries[i];
    if (prev.storeId === entry.storeId) {
      return prev.state === undefined ? { unavailable: true } : { base: prev.state };
    }
  }
  const bl = (session.baselines || []).find((b) => b.storeId === entry.storeId);
  if (bl && bl.state !== undefined) return { base: bl.state };
  return { noBaseline: true };
}

/** Filter trace entries. diffFor(actionId) returns a diff result or null if
 * not yet computed (path filtering then skips the entry until ready). */
export function filterTraceEntries(entries, f, diffFor) {
  const text = (f.text || "").toLowerCase();
  const path = (f.path || "").toLowerCase();
  const call = (f.callsite || "").toLowerCase();
  return entries.filter((e) => {
    if (f.storeId && e.storeId !== f.storeId) return false;
    if (f.bookmarked && !e.bookmarked) return false;
    if (text && !(`${e.actionName} ${e.storeName}`.toLowerCase().includes(text))) return false;
    if (call) {
      const cs = e.callSite ? `${e.callSite.label} ${e.callSite.url}`.toLowerCase() : "";
      if (!cs.includes(call)) return false;
    }
    if (path) {
      const diff = diffFor(e.actionId);
      if (!diff) return false;
      if (!diff.changes.some((c) => c.path.toLowerCase().includes(path))) return false;
    }
    return true;
  });
}
