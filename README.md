# Zustand DevTools

[![npm](https://img.shields.io/npm/v/zustand-devtools-bridge?label=zustand-devtools-bridge)](https://www.npmjs.com/package/zustand-devtools-bridge)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A Chrome DevTools panel that shows live [Zustand](https://github.com/pmndrs/zustand) store
state, with zero code changes to your app.

**Website:** [smellybricc.github.io/zustand-devtools-site](https://smellybricc.github.io/zustand-devtools-site/)

## What it does

Open Chrome DevTools on any page using Zustand, click the "Zustand" tab, and see every
component's current store-selected values update live as you interact with the page — no
setup, no imports, nothing added to your app.

**Free**
- Live component state, updating in real time
- Search/filter by component name
- Matches Chrome DevTools' own light/dark theme

**Paid upgrade** (one-time purchase, via the optional `zustand-devtools-bridge` npm
package — one import line in a store)
- Named action log across all your stores
- One-click time-travel to any past state
- Unified multi-store timeline

## Install

The extension itself isn't on the Chrome Web Store yet — in progress. The optional paid
tier's package is published and installable today:

```
npm install zustand-devtools-bridge
```

This repository contains:

- `extension/` — the Chrome extension itself
- `bridge/` — the `zustand-devtools-bridge` npm package for the paid tier
- `test-app/` — verification fixtures used during development

## How it works

The free tier installs a lightweight hook (`window.__REACT_DEVTOOLS_GLOBAL_HOOK__`) before
React loads, the same mechanism the real React DevTools extension uses, so it can read
component state directly from React's Fiber tree — no dependency on the real React
DevTools extension being installed. This only becomes active while you have DevTools open
with the Zustand panel active on a tab; otherwise it's completely idle.

## Privacy

No data collection, no analytics, no server. See `PRIVACY.md` for details.

## License

MIT for the extension and the `bridge/` package's source. The paid tier's unlock is a
one-time license purchase, not a code license restriction.
