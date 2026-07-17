// Versioned trace-session bundle: build, validate, and safely import.
// Imported files are UNTRUSTED input: everything is schema-checked and
// whitelist-copied; nothing from a file is ever executed or interpreted as
// HTML, and imported data is never posted into the inspected page.

export const TRACE_SCHEMA_VERSION = 1;

export const IMPORT_LIMITS = {
  maxBytes: 25 * 1024 * 1024, // refuse to parse anything bigger
  maxEntries: 20000,
  maxStores: 200,
  maxStringLength: 100000,
  maxNoteLength: 4000,
};

function str(v, max = IMPORT_LIMITS.maxStringLength) {
  return typeof v === "string" && v.length <= max;
}
function num(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/** Build an export bundle from panel-side session data. Pure function. */
export function buildTraceBundle({
  extensionVersion,
  bridgeVersion,
  session,
  stores,
  entries,
  baselines,
  includeState,
}) {
  return {
    // Trace-start baselines (display-safe, redacted). Only meaningful when
    // state is included; metadata-only bundles omit them and importers must
    // report the first per-store diff as unavailable. Optional additive
    // field — schema version 1 readers that predate it simply ignore it.
    baselines:
      includeState && Array.isArray(baselines)
        ? baselines.map((b) => ({ storeId: b.storeId, storeName: b.storeName, state: b.state }))
        : undefined,
    kind: "zustand-devtools-trace",
    schemaVersion: TRACE_SCHEMA_VERSION,
    extensionVersion: extensionVersion || "unknown",
    bridgeVersion: bridgeVersion || "unknown",
    exportedAt: new Date().toISOString(),
    includesState: !!includeState,
    session: {
      traceId: session.traceId,
      name: session.name || "",
      startedAt: session.startedAt,
      stoppedAt: session.stoppedAt,
      entryCount: entries.length,
    },
    stores: stores.map((s) => ({ storeId: s.storeId, storeName: s.storeName })),
    entries: entries.map((e) => ({
      actionId: e.actionId,
      storeId: e.storeId,
      storeName: e.storeName,
      actionName: e.actionName,
      timestamp: e.timestamp,
      callSite: e.callSite
        ? {
            label: String(e.callSite.label || ""),
            url: String(e.callSite.url || ""),
            line: e.callSite.line | 0,
            column: e.callSite.column | 0,
          }
        : null,
      state: includeState ? e.state : undefined,
      diff: includeState ? e.diffSummary : undefined,
      bookmarked: !!e.bookmarked,
      note: e.note || undefined,
      // Imported entries can never be replayed: raw state does not exist
      // outside the original page's memory.
      replaySafe: false,
    })),
  };
}

/**
 * Validate untrusted parsed JSON as a trace bundle.
 * @returns {{ok: true, bundle: object} | {ok: false, error: string}}
 */
export function validateTraceBundle(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "Not a trace file: expected a JSON object." };
  }
  if (data.kind !== "zustand-devtools-trace") {
    return { ok: false, error: "Not a trace file: missing zustand-devtools-trace marker." };
  }
  if (data.schemaVersion !== TRACE_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Unsupported trace schema version ${JSON.stringify(
        data.schemaVersion
      )} — this build reads version ${TRACE_SCHEMA_VERSION}. Update the extension (or re-export the trace) and try again.`,
    };
  }
  const s = data.session;
  if (!s || typeof s !== "object" || !str(s.traceId, 200) || !num(s.startedAt)) {
    return { ok: false, error: "Malformed trace: bad or missing session block." };
  }
  if (!Array.isArray(data.stores) || data.stores.length > IMPORT_LIMITS.maxStores) {
    return { ok: false, error: "Malformed trace: bad stores list." };
  }
  for (const st of data.stores) {
    if (!st || typeof st !== "object" || !str(st.storeId, 200) || !str(st.storeName, 500)) {
      return { ok: false, error: "Malformed trace: bad store record." };
    }
  }
  if (data.baselines !== undefined && data.baselines !== null) {
    if (!Array.isArray(data.baselines) || data.baselines.length > IMPORT_LIMITS.maxStores) {
      return { ok: false, error: "Malformed trace: bad baselines list." };
    }
    for (const b of data.baselines) {
      if (!b || typeof b !== "object" || !str(b.storeId, 200) || !str(b.storeName, 500)) {
        return { ok: false, error: "Malformed trace: bad baseline record." };
      }
    }
  }
  if (!Array.isArray(data.entries)) {
    return { ok: false, error: "Malformed trace: entries is not an array." };
  }
  if (data.entries.length > IMPORT_LIMITS.maxEntries) {
    return {
      ok: false,
      error: `Trace too large: ${data.entries.length} entries (limit ${IMPORT_LIMITS.maxEntries}).`,
    };
  }
  for (let i = 0; i < data.entries.length; i++) {
    const e = data.entries[i];
    if (!e || typeof e !== "object" || Array.isArray(e)) {
      return { ok: false, error: `Malformed trace: entry ${i} is not an object.` };
    }
    if (!str(e.actionId, 200) || !str(e.storeId, 200) || !str(e.actionName, 1000) || !num(e.timestamp)) {
      return { ok: false, error: `Malformed trace: entry ${i} has bad identity fields.` };
    }
    if (e.callSite !== null && e.callSite !== undefined) {
      const c = e.callSite;
      if (typeof c !== "object" || !str(c.url, 4000) || !num(c.line) || !num(c.column)) {
        return { ok: false, error: `Malformed trace: entry ${i} has a bad call-site.` };
      }
    }
    if (e.note !== undefined && !str(e.note, IMPORT_LIMITS.maxNoteLength)) {
      return { ok: false, error: `Malformed trace: entry ${i} has an oversized note.` };
    }
  }

  // Whitelist-copy: nothing outside the schema survives the import, and
  // every imported entry is force-marked as not replayable and view-only.
  const bundle = {
    kind: "zustand-devtools-trace",
    schemaVersion: TRACE_SCHEMA_VERSION,
    extensionVersion: String(data.extensionVersion || "unknown").slice(0, 100),
    bridgeVersion: String(data.bridgeVersion || "unknown").slice(0, 100),
    exportedAt: str(data.exportedAt, 100) ? data.exportedAt : "",
    includesState: !!data.includesState,
    imported: true,
    session: {
      traceId: s.traceId,
      name: str(s.name, 500) ? s.name : "",
      startedAt: s.startedAt,
      stoppedAt: num(s.stoppedAt) ? s.stoppedAt : s.startedAt,
      entryCount: data.entries.length,
    },
    stores: data.stores.map((st) => ({ storeId: st.storeId, storeName: st.storeName })),
    baselines: Array.isArray(data.baselines)
      ? data.baselines.map((b) => ({ storeId: b.storeId, storeName: b.storeName, state: b.state }))
      : [],
    entries: data.entries.map((e) => ({
      actionId: e.actionId,
      storeId: e.storeId,
      storeName: str(e.storeName, 500) ? e.storeName : "",
      actionName: e.actionName,
      timestamp: e.timestamp,
      callSite: e.callSite
        ? {
            label: str(e.callSite.label, 1000) ? e.callSite.label : "",
            url: e.callSite.url,
            line: e.callSite.line | 0,
            column: e.callSite.column | 0,
          }
        : null,
      state: e.state, // display-encoded JSON data; rendered as text only
      diff: e.diff,
      bookmarked: !!e.bookmarked,
      note: str(e.note, IMPORT_LIMITS.maxNoteLength) ? e.note : undefined,
      replaySafe: false,
      imported: true,
    })),
  };
  return { ok: true, bundle };
}

/** Guard to run BEFORE JSON.parse on the raw file text. */
export function checkImportSize(text) {
  if (typeof text !== "string") return { ok: false, error: "Empty file." };
  if (text.length > IMPORT_LIMITS.maxBytes) {
    return {
      ok: false,
      error: `File too large (${(text.length / 1024 / 1024).toFixed(1)} MB — limit ${
        IMPORT_LIMITS.maxBytes / 1024 / 1024
      } MB).`,
    };
  }
  return { ok: true };
}
