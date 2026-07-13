// zustand-devtools-bridge — the one-line integration that unlocks a named
// action log, time-travel, and a unified multi-store timeline in the
// Zustand DevTools Chrome extension (the free tier already shows live
// component state with zero setup via Fiber-tree walking; this package is
// only needed for the action-log/time-travel tier).
//
// Mirrors Zustand's own `devtools()` middleware shape on purpose — anyone
// who has used `devtools(storeCreator)` already knows this API.

const MAX_HISTORY = 200;

// storeName -> { rawSetState, history: [{ actionName, rawState, sanitized, timestamp }] }
// rawState is kept as-is (including action functions) for reference; `sanitized`
// is computed once per entry and reused for every postMessage/persistence
// write, instead of re-deriving it from rawState on every save (see
// recordAction below — this runs on the HOST APP's own hot path, so
// re-sanitizing the whole history on every single action is real, avoidable
// cost in a real running app, not just devtools-side overhead).
const registry = new Map();
let unnamedStoreCount = 0;

// Zustand conventionally colocates action functions in the same state
// object as data (e.g. `{ items: [], addItem: fn }` — literally the shape
// shown in this package's own README example). Posting that object as-is
// makes `window.postMessage` throw DataCloneError on EVERY action, since
// functions can't be structured-cloned — and silently, if the caller only
// wraps the call in try/catch without addressing the actual cause. This is
// the same class of bug already found and fixed in the extension's own
// Fiber-walker; here the fix is to strip non-cloneable values before they
// ever reach postMessage, confirmed against a real Zustand store where
// state and actions share one object.
function sanitizeState(value, depth) {
  if (depth > 4) return "[nested]";
  if (value === null || value === undefined) return null;
  const t = typeof value;
  if (t === "function" || t === "symbol") return undefined;
  if (t !== "object") return value;
  if (typeof value.$$typeof === "symbol") return "[react element]"; // defensive: React nodes stored in state
  // Represent common built-ins meaningfully instead of falling through to
  // Object.keys() (which is empty for these — Date/Map/Set/RegExp don't
  // store their data as own enumerable properties — so they'd otherwise
  // silently become "{}", and a later time-travel merge would overwrite a
  // live Date/Map/Set with a plain empty object).
  if (value instanceof Date) return value.toISOString();
  if (value instanceof RegExp) return value.toString();
  if (value instanceof Map) return sanitizeState(Array.from(value.entries()), depth + 1);
  if (value instanceof Set) return sanitizeState(Array.from(value.values()), depth + 1);
  if (Array.isArray(value)) {
    try {
      return value.slice(0, 50).map((v) => sanitizeState(v, depth + 1));
    } catch (e) {
      return "[unserializable]";
    }
  }
  const out = {};
  for (const k of Object.keys(value).slice(0, 50)) {
    // Per-key, not around the whole loop — one throwing getter should only
    // drop that one key, not discard every already-processed sibling key.
    try {
      const sv = sanitizeState(value[k], depth + 1);
      if (sv !== undefined) out[k] = sv;
    } catch (e) {
      out[k] = "[unserializable]";
    }
  }
  return out;
}

function post(message) {
  if (typeof window === "undefined") return; // no-op during SSR
  try {
    window.postMessage({ source: "zustand-devtools-bridge", ...message }, "*");
  } catch (e) {
    // fail safe — devtools messaging must never break the host app
  }
}

// Without this, a normal dev workflow (page refresh, hot reload) would wipe
// the action log every time — not acceptable for something sold as a
// debugging tool. sessionStorage survives reloads but clears when the tab
// closes, which is the right lifetime here (matches "this session's debug
// history", not a permanent record).
const HISTORY_STORAGE_PREFIX = "zdt-history:";

function loadHistory(name) {
  try {
    if (typeof sessionStorage === "undefined") return [];
    const raw = sessionStorage.getItem(HISTORY_STORAGE_PREFIX + name);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return []; // corrupted/foreign data under this key — don't crash the app
    // Persisted entries were already sanitized before being written, so
    // rawState here IS the sanitized form — reuse it as `sanitized` too
    // rather than re-deriving (see recordAction/saveHistory).
    return parsed.map((e) => ({ ...e, sanitized: e.rawState }));
  } catch (e) {
    return [];
  }
}

