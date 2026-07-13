// Panel path is relative to the extension ROOT, not to this devtools.js file
// (they happen to be the same directory here, but this is the #1 cause of
// broken DevTools panels — see the chrome-extensions skill's devtools.md).
chrome.devtools.panels.create("Zustand", "icons/icon-16.png", "panel.html");
