# Implementation plan — Trace Sessions validation build

Baseline (2026-07-16): no automated tests exist (two manual HTML fixtures + "confirmed
empirically" comments only). Uncommitted user edits in CHROMEWEBSTORE.md and PRIVACY.md
must be preserved. `marketing/`, `test-app/SCREENSHOT-GUIDE.md`, `*.zip` are git-ignored.

Verified problems: (1) page-script.js walks arbitrary hook memoizedState — no Zustand
proof; (2) TIME_TRAVEL_JUMP restores the sanitized panel copy (Dates→strings, Maps/Sets→
arrays, "[nested]", 50-item truncation); (3) no TS types; (4) no enabled option;
(5) dedup by actionName+timestamp; (6) shallow diff; (7) paid tier duplicates free tools;
(8) rich capture always-on.

## Order of work

1. **Test infra** — root private package.json, vitest+jsdom, typescript, `zustand4`/
   `zustand5` npm aliases. Unit layer needs no React.
2. **Bridge 0.2.0 (TypeScript)** — protocol v2 with schema version; stable store/action/
   session IDs; STORE_REGISTERED/UNREGISTERED/UPDATE, ACTION, HISTORY, TRACE_STARTED/
   STOPPED/entry fields on ACTION, TIME_TRAVEL_JUMP(storeId, actionId) resolved against
   in-memory raw state (replace:true with the original object — functions, Dates, Maps,
   cycles preserved by construction); persisted/imported entries rawAvailable:false and
   view-only; `enabled:false` = return initializer untouched, no listeners/messages/
   storage/stacks; `redact` option compiled to path matchers, applied before any display
   encoding; display encoding uses explicit type markers ({__zdt:'date'|'map'|'set'|
   'regexp'|'fn'|'bigint'|'num'|'undef'|'cycle'|'deep'|'redacted'|'truncated'}) instead of
   silent conversion; call-site capture (V8 stack parse, internal frames stripped) only
   while a trace is active; trace start/stop/cancel/limit via control messages.
3. **Bridge tests** — full postMessage roundtrips in jsdom for both zustand 4 and 5;
   type tests via tsc --noEmit for both; the non-JSON time-travel matrix from the spec.
4. **Shared libs** — extension/lib/deep-diff.js (path-level, marker-aware, cycle/depth/
   size guarded, lazy-friendly) and extension/lib/trace-schema.js (versioned bundle,
   validation, size caps, never executes content). Vitest coverage incl. hostile input.
5. **Extension** — content-script/background allowlist for new control types; panel
   rebuilt as ES modules with tabs: Stores / Component Hooks (experimental) / Timeline
   (free) / Trace Sessions (preview+Pro). Fixed-height virtualized trace list + detail
   pane (lazy deep diff, call-site openResource, notes/bookmarks); filters (store, action,
   changed path, call-site text, bookmarks); A/B compare; export (warning + metadata-only
   option) / import (validated, view-only); 3-preview gating in chrome.storage.local;
   license gate only on Trace Sessions.
6. **Fixtures + verification** — trace fixture with deep/exotic state and secrets;
   React18+Z4, React19+Z5 pages; panel harness with a fake chrome API to drive the real
   panel UI in a normal browser tab; performance numbers measured there.
7. **Docs/packaging/report** — honest copy everywhere; bridge 0.2.0, extension 1.1.0;
   zip build; beta guide + commercial gate; final report. No publish/commit/push.

## Deliberate scope cuts (validation build)

- Replay of *imported* traces: out (view-only), stated in UI.
- Lossless serializer for persisted history: out — persisted entries are view-only.
- Advanced Pro (Phase 3 list): blocked behind the validation gate.
- Fiber view stays but is renamed/labelled experimental; no accuracy claim.
