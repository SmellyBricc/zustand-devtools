// zustand-devtools-bridge — explicit store registration, safe raw-state
// time-travel, and Trace Session capture for the Zustand DevTools Chrome
// extension.
//
// Design invariants (do not weaken):
// - Raw state never crosses postMessage. Display copies are encoded with
//   explicit type markers; time-travel resolves an actionId against the raw
//   object kept in this module's memory and restores it locally.
// - Nothing here may break the host app: every message handler and capture
//   path is wrapped; failures degrade to "devtools sees less", never throw.
// - `enabled: false` must leave zero footprint: no listeners, no messages,
//   no storage, no stack capture, and the initializer is returned untouched.

import type { StateCreator, StoreMutatorIdentifier } from "zustand/vanilla";

export const PROTOCOL_VERSION = 2;
export const BRIDGE_VERSION = "0.2.0";

const MAX_HISTORY_DEFAULT = 200;
const DISPLAY_DEPTH = 4;
const DISPLAY_KEYS = 50;
const TRACE_DEPTH = 8;
const TRACE_KEYS = 200;
const HISTORY_STORAGE_PREFIX = "zdt-history:";

/** Keys redacted by default (case-insensitive substring match on the key).
 * This is a convenience net, NOT a guarantee — pass your own `redact`
 * patterns for anything sensitive it doesn't cover. */
export const DEFAULT_REDACT_KEYS = [
  "token",
  "password",
  "secret",
  "authorization",
  "apikey",
  "api_key",
  "credential",
];

export interface CallSite {
  label: string;
  url: string;
  line: number;
  column: number;
}

export interface BridgeOptions {
  /** Human-readable store name shown in the panel. A registration under an
   * already-registered name REPLACES the previous registration (hot-reload
   * friendly: the re-run creator takes over instead of accumulating stale
   * stores). Two stores meant to be active at the same time must therefore
   * use distinct names. */
  name?: string;
  /** Set to false to compile the bridge out of the store entirely: the
   * initializer is returned as-is; no listeners, messages, storage or stack
   * capture happen. There is no reliable cross-bundler automatic detection —
   * pass it explicitly:
   *   Vite:            enabled: import.meta.env.DEV
   *   Next.js/Webpack: enabled: process.env.NODE_ENV !== "production"
   */
  enabled?: boolean;
  /** Redaction patterns applied BEFORE any data leaves this module.
   * - string without dots: case-insensitive substring match on the key
   * - string with dots: exact path prefix ("user.auth.token")
   * - RegExp: tested against the full dot path
   * Matched values become a redacted marker in display data and exports.
   * Raw in-memory state (used for local time-travel) is not modified. */
  redact?: (string | RegExp)[];
  /** Per-store action history cap (default 200). */
  maxHistory?: number;
}

// ---------------------------------------------------------------------------
// IDs
// ---------------------------------------------------------------------------

let idCounter = 0;
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

// One session ID per page lifetime (module evaluation).
let sessionId: string | null = null;
function getSessionId(): string {
  if (!sessionId) sessionId = newId("ses");
  return sessionId;
}

// ---------------------------------------------------------------------------
// Display-safe encoding (explicit markers, no silent conversion)
// ---------------------------------------------------------------------------

type Marker = { __zdt: string; [k: string]: unknown };

function marker(kind: string, extra?: Record<string, unknown>): Marker {
  return { __zdt: kind, ...extra };
}

interface CompiledRedact {
  keySubstrings: string[];
  pathPrefixes: string[];
  regexes: RegExp[];
}

function compileRedact(patterns: (string | RegExp)[] | undefined): CompiledRedact {
  const out: CompiledRedact = {
    keySubstrings: [...DEFAULT_REDACT_KEYS],
    pathPrefixes: [],
    regexes: [],
  };
  for (const p of patterns || []) {
    if (p instanceof RegExp) out.regexes.push(p);
    else if (p.includes(".")) out.pathPrefixes.push(p);
    else out.keySubstrings.push(p.toLowerCase());
  }
  return out;
}

function isRedacted(path: string, key: string, redact: CompiledRedact): boolean {
  const lower = key.toLowerCase();
  for (const s of redact.keySubstrings) if (lower.includes(s)) return true;
  for (const pre of redact.pathPrefixes) {
    if (path === pre || path.startsWith(pre + ".") || path.startsWith(pre + "[")) return true;
  }
  for (const re of redact.regexes) if (re.test(path)) return true;
  return false;
}

