# Zustand DevTools

[![npm](https://img.shields.io/npm/v/zustand-devtools-bridge?label=zustand-devtools-bridge)](https://www.npmjs.com/package/zustand-devtools-bridge)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Register a [Zustand](https://github.com/pmndrs/zustand) store with one wrapper
(`withDevtoolsBridge`) to inspect its live state, timeline, safe time-travel and Trace
Sessions in a Chrome DevTools panel. An experimental zero-setup Component Hooks view is
also included, but its values are read from React hooks and are not guaranteed to come
from Zustand.

**Website:** [smellybricc.github.io/zustand-devtools-site](https://smellybricc.github.io/zustand-devtools-site/)

## What it does

Register a store with one line and get an accurate live Stores view, a free action
timeline with safe time-travel, and (Pro) Trace Sessions: deep path-level diffs, source
call-sites, snapshot comparison and shareable debugging sessions. A zero-setup
experimental Component Hooks view is included, honestly labelled: it shows React hook
values and cannot guarantee they came from Zustand.

**Free**
- Accurate **Stores** view for stores registered with `zustand-devtools-bridge` (one line per store)
- Basic action **Timeline** across all stores, with search
- **Safe time-travel**: the original in-memory state is restored by ID — Dates, Maps, Sets and your action functions survive; lossy copies are never restored
- **Component Hooks (experimental)**: the zero-setup Fiber view — shows hook values found in React components, which are *not guaranteed to come from Zustand*
- Matches Chrome DevTools' own light/dark theme

**Pro: Trace Sessions** (€9.99 one-time; 3 full preview sessions free)
- Record a trace while reproducing a bug: every change captured with a deep path-level diff (`cart.items[3].quantity`) and a best-effort source call-site
- Filter by store, action, changed path, call-site, bookmarks; compare any two entries
- Export a redacted, versioned session a teammate can import and inspect offline (view-only, validated, never executed)

## Install

The extension isn't on the Chrome Web Store yet, and the bridge described here is
**0.2.0, which is not yet published to npm** (npm currently serves the old 0.1.1).
**Do not install 0.1.1 for extension 1.1.0** — the extension speaks protocol v2, which
0.1.1 does not emit, so the pair cannot talk to each other. Publication order matters:
publish `zustand-devtools-bridge@0.2.0` FIRST, then submit extension 1.1.0.

**Beta setup (until 0.2.0 is on npm):** build the bridge from this repository and
install it from disk:

```
git clone https://github.com/SmellyBricc/zustand-devtools
cd zustand-devtools && npm install && npm run build:bridge
cd your-app && npm install /path/to/zustand-devtools/bridge
```

Then load `extension/` unpacked at `chrome://extensions` (Developer mode on).

The bridge is part of the **free** foundation (accurate Stores view, Timeline, safe
time-travel); only Trace Sessions is paid. One line per store:

```
npm install zustand-devtools-bridge   # once 0.2.0 is published
```

This repository contains:

- `extension/` — the Chrome extension itself
- `bridge/` — the `zustand-devtools-bridge` npm package (free foundation: Stores/Timeline/safe time-travel; also feeds Pro Trace Sessions)
- `test-app/` — verification fixtures used during development

## How it works

The free tier installs a lightweight hook (`window.__REACT_DEVTOOLS_GLOBAL_HOOK__`) before
React loads, the same mechanism the real React DevTools extension uses, so it can read
component state directly from React's Fiber tree — no dependency on the real React
DevTools extension being installed. This only becomes active while you have DevTools open
with the Zustand panel active on a tab; otherwise it's completely idle.

## Privacy

No analytics, no telemetry, no server. State stays on your machine; the only network
requests are the license-activation calls you trigger yourself, which send the license
key and a generic instance name to Lemon Squeezy. See `PRIVACY.md` for the full picture,
including what lives in `chrome.storage.local` and the page's `sessionStorage`.

## License

MIT for the extension and the `bridge/` package's source. The paid tier's unlock is a
one-time license purchase, not a code license restriction.
