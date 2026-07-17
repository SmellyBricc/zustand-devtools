# zustand-devtools-bridge

Explicit store registration for the [Zustand DevTools](https://github.com/SmellyBricc/zustand-devtools)
Chrome extension: an accurate Stores view, a free action timeline, **safe raw-state
time-travel**, and Pro **Trace Sessions** (call-sites, deep diffs, comparison, export).

```
npm install zustand-devtools-bridge
```

> **Version note:** this README describes 0.2.0, which is **not yet published** — npm
> currently serves 0.1.1 (the old protocol). Publish 0.2.0 before shipping extension
> 1.1.0.

ESM-only, TypeScript-first. Compatibility: zustand `>=4.5 <6`, React 18/19 (the bridge
itself has no React dependency).

## Usage (TypeScript)

```ts
import { create } from 'zustand';
import { withDevtoolsBridge } from 'zustand-devtools-bridge';

interface CartState {
  items: string[];
  addItem: (item: string) => void;
}

const useCartStore = create<CartState>()(
  withDevtoolsBridge(
    (set) => ({
      items: [],
      addItem: (item) =>
        set((s) => ({ items: [...s.items, item] }), false, 'addItem'), // ← named in the panel
    }),
    {
      name: 'cart',
      enabled: import.meta.env.DEV,           // see "Production" below
      redact: ['user.auth.token', /secret/i], // see "Sensitive state"
    }
  )
);
```

State is fully inferred (no `any`), the third `actionName` argument is typed on both the
inner `set` and direct `useCartStore.setState(partial, false, 'name')`, and composition
with zustand's own middlewares type-checks on zustand 4 and 5. One deliberate looseness:
`setState` is a single signature (`replace?: boolean`) rather than v5's strict overload
pair, because zustand 4's middleware typing breaks composition for overloaded setState —
when you pass `replace: true`, pass the full state.

## Why time-travel here is safe

The panel never sends state back into your app. Every action gets a stable ID; the
original state object is kept in the page's memory, and a time-travel jump resolves that
ID locally. Dates stay Dates, Maps stay Maps, Sets, RegExps, BigInts, cycles, 50+-item
arrays, deep nesting and your action functions all survive — proven by the test suite
against zustand 4 and 5. Entries recorded before the last reload are **view-only** (their
original objects are gone; the persisted copy is lossy by design and is never restored).

Caveat: raw history holds references, so mutating state in place (instead of replacing it)
rewrites your own history — the same constraint every state devtool has.

## Production

There is no reliable automatic cross-bundler detection — pass `enabled` explicitly:

```ts
// Vite
{ enabled: import.meta.env.DEV }
// Next.js / Webpack / anything with process.env
{ enabled: process.env.NODE_ENV !== 'production' }
```

With `enabled: false` the initializer is returned untouched: no listeners, no messages,
no history, no sessionStorage, no stack capture — the cost is one boolean check.

## Sensitive state

Keys containing `token`, `password`, `secret`, `authorization`, `apikey`, `api_key` or
`credential` are redacted from everything that leaves the page (display, exports) by
default. That default is a convenience, **not** a guarantee — add your own:

```ts
redact: [
  'sessionKey',            // key substring (case-insensitive)
  'user.auth.refresh',     // exact path prefix
  /items\[\d+\]\.card/,    // RegExp against the full dot path
]
```

Raw in-memory state (needed for correct local time-travel) is not modified and never
leaves the page.

## Options

| Option | Default | |
|---|---|---|
| `name` | `store-N` | Panel display name. A registration under an existing name **replaces** it (hot-reload friendly) — give concurrent stores distinct names. |
| `enabled` | `true` | `false` = zero-footprint no-op. |
| `redact` | built-ins | Patterns redacted before data leaves the page. |
| `maxHistory` | `200` | Per-store action history cap (max 1000). |

## Trace Sessions (extension Pro feature)

While a trace is recording, the bridge additionally captures a best-effort call-site per
action (dev-build stack parse, internal frames stripped — accuracy depends on your build
and source maps) and deeper display snapshots. Outside an active trace none of that work
happens. Everything stays on your machine.
