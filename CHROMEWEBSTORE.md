# Chrome Web Store Listing — Zustand DevTools

> Last Updated: 2026-07-16

## Store Listing

**Extension Name**
Zustand DevTools

**Short Description**
Registered-store inspector, safe time-travel and Pro Trace Sessions (deep diffs, call-sites, shareable traces) for Zustand.

**Detailed Description**

A dedicated Zustand panel for Chrome DevTools. Register a store with one line of the
zustand-devtools-bridge package for an accurate live Stores view, a free cross-store
Timeline, and time-travel that never corrupts your state. An experimental zero-setup
Component Hooks view is included for quick looks (its values are not guaranteed to come
from Zustand). The Pro Trace Sessions workflow records a bug reproduction with deep
path-level diffs and source call-sites, and exports a debugging session your teammate
can inspect without reproducing the bug.

FEATURES
• Stores (free) — an accurate live view of every store registered through the one-line
  zustand-devtools-bridge package, with stable identities across hot reloads.
• Timeline (free) — a named action history across all registered stores, with search and
  SAFE time-travel: the original in-memory state is restored by ID, so Dates, Maps, Sets
  and your action functions survive. Lossy copies are never restored.
• Component Hooks (experimental, free) — a zero-setup view of hook values found in React
  components. Honestly labelled: values are not guaranteed to come from Zustand.
• Trace Sessions (Pro, three full previews included) — record while reproducing a bug:
  deep path-level diffs (cart.items[3].quantity), best-effort source call-sites you can
  click to open in Sources, filters, comparison of any two moments, bookmarks/notes, and
  export/import of a redacted, versioned debugging session (view-only, validated).
• Matches your DevTools theme — light or dark, automatically.

HOW TO USE
1. Add the bridge to a store (one line): create(withDevtoolsBridge(creator, { name: 'cart' })).
2. Open Chrome DevTools (F12) and click the "Zustand" tab — Stores and Timeline are live.
3. Press Start Trace, reproduce your bug, press Stop — inspect diffs and call-sites,
   compare any two moments, export the session. Three full preview sessions are free;
   Pro unlocks unlimited ones.
4. No store registered yet? The experimental Component Hooks tab shows React hook values
   with zero setup (not guaranteed to be Zustand state).

PRIVACY
This extension processes component state locally so it can display it in your own open
DevTools panel. That state is not sent off your device, and there is no analytics or
telemetry. The only outbound network requests are the ones you trigger by pasting a
license key: the key and a generic instance name ("Zustand DevTools") are sent to Lemon
Squeezy to activate the optional paid tier.

PERMISSIONS
• "storage" — keeps your recent Trace Sessions, the free-preview counter, and your
  validated license record locally (saved sessions are view-only).
• Access to page content — needed to detect a React/Zustand renderer and read component
  state, but only becomes active once you've opened DevTools and switched to the Zustand
  panel for that tab; otherwise it does nothing on that page.

SUPPORT
Found a bug or have a suggestion? Open an issue at the project's GitHub repository.

Local-first by design: state, traces and exports stay on your machine; imported trace
files are validated and opened view-only.

**Category**
Developer Tools

**Single Purpose**
Inspect and debug Zustand store state in a Chrome DevTools panel: live registered-store
view, action timeline with safe time-travel, and recordable Trace Sessions with diffs,
call-sites and local export/import.

**Primary Language**
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon | 128×128 PNG | ✅ Ready | `extension/icons/icon-128.png` |
| Screenshot 1 | 1280×800 or 640×400 | ⬜ Not created (see `test-app/SCREENSHOT-GUIDE.md`) | — |
| Screenshot 2 | 1280×800 or 640×400 | ⬜ Not created (see `test-app/SCREENSHOT-GUIDE.md`) | — |
| Screenshot 3 | 1280×800 or 640×400 | ⬜ Not created (see `test-app/SCREENSHOT-GUIDE.md`) | — |
| Small Promo Tile | 440×280 | ✅ Ready | `store-assets/promo-tile-440x280.png` |