/**
 * Encode a raw value into a structured-clone-safe, display-safe tree.
 * Non-JSON types become explicit markers instead of silently converting,
 * so the panel can render them honestly and never mistake them for the
 * original value. Cycle-safe, depth- and size-capped with visible
 * truncation markers. Redaction happens here — before anything can leave
 * the page.
 */
export function encodeForDisplay(
  value: unknown,
  opts: { maxDepth: number; maxKeys: number; redact: CompiledRedact },
  depth = 0,
  path = "",
  seen?: WeakSet<object>
): unknown {
  if (value === null) return null;
  if (value === undefined) return marker("undef");
  const t = typeof value;
  if (t === "number") {
    const n = value as number;
    if (Number.isNaN(n)) return marker("num", { v: "NaN" });
    if (n === Infinity) return marker("num", { v: "Infinity" });
    if (n === -Infinity) return marker("num", { v: "-Infinity" });
    return n;
  }
  if (t === "string" || t === "boolean") return value;
  if (t === "bigint") return marker("bigint", { v: String(value) });
  if (t === "function") {
    const name = (value as { name?: string }).name;
    return marker("fn", { name: name || "anonymous" });
  }
  if (t === "symbol") return marker("symbol", { v: String(value) });
  // objects from here on
  const obj = value as object;
  if (depth >= opts.maxDepth) return marker("deep");
  const tracker = seen || new WeakSet<object>();
  if (tracker.has(obj)) return marker("cycle");
  tracker.add(obj);
  try {
    if (typeof (obj as { $$typeof?: unknown }).$$typeof === "symbol") return marker("react");
    if (obj instanceof Date) {
      return marker("date", { v: Number.isNaN(obj.getTime()) ? "Invalid Date" : obj.toISOString() });
    }
    if (obj instanceof RegExp) return marker("regexp", { v: obj.toString() });
    if (obj instanceof Map) {
      const entries: unknown[] = [];
      let i = 0;
      for (const [k, v] of obj) {
        if (i >= opts.maxKeys) break;
        entries.push([
          encodeForDisplay(k, opts, depth + 1, `${path}[map-key]`, tracker),
          encodeForDisplay(v, opts, depth + 1, `${path}[map]`, tracker),
        ]);
        i += 1;
      }
      return marker("map", { size: obj.size, entries });
    }
    if (obj instanceof Set) {
      const values: unknown[] = [];
      let i = 0;
      for (const v of obj) {
        if (i >= opts.maxKeys) break;
        values.push(encodeForDisplay(v, opts, depth + 1, `${path}[set]`, tracker));
        i += 1;
      }
      return marker("set", { size: obj.size, values });
    }
    if (Array.isArray(obj)) {
      const out: unknown[] = [];
      const cap = Math.min(obj.length, opts.maxKeys);
      for (let i = 0; i < cap; i++) {
        out.push(encodeForDisplay(obj[i], opts, depth + 1, `${path}[${i}]`, tracker));
      }
      if (obj.length > cap) out.push(marker("truncated", { kept: cap, total: obj.length }));
      return out;
    }
    const keys = Object.keys(obj);
    const out: Record<string, unknown> = {};
    const cap = Math.min(keys.length, opts.maxKeys);
    for (let i = 0; i < cap; i++) {
      const k = keys[i];
      const childPath = path ? `${path}.${k}` : k;
      try {
        if (isRedacted(childPath, k, opts.redact)) {
          out[k] = marker("redacted");
          continue;
        }
        out[k] = encodeForDisplay((obj as Record<string, unknown>)[k], opts, depth + 1, childPath, tracker);
      } catch {
        out[k] = marker("unserializable");
      }
    }
    if (keys.length > cap) out.__zdt_truncated__ = marker("truncated", { kept: cap, total: keys.length });
    return out;
  } finally {
    tracker.delete(obj);
  }
}

// ---------------------------------------------------------------------------
// Registry and messaging
// ---------------------------------------------------------------------------

interface HistoryEntry {
  actionId: string;
  actionName: string;
  timestamp: number;
  display: unknown;
  traceId?: string;
  callSite?: CallSite | null;
}

interface StoreRecord {
  storeId: string;
  name: string;
  registeredAt: number;
  rawSetState: (state: unknown, replace?: boolean) => void;
  getState: () => unknown;
  history: HistoryEntry[];
  redact: CompiledRedact;
  maxHistory: number;
}

const registry = new Map<string, StoreRecord>(); // storeId -> record
let unnamedStoreCount = 0;

