import { describe, expect, it } from "vitest";
import { createModel, applyMessage, filterTraceEntries, traceConsumesPreview } from "../extension/panel/model.js";

function action(id, over = {}) {
  return {
    type: "ACTION",
    actionId: id,
    storeId: "st_1",
    storeName: "cart",
    actionName: "addItem",
    timestamp: 100,
    state: { n: 1 },
    rawAvailable: true,
    traceId: null,
    callSite: null,
    ...over,
  };
}

describe("panel model", () => {
  it("dedupes actions by stable ID, not name+timestamp", () => {
    const m = createModel();
    applyMessage(m, action("a1"));
    applyMessage(m, action("a1"));
    // same name, same timestamp, DIFFERENT id — must be kept
    applyMessage(m, action("a2"));
    expect(m.timeline.length).toBe(2);
  });

  it("merges HISTORY without duplicating live ACTIONs", () => {
    const m = createModel();
    applyMessage(m, action("a1"));
    applyMessage(m, {
      type: "HISTORY",
      storeId: "st_1",
      storeName: "cart",
      entries: [action("a1"), action("a0", { timestamp: 50, rawAvailable: false })],
    });
    expect(m.timeline.map((e) => e.actionId)).toEqual(["a0", "a1"]);
    expect(m.timeline[0].rawAvailable).toBe(false);
  });

  it("runs the trace lifecycle and collects only tagged entries", () => {
    const m = createModel();
    applyMessage(m, { type: "TRACE_STARTED", traceId: "t1", startedAt: 1, limit: 100 });
    expect(m.trace.status).toBe("recording");
    applyMessage(m, action("a1", { traceId: "t1" }));
    applyMessage(m, action("a2", { traceId: null })); // recorded outside tagging
    applyMessage(m, { type: "TRACE_STOPPED", traceId: "t1", reason: "user", stoppedAt: 9 });
    expect(m.trace.status).toBe("idle");
    expect(m.sessions.length).toBe(1);
    expect(m.sessions[0].entries.map((e) => e.actionId)).toEqual(["a1"]);
    expect(traceConsumesPreview(m.sessions[0])).toBe(true);
  });

  it("cancelled traces are discarded and never consume a preview", () => {
    const m = createModel();
    applyMessage(m, { type: "TRACE_STARTED", traceId: "t1", startedAt: 1, limit: 100 });
    applyMessage(m, action("a1", { traceId: "t1" }));
    applyMessage(m, { type: "TRACE_STOPPED", traceId: "t1", reason: "cancel" });
    expect(m.sessions.length).toBe(0);
  });

  it("empty traces never consume a preview", () => {
    const m = createModel();
    applyMessage(m, { type: "TRACE_STARTED", traceId: "t1", startedAt: 1, limit: 100 });
    applyMessage(m, { type: "TRACE_STOPPED", traceId: "t1", reason: "user" });
    expect(m.sessions.length).toBe(1);
    expect(traceConsumesPreview(m.sessions[0])).toBe(false);
  });

  it("store registration replaces on unregister and updates state", () => {
    const m = createModel();
    applyMessage(m, { type: "STORE_REGISTERED", storeId: "st_1", storeName: "cart", state: { a: 1 } });
    applyMessage(m, { type: "STORE_UPDATE", storeId: "st_1", state: { a: 2 } });
    expect(m.stores.get("st_1").state).toEqual({ a: 2 });
    applyMessage(m, { type: "STORE_UNREGISTERED", storeId: "st_1" });
    expect(m.stores.size).toBe(0);
  });

  it("filters by store, text, call-site and pending diffs", () => {
    const entries = [
      { actionId: "a", storeId: "s1", storeName: "cart", actionName: "addItem", bookmarked: false, callSite: { label: "addItem", url: "http://x/src/cart.ts" } },
      { actionId: "b", storeId: "s2", storeName: "user", actionName: "login", bookmarked: true, callSite: null },
    ];
    expect(filterTraceEntries(entries, { storeId: "s1" }, () => null).length).toBe(1);
    expect(filterTraceEntries(entries, { text: "login" }, () => null).length).toBe(1);
    expect(filterTraceEntries(entries, { callsite: "cart.ts" }, () => null).length).toBe(1);
    expect(filterTraceEntries(entries, { bookmarked: true }, () => null).length).toBe(1);
    // path filter with no computed diffs excludes entries until diffs arrive
    expect(filterTraceEntries(entries, { path: "items" }, () => null).length).toBe(0);
    const diffs = { a: { changes: [{ path: "items[0]" }] } };
    expect(filterTraceEntries(entries, { path: "items" }, (id) => diffs[id] || null).length).toBe(1);
  });
});

// ---- Corrective-pass regressions ------------------------------------------
import {
  prepareSessionsForPersist,
  hydratePersistedSessions,
  invalidateSessionReplay,
  diffBaseFor,
} from "../extension/panel/model.js";

describe("D1: ACTION updates the live Stores view", () => {
  it("updates the matching registered store's state and keeps dedup intact", () => {
    const m = createModel();
    applyMessage(m, { type: "STORE_REGISTERED", storeId: "st_1", storeName: "cart", state: { items: 0 } });
    const dirty = applyMessage(m, action("a1", { state: { items: 1, total: 10 } }));
    expect(dirty).toContain("stores");
    expect(m.stores.get("st_1").state).toEqual({ items: 1, total: 10 });
    // duplicate delivery neither duplicates the timeline nor rewinds the store
    applyMessage(m, action("a1", { state: { items: 0 } }));
    expect(m.timeline.length).toBe(1);
    expect(m.stores.get("st_1").state).toEqual({ items: 1, total: 10 });
    // explicit STORE_UPDATE still works on top
    applyMessage(m, { type: "STORE_UPDATE", storeId: "st_1", state: { items: 2 } });
    expect(m.stores.get("st_1").state).toEqual({ items: 2 });
  });
});

