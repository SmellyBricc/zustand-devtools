import { describe, expect, it } from "vitest";
import {
  buildTraceBundle,
  validateTraceBundle,
  checkImportSize,
  TRACE_SCHEMA_VERSION,
  IMPORT_LIMITS,
} from "../extension/lib/trace-schema.js";

function goodBundle(overrides = {}) {
  return buildTraceBundle({
    extensionVersion: "1.1.0",
    bridgeVersion: "0.2.0",
    session: { traceId: "trc_1", name: "repro", startedAt: 1000, stoppedAt: 2000 },
    stores: [{ storeId: "st_1", storeName: "cart" }],
    entries: [
      {
        actionId: "act_1",
        storeId: "st_1",
        storeName: "cart",
        actionName: "addItem",
        timestamp: 1500,
        callSite: { label: "addItem", url: "http://localhost:5173/src/cart.ts", line: 42, column: 11 },
        state: { items: [1] },
        diffSummary: [{ path: "items[0]", kind: "added" }],
        bookmarked: true,
        note: "starts here",
      },
    ],
    includeState: true,
    ...overrides,
  });
}

describe("trace bundle export", () => {
  it("round-trips through validation", () => {
    const bundle = goodBundle();
    const res = validateTraceBundle(JSON.parse(JSON.stringify(bundle)));
    expect(res.ok).toBe(true);
    expect(res.bundle.entries[0].actionName).toBe("addItem");
    expect(res.bundle.entries[0].bookmarked).toBe(true);
    expect(res.bundle.entries[0].note).toBe("starts here");
    // imports are always view-only and can never claim replay safety
    expect(res.bundle.entries[0].replaySafe).toBe(false);
    expect(res.bundle.imported).toBe(true);
  });

  it("metadata-only export omits state", () => {
    const b = buildTraceBundle({
      extensionVersion: "1.1.0",
      bridgeVersion: "0.2.0",
      session: { traceId: "t", startedAt: 1 },
      stores: [],
      entries: [
        { actionId: "a", storeId: "s", storeName: "n", actionName: "x", timestamp: 1, state: { secret: 1 } },
      ],
      includeState: false,
    });
    expect(b.includesState).toBe(false);
    expect(b.entries[0].state).toBeUndefined();
  });

  it("never includes license material by construction", () => {
    const text = JSON.stringify(goodBundle());
    expect(text).not.toMatch(/license/i);
  });
});

describe("trace bundle import validation", () => {
  it("rejects non-objects and wrong kinds", () => {
    expect(validateTraceBundle(null).ok).toBe(false);
    expect(validateTraceBundle([]).ok).toBe(false);
    expect(validateTraceBundle({ kind: "something-else" }).ok).toBe(false);
  });

  it("rejects unsupported schema versions with a useful message", () => {
    const b = JSON.parse(JSON.stringify(goodBundle()));
    b.schemaVersion = 99;
    const res = validateTraceBundle(b);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("99");
    expect(res.error).toContain(String(TRACE_SCHEMA_VERSION));
  });

  it("rejects malformed entries", () => {
    const cases = [
      (b) => (b.entries = "nope"),
      (b) => (b.entries = [null]),
      (b) => (b.entries = [{ actionId: 5, storeId: "s", actionName: "x", timestamp: 1 }]),
      (b) => (b.entries = [{ actionId: "a", storeId: "s", actionName: "x", timestamp: "late" }]),
      (b) => (b.entries = [{ actionId: "a", storeId: "s", actionName: "x", timestamp: 1, callSite: { url: 42 } }]),
      (b) => (b.session = { traceId: "t" }),
      (b) => (b.stores = [{ storeId: "s" }]),
    ];
    for (const mutate of cases) {
      const b = JSON.parse(JSON.stringify(goodBundle()));
      mutate(b);
      expect(validateTraceBundle(b).ok).toBe(false);
    }
  });

  it("rejects oversized traces", () => {
    const b = JSON.parse(JSON.stringify(goodBundle()));
    b.entries = new Array(IMPORT_LIMITS.maxEntries + 1).fill(b.entries[0]);
    const res = validateTraceBundle(b);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("limit");
  });

  it("checkImportSize refuses huge files before parsing", () => {
    expect(checkImportSize("x".repeat(IMPORT_LIMITS.maxBytes + 1)).ok).toBe(false);
    expect(checkImportSize('{"ok":true}').ok).toBe(true);
  });

  it("whitelist-copies: unexpected fields are dropped and prototype pollution is inert", () => {
    const b = JSON.parse(
      JSON.stringify(goodBundle()).replace(
        '"kind"',
        '"__proto__":{"polluted":true},"evil":"<script>alert(1)</script>","kind"'
      )
    );
    const res = validateTraceBundle(b);
    expect(res.ok).toBe(true);
    expect(res.bundle.evil).toBeUndefined();
    expect({}.polluted).toBeUndefined();
    expect(Object.prototype.polluted).toBeUndefined();
  });

  it("keeps hostile strings as data (rendering is textContent-only by design)", () => {
    const b = JSON.parse(JSON.stringify(goodBundle()));
    b.entries[0].actionName = "<img src=x onerror=alert(1)>";
    const res = validateTraceBundle(b);
    expect(res.ok).toBe(true);
    expect(res.bundle.entries[0].actionName).toBe("<img src=x onerror=alert(1)>");
  });
});

describe("D3 (schema): baselines in export/import", () => {
  it("round-trips baselines when state is included", () => {
    const bundle = buildTraceBundle({
      extensionVersion: "1.1.0", bridgeVersion: "0.2.0",
      session: { traceId: "t", startedAt: 1, stoppedAt: 2 },
      stores: [{ storeId: "s1", storeName: "cart" }],
      baselines: [{ storeId: "s1", storeName: "cart", state: { items: [], total: 0 } }],
      entries: [{ actionId: "a", storeId: "s1", storeName: "cart", actionName: "x", timestamp: 1, state: { items: [1] } }],
      includeState: true,
    });
    expect(bundle.baselines.length).toBe(1);
    const res = validateTraceBundle(JSON.parse(JSON.stringify(bundle)));
    expect(res.ok).toBe(true);
    expect(res.bundle.baselines[0].state).toEqual({ items: [], total: 0 });
  });

  it("metadata-only exports omit baseline values", () => {
    const bundle = buildTraceBundle({
      extensionVersion: "1.1.0", bridgeVersion: "0.2.0",
      session: { traceId: "t", startedAt: 1 },
      stores: [],
      baselines: [{ storeId: "s1", storeName: "cart", state: { secret: 1 } }],
      entries: [],
      includeState: false,
    });
    expect(bundle.baselines).toBeUndefined();
    const res = validateTraceBundle(JSON.parse(JSON.stringify(bundle)));
    expect(res.ok).toBe(true);
    expect(res.bundle.baselines).toEqual([]);
  });

  it("rejects malformed baseline records", () => {
    const b = JSON.parse(JSON.stringify(goodBundle()));
    b.baselines = [{ storeId: 42 }];
    expect(validateTraceBundle(b).ok).toBe(false);
    b.baselines = "nope";
    expect(validateTraceBundle(b).ok).toBe(false);
  });
});
