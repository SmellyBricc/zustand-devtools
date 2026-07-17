# Competitive landscape — Zustand debugging tools

> Compiled 2026-07-16 from primary sources (GitHub repos, Chrome Web Store listings,
> official Zustand docs). For product decisions, not marketing attacks. Re-verify
> maintenance status before quoting externally.

## The tools

| | Setup | Registered stores | Action history | Multi-store | Time-travel | Deep diff | Call-sites | Snapshot compare | Export | Import/offline viewer | Session sharing | TypeScript | Prod safety | Privacy | Maintained |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Zustand + Redux DevTools** (official `devtools()` middleware) | 1-line middleware + Redux DevTools ext | Yes (named connections) | Yes | Yes (multiple connections) | Yes — across a serialization boundary; non-JSON types need custom serialize options or lose their types on replay | Diff tab (serialized values) | Yes via `trace: true` (stack per action) | Manual (two diff views) | State/history export | Import into Redux DevTools | Raw JSON file, no schema/versioning, no redaction | Middleware typed; store typing good | `enabled` option | Local | Actively (Redux DevTools team) |
| **Zukeeper** ([repo](https://github.com/oslabs-beta/Zukeeper), [listing](https://chromewebstore.google.com/detail/copnnlbbmgdflldkbnemmccblmgcnlmo)) | Their wrapper + extension | Yes | Yes | Yes | Yes | State diffing (shallow display) | No | No | No | No | No | Partial | No documented flag | Local | Store listing last updated 2023; OS-Labs beta cadence |
| **Zusty** ([repo](https://github.com/oslabs-beta/Zusty), zustymiddleware) | Middleware + extension | Yes | Yes | — | Yes | Prev/next state view | No | No | No | No | No | Partial | No documented flag | Local | OS-Labs beta cadence |
| **simple-zustand-devtools** | Mounts store into React DevTools | Yes | No | Manual | No | No | No | No | No | No | No | Yes | Manual | Local | Low activity |
| **This project (before this change)** | Zero-setup Fiber walk (free) + bridge (paid) | No — inferred from hooks (inaccurate) | Paid | Paid | Paid — **lossy** (sanitized restore) | Shallow top-level | No | No | JSON copy | No | No | None | None | Local | — |
| **Trace Sessions (proposed)** | 1-line bridge; hook view clearly experimental | Yes (explicit, stable IDs) | Free (basic) | Free | Free, **raw-state safe** (Dates/Maps/Sets/functions preserved; view-only when unsafe) | Pro: path-level (`cart.items[3].quantity`), filterable | Pro: best-effort app frame, clickable | Pro: any two entries | Pro: versioned bundle, redaction, sensitivity warning, metadata-only option | Pro: validated, view-only, never executed | Pro: bundle incl. bookmarks/notes | First-class generics + typed `actionName` | Documented `enabled` option | Local-first, redaction support | — |

## Honest read

1. **Feature-count parity is unwinnable and irrelevant.** Redux DevTools already has
   action logs, diffs, time-travel, export, and even stack traces (`trace: true`).
   Zukeeper/Zusty replicate subsets for free.
2. **Where free tools genuinely hurt:**
   - Redux DevTools transports state across a serialization boundary. With default
     settings, replaying restores JSON-ified state, so Dates/Maps/Sets/class instances
     lose their types; its `serialize` options can customise encoding (and users can
     write reviver logic), but that is per-type opt-in configuration the developer must
     build and maintain. Our raw in-memory restore avoids the boundary entirely for current-page entries.
   - Redux-shaped UI for a non-Redux library: connection-per-store, no unified
     cross-store timeline, action names need manual threading anyway.
   - Nobody offers a **shareable, versioned, redacted debugging session** a teammate can
     open without reproducing the bug.
   - Zukeeper/Zusty appear unmaintained (OS-Labs launch projects); using them for daily
     work is a risk.
3. **Therefore the paid wedge is the workflow, not the features:** record a trace while
   reproducing a bug → see path-level changes + best-effort call-site → compare any two
   moments → export a redacted bundle a teammate can inspect offline. Safe-by-design
   replay (raw in-memory state, never serialized) is the technical moat vs. Redux
   DevTools' serialization, and it's why our *free* time-travel avoids a whole class of
   type-corruption pitfalls by construction (for current-page entries).
4. **Claims we must not make:** "only tool with stack traces" (false — Redux DevTools
   trace), "exact call-sites" (best-effort), "works with every bundler automatically"
   (untested), guaranteed sales (validation gate exists for a reason).
