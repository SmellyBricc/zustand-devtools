# Manual checks — real unpacked Chrome DevTools (owner)

The automated suite and the browser harness cannot reach `chrome://extensions` or a real
DevTools panel. Before sending the beta build, verify these by hand (~20 min):

1. **Load unpacked** `extension/` at `chrome://extensions` (Developer mode).
2. **Light theme**: DevTools default theme → Zustand panel readable, focus rings visible.
3. **Dark theme**: DevTools dark theme → same checks (panel keys off `themeName`).
4. **Real React DevTools coexistence**: with the official React DevTools installed, open
   `test-app/index.html` (serve the repo, e.g. `python3 -m http.server`) — both panels
   must work regardless of which extension loaded first.
5. **Vite call-site**: run any Vite dev app with a bridge-registered store, Start Trace,
   dispatch an action, click the call-site — Sources should open at the right line
   (best-effort; note the actual file/line you get).
6. **Page navigation**: navigate the inspected tab mid-session — Stores/Timeline reset,
   saved sessions become view-only, no console errors.
7. **DevTools close during recording**: Start Trace, close DevTools, interact with the
   page, reopen — the trace must be cancelled (no phantom recording), panel returns to
   idle.
8. **Export download**: export a session with state — file downloads, opens as JSON, and
   re-imports view-only.
9. **Test-mode license activation**: make a test-mode Lemon Squeezy purchase, paste the
   key in the Trace Sessions paywall → "License activated", unlimited traces; a garbage
   key → clear error. (Requires your LS account; cannot be automated here.)
