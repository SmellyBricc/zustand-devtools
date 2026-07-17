// Protocol validation for everything arriving from the inspected page.
//
// HONESTY NOTE: messages travel through the page's MAIN world, so the page
// itself can always forge a message with the right shape — there is no
// authentication boundary against the inspected page. What this module
// guarantees is narrower and real: malformed, oversized, cyclic, or
// unexpected payloads are dropped BEFORE they reach chrome.runtime messaging
// or the panel model, so a hostile or buggy page cannot destabilise the
// extension. All strings are still rendered via textContent downstream.
//
// This file is loaded two ways, which is why it uses a global instead of
// ESM exports: as a classic script in the content-script's isolated world
// (MV3 content scripts cannot be modules), and as a side-effect import
// (`import "../lib/protocol.js"`) in the panel and in tests.
(function (global) {
  "use strict";

  const LIMITS = {
    maxComponents: 400, // fiber view component cap (page-script caps at 300)
    maxValuesPerComponent: 40,
    maxHistoryEntries: 1000,
    maxBaselines: 200,
    maxEvicted: 2000,
    maxIdLength: 200,
    maxNameLength: 1000,
    maxStringLength: 50000,
    maxNodes: 60000, // total structure budget per message
    maxDepth: 40,
  };

  function isObj(v) {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }
  function idOk(v) {
    return typeof v === "string" && v.length > 0 && v.length <= LIMITS.maxIdLength;
  }
  function nameOk(v) {
    return typeof v === "string" && v.length <= LIMITS.maxNameLength;
  }
  function numOk(v) {
    return typeof v === "number" && Number.isFinite(v);
  }

  /**
   * Budgeted, iterative structure check — no JSON.stringify, no recursion.
   * Rejects payloads that are too large, too deep, contain oversized
   * strings, or contain cycles (our encoder never produces cycles; a cyclic
   * payload is by definition foreign).
   */
  function payloadOk(value) {
    let nodes = 0;
    const seen = new WeakSet();
    const stack = [{ v: value, d: 0 }];
    while (stack.length) {
      const { v, d } = stack.pop();
      nodes += 1;
      if (nodes > LIMITS.maxNodes || d > LIMITS.maxDepth) return false;
      if (typeof v === "string") {
        if (v.length > LIMITS.maxStringLength) return false;
        continue;
      }
      if (!v || typeof v !== "object") continue;
      if (seen.has(v)) return false; // cycle
      seen.add(v);
      if (Array.isArray(v)) {
        for (const x of v) stack.push({ v: x, d: d + 1 });
      } else {
        for (const k of Object.keys(v)) {
          if (k.length > LIMITS.maxNameLength) return false;
          stack.push({ v: v[k], d: d + 1 });
        }
      }
    }
    return true;
  }

  function callSiteOk(cs) {
    if (cs === null || cs === undefined) return true;
    return (
      isObj(cs) &&
      typeof cs.url === "string" &&
      cs.url.length <= 4000 &&
      numOk(cs.line) &&
      numOk(cs.column) &&
      (cs.label === undefined || nameOk(cs.label))
    );
  }

  /** Fiber/page-script messages (source: "zustand-devtools-page"). */
  function validatePageMessage(d) {
    if (!isObj(d) || d.source !== "zustand-devtools-page") return false;
    switch (d.type) {
      case "RENDERER_DETECTED":
        return d.version === undefined || (typeof d.version === "string" && d.version.length <= 100);
      case "STATE_UPDATE": {
        if (!Array.isArray(d.components) || d.components.length > LIMITS.maxComponents) return false;
        for (const c of d.components) {
          if (!isObj(c) || !nameOk(c.component) || typeof c.component !== "string") return false;
          if (!Array.isArray(c.values) || c.values.length > LIMITS.maxValuesPerComponent) return false;
        }
        return payloadOk(d.components);
      }
      default:
        return false;
    }
  }

  /** Bridge protocol v2 messages (source: "zustand-devtools-bridge"). */
  function validateBridgeMessage(d) {
    if (!isObj(d) || d.source !== "zustand-devtools-bridge") return false;
    if (d.protocolVersion !== 2) return false;
    switch (d.type) {
      case "STORE_REGISTERED":
        return idOk(d.storeId) && nameOk(d.storeName) && typeof d.storeName === "string" && payloadOk(d.state);
      case "STORE_UNREGISTERED":
        return idOk(d.storeId);
      case "STORE_UPDATE":
        return idOk(d.storeId) && payloadOk(d.state);
      case "ACTION":
        return (
          idOk(d.storeId) &&
          idOk(d.actionId) &&
          typeof d.actionName === "string" &&
          nameOk(d.actionName) &&
          numOk(d.timestamp) &&
          callSiteOk(d.callSite) &&
          (d.traceId === null || d.traceId === undefined || idOk(d.traceId)) &&
          payloadOk(d.state)
        );
      case "HISTORY": {
        if (!idOk(d.storeId)) return false;
        if (!Array.isArray(d.entries) || d.entries.length > LIMITS.maxHistoryEntries) return false;
        for (const e of d.entries) {
          if (!isObj(e) || !idOk(e.actionId) || typeof e.actionName !== "string" || !nameOk(e.actionName) || !numOk(e.timestamp)) {
            return false;
          }
          if (!callSiteOk(e.callSite)) return false;
        }
        return payloadOk(d.entries);
      }
      case "TRACE_STARTED": {
        if (!idOk(d.traceId) || !numOk(d.startedAt)) return false;
        if (d.baselines !== undefined) {
          if (!Array.isArray(d.baselines) || d.baselines.length > LIMITS.maxBaselines) return false;
          for (const b of d.baselines) {
            if (!isObj(b) || !idOk(b.storeId) || typeof b.storeName !== "string" || !nameOk(b.storeName)) return false;
          }
          if (!payloadOk(d.baselines)) return false;
        }
        return true;
      }
      case "TRACE_STOPPED":
        return idOk(d.traceId) && (d.reason === "user" || d.reason === "limit" || d.reason === "cancel");
      case "TIME_TRAVEL_REJECTED":
        return typeof d.reason === "string" && d.reason.length <= 200;
      case "RAW_EVICTED": {
        if (!Array.isArray(d.evicted) || d.evicted.length > LIMITS.maxEvicted) return false;
        for (const e of d.evicted) {
          if (!isObj(e) || !idOk(e.actionId) || !idOk(e.storeId)) return false;
        }
        return true;
      }
      default:
        return false;
    }
  }

  global.ZDTProtocol = { LIMITS, validatePageMessage, validateBridgeMessage, payloadOk };
})(globalThis);