describe("D2 (panel): RAW_EVICTED revokes replay everywhere", () => {
  it("flips matching timeline, trace, and session entries to view-only", () => {
    const m = createModel();
    applyMessage(m, action("a1"));
    applyMessage(m, { type: "TRACE_STARTED", traceId: "t1", startedAt: 1, limit: 100 });
    applyMessage(m, action("a2", { traceId: "t1" }));
    applyMessage(m, { type: "TRACE_STOPPED", traceId: "t1", reason: "user" });
    expect(m.timeline.every((e) => e.rawAvailable)).toBe(true);
    const dirty = applyMessage(m, { type: "RAW_EVICTED", evicted: [{ storeId: "st_1", actionId: "a1" }, { storeId: "st_1", actionId: "a2" }] });
    expect(dirty).toEqual(["timeline", "trace", "sessions"]);
    expect(m.timeline.find((e) => e.actionId === "a1").rawAvailable).toBe(false);
    expect(m.sessions[0].entries[0].rawAvailable).toBe(false);
    // idempotent + unknown ids are no-ops
    expect(applyMessage(m, { type: "RAW_EVICTED", evicted: [{ actionId: "a1" }, { actionId: "nope" }] })).toEqual([]);
  });
});

describe("D3 (panel): first-entry diffs use the trace-start baseline", () => {
  const session = {
    baselines: [
      { storeId: "s1", storeName: "cart", state: { items: [], total: 0, meta: { theme: "dark" } } },
      { storeId: "s2", storeName: "user", state: { loggedIn: false } },
    ],
    entries: [
      { actionId: "a1", storeId: "s1", state: { items: [{ sku: "x" }], total: 10, meta: { theme: "dark" } } },
      { actionId: "b1", storeId: "s2", state: { loggedIn: true } },
      { actionId: "a2", storeId: "s1", state: { items: [{ sku: "x" }], total: 20, meta: { theme: "dark" } } },
    ],
  };
  it("first entry per store compares against that store's baseline, not {}", () => {
    const pick = diffBaseFor(session, session.entries[0]);
    expect(pick.base).toBe(session.baselines[0].state);
    // and unchanged fields are NOT reported
    const { deepDiff } = awaitDeepDiff();
    const { changes } = deepDiff(pick.base, session.entries[0].state);
    const paths = changes.map((c) => c.path);
    expect(paths).toContain("total");
    expect(paths).toContain("items[0]");
    expect(paths).not.toContain("meta");
    expect(paths).not.toContain("meta.theme");
  });
  it("baseline selection is per-store", () => {
    expect(diffBaseFor(session, session.entries[1]).base).toEqual({ loggedIn: false });
  });
  it("later entries compare against the predecessor of the same store", () => {
    expect(diffBaseFor(session, session.entries[2]).base).toBe(session.entries[0].state);
  });
  it("metadata-only traces report the first diff honestly instead of inventing one", () => {
    const meta = { baselines: [], entries: [{ actionId: "a", storeId: "s1", state: undefined }] };
    expect(diffBaseFor(meta, meta.entries[0]).unavailable).toBe(true);
    const noBl = { baselines: [], entries: [{ actionId: "a", storeId: "s1", state: { x: 1 } }] };
    expect(diffBaseFor(noBl, noBl.entries[0]).noBaseline).toBe(true);
  });
});

import { deepDiff as _dd } from "../extension/lib/deep-diff.js";
function awaitDeepDiff() { return { deepDiff: _dd }; }

describe("D4: persisted sessions are view-only", () => {
  function liveSession() {
    return {
      traceId: "t1", startedAt: 1, stoppedAt: 2, reason: "user",
      baselines: [{ storeId: "s1", storeName: "cart", state: { a: 1 } }],
      entries: [{ actionId: "a1", storeId: "s1", storeName: "cart", actionName: "x", timestamp: 1, state: { a: 2 }, rawAvailable: true }],
    };
  }
  it("prepareSessionsForPersist never stores rawAvailable: true", () => {
    const out = prepareSessionsForPersist([liveSession()]);
    expect(out[0].persisted).toBe(true);
    expect(out[0].entries[0].rawAvailable).toBe(false);
    // original in-memory session untouched
    const orig = liveSession();
    prepareSessionsForPersist([orig]);
    expect(orig.entries[0].rawAvailable).toBe(true);
  });
  it("oversized persists strip state and mark it honestly", () => {
    const out = prepareSessionsForPersist([liveSession()], 10 /* force stripping */);
    expect(out[0].stateStripped).toBe(true);
    expect(out[0].entries[0].state).toBeUndefined();
    expect(out[0].baselines).toEqual([]);
  });
  it("hydratePersistedSessions boots everything view-only even if storage lies", () => {
    const stored = [liveSession()];
    stored[0].entries[0].rawAvailable = true; // a stale persisted boolean
    const out = hydratePersistedSessions(JSON.parse(JSON.stringify(stored)));
    expect(out.length).toBe(1);
    expect(out[0].entries[0].rawAvailable).toBe(false);
    expect(out[0].persisted).toBe(true);
    expect(hydratePersistedSessions("garbage")).toEqual([]);
    expect(hydratePersistedSessions([{ nope: true }])).toEqual([]);
  });
  it("navigation invalidates replay on all sessions", () => {
    const m = createModel();
    m.sessions.push(liveSession());
    invalidateSessionReplay(m);
    expect(m.sessions[0].entries.every((e) => e.rawAvailable === false)).toBe(true);
  });
});
