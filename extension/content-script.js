// Isolated-world bridge: relays postMessage traffic between the page's MAIN
// world (page-script.js's fiber-walker, and the optional zustand-devtools-
// bridge package apps import themselves) and the background service worker
// via chrome.runtime, in both directions.
(function () {
  // Page (or bridge) -> background.
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data) return;
    if (data.source !== "zustand-devtools-page" && data.source !== "zustand-devtools-bridge") return;
    chrome.runtime.sendMessage({ source: "zustand-devtools-content", payload: data });
  });

  // Background -> page: activation state and time-travel commands.
  chrome.runtime.onMessage.addListener((message) => {
    if (!message) return;
    if (message.type === "ACTIVATE" || message.type === "DEACTIVATE" || message.type === "REQUEST_HISTORY" || message.type === "TIME_TRAVEL_JUMP") {
      window.postMessage({ source: "zustand-devtools-control", ...message }, "*");
    }
  });

  // Announce readiness so a service worker that already has a panel
  // connected for this tab can activate reporting immediately, even though
  // the panel's own onConnect only fires once per DevTools-open, not once
  // per page load/navigation.
  chrome.runtime.sendMessage({ source: "zustand-devtools-content-ready" }, (response) => {
    if (chrome.runtime.lastError) return; // no listener yet — ignore
    if (response && response.active) {
      window.postMessage({ source: "zustand-devtools-control", type: "ACTIVATE" }, "*");
    }
  });
})();