// ---------------------------------------------------------------------------
// Raw-state registry — the single source of replay truth.
//
// Invariant: the panel may only offer "Time-travel here" for an actionId that
// is CURRENTLY in this registry. Raw states are kept here (bounded FIFO)
// independently of the display history, so a Pro trace (limit 2000) stays
// fully replayable even after `maxHistory` evicts old display entries. When
// this registry itself must evict, an explicit RAW_EVICTED message tells the
// panel to flip those entries to view-only immediately — rejection stays a
// backstop, never the normal UX.
// ---------------------------------------------------------------------------
export const RAW_RETENTION_CAP = 2500; // must stay >= the panel's Pro trace limit
let rawCap = RAW_RETENTION_CAP;
const rawStore = new Map<string, { storeId: string; raw: unknown }>();

function evictRaw(entries: { storeId: string; actionId: string }[]): void {
  if (!entries.length) return;
  for (const e of entries) rawStore.delete(e.actionId);
  post({ type: "RAW_EVICTED", evicted: entries });
}

function retainRaw(storeId: string, actionId: string, raw: unknown): void {
  rawStore.set(actionId, { storeId, raw });
  if (rawStore.size > rawCap) {
    const evicted: { storeId: string; actionId: string }[] = [];
    const over = rawStore.size - rawCap;
    for (const [id, rec] of rawStore) {
      if (evicted.length >= over) break;
      evicted.push({ storeId: rec.storeId, actionId: id });
    }
    evictRaw(evicted);
  }
}

/** Test-only: shrink the retention cap so eviction is testable quickly. */
export function __setRawCapForTests(n: number): void {
  rawCap = n > 0 ? n : RAW_RETENTION_CAP;
}

interface ActiveTrace {
  traceId: string;
  startedAt: number;
  entryCount: number;
  limit: number;
  baselines: { storeId: string; storeName: string; state: unknown }[];
}
let activeTrace: ActiveTrace | null = null;

function post(message: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    window.postMessage(
      { source: "zustand-devtools-bridge", protocolVersion: PROTOCOL_VERSION, ...message },
      "*"
    );
  } catch {
    /* devtools messaging must never break the host app */
  }
}

// ---------------------------------------------------------------------------
// Call-site capture (V8 stacks; only while a trace is active)
// ---------------------------------------------------------------------------

const INTERNAL_FRAME = /zustand-devtools-bridge|\/zustand(@[^/]*)?\/|\/zustand\.m?js|chrome-extension:|captureCallSite|recordAction|wrappedSet|node_modules\/zustand/;

export function parseCallSite(stack: string | undefined): CallSite | null {
  if (!stack) return null;
  const lines = stack.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("at ")) continue;
    if (INTERNAL_FRAME.test(trimmed)) continue;
    // "at fnName (url:line:col)" or "at url:line:col"
    const m =
      trimmed.match(/^at\s+(.*?)\s+\((.*):(\d+):(\d+)\)$/) ||
      trimmed.match(/^at\s+()(.*):(\d+):(\d+)$/);
    if (!m) continue;
    const url = m[2];
    if (!url || url === "<anonymous>" || INTERNAL_FRAME.test(url)) continue;
    return {
      label: m[1] || "(anonymous)",
      url,
      line: Number(m[3]),
      column: Number(m[4]),
    };
  }
  return null;
}

function captureCallSite(): CallSite | null {
  try {
    return parseCallSite(new Error().stack);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// History persistence (display copies only; view-only after reload)
// ---------------------------------------------------------------------------

function loadHistory(name: string): HistoryEntry[] {
  try {
    if (typeof sessionStorage === "undefined") return [];
    const rawJson = sessionStorage.getItem(HISTORY_STORAGE_PREFIX + name);
    if (!rawJson) return [];
    const parsed: unknown = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) return [];
    // Raw state does not survive a reload, and the persisted display copy is
    // lossy by design — these entries are never in rawStore, so every
    // rawAvailable computation for them yields false (strictly view-only).
    return parsed
      .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
      .map((e) => ({
        actionId: typeof e.actionId === "string" ? e.actionId : newId("act"),
        actionName: typeof e.actionName === "string" ? e.actionName : "anonymous",
        timestamp: typeof e.timestamp === "number" ? e.timestamp : 0,
        display: e.display,
      }));
  } catch {
    return [];
  }
}

function writeHistory(name: string, history: HistoryEntry[]): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    const serializable = history.map((e) => ({
      actionId: e.actionId,
      actionName: e.actionName,
      timestamp: e.timestamp,
      display: e.display,
    }));
    sessionStorage.setItem(HISTORY_STORAGE_PREFIX + name, JSON.stringify(serializable));
  } catch {
    /* quota/serialization issues must not break the app */
  }
}

