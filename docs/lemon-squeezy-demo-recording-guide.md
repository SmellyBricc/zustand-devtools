# Demo recording guide (45–60s, real extension — Kuba records this)

Automated tooling here cannot load an unpacked extension or drive a real DevTools
panel, so this must be recorded by hand. Use QuickTime/OBS at 1920×1080. Target: one
continuous take, 45–60 seconds.

## The fixture

`test-app/demo-cart-bug.html` — built for this exact script, synthetic data only. It
loads the real page-script and the real built bridge (`bridge/dist/index.js`) and
registers two stores:

- **cart** — `items` (array of `{sku, name, price, quantity}`), `total`, and four named
  actions: `addLamp`, `addKeyboard`, `increaseKeyboardQty`, `recalcTotal`.
  `increaseKeyboardQty` contains the planted bug: it bumps `items[1].quantity` but adds
  the lamp's €39 to `total` instead of the keyboard's €129.
- **auth** — `user`, `loggedIn`, `accessToken` (a synthetic string), with named `login`
  / `logout` actions and `redact: ["accessToken"]`. The token renders as
  "•• redacted ••" everywhere the panel or an export shows it (it is also covered by
  the default "token" redaction key).

Every promise below was verified against this fixture: the actions appear under those
names, the call-sites resolve to `demo-cart-bug.html` lines, the bug diff is exactly
`items[1].quantity: 1 → 2` plus `total: 168 → 207`, and the fix diff is
`total: 207 → 297`.

## Setup (before recording)

1. `npm run build:bridge` (the fixture imports `bridge/dist/index.js`), then
   `python3 -m http.server 8000` in the repo root.
2. Load `extension/` unpacked at `chrome://extensions`.
3. Open `http://localhost:8000/test-app/demo-cart-bug.html`.
4. Optional dry run once without recording; reload the page to reset all state.

## Script (narration optional; on-screen action is what matters)

1. **0–5s** — Show the storefront card: empty cart, "signed in: nobody", the five
   buttons.
2. **5–10s** — Press F12, click the **Zustand** tab. Show the Stores view: `cart` and
   `auth` registered, and point at `accessToken: •• redacted ••` under `auth`.
3. **10–15s** — Switch to **Trace Sessions**, click **Start Trace** (recording badge and
   counter appear).
4. **15–25s** — Reproduce the bug in the app: click **Add desk lamp**, **Add mech
   keyboard**, then **+1 keyboard quantity (this one has the bug)**. The card now shows
   Mech keyboard × 2 but Total €207 (€90 short). Click **Fix: recalculate total** —
   Total corrects to €297. Click **Log in / out** once.
5. **25–30s** — Click **Stop Trace**. The session opens with the entry list:
   `addLamp`, `addKeyboard`, `increaseKeyboardQty`, `recalcTotal`, `login`.
6. **30–38s** — Click the `increaseKeyboardQty` entry: the detail pane shows the changed
   paths `items[1].quantity: 1 → 2` and `total: 168 → 207`. Hover them briefly.
7. **38–43s** — Point at the call-site line (`demo-cart-bug.html:…`) and click it so the
   Sources panel opens at the buggy action. Return to the Zustand panel.
8. **43–50s** — On the `addKeyboard` entry click **Set as A (compare)**, then on
   `recalcTotal` click **Set as B & compare**: the A→B view shows
   `items[1].quantity: 1 → 2` and `total: 168 → 297`.
9. **50–55s** — Click **Export with state**: show the sensitivity note and the
   downloaded `zustand-trace-*.json` in the shelf. If you open it, `accessToken` is a
   redacted marker, never the real string.
10. **55–60s** — Back on the Trace Sessions idle view, show the free-vs-Pro boundary:
    the "Free preview: N of 3 full Trace Sessions left" line (and, if previews are
    exhausted, the €9.99 unlock panel).

Save as `store-assets/demo-trace-sessions.mp4`. Do NOT publish it anywhere yet — it is
for the Lemon Squeezy reviewer on request and, later, the Chrome Web Store listing.
While recording, also capture the three listing screenshots per
`test-app/SCREENSHOT-GUIDE.md` — same session, zero extra setup.
