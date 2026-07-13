// MV3 service worker — bridges per-tab content-script messages to the
// matching open DevTools panel, following the standard Redux-DevTools-style
// architecture (content script -> background -> devtools panel), plus the
// reverse direction for panel -> page commands (time-travel jumps).
//
// No state lives in memory beyond this Map, which is fine per the
// chrome-extensions skill's service-worker guidance: an open chrome.runtime
// port (the panel's connection) keeps this service worker alive for as long
// as DevTools is open on that tab, so panelPortsByTabId never needs to
// survive an actual SW restart — if the SW *did* restart, the port itself
// would already be gone and DevTools would reconnect a fresh one.
const panelPortsByTabId = new Map();

async function notifyTab(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (e) {
    // Tab closed, navigated to a restricted page, or content script not
    // injected there yet — nothing to relay to, safe to ignore.
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (!port.name.startsWith("zdt-panel-")) return;
  const tabId = Number(port.name.slice("zdt-panel-".length));
  panelPortsByTabId.set(tabId, port);
  // A panel just opened for this tab — tell the page to start (or resume)
  // reporting live state, and ask any registered bridge stores to replay
  // their buffered action history so the panel isn't starting from zero.
  notifyTab(tabId, { type: "ACTIVATE" });
  notifyTab(tabId, { type: "REQUEST_HISTORY" });

  port.onMessage.addListener((message) => {
    // Panel -> page commands, e.g. a time-travel jump to a past action.
    if (message && message.type === "TIME_TRAVEL_JUMP") {
      notifyTab(tabId, message);
    }
  });

  port.onDisconnect.addListener(() => {
    if (panelPortsByTabId.get(tabId) === port) panelPortsByTabId.delete(tabId);
    notifyTab(tabId, { type: "DEACTIVATE" });
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab && sender.tab.id;
  if (!message || tabId == null) return;

  if (message.source === "zustand-devtools-content-ready") {
    // Content script just (re)injected — typically a fresh page load or
    // navigation. Tell it immediately whether a panel is already open for
    // this tab, since the panel's own onConnect firing already happened
    // once and won't fire again just because the page reloaded.
    sendResponse({ active: panelPortsByTabId.has(tabId) });
    return;
  }

  if (message.source === "zustand-devtools-content") {
    const port = panelPortsByTabId.get(tabId);
    if (port) port.postMessage(message.payload);
  }
});