### Screenshot Notes (shot list — needs your real Chrome, not fabricated)

1. **Stores tab** on a real app: DevTools open, two registered stores with live values
   (include a redacted field), status bar showing the store count.
2. **Trace Sessions tab** with a stopped session: entry list plus detail pane showing
   changed paths and a call-site.
3. **Time-travel in action**: cursor on a Timeline entry's "Jump here", or a
   before/after pair showing the app's UI reflecting a restored past state (plus one
   view-only entry showing the honest "Replay unavailable" state).
4. Optional: the paywall/"Buy license" state, to show the free vs. paid boundary clearly.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|----------------|
| `storage` | permissions | Stores recent Trace Sessions, the preview counter, and the validated license record locally so the Pro tier doesn't re-validate on every DevTools open. |
| `https://api.lemonsqueezy.com/*` | host_permissions | Only contacted when the user pastes a license key into the Trace Sessions tab's "Activate" field, to activate it through Lemon Squeezy's public License API. The request carries the license key and a generic instance name ("Zustand DevTools"); no application state or other data is sent. |
| `<all_urls>` (content scripts) | content_scripts matches | Needed to install a lightweight React-renderer hook before React loads on any page the developer might inspect, since Zustand apps can run on any site. The hook stays inert — no data is read or sent — unless the developer has DevTools open with the Zustand panel active for that tab. |

## Privacy & Data Use

### Data Handling

Chrome's disclosure rules include data processed locally, not only data sent to a server.
The extension therefore handles website content (component state) locally to provide its
single debugging purpose. It does not transmit that state off-device. If the user enters
a paid-tier license key, the key and a generic instance name ("Zustand DevTools") are
sent to Lemon Squeezy's License API for activation, and the activation result is stored
locally in `chrome.storage.local`.

| Data Type | Handled? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|--------------------------|---------|------------------------------|
| Personally identifiable info | No | No | — | No |
| Web history | No | No | — | No |
| Website content | Yes, locally while the panel is active | No | Displayed in your own DevTools panel | No |
| Authentication info (license key) | Only if entered | Yes, to Lemon Squeezy only | Activate a purchased license | Lemon Squeezy processes the activation request |

In the Chrome Web Store data-use form, disclose the local handling of **Website content**
and the optional handling/transmission of **Authentication information**. Make clear that
website content is processed locally only and is not collected by the developer or sent
off-device.

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL**
https://smellybricc.github.io/zustand-devtools-site/privacy.html

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name**
SmellyBricc

**Contact Email**
kuba.opoczka@gmail.com
**Support URL / Email**
https://github.com/SmellyBricc/zustand-devtools/issues

**Homepage URL**
https://github.com/SmellyBricc/zustand-devtools

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.1.0 | 2026-07-16 | Accurate-registration rework: explicit store registration with stable store/action/session IDs (protocol v2); Fiber view moved to "Component Hooks (experimental)" with honest labelling; time-travel is now ID-based raw-state restoration (never restores sanitized copies; view-only for pre-reload entries); new Trace Sessions Pro tier (call-sites, deep diffs, compare, export/import, redaction, 3 free previews); bridge 0.2.0 with TypeScript, enabled flag, redaction. | Draft |
| 1.0.1 | 2026-07-13 | Independent code review pass, all findings verified before fixing: React DevTools hook now chains instead of clobbering (fixes silent breakage when the real React DevTools extension is also installed); fixed a Fiber-walk bug that silently truncated any list/table with 40+ sibling components; license Activate now calls Lemon Squeezy's `/activate` endpoint (was calling `/validate`, which never registered an instance, so activation limits were never actually enforced); fixed a port-disconnect race that could cancel a just-opened panel connection; Action Log/Live State now reset on page navigation instead of mixing entries from an unrelated page; fixed a race where a live action arriving during a history-replay round trip could be silently dropped; component collapse state no longer resets on every live update. Bridge package bumped to 0.1.1 with matching fixes plus: default store names no longer collide when multiple stores omit `name`; corrupted `sessionStorage` no longer crashes `create()`; `Date`/`Map`/`Set`/`RegExp` fields display correctly instead of becoming `{}` (previously a time-travel jump would even overwrite a live one with an empty object); direct `useStore.setState(...)` calls are now tracked, not just actions defined on the store. | Draft |
| 1.0.0 | 2026-07-13 | First public-release candidate: live Fiber-tree state inspector, search, DevTools theme matching, and the optional `zustand-devtools-bridge` action-log/time-travel tier with license gating. | Draft |

