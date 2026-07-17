# Demo recording guide (45–60s, real extension — Kuba records this)

Automated tooling here cannot load an unpacked extension or drive a real DevTools
panel, so this must be recorded by hand. Use QuickTime/OBS at 1920×1080, synthetic data
only (the fixtures below contain none of your real data). Target: one continuous take,
45–60 seconds.

**Setup (before recording):** `python3 -m http.server 8000` in the repo; load
`extension/` unpacked at `chrome://extensions`; open
`http://localhost:8000/test-app/panel-harness.html`? — no: use a real inspected page,
`http://localhost:8000/test-app/react19-z5.html` (React 19 + registered store), or your
own Vite app with one `withDevtoolsBridge` store for real call-sites.

Script (narration optional; on-screen action is what matters):

1. **0–5s** — Show the test app in the browser tab (cart-style UI, counter buttons).
2. **5–10s** — Press F12 to open Chrome DevTools; click the **Zustand** tab. Point at
   the Stores view showing the registered store's live state.
3. **10–15s** — Switch to **Trace Sessions**; click **Start Trace** (recording badge and
   counter become visible).
4. **15–25s** — Reproduce a small "bug": click the app's buttons a few times, e.g. add
   two items then trigger the action that sets a wrong total/deep value.
5. **25–30s** — Click **Stop Trace**. The session opens with the entry list.
6. **30–38s** — Click the suspicious entry: show the **changed path** in the detail pane
   (e.g. `deep.a.b.c.d.value` or `items[1].quantity`) — hover it briefly.
7. **38–43s** — Point at the **call-site** line (file:line) and click it so the Sources
   panel opens at that location. Return to the Zustand panel.
8. **43–50s** — Select entry A ("Set as A"), click a second entry, "Set as B & compare":
   show the A→B changed paths.
9. **50–55s** — Click **Export with state**: show the sensitivity note and the
   downloaded `zustand-trace-*.json` in the shelf. (Optionally show a redacted field —
   the fixture's `auth.accessToken` renders as "•• redacted ••".)
10. **55–60s** — Go back to the Trace Sessions idle view and show the free-vs-Pro
    boundary: the "Free preview: N of 3" line (and, if previews are exhausted, the
    €9.99 unlock panel).

Save as `store-assets/demo-trace-sessions.mp4`. Do NOT publish it anywhere yet — it is
for the Lemon Squeezy reviewer on request and, later, the Chrome Web Store listing.
While recording, also capture the three listing screenshots per
`test-app/SCREENSHOT-GUIDE.md` — same session, zero extra setup.
