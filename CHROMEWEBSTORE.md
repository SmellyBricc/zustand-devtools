# Chrome Web Store Listing — Zustand DevTools

> Last Updated: 2026-07-13

## Store Listing

**Extension Name**
Zustand DevTools

**Short Description**
Live Zustand state in DevTools, plus an optional action log and time-travel.

**Detailed Description**

See your Zustand store state update live, right inside Chrome DevTools — no code changes
to your app required.

FEATURES
• Live component state — a dedicated DevTools panel shows every component's current
  Zustand-selected values, updating as you interact with your app.
• Search — filter the live list by component name when a page has many components.
• Action log & time-travel (optional) — add the companion package to a store to see a
  named history of every state change and jump back to any past state with one click,
  across all your stores in a single unified timeline.
• Matches your DevTools theme — light or dark, automatically.

HOW TO USE
1. Open Chrome DevTools (F12) on any page using Zustand.
2. Click the "Zustand" tab in DevTools.
3. Interact with the page — component state appears live, no setup required.
4. For the optional action log and time-travel, add the companion npm package to a store
   and pass it a name — see the package's README for the one-line setup.

PRIVACY
This extension does not collect, store, or transmit any personal data or browsing
history. Component state it reads stays on your device and is only ever sent to your own
open DevTools panel. The only network request it ever makes is triggered by you, when you
paste a license key to validate the optional paid tier.

PERMISSIONS
• "storage" — remembers your validated license key locally, so you don't have to
  re-enter it every time you open DevTools.
• Access to page content — needed to detect a React/Zustand renderer and read component
  state, but only becomes active once you've opened DevTools and switched to the Zustand
  panel for that tab; otherwise it does nothing on that page.

SUPPORT
Found a bug or have a suggestion? Open an issue at the project's GitHub repository.

Version 1.0.0 — first public release: live state inspector, search, theme matching, and
the optional action-log/time-travel tier.

**Category**
Developer Tools

**Single Purpose**
Shows live Zustand store state in a Chrome DevTools panel, with an optional action log
and time-travel debugging.

**Primary Language**
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon | 128×128 PNG | ✅ Ready | `extension/icons/icon-128.png` |
| Screenshot 1 | 1280×800 or 640×400 | ⬜ Not created | — |
| Screenshot 2 | 1280×800 or 640×400 | ⬜ Not created | — |
| Screenshot 3 | 1280×800 or 640×400 | ⬜ Not created | — |
| Small Promo Tile | 440×280 | ⬜ Not created | — |

### Screenshot Notes (shot list — needs your real Chrome, not fabricated)

1. **Live State tab** on a real app: DevTools open, Zustand panel active, a couple of
   components expanded showing live values, search box visible.
2. **Action Log tab**, licensed, showing a unified multi-store timeline with a few named
   actions (e.g. "addItem", "checkout") and timestamps.
3. **Time-travel in action**: cursor on a past log entry, or a before/after pair showing
   the app's UI reflecting a restored past state.
4. Optional: the paywall/"Buy license" state, to show the free vs. paid boundary clearly.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|----------------|
| `storage` | permissions | Stores the user's validated license key locally so the paid Action Log tier doesn't need to re-validate on every DevTools open. |
| `https://api.lemonsqueezy.com/*` | host_permissions | Only contacted when the user pastes a license key into the Action Log tab's "Activate" field, to validate it against Lemon Squeezy's public License API. No other data is sent. |
| `<all_urls>` (content scripts) | content_scripts matches | Needed to install a lightweight React-renderer hook before React loads on any page the developer might inspect, since Zustand apps can run on any site. The hook stays inert — no data is read or sent — unless the developer has DevTools open with the Zustand panel active for that tab. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

This extension does not collect, store, or transmit personal data, browsing history, or
website content to any server. Component state read by the Fiber-walker is relayed only
to the user's own open DevTools panel via the browser's internal messaging — it never
leaves the device. The only outbound network request is a license-key validation call to
Lemon Squeezy's API, made only when the user explicitly enters a key.

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|--------------------------|---------|------------------------------|
| Personally identifiable info | No | No | — | No |
| Web history | No | No | — | No |
| Website content | No (read locally only) | No | Displayed in your own DevTools panel | No |
| Authentication info (license key) | Only if entered | Yes, to Lemon Squeezy only | Validate a purchased license | No |

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL**
See `PRIVACY.md` in this repository — host its contents at a public URL (GitHub Pages or
similar) before submitting, and paste that URL here.

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name** — fill in before submitting
**Contact Email** — fill in before submitting (must be monitored; Google sends policy
notices here)
**Support URL / Email**
https://github.com/SmellyBricc/zustand-devtools/issues

**Homepage URL**
https://github.com/SmellyBricc/zustand-devtools

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-07-13 | First public-release candidate: live Fiber-tree state inspector, search, DevTools theme matching, and the optional `zustand-devtools-bridge` action-log/time-travel tier with license gating. | Draft |

## Review Notes

### Known Issues / Limitations
- The Fiber-walker shows whatever a component's hooks currently hold — it has no action
  history or time-travel of its own; that's what the optional bridge package adds.
- Time-travel restores data fields via a merge, not a full state replace, since only
  serializable data (not functions) ever crosses the messaging boundary — restoring a very
  old snapshot won't remove object keys added after that snapshot.
- The Lemon Squeezy store, product, and checkout URL are live (see `MONETIZATION.md`) —
  identity verification and a payout method still need to be finished on Kuba's end before
  real (non-test-mode) purchases can be accepted.
- The `zustand-devtools-bridge` package's npm publish is still pending (see
  `MONETIZATION.md`) — the code is finished and public on GitHub, but not yet installable
  via `npm install` until that's done.

### Rejection History
None yet — first submission pending.