## Review Notes

### Known Issues / Limitations
- The Fiber-walker shows whatever a component's hooks currently hold — it has no action
  history or time-travel of its own; that's what the optional bridge package adds.
- Time-travel restores the original in-memory state object by ID (full replace, functions
  included). Entries whose raw state the page no longer holds — evicted, pre-reload,
  persisted, or imported — are view-only, stated in the UI before you click.
- The Lemon Squeezy store is TEST MODE ONLY: the account is awaiting approval, the
  existing product is a test-mode product (old test name "Zustand DevTools — Action Log &
  Time-Travel", to be manually renamed to "Zustand DevTools Pro — Trace Sessions"), and
  no real payments are accepted. See `MONETIZATION.md` and `docs/lemon-squeezy-review.md`.
- npm currently serves `zustand-devtools-bridge` **0.1.1** (old protocol). The 0.2.0 the extension requires is built and tested locally but NOT yet published — publish it before submitting the extension.
- A very large array/object field (over the 50-item cap) or one nested more than 4 levels
  deep loses the truncated portion permanently if you time-travel to that snapshot, since
  the cap exists to bound message size and applies before the data is stored, not just
  before display. Affects only fields that large; typical app state is unaffected.
- `NaN`/`Infinity` values in state become `null` after a page reload (a `JSON.stringify`
  limitation in the persistence path) — cosmetic, and only affects the persisted history
  display, not the live app.
- The bridge only authenticates control messages by same-window origin, not by sender
  identity — consistent with how this whole category of devtools tooling works (the same
  is true of Redux DevTools' architecture), but worth knowing if a page also runs untrusted
  third-party scripts: don't ship `zustand-devtools-bridge` in a production bundle.

### ⚠️ Pre-submission blocker — live-mode checkout URL

The checkout URL in `extension/panel/license-config.js` (`LICENSE_CONFIG.checkoutUrl`) points
at the **test-mode** product. Lemon Squeezy test-mode products do not carry over to live
mode — after activating the store, use the product's "Copy to Live Mode" menu option; the
copied product gets a **new ID and therefore a new checkout URL**. That new URL must be
swapped into `license-config.js` (with the live store/product/variant IDs, and
`mode: "live"`) and the zip rebuilt (`./package-extension.sh`) **before**
submitting, or the shipped Buy button will point at a checkout that cannot take real
payments. Test-mode license keys also won't validate against the live product — do one
real (live-mode) purchase after activation to confirm the Activate flow end-to-end.

### ⚠️ Pre-submission blocker — developer account and disclosure details

- Chrome says items that offer paid functionality must include a physical address in the
  developer account. Decide which valid business/contact address you will use before
  submitting.
- Do not select a blanket "no user data handled" answer. The extension processes website
  content locally and sends a user-entered license key to Lemon Squeezy, as described
  above. The dashboard answers, this listing, and `PRIVACY.md` must agree.
- Replace the current publisher name if desired before launch. `SmellyBricc` is memorable,
  but a personal name or product/company name may create more trust for a paid developer
  tool.

### Rejection History
None yet — first submission pending.
