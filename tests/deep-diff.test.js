import { describe, expect, it } from "vitest";
import { deepDiff, structuralEqual, shortLabel } from "../extension/lib/deep-diff.js";

describe("deepDiff", () => {
  it("produces path-level changes for nested objects and arrays", () => {
    const before = {
      cart: { items: [{ sku: "a", quantity: 1 }, { sku: "b", quantity: 2 }], open: false },
      user: { profile: { name: "Ada" } },
    };
    const after = {
      cart: { items: [{ sku: "a", quantity: 1 }, { sku: "b", quantity: 5 }], open: false },
      user: { profile: { name: "Grace" } },
      filters: { active: true },
    };
    const { changes, truncated } = deepDiff(before, after);
    expect(truncated).toBe(false);
    const byPath = Object.fromEntries(changes.map((c) => [c.path, c]));
    expect(byPath["cart.items[1].quantity"]).toMatchObject({ kind: "changed", before: 2, after: 5 });
    expect(byPath["user.profile.name"]).toMatchObject({ kind: "changed", before: "Ada", after: "Grace" });
    expect(byPath["filters"]).toMatchObject({ kind: "added" });
    expect(changes.length).toBe(3);
  });

  it("reports added and removed array elements", () => {
    const { changes } = deepDiff({ list: [1, 2] }, { list: [1] });
    expect(changes).toEqual([{ path: "list[1]", kind: "removed", before: 2 }]);
    const { changes: added } = deepDiff({ list: [1] }, { list: [1, 9] });
    expect(added).toEqual([{ path: "list[0+1]".replace("0+1", "1"), kind: "added", after: 9 }]);
  });

  it("treats encoder markers as leaves and compares them structurally", () => {
    const before = { when: { __zdt: "date", v: "2026-01-01T00:00:00.000Z" }, m: { __zdt: "map", size: 1, entries: [["a", 1]] } };
    const afterSame = { when: { __zdt: "date", v: "2026-01-01T00:00:00.000Z" }, m: { __zdt: "map", size: 1, entries: [["a", 1]] } };
    expect(deepDiff(before, afterSame).changes.length).toBe(0);
    const afterChanged = { when: { __zdt: "date", v: "2026-06-01T00:00:00.000Z" }, m: before.m };
    const { changes } = deepDiff(before, afterChanged);
    expect(changes.length).toBe(1);
    expect(changes[0].path).toBe("when");
    expect(changes[0].kind).toBe("changed");
  });

  it("caps output and flags truncation instead of freezing", () => {
    const before = {};
    const after = {};
    for (let i = 0; i < 1200; i++) after[`k${i}`] = i;
    const { changes, truncated } = deepDiff(before, after);
    expect(truncated).toBe(true);
    expect(changes.length).toBe(500);
  });

  it("handles pathological depth without stack overflow", () => {
    let a = {};
    let b = {};
    let pa = a;
    let pb = b;
    for (let i = 0; i < 200; i++) {
      pa.child = { i };
      pb.child = { i: i === 199 ? -1 : i };
      pa = pa.child;
      pb = pb.child;
    }
    const { changes } = deepDiff(a, b);
    // deeper than MAX_DEPTH collapses into a single "changed" at the cap
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.length).toBeLessThan(5);
  });

  it("diffs a large flat object quickly", () => {
    const before = {};
    const after = {};
    for (let i = 0; i < 5000; i++) {
      before[`k${i}`] = i;
      after[`k${i}`] = i === 4999 ? -1 : i;
    }
    const t0 = performance.now();
    const { changes } = deepDiff(before, after);
    const ms = performance.now() - t0;
    expect(changes.length).toBe(1);
    expect(ms).toBeLessThan(200);
  });
});

describe("structuralEqual + shortLabel", () => {
  it("compares mixed trees", () => {
    expect(structuralEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(structuralEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
    expect(structuralEqual(NaN, NaN)).toBe(true); // Object.is semantics
  });

  it("labels markers as text, never HTML", () => {
    expect(shortLabel({ __zdt: "date", v: "2026-01-01T00:00:00.000Z" })).toContain("Date(");
    expect(shortLabel({ __zdt: "redacted" })).toBe("•• redacted ••");
    expect(shortLabel({ __zdt: "fn", name: "addItem" })).toBe("ƒ addItem");
    expect(shortLabel("<img src=x onerror=alert(1)>")).toContain("<img"); // plain string, rendered via textContent
  });
});