// Persisting on every action would re-serialize the whole history on the
// host app's hot path (measured: it dominated per-action cost under rapid
// updates). Debounce instead — reload-persistence is best-effort by nature —
// and flush pending writes on pagehide so normal reloads lose nothing.
const pendingSaves = new Map<string, HistoryEntry[]>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function flushSaves(): void {
  saveTimer = null;
  for (const [name, history] of pendingSaves) writeHistory(name, history);
  pendingSaves.clear();
}

function saveHistory(name: string, history: HistoryEntry[]): void {
  pendingSaves.set(name, history);
  if (!saveTimer) saveTimer = setTimeout(flushSaves, 250);
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

function recordAction(record: StoreRecord, actionName: string | undefined, rawState: unknown): void {
  // A store replaced by re-registration (hot reload, or a duplicate name)
  // is detached from the registry; its old closure must go silent instead
  // of posting actions under a dead storeId.
  if (registry.get(record.storeId) !== record) return;
  const entry: HistoryEntry = {
    actionId: newId("act"),
    actionName: actionName || "anonymous",
    timestamp: Date.now(),
    display: encodeForDisplay(rawState, {
      maxDepth: activeTrace ? TRACE_DEPTH : DISPLAY_DEPTH,
      maxKeys: activeTrace ? TRACE_KEYS : DISPLAY_KEYS,
      redact: record.redact,
    }),
  };
  retainRaw(record.storeId, entry.actionId, rawState);

  if (activeTrace) {
    if (activeTrace.entryCount >= activeTrace.limit) {
      stopTrace("limit");
    } else {
      activeTrace.entryCount += 1;
      entry.traceId = activeTrace.traceId;
      entry.callSite = captureCallSite();
    }
  }

  record.history.push(entry);
  if (record.history.length > record.maxHistory) record.history.shift();
  saveHistory(record.name, record.history);

  post({
    type: "ACTION",
    storeId: record.storeId,
    storeName: record.name,
    sessionId: getSessionId(),
    actionId: entry.actionId,
    actionName: entry.actionName,
    timestamp: entry.timestamp,
    state: entry.display,
    rawAvailable: true, // just retained above; RAW_EVICTED revokes it later
    traceId: entry.traceId || null,
    callSite: entry.callSite || null,
    perfTime: typeof performance !== "undefined" ? performance.now() : null,
  });
}

function stopTrace(reason: "user" | "limit" | "cancel"): void {
  if (!activeTrace) return;
  const t = activeTrace;
  activeTrace = null;
  post({
    type: "TRACE_STOPPED",
    traceId: t.traceId,
    reason,
    entryCount: t.entryCount,
    startedAt: t.startedAt,
    stoppedAt: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// Control-message listener (installed lazily on first enabled registration)
// ---------------------------------------------------------------------------

let listenerInstalled = false;

function postStoreRegistered(record: StoreRecord, stateOverride?: unknown): void {
  // During registration the store hasn't assigned its initial state yet
  // (the initializer is still running), so the caller passes it explicitly;
  // later replays read the live store.
  const state = stateOverride !== undefined ? stateOverride : record.getState();
  post({
    type: "STORE_REGISTERED",
    storeId: record.storeId,
    storeName: record.name,
    sessionId: getSessionId(),
    registeredAt: record.registeredAt,
    bridgeVersion: BRIDGE_VERSION,
    capabilities: { rawTimeTravel: true, trace: true, redaction: true },
    state: encodeForDisplay(state, {
      maxDepth: DISPLAY_DEPTH,
      maxKeys: DISPLAY_KEYS,
      redact: record.redact,
    }),
  });
}

function ensureListener(): void {
  if (listenerInstalled || typeof window === "undefined") return;
  listenerInstalled = true;

  window.addEventListener("pagehide", flushSaves);

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window) return;
    const data = event.data as Record<string, unknown> | null;
    if (!data || data.source !== "zustand-devtools-control") return;

    try {
      switch (data.type) {
        case "REQUEST_STORES": {
          for (const record of registry.values()) {
            postStoreRegistered(record);
            post({
              type: "STORE_UPDATE",
              storeId: record.storeId,
              state: encodeForDisplay(record.getState(), {
                maxDepth: DISPLAY_DEPTH,
                maxKeys: DISPLAY_KEYS,
                redact: record.redact,
              }),
            });
          }
          if (activeTrace) {
            post({
              type: "TRACE_STARTED",
              traceId: activeTrace.traceId,
              startedAt: activeTrace.startedAt,
              limit: activeTrace.limit,
              baselines: activeTrace.baselines,
              resumed: true,
            });
          }
          return;
        }
        case "REQUEST_HISTORY": {
          for (const record of registry.values()) {
            post({
              type: "HISTORY",
              storeId: record.storeId,
              storeName: record.name,
              sessionId: getSessionId(),
              entries: record.history.map((e) => ({
                actionId: e.actionId,
                actionName: e.actionName,
                timestamp: e.timestamp,
                state: e.display,
                // Computed against the raw registry at reply time — never a
                // stored boolean that could go stale.
                rawAvailable: rawStore.has(e.actionId),
                traceId: e.traceId || null,
                callSite: e.callSite || null,
              })),
            });
          }
          return;
        }
        case "TIME_TRAVEL_JUMP": {
          // ID-based only. The panel never sends state; we resolve the raw
          // object from the raw-state registry and restore it locally. This
          // is the invariant that makes time-travel safe for Dates/Maps/
          // Sets/functions/cycles/BigInt — no serialization boundary is
          // ever crossed. Resolution deliberately does NOT go through the
          // display history: a raw state outlives its display entry (so a
          // long Pro trace replays past maxHistory), and an evicted raw is
          // rejected even if a display entry still exists.
          const record = registry.get(String(data.storeId));
          if (!record) {
            post({ type: "TIME_TRAVEL_REJECTED", storeId: data.storeId, actionId: data.actionId, reason: "unknown-store" });
            return;
          }
          const held = rawStore.get(String(data.actionId));
          if (!held || held.storeId !== record.storeId) {
            const known = record.history.some((e) => e.actionId === data.actionId);
            post({
              type: "TIME_TRAVEL_REJECTED",
              storeId: data.storeId,
              actionId: data.actionId,
              reason: known ? "raw-unavailable" : "unknown-action",
            });
            return;
          }
          // Raw state is the exact object returned by get() at record time —
          // full state including action functions, so replace semantics are
          // correct and lossless. Uses the raw setState captured before
          // wrapping so the jump itself is not recorded as a new action.
          record.rawSetState(held.raw, true);
          post({
            type: "STORE_UPDATE",
            storeId: record.storeId,
            state: encodeForDisplay(record.getState(), {
              maxDepth: DISPLAY_DEPTH,
              maxKeys: DISPLAY_KEYS,
              redact: record.redact,
            }),
            causedBy: "time-travel",
          });
          return;
        }
        case "TRACE_START": {
          if (activeTrace) stopTrace("user");
          // Baseline: a display-safe, redacted snapshot of every registered
          // store at trace start, so the first diff of each store compares
          // against reality instead of {}. Baselines are display data only —
          // they are never eligible for raw replay.
          const baselines: ActiveTrace["baselines"] = [];
          for (const r of registry.values()) {
            baselines.push({
              storeId: r.storeId,
              storeName: r.name,
              state: encodeForDisplay(r.getState(), {
                maxDepth: TRACE_DEPTH,
                maxKeys: TRACE_KEYS,
                redact: r.redact,
              }),
            });
          }
          activeTrace = {
            traceId: typeof data.traceId === "string" ? data.traceId : newId("trc"),
            startedAt: Date.now(),
            entryCount: 0,
            limit:
              typeof data.limit === "number" && data.limit > 0 && data.limit <= 10000
                ? data.limit
                : 2000,
            baselines,
          };
          post({
            type: "TRACE_STARTED",
            traceId: activeTrace.traceId,
            startedAt: activeTrace.startedAt,
            limit: activeTrace.limit,
            baselines,
          });
          return;
        }
        case "TRACE_STOP":
          stopTrace("user");
          return;
        case "TRACE_CANCEL":
          stopTrace("cancel");
          return;
        case "DEACTIVATE":
          // The last panel for this tab disconnected (DevTools closed).
          // Rich capture with no observing panel is wasted work and would
          // be invisible background tracing — cancel it, and flush any
          // pending history writes.
          if (activeTrace) stopTrace("cancel");
          flushSaves();
          return;
      }
    } catch {
      /* a malformed control message must never break the host app */
    }
  });
}

// ---------------------------------------------------------------------------
// TypeScript surface
// ---------------------------------------------------------------------------

type Write<T, U> = Omit<T, keyof U> & U;

/** setState with the optional third actionName argument the bridge records.
 *
 * Deliberately a single call signature rather than zustand 5's strict
 * replace:true/false overload pair: zustand 4's middleware typing collapses
 * overloads via a TakeTwo tuple trick, which breaks composition for any
 * two-overload setState (including v4's own devtools-in-devtools). The
 * runtime contract is unchanged — pass the full state when replace is true. */
export interface SetStateWithAction<T> {
  (
    partial: T | Partial<T> | ((state: T) => T | Partial<T>),
    replace?: boolean,
    actionName?: string
  ): void;
}

type WithBridge<S> = S extends { getState: () => infer T }
  ? Write<S, { setState: SetStateWithAction<T> }>
  : never;

declare module "zustand/vanilla" {
  interface StoreMutators<S, A> {
    "zustand-devtools-bridge": WithBridge<S>;
  }
}

type Bridged = ["zustand-devtools-bridge", never];

export function withDevtoolsBridge<
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  initializer: StateCreator<T, [...Mps, Bridged], Mcs>,
  options?: BridgeOptions
): StateCreator<T, Mps, [Bridged, ...Mcs]>;

