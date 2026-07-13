# zustand-devtools-bridge

The free [Zustand DevTools](https://github.com/SmellyBricc/zustand-devtools) Chrome extension already shows live
component state with zero code changes, via a Fiber-tree inspector. This package is the
optional, one-line upgrade for stores that want a **named action log**, **one-click
time-travel**, and a **unified multi-store timeline** in the same panel — the extension's
paid tier.

## Install

```
npm install zustand-devtools-bridge
```

This package is ESM-only. If your build tool doesn't support ESM-only packages, use a
dynamic `import('zustand-devtools-bridge')` instead of a static `require`.

## Usage

Mirrors Zustand's own `devtools()` middleware shape on purpose — if you've used that, you
already know this API:

```js
import { create } from 'zustand';
import { withDevtoolsBridge } from 'zustand-devtools-bridge';

const useCartStore = create(
  withDevtoolsBridge(
    (set, get) => ({
      items: [],
      addItem: (item) =>
        set((s) => ({ items: [...s.items, item] }), false, 'addItem'),
      checkout: () => set({ items: [] }, false, 'checkout'),
    }),
    { name: 'cart' }
  )
);
```

Pass an action name as the optional third argument to `set` — `set(partial, replace,
actionName)` — so it shows up labeled in the Action Log instead of "anonymous". This is
the exact rough edge our own research found with piggybacking Zustand onto Redux DevTools:
unlabeled actions and no unified timeline across stores. Every store you wrap with
`withDevtoolsBridge` and a distinct `name` shows up as its own lane in one interleaved,
chronological timeline in the panel.

## What it does (and doesn't) do

- Every `set()` call is recorded with its resulting state and timestamp, kept in a
  200-entry rolling buffer per store, and posted to the DevTools panel if it's open.
- History survives a page reload (backed by `sessionStorage`), so refreshing mid-debug
  session doesn't wipe your action log — it clears when the tab closes, matching "this
  session's history," not a permanent record.
- The panel shows a diff between each action and the one before it for that store — added,
  changed, and removed keys — not just a full state dump every time.
- Clicking a past entry in the panel's Action Log calls your store's `setState` directly
  to restore that snapshot — no action replay, just a direct jump.
- The full timeline can be exported as JSON from the panel for bug reports.
- Nothing is sent anywhere except `window.postMessage` on the page itself, which only the
  Zustand DevTools extension's content script (if installed) ever reads. No network
  request, no analytics, no server.
- Action-log recording keeps working even when DevTools is closed, so opening it later
  still shows the buffered history — it does not gate on an active DevTools connection
  the way the free tier's Fiber-walker does, since this package is opt-in per store rather
  than always-on for every page you visit.
