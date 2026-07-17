// Isolated-world bridge: relays postMessage traffic between the page's MAIN
// world (page-script.js's fiber-walker, and the optional zustand-devtools-
// bridge package apps import themselves) and the background service worker
// via chrome.runtime, in both directions.
(function () {
  // Page (or bridge) -> background. Everything from the page is untrusted:
  // validate shape, types, protocol version and size budgets BEFORE it
  // touches chrome.runtime messaging (lib/protocol.js loads just before
  // this file — see manifest content_scripts order). Validation cannot
  // authenticate the page — it prevents malformed/oversized/spoof-shaped
  // payloads from destabilising the extension.
  const { validatePageMessage, validateBridgeMessage } = globalThis.ZDTProtocol;
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data) return;
    if (data.source === "zustand-devtools-page") {
      if (!validatePageMessage(data)) return;
    } else if (data.source === "zustand-devtools-bridge") {
      if (!validateBridgeMessage(data)) return;
    } else {
      return;
    }
    try {
      chrome.runtime.sendMessage({ source: "zustand-devtools-content", payload: data });
    } catch (e) {
      // After an extension reload/update, content scripts already injected
      // into still-open tabs become orphaned — chrome.runtime.sendMessage
      // throws "Extension context invalidated" on every subsequent call.
      // Nothing to recover into; just don't let it spam the console forever.
    }
  });

  // Background -> page: activation state, store/history requests, trace
  // controls and ID-based time-travel commands. Allowlist only — anything
  // else is dropped here.
  const CONTROL_TYPES = new Set([
    "ACTIVATE",
    "DEACTIVATE",
    "REQUEST_STORES",
    "REQUEST_HISTORY",
    "TIME_TRAVEL_JUMP",
    "TRACE_START",
    "TRACE_STOP",
    "TRACE_CANCEL",
  ]);
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || !CONTROL_TYPES.has(message.type)) return;
    window.postMessage({ source: "zustand-devtools-control", ...message }, "*");
  });

  // Announce readiness so a service worker that already has a panel
  // connected for this tab can activate reporting immediately, even though
  // the panel's own onConnect only fires once per DevTools-open, not once
  // per page load/navigation.
  chrome.runtime.sendMessage({ source: "zustand-devtools-content-ready" }, (response) => {
    if (chrome.runtime.lastError) return; // no listener yet — ignore
    if (response && response.active) {
      // Also re-request stores + history, not just activate — a page reload
      // while DevTools stays open re-creates the bridge fresh, and without
      // this the panel would only see NEW registrations/actions from this
      // point on, never re-learning what the page already has.
      window.postMessage({ source: "zustand-devtools-control", type: "ACTIVATE" }, "*");
      window.postMessage({ source: "zustand-devtools-control", type: "REQUEST_STORES" }, "*");
      window.postMessage({ source: "zustand-devtools-control", type: "REQUEST_HISTORY" }, "*");
    }
  });
})();
