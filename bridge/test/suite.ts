// Version-agnostic correctness suite: imported by zustand4.test.ts and
// zustand5.test.ts with the respective `create` implementation, so every
// guarantee is proven against both supported majors.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  withDevtoolsBridge,
  __resetForTests,
  __setRawCapForTests,
  encodeForDisplay,
  parseCallSite,
  RAW_RETENTION_CAP,
} from "../src/index";
import { captureBridgeMessages, sendControl, flush, type Captured } from "./helpers";

type CreateFn = (initializer: unknown) => {
  getState: () => Record<string, unknown>;
  setState: (p: unknown, r?: boolean, a?: string) => void;
};

export function runBridgeSuite(zustandLabel: string, create: CreateFn) {
  describe(`bridge on ${zustandLabel}`, () => {
    let cap: Captured;

    beforeEach(() => {
      __resetForTests();
      sessionStorage.clear();
      cap = captureBridgeMessages();
    });
    afterEach(() => {
      cap.dispose();
    });

    function makeExoticStore(name = "exotic") {
      interface Cycle {
        self?: Cycle;
        label: string;
      }
      const cyclic: Cycle = { label: "loop" };
      cyclic.self = cyclic;
      return create(
        withDevtoolsBridge(
          (set: (p: unknown, r?: boolean, a?: string) => void) => ({
            when: new Date("2026-01-02T03:04:05.000Z"),
            lookup: new Map([
              ["a", 1],
              ["b", 2],
            ]),
            tags: new Set(["x", "y"]),
            matcher: /he(l+)o/gi,
            big: Array.from({ length: 60 }, (_, i) => i),
            deep: { l1: { l2: { l3: { l4: { l5: { l6: "bottom" } } } } } },
            nan: NaN,
            inf: Infinity,
            missing: undefined as unknown,
            bigint: 123456789012345678901234567890n,
            cyclic,
            counter: 0,
            increment: () => set((s: { counter: number }) => ({ counter: s.counter + 1 }), false, "increment"),
            clobber: () =>
              set(
                {
                  when: new Date("2030-12-31T00:00:00.000Z"),
                  lookup: new Map([["z", 99]]),
                  tags: new Set(["gone"]),
                  big: [0],
                  deep: { l1: "flattened" },
                  nan: 0,
                  inf: 0,
                  bigint: 1n,
                  counter: 1000,
                },
                false,
                "clobber"
              ),
          }),
          { name }
        ) as never
      );
    }

    it("registers stores explicitly with stable IDs, name, state and capabilities", async () => {
      makeExoticStore("regcheck");
      await flush();
      const reg = cap.ofType("STORE_REGISTERED");
      expect(reg.length).toBe(1);
      const m = reg[0];
      expect(m.storeName).toBe("regcheck");
      expect(typeof m.storeId).toBe("string");
      expect((m.storeId as string).startsWith("st_")).toBe(true);
      expect(m.protocolVersion).toBe(2);
      expect((m.capabilities as Record<string, unknown>).rawTimeTravel).toBe(true);
      // Display state uses markers, not silent conversion
      const state = m.state as Record<string, Record<string, unknown>>;
      expect(state.when.__zdt).toBe("date");
      expect(state.lookup.__zdt).toBe("map");
      expect(state.tags.__zdt).toBe("set");
      expect(state.matcher.__zdt).toBe("regexp");
      expect(state.nan).toEqual({ __zdt: "num", v: "NaN" });
      expect(state.bigint.__zdt).toBe("bigint");
      expect(state.increment.__zdt).toBe("fn");
      expect(state.cyclic).toBeTruthy();
    });

    it("assigns unique stable action IDs and a session ID to every action", async () => {
      const store = makeExoticStore("ids");
      (store.getState().increment as () => void)();
      (store.getState().increment as () => void)();
      await flush();
      const actions = cap.ofType("ACTION");
      expect(actions.length).toBeGreaterThanOrEqual(3); // @@INIT + 2
      const ids = actions.map((a) => a.actionId);
      expect(new Set(ids).size).toBe(ids.length);
      const sessions = new Set(actions.map((a) => a.sessionId));
      expect(sessions.size).toBe(1);
      expect(actions.every((a) => a.rawAvailable === true)).toBe(true);
    });

    it("time-travel restores the ORIGINAL raw state: Date, Map, Set, RegExp, big arrays, deep objects, NaN, Infinity, undefined, BigInt, cycles, functions", async () => {
      const store = makeExoticStore("tt");
      const before = store.getState();
      const originalDate = before.when;
      const originalIncrement = before.increment;
      await flush();
      const init = cap.ofType("ACTION").find((a) => a.actionName === "@@INIT")!;
      expect(init).toBeTruthy();

      // Destroy everything
      (store.getState().clobber as () => void)();
      await flush();
      expect((store.getState().when as Date).getFullYear()).toBe(2030);
      expect((store.getState().lookup as Map<string, number>).has("a")).toBe(false);

      // Jump back by ID only — no state crosses the boundary
      sendControl({ type: "TIME_TRAVEL_JUMP", storeId: init.storeId, actionId: init.actionId });
      await flush();

      const s = store.getState();
      expect(s.when).toBe(originalDate); // same object identity, not a copy
      expect(s.when instanceof Date).toBe(true);
      expect((s.when as Date).toISOString()).toBe("2026-01-02T03:04:05.000Z");
      expect(s.lookup instanceof Map).toBe(true);
      expect((s.lookup as Map<string, number>).get("b")).toBe(2);
      expect(s.tags instanceof Set).toBe(true);
      expect((s.tags as Set<string>).has("y")).toBe(true);
      expect(s.matcher instanceof RegExp).toBe(true);
      expect((s.matcher as RegExp).source).toBe("he(l+)o");
      expect((s.big as number[]).length).toBe(60);
      expect((s.big as number[])[59]).toBe(59);
      const deep = s.deep as { l1: { l2: { l3: { l4: { l5: { l6: string } } } } } };
      expect(deep.l1.l2.l3.l4.l5.l6).toBe("bottom");
      expect(Number.isNaN(s.nan)).toBe(true);
      expect(s.inf).toBe(Infinity);
      expect(s.bigint).toBe(123456789012345678901234567890n);
      const cyc = s.cyclic as { self?: unknown };
      expect(cyc.self).toBe(cyc);
      expect(s.increment).toBe(originalIncrement);
      expect(typeof s.increment).toBe("function");
      // and the restored action function still works
      (s.increment as () => void)();
      expect(store.getState().counter).toBe(1);
      // the jump itself must not have been recorded as an action
      const names = cap.ofType("ACTION").map((a) => a.actionName);
      expect(names.filter((n) => n === "@@INIT").length).toBe(1);
      // panel gets a fresh STORE_UPDATE after the jump
      expect(cap.last("STORE_UPDATE")).toBeTruthy();
    });

    it("rejects time-travel to persisted (view-only) entries instead of restoring lossy data", async () => {
      sessionStorage.setItem(
        "zdt-history:persisted",
        JSON.stringify([
          { actionId: "act_old_1", actionName: "fromLastReload", timestamp: 1, display: { a: 1 } },
        ])
      );
      makeExoticStore("persisted");
      await flush();
      sendControl({ type: "REQUEST_HISTORY" });
      await flush();
      const hist = cap.last("HISTORY")!;
      const entries = hist.entries as Record<string, unknown>[];
      const persisted = entries.find((e) => e.actionId === "act_old_1")!;
      expect(persisted.rawAvailable).toBe(false);

      const beforeJump = cap.messages.length;
      sendControl({ type: "TIME_TRAVEL_JUMP", storeId: hist.storeId, actionId: "act_old_1" });
      await flush();
      const rejected = cap.ofType("TIME_TRAVEL_REJECTED");
      expect(rejected.length).toBe(1);
      expect(rejected[0].reason).toBe("raw-unavailable");
      // and no STORE_UPDATE resulted from the rejected jump
      expect(cap.messages.slice(beforeJump).filter((m) => m.type === "STORE_UPDATE").length).toBe(0);
    });

    it("rejects unknown action IDs", async () => {
      makeExoticStore("unknown");
      await flush();
      const reg = cap.last("STORE_REGISTERED")!;
      sendControl({ type: "TIME_TRAVEL_JUMP", storeId: reg.storeId, actionId: "act_nope" });
      await flush();
      expect(cap.last("TIME_TRAVEL_REJECTED")!.reason).toBe("unknown-action");
    });

    it("redacts default sensitive keys and custom paths/patterns before anything leaves the page — raw stays intact", async () => {
      const store = create(
        withDevtoolsBridge(
          (set: (p: unknown, r?: boolean, a?: string) => void) => ({
            auth: { accessToken: "SECRET-A", refreshToken: "SECRET-B" },
            user: { password: "hunter2", profile: { internalNote: "hide me" } },
            items: [{ apiKey: "k-1" }, { apiKey: "k-2" }],
            visible: "public",
            login: () => set({ visible: "logged-in" }, false, "login"),
          }),
          { name: "redact", redact: ["user.profile.internalNote", /items\[\d+\]\.apiKey/] }
        ) as never
      );
      await flush();
      const reg = cap.last("STORE_REGISTERED")!;
      const state = reg.state as Record<string, never>;
      expect((state.auth as Record<string, unknown>).accessToken).toEqual({ __zdt: "redacted" });
      expect((state.auth as Record<string, unknown>).refreshToken).toEqual({ __zdt: "redacted" });
      expect((state.user as Record<string, unknown>).password).toEqual({ __zdt: "redacted" });
      expect(((state.user as Record<string, never>).profile as Record<string, unknown>).internalNote).toEqual({
        __zdt: "redacted",
      });
      const items = state.items as Record<string, unknown>[];
      expect(items[0].apiKey).toEqual({ __zdt: "redacted" });
      expect(items[1].apiKey).toEqual({ __zdt: "redacted" });
      expect(state.visible).toBe("public");
      // Raw in-memory state is untouched (needed for correct time-travel)
      expect((store.getState().auth as Record<string, string>).accessToken).toBe("SECRET-A");
    });

    it("enabled:false leaves zero footprint: same initializer, no listeners, no messages, no storage", async () => {
      __resetForTests();
      const initializer = (set: never) => ({ a: 1 });
      const wrapped = withDevtoolsBridge(initializer as never, { name: "off", enabled: false });
      expect(wrapped).toBe(initializer);

      const addSpy = vi.spyOn(window, "addEventListener");
      const before = cap.messages.length;
      const store = create(wrapped as never);
      store.setState({ a: 2 });
      await flush();
      expect(cap.messages.length).toBe(before);
      expect(addSpy.mock.calls.filter((c) => c[0] === "message").length).toBe(0);
      expect(sessionStorage.length).toBe(0);
      addSpy.mockRestore();
    });

    it("tracks direct setState calls with the actionName third argument", async () => {
      const store = makeExoticStore("direct");
      store.setState({ counter: 42 }, false, "directBump");
      await flush();
      const action = cap.ofType("ACTION").find((a) => a.actionName === "directBump");
      expect(action).toBeTruthy();
      expect(store.getState().counter).toBe(42);
    });

    it("duplicate names / hot reload: new registration replaces the old, old closure goes silent", async () => {
      const first = makeExoticStore("dup");
      await flush();
      const firstId = cap.last("STORE_REGISTERED")!.storeId;
      makeExoticStore("dup");
      await flush();
      const unreg = cap.ofType("STORE_UNREGISTERED");
      expect(unreg.length).toBe(1);
      expect(unreg[0].storeId).toBe(firstId);
      cap.clear();
      (first.getState().increment as () => void)();
      await flush();
      // detached store posts nothing
      expect(cap.ofType("ACTION").filter((a) => a.storeId === firstId).length).toBe(0);
    });

    it("trace sessions: entries are tagged and call-sites captured only while active; limit stops the trace", async () => {
      const store = makeExoticStore("trace");
      await flush();
      cap.clear();
      (store.getState().increment as () => void)();
      await flush();
      expect(cap.ofType("ACTION")[0].traceId).toBe(null);
      expect(cap.ofType("ACTION")[0].callSite).toBe(null);

      sendControl({ type: "TRACE_START", traceId: "trc_test", limit: 2 });
      await flush();
      expect(cap.last("TRACE_STARTED")!.traceId).toBe("trc_test");

      cap.clear();
      (store.getState().increment as () => void)();
      (store.getState().increment as () => void)();
      (store.getState().increment as () => void)(); // over limit
      await flush();
      const traced = cap.ofType("ACTION").filter((a) => a.traceId === "trc_test");
      expect(traced.length).toBe(2);
      for (const t of traced) {
        // vitest stacks point at this test file — a plausible app frame
        const cs = t.callSite as Record<string, unknown> | null;
        if (cs) {
          expect(typeof cs.url).toBe("string");
          expect(typeof cs.line).toBe("number");
          expect(String(cs.url)).not.toMatch(/zustand-devtools-bridge|\/zustand\//);
        }
      }
      const stopped = cap.ofType("TRACE_STOPPED");
      expect(stopped.length).toBe(1);
      expect(stopped[0].reason).toBe("limit");
      expect(stopped[0].entryCount).toBe(2);
    });

    it("REQUEST_STORES replays registrations and current state for late-opened panels", async () => {
      makeExoticStore("late-a");
      makeExoticStore("late-b");
      await flush();
      cap.clear();
      sendControl({ type: "REQUEST_STORES" });
      await flush();
      expect(cap.ofType("STORE_REGISTERED").length).toBe(2);
      expect(cap.ofType("STORE_UPDATE").length).toBe(2);
    });

    it("raw retention outlives history eviction: a 205-action trace replays its first action (regression)", async () => {
      const store = create(
        withDevtoolsBridge(
          (set: (p: unknown, r?: boolean, a?: string) => void) => ({
            n: 0,
            bump: () => set((s: { n: number }) => ({ n: s.n + 1 }), false, "bump"),
          }),
          { name: "long", maxHistory: 200 }
        ) as never
      );
      await flush();
      const first = cap.ofType("ACTION").find((a) => a.actionName === "@@INIT")!;
      for (let i = 0; i < 204; i++) (store.getState().bump as () => void)();
      await flush();
      // display history evicted the earliest entries…
      cap.clear();
      sendControl({ type: "REQUEST_HISTORY" });
      await flush();
      const hist = cap.ofType("HISTORY").find((h) => h.storeName === "long")!;
      expect((hist.entries as unknown[]).length).toBe(200);
      // …but no RAW_EVICTED was posted (raw registry is larger), so the
      // first action must still replay — the panel's button stays honest.
      expect(cap.ofType("RAW_EVICTED").length).toBe(0);
      sendControl({ type: "TIME_TRAVEL_JUMP", storeId: first.storeId, actionId: first.actionId });
      await flush();
      expect(cap.ofType("TIME_TRAVEL_REJECTED").length).toBe(0);
      expect(store.getState().n).toBe(0);
    });

    it("raw-registry eviction is explicit: RAW_EVICTED fires and evicted entries reject, survivors replay", async () => {
      __setRawCapForTests(3);
      const store = create(
        withDevtoolsBridge(
          (set: (p: unknown, r?: boolean, a?: string) => void) => ({
            n: 0,
            bump: () => set((s: { n: number }) => ({ n: s.n + 1 }), false, "bump"),
          }),
          { name: "evict" }
        ) as never
      );
      for (let i = 0; i < 4; i++) (store.getState().bump as () => void)(); // 5 actions incl. @@INIT
      await flush();
      const actions = cap.ofType("ACTION");
      expect(actions.length).toBe(5);
      const evictedMsgs = cap.ofType("RAW_EVICTED");
      expect(evictedMsgs.length).toBeGreaterThan(0);
      const evictedIds = evictedMsgs.flatMap((m) =>
        (m.evicted as { actionId: string }[]).map((e) => e.actionId)
      );
      expect(evictedIds).toContain(actions[0].actionId);
      // evicted entry rejects with the honest reason…
      sendControl({ type: "TIME_TRAVEL_JUMP", storeId: actions[0].storeId, actionId: actions[0].actionId });
      await flush();
      expect(cap.last("TIME_TRAVEL_REJECTED")!.reason).toBe("raw-unavailable");
      // …and every non-evicted entry still replays
      const survivor = actions[actions.length - 3];
      expect(evictedIds).not.toContain(survivor.actionId);
      sendControl({ type: "TIME_TRAVEL_JUMP", storeId: survivor.storeId, actionId: survivor.actionId });
      await flush();
      expect(store.getState().n).toBe(2);
    });

    it("raw retention cap covers the full Pro trace limit (2000)", () => {
      expect(RAW_RETENTION_CAP).toBeGreaterThanOrEqual(2000);
    });

    it("TRACE_STARTED carries per-store, redacted, display-safe baselines", async () => {
      makeExoticStore("base-a");
      create(
        withDevtoolsBridge(
          (set: (p: unknown, r?: boolean, a?: string) => void) => ({
            password: "hunter2",
            plain: 1,
            login: () => set({ plain: 2 }, false, "login"),
          }),
          { name: "base-b" }
        ) as never
      );
      await flush();
      cap.clear();
      sendControl({ type: "TRACE_START", traceId: "trc_base", limit: 50 });
      await flush();
      const started = cap.last("TRACE_STARTED")!;
      const baselines = started.baselines as { storeId: string; storeName: string; state: Record<string, unknown> }[];
      expect(baselines.length).toBe(2);
      const names = baselines.map((b) => b.storeName).sort();
      expect(names).toEqual(["base-a", "base-b"]);
      const b = baselines.find((x) => x.storeName === "base-b")!;
      expect(b.state.password).toEqual({ __zdt: "redacted" });
      expect(b.state.plain).toBe(1);
      const a = baselines.find((x) => x.storeName === "base-a")!;
      expect((a.state.when as Record<string, unknown>).__zdt).toBe("date");
    });

    it("DEACTIVATE cancels an active trace; capture stops (regression)", async () => {
      const store = makeExoticStore("deact");
      await flush();
      sendControl({ type: "TRACE_START", traceId: "trc_d", limit: 100 });
      await flush();
      (store.getState().increment as () => void)();
      await flush();
      cap.clear();
      sendControl({ type: "DEACTIVATE" });
      await flush();
      const stopped = cap.ofType("TRACE_STOPPED");
      expect(stopped.length).toBe(1);
      expect(stopped[0].reason).toBe("cancel");
      cap.clear();
      (store.getState().increment as () => void)();
      await flush();
      const after = cap.ofType("ACTION")[0];
      expect(after.traceId).toBe(null);
      expect(after.callSite).toBe(null);
    });

    it("hot-reload replacement evicts the old store's raw states explicitly", async () => {
      const first = makeExoticStore("swap");
      (first.getState().increment as () => void)();
      await flush();
      const firstId = cap.ofType("STORE_REGISTERED")[0].storeId;
      cap.clear();
      makeExoticStore("swap");
      await flush();
      const evicted = cap.ofType("RAW_EVICTED");
      expect(evicted.length).toBe(1);
      expect((evicted[0].evicted as { storeId: string }[]).every((e) => e.storeId === firstId)).toBe(true);
    });

    it("caps history at maxHistory", async () => {
      const store = create(
        withDevtoolsBridge(
          (set: (p: unknown, r?: boolean, a?: string) => void) => ({
            n: 0,
            bump: () => set((s: { n: number }) => ({ n: s.n + 1 }), false, "bump"),
          }),
          { name: "capped", maxHistory: 5 }
        ) as never
      );
      for (let i = 0; i < 12; i++) (store.getState().bump as () => void)();
      await flush();
      cap.clear();
      sendControl({ type: "REQUEST_HISTORY" });
      await flush();
      const hist = cap.ofType("HISTORY").find((h) => h.storeName === "capped")!;
      expect((hist.entries as unknown[]).length).toBe(5);
    });
  });

  describe(`encoding + call-site parsing (${zustandLabel})`, () => {
    it("marks truncation explicitly instead of silently dropping", () => {
      const wide: Record<string, number> = {};
      for (let i = 0; i < 80; i++) wide[`k${i}`] = i;
      const enc = encodeForDisplay(wide, {
        maxDepth: 4,
        maxKeys: 50,
        redact: { keySubstrings: [], pathPrefixes: [], regexes: [] },
      }) as Record<string, unknown>;
      expect(enc.__zdt_truncated__).toEqual({ __zdt: "truncated", kept: 50, total: 80 });
      const longArr = encodeForDisplay(Array.from({ length: 60 }, (_, i) => i), {
        maxDepth: 4,
        maxKeys: 50,
        redact: { keySubstrings: [], pathPrefixes: [], regexes: [] },
      }) as unknown[];
      expect(longArr.length).toBe(51);
      expect(longArr[50]).toEqual({ __zdt: "truncated", kept: 50, total: 60 });
    });

    it("parses V8 stacks and skips internal frames", () => {
      const stack = [
        "Error",
        "    at captureCallSite (http://localhost:5173/node_modules/zustand-devtools-bridge/dist/index.js:210:15)",
        "    at recordAction (http://localhost:5173/node_modules/zustand-devtools-bridge/dist/index.js:280:5)",
        "    at Object.setState (http://localhost:5173/node_modules/zustand-devtools-bridge/dist/index.js:300:7)",
        "    at addItem (http://localhost:5173/src/stores/cart.ts:42:11)",
        "    at onClick (http://localhost:5173/src/components/Cart.tsx:17:23)",
      ].join("\n");
      const cs = parseCallSite(stack)!;
      expect(cs.label).toBe("addItem");
      expect(cs.url).toBe("http://localhost:5173/src/stores/cart.ts");
      expect(cs.line).toBe(42);
      expect(cs.column).toBe(11);
    });

    it("returns null for useless stacks instead of guessing", () => {
      expect(parseCallSite(undefined)).toBe(null);
      expect(parseCallSite("Error\n    at <anonymous>")).toBe(null);
    });
  });
}
