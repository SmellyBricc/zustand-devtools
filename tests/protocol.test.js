import { describe, expect, it } from "vitest";
import "../extension/lib/protocol.js";

const { validatePageMessage, validateBridgeMessage, LIMITS, payloadOk } = globalThis.ZDTProtocol;

const v2 = (m) => ({ source: "zustand-devtools-bridge", protocolVersion: 2, ...m });

describe("D6: bridge protocol v2 validation", () => {
  it("accepts every valid message type the bridge actually sends", () => {
    expect(validateBridgeMessage(v2({ type: "STORE_REGISTERED", storeId: "st_1", storeName: "cart", state: { a: 1 } }))).toBe(true);
    expect(validateBridgeMessage(v2({ type: "STORE_UNREGISTERED", storeId: "st_1" }))).toBe(true);
    expect(validateBridgeMessage(v2({ type: "STORE_UPDATE", storeId: "st_1", state: { a: 1 } }))).toBe(true);
    expect(validateBridgeMessage(v2({ type: "ACTION", storeId: "st_1", actionId: "act_1", actionName: "addItem", timestamp: 1, state: { a: 1 }, callSite: { label: "f", url: "http://x/a.ts", line: 1, column: 2 }, traceId: null }))).toBe(true);
    expect(validateBridgeMessage(v2({ type: "HISTORY", storeId: "st_1", entries: [{ actionId: "a", actionName: "x", timestamp: 1, state: {} }] }))).toBe(true);
    expect(validateBridgeMessage(v2({ type: "TRACE_STARTED", traceId: "t", startedAt: 1, limit: 100, baselines: [{ storeId: "st_1", storeName: "cart", state: { a: 1 } }] }))).toBe(true);
    expect(validateBridgeMessage(v2({ type: "TRACE_STOPPED", traceId: "t", reason: "user" }))).toBe(true);
    expect(validateBridgeMessage(v2({ type: "TIME_TRAVEL_REJECTED", reason: "raw-unavailable" }))).toBe(true);
    expect(validateBridgeMessage(v2({ type: "RAW_EVICTED", evicted: [{ storeId: "st_1", actionId: "a" }] }))).toBe(true);
  });

  it("rejects wrong or missing protocol versions", () => {
    expect(validateBridgeMessage({ source: "zustand-devtools-bridge", protocolVersion: 1, type: "STORE_UNREGISTERED", storeId: "s" })).toBe(false);
    expect(validateBridgeMessage({ source: "zustand-devtools-bridge", type: "STORE_UNREGISTERED", storeId: "s" })).toBe(false);
    expect(validateBridgeMessage({ source: "zustand-devtools-bridge", protocolVersion: "2", type: "STORE_UNREGISTERED", storeId: "s" })).toBe(false);
  });

  it("rejects unexpected types and missing identity fields", () => {
    expect(validateBridgeMessage(v2({ type: "EVAL_THIS", code: "alert(1)" }))).toBe(false);
    expect(validateBridgeMessage(v2({ type: "ACTION", actionId: "a", actionName: "x", timestamp: 1 }))).toBe(false); // no storeId
    expect(validateBridgeMessage(v2({ type: "ACTION", storeId: "s", actionName: "x", timestamp: 1 }))).toBe(false); // no actionId
    expect(validateBridgeMessage(v2({ type: "ACTION", storeId: "s", actionId: "a", actionName: 42, timestamp: 1 }))).toBe(false);
    expect(validateBridgeMessage(v2({ type: "ACTION", storeId: "s", actionId: "a", actionName: "x", timestamp: "then" }))).toBe(false);
    expect(validateBridgeMessage(v2({ type: "TRACE_STOPPED", traceId: "t", reason: "because" }))).toBe(false);
  });

  it("rejects oversized histories, ids, strings and structures", () => {
    expect(validateBridgeMessage(v2({ type: "HISTORY", storeId: "s", entries: new Array(LIMITS.maxHistoryEntries + 1).fill({ actionId: "a", actionName: "x", timestamp: 1 }) }))).toBe(false);
    expect(validateBridgeMessage(v2({ type: "STORE_UNREGISTERED", storeId: "x".repeat(LIMITS.maxIdLength + 1) }))).toBe(false);
    expect(validateBridgeMessage(v2({ type: "STORE_UPDATE", storeId: "s", state: { big: "y".repeat(LIMITS.maxStringLength + 1) } }))).toBe(false);
    const wide = {};
    let cursor = wide;
    for (let i = 0; i < LIMITS.maxDepth + 5; i++) cursor = cursor.child = {};
    expect(validateBridgeMessage(v2({ type: "STORE_UPDATE", storeId: "s", state: wide }))).toBe(false);
    const huge = { arr: new Array(LIMITS.maxNodes + 10).fill(0) };
    expect(validateBridgeMessage(v2({ type: "STORE_UPDATE", storeId: "s", state: huge }))).toBe(false);
  });

  it("rejects cyclic payloads without hanging (no stringify)", () => {
    const cyc = { a: 1 };
    cyc.self = cyc;
    const t0 = performance.now();
    expect(validateBridgeMessage(v2({ type: "STORE_UPDATE", storeId: "s", state: cyc }))).toBe(false);
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it("prototype-pollution-shaped payloads validate as inert data and pollute nothing", () => {
    const msg = JSON.parse(
      '{"source":"zustand-devtools-bridge","protocolVersion":2,"type":"STORE_UPDATE","storeId":"s","state":{"__proto__":{"polluted":true},"constructor":{"prototype":{"x":1}}}}'
    );
    // shape-wise it's just keys and objects — allowed as data…
    expect(validateBridgeMessage(msg)).toBe(true);
    // …and validation itself must not have polluted anything
    expect({}.polluted).toBeUndefined();
    expect(Object.prototype.polluted).toBeUndefined();
  });
});

describe("D6: page/fiber message validation", () => {
  it("accepts real page-script output", () => {
    expect(validatePageMessage({ source: "zustand-devtools-page", type: "RENDERER_DETECTED", version: "19.1.0" })).toBe(true);
    expect(validatePageMessage({ source: "zustand-devtools-page", type: "STATE_UPDATE", components: [{ component: "App", values: [1, "x", { a: 1 }] }] })).toBe(true);
  });

  it("rejects malformed and oversized page messages", () => {
    expect(validatePageMessage(null)).toBe(false);
    expect(validatePageMessage({ source: "zustand-devtools-page", type: "OTHER" })).toBe(false);
    expect(validatePageMessage({ source: "zustand-devtools-page", type: "STATE_UPDATE", components: "nope" })).toBe(false);
    expect(validatePageMessage({ source: "zustand-devtools-page", type: "STATE_UPDATE", components: new Array(LIMITS.maxComponents + 1).fill({ component: "A", values: [] }) })).toBe(false);
    expect(validatePageMessage({ source: "zustand-devtools-page", type: "STATE_UPDATE", components: [{ component: "A", values: new Array(LIMITS.maxValuesPerComponent + 1).fill(0) }] })).toBe(false);
    expect(validatePageMessage({ source: "zustand-devtools-page", type: "STATE_UPDATE", components: [{ component: 42, values: [] }] })).toBe(false);
    expect(validatePageMessage({ source: "zustand-devtools-page", type: "RENDERER_DETECTED", version: "v".repeat(101) })).toBe(false);
  });

  it("wrong source strings never cross validators", () => {
    expect(validatePageMessage({ source: "zustand-devtools-bridge", type: "RENDERER_DETECTED" })).toBe(false);
    expect(validateBridgeMessage({ source: "zustand-devtools-page", protocolVersion: 2, type: "STORE_UNREGISTERED", storeId: "s" })).toBe(false);
  });
});

describe("payloadOk budget walk", () => {
  it("accepts normal encoded state quickly", () => {
    const state = { items: Array.from({ length: 50 }, (_, i) => ({ sku: `s${i}`, q: i })), when: { __zdt: "date", v: "2026-01-01" } };
    expect(payloadOk(state)).toBe(true);
  });
});