function saveHistory(name, history) {
  try {
    if (typeof sessionStorage === "undefined") return;
    const serializable = history.map((e) => ({
      actionName: e.actionName,
      timestamp: e.timestamp,
      rawState: e.sanitized,
    }));
    sessionStorage.setItem(HISTORY_STORAGE_PREFIX + name, JSON.stringify(serializable));
  } catch (e) {
    // fail safe — storage quota or serialization issues shouldn't break the app
  }
}

function recordAction(name, actionName, rawState) {
  const record = registry.get(name);
  if (!record) return;
  const sanitized = sanitizeState(rawState, 0);
  const entry = { actionName: actionName || "anonymous", rawState, sanitized, timestamp: Date.now() };
  record.history.push(entry);
  if (record.history.length > MAX_HISTORY) record.history.shift();
  saveHistory(name, record.history);
  post({ type: "ACTION", store: name, actionName: entry.actionName, timestamp: entry.timestamp, state: sanitized });
}

if (typeof window !== "undefined") {
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "zustand-devtools-control") return;

    if (data.type === "REQUEST_HISTORY") {
      for (const [name, record] of registry) {
        post({
          type: "HISTORY",
          store: name,
          entries: record.history.map((e) => ({
            actionName: e.actionName,
            timestamp: e.timestamp,
            state: e.sanitized,
          })),
        });
      }
      return;
    }
    if (data.type === "TIME_TRAVEL_JUMP") {
      const record = registry.get(data.store);
      if (!record) return;
      // Merge (replace: false), deliberately NOT a full replace — the data
      // we received back only ever crossed postMessage, so it's the
      // sanitized, function-free copy. A full replace would wipe out the
      // store's own action methods. Merging restores the past data fields
      // while leaving the live actions already on the store untouched.
      // Also deliberately calling the RAW setState captured at wrap time,
      // not the tracked one exposed on `api`, so the jump itself isn't
      // recorded as a new action (which would corrupt the very history it
      // just restored).
      record.rawSetState(data.state, false);
    }
  });
}

/**
 * Wraps a Zustand store creator to report every state change to the
 * extension. Usage mirrors Zustand's own `devtools()` middleware:
 *
 *   import { create } from 'zustand';
 *   import { withDevtoolsBridge } from 'zustand-devtools-bridge';
 *
 *   const useCartStore = create(withDevtoolsBridge((set, get) => ({
 *     items: [],
 *     addItem: (item) => set((s) => ({ items: [...s.items, item] }), false, 'addItem'),
 *   }), { name: 'cart' }));
 *
 * The optional third argument to `set` is the action name shown in the
 * panel's Action Log — omit it and entries show up as "anonymous", the
 * exact rough edge our research found with piggybacking on Redux DevTools.
 *
 * Pass a distinct `name` per store — two stores that both omit it (or reuse
 * the same one) would otherwise silently share one history/time-travel
 * target. A fallback name is still assigned automatically so an omitted
 * name degrades to "no useful label" rather than "corrupts another store."
 */
export function withDevtoolsBridge(storeCreator, options) {
  const name = (options && options.name) || `store-${++unnamedStoreCount}`;
  return (set, get, api) => {
    const rawSetState = api.setState.bind(api);
    registry.set(name, { rawSetState, history: loadHistory(name) });

    const wrappedSet = (partial, replace, actionName) => {
      set(partial, replace);
      recordAction(name, actionName, get());
    };
    // Also wrap api.setState itself (not just the closure `set` passed to
    // the initializer) so direct `useStore.setState(...)` calls — a common
    // imperative-update pattern from outside a store's own actions — are
    // tracked too, not just updates that go through the store's defined
    // actions. Zustand's own official devtools() middleware does the same.
    api.setState = (partial, replace, actionName) => {
      rawSetState(partial, replace);
      recordAction(name, actionName, get());
    };

    const initialState = storeCreator(wrappedSet, get, api);
    recordAction(name, "@@INIT", initialState);
    return initialState;
  };
}
