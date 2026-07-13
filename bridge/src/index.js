// zustand-devtools-bridge — the one-line integration that unlocks a named
// action log, time-travel, and a unified multi-store timeline in the
// Zustand DevTools Chrome extension (the free tier already shows live
// component state with zero setup via Fiber-tree walking; this package is
// only needed for the action-log/time-travel tier).
//
// Mirrors Zustand's own `devtools()` middleware shape on purpose — anyone
// who has used `devtools(storeCreator)` already knows this API.

const MAX_HISTORY = 200;

// storeName -> { api, history: [{ actionName, rawState, timestamp }] }
// rawState is kept as-is (including action functions) so time-travel can
// merge real data back into a live store; only a sanitized copy ever goes
// over postMessage — see sanitizeState below.
const registry = new Map();

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
  try {
    if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitizeState(v, depth + 1));
    const out = {};
    for (const k of Object.keys(value).slice(0, 50)) {
      const sv = sanitizeState(value[k], depth + 1);
      if (sv !== undefined) out[k] = sv;
    }
    return out;
  } catch (e) {
    return "[unserializable]";
  }
}

function post(message) {
  if (typeof window === "undefined") return; // no-op during SSR
  try {
    window.postMessage({ source: "zustand-devtools-bridge", ...message }, "*");
  } catch (e) {
    // fail safe — devtools messaging must never break the host app
  }
}

function recordAction(name, actionName, rawState) {
  const record = registry.get(name);
  if (!record) return;
  const entry = { actionName: actionName || "anonymous", rawState, timestamp: Date.now() };
  record.history.push(entry);
  if (record.history.length > MAX_HISTORY) record.history.shift();
  post({ type: "ACTION", store: name, actionName: entry.actionName, timestamp: entry.timestamp, state: sanitizeState(rawState, 0) });
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
            state: sanitizeState(e.rawState, 0),
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
      // Also deliberately calling the store's raw setState, not the
      // wrapped one below, so the jump itself isn't recorded as a new
      // action (which would corrupt the very history it just restored).
      record.api.setState(data.state, false);
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
 */
export function withDevtoolsBridge(storeCreator, options) {
  const name = (options && options.name) || "store";
  return (set, get, api) => {
    registry.set(name, { api, history: [] });
    const wrappedSet = (partial, replace, actionName) => {
      set(partial, replace);
      recordAction(name, actionName, get());
    };
    const initialState = storeCreator(wrappedSet, get, api);
    recordAction(name, "@@INIT", initialState);
    return initialState;
  };
}
