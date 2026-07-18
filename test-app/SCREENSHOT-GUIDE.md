# Chrome Web Store screenshot guide (extension 1.1.0)

The store listing needs screenshots at **1280×800** (preferred) or 640×400, PNG or
JPEG, no alpha. These steps produce all shots from `test-app/demo-cart-bug.html`, the
real unpacked extension, and the real Zustand DevTools panel. Everything shown is
synthetic fixture data; nothing sensitive can appear if you follow the steps.

Browser automation cannot reach `chrome://extensions` or a DevTools panel, so these are
captured by hand. Budget about ten minutes.

## Setup (once)

1. Build the bridge so the fixture can import it: `npm run build:bridge` in the repo
   root.
2. Serve the repo root (the fixture loads ES modules):
   `python3 -m http.server 8000`
3. `chrome://extensions` → enable Developer mode → "Load unpacked" → select the
   `extension/` folder. If it was already loaded, click reload (⟳) so it runs 1.1.0.
4. Open `http://localhost:8000/test-app/demo-cart-bug.html` in a normal tab.
5. Press F12 → find the **Zustand** tab (it may hide behind the `»` overflow menu).
   Dock DevTools to the right or bottom, whichever reads better at 1280×800.
6. Do not log into anything else in this Chrome profile while capturing; the only
   visible data should be the fixture's synthetic cart and the fake
   "Ada Example" / redacted-token auth store.

## Shot 1 — Stores view with redaction (`store-shot-1-stores.png`)

1. In the fixture, click **Add desk lamp** and **Add mech keyboard** once each, and
   **Log in / out** once, so both stores hold non-default values.
2. Zustand panel → **Stores** tab. Expand `cart` and `auth`.
3. The frame must show: both registered stores, the `items` array, and
   `accessToken: •• redacted ••` under `auth`.
4. Capture (macOS: `⇧⌘4`, drag; or `⇧⌘4` + space + click the window).

## Shot 2 — a stopped Trace Session (`store-shot-2-trace.png`)

1. Reload the fixture page to reset state.
2. Zustand panel → **Trace Sessions** → **Start Trace**.
3. In the fixture click, in order: **Add desk lamp**, **Add mech keyboard**,
   **+1 keyboard quantity (this one has the bug)**.
4. Click **Stop Trace**. The session opens.
5. Click the `increaseKeyboardQty` entry. The detail pane shows the changed paths
   `items[1].quantity: 1 → 2` and `total: 168 → 207`, plus the source call-site
   (`demo-cart-bug.html:…`).
6. Capture with both the entry list and the detail pane visible.

## Shot 3 — A/B comparison (`store-shot-3-compare.png`)

1. Continuing from shot 2, click **Fix: recalculate total** in the fixture only if you
   are still recording; otherwise use the session from shot 2 plus a fresh trace that
   includes `recalcTotal`. Easiest path: record one trace containing all four actions
   (lamp, keyboard, buggy +1, fix), then stop.
2. On the `addKeyboard` entry click **Set as A (compare)**.
3. On the `recalcTotal` entry click **Set as B & compare**.
4. The A→B view shows `items[1].quantity: 1 → 2` and `total: 168 → 297`.
5. Capture the compare view.

## Optional shot 4 — the honest free/Pro boundary (`store-shot-4-preview.png`)

Back on the Trace Sessions idle view, capture the "Free preview: N of 3 full Trace
Sessions left" line, or (in a fresh profile with previews exhausted) the €9.99 unlock
panel. This makes the free/paid boundary clear in the listing.

## Export

Crop or resize to exactly 1280×800 (Preview.app: Tools → Adjust Size), save as PNG,
and add them to the store listing's Graphics section alongside
`store-assets/promo-tile-440x280.png`. Before uploading, double-check no real personal
data, bookmarks bar, other tabs, or notification popups are in frame; capture the
DevTools window area only.