// Implementation signature (loosely typed internally; the overload above is
// the public contract and the type tests hold it to account).
export function withDevtoolsBridge(
  initializer: (set: never, get: never, api: never) => unknown,
  options?: BridgeOptions
) {
  if (options?.enabled === false) {
    // Zero-footprint path: hand back the initializer untouched.
    return initializer;
  }

  return (set: (p: unknown, r?: boolean) => void, get: () => unknown, api: {
    setState: (p: unknown, r?: boolean) => void;
  }) => {
    ensureListener();

    const name = options?.name || `store-${++unnamedStoreCount}`;
    const storeId = newId("st");

    // A registration under an already-registered name REPLACES the old
    // registration (same semantics as Redux DevTools connections). This is
    // what makes hot reload clean — the re-run creator takes over instead
    // of accumulating stale stores — and it means two deliberately
    // concurrent stores must use distinct names (documented). The replaced
    // store's closure is detached and goes silent (see recordAction guard).
    for (const [oldId, rec] of registry) {
      if (rec.name === name) {
        registry.delete(oldId);
        post({ type: "STORE_UNREGISTERED", storeId: oldId, reason: "re-registered" });
        // The replaced store's raw states are unreachable for replay (its
        // storeId is gone from the registry) — evict them explicitly so the
        // panel flips those entries to view-only instead of finding out via
        // rejection.
        const orphaned: { storeId: string; actionId: string }[] = [];
        for (const [actionId, heldRec] of rawStore) {
          if (heldRec.storeId === oldId) orphaned.push({ storeId: oldId, actionId });
        }
        evictRaw(orphaned);
      }
    }

    const record: StoreRecord = {
      storeId,
      name,
      registeredAt: Date.now(),
      rawSetState: api.setState.bind(api) as StoreRecord["rawSetState"],
      getState: get,
      history: loadHistory(name),
      redact: compileRedact(options?.redact),
      maxHistory:
        typeof options?.maxHistory === "number" && options.maxHistory > 0
          ? Math.min(options.maxHistory, 1000)
          : MAX_HISTORY_DEFAULT,
    };
    registry.set(storeId, record);

    const rawSetState = record.rawSetState as (p: unknown, r?: boolean) => void;

    const wrappedSet = (partial: unknown, replace?: boolean, actionName?: string) => {
      set(partial as never, replace as never);
      recordAction(record, actionName, get());
    };
    api.setState = (partial: unknown, replace?: boolean, actionName?: string) => {
      rawSetState(partial, replace);
      recordAction(record, actionName, get());
    };

    const initialState = (initializer as (s: unknown, g: unknown, a: unknown) => unknown)(
      wrappedSet,
      get,
      api
    );
    postStoreRegistered(record, initialState);
    recordAction(record, "@@INIT", initialState);
    return initialState;
  };
}

// Test-only escape hatch: lets the test suite reset module state between
// cases without reimporting the module graph. Not part of the public API.
export function __resetForTests(): void {
  registry.clear();
  rawStore.clear();
  rawCap = RAW_RETENTION_CAP;
  unnamedStoreCount = 0;
  activeTrace = null;
  sessionId = null;
}
