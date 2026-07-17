# Privacy Policy for Zustand DevTools

Last updated: 2026-07-17

Zustand DevTools does not send your application state, trace contents, browsing history,
or other website content to the developer or to anyone else. There is no analytics and no
telemetry. The extension processes state locally to display it in your own Chrome
DevTools panel.

## What the extension processes

The extension reads component and store state from pages you inspect while Chrome
DevTools is open with the "Zustand" panel active, and displays it in that same panel.
Chrome's disclosure rules treat this as handling website content even though the
processing is local. That state is relayed entirely through the browser's own internal
extension messaging, from the inspected page to your own open DevTools window, and is not
sent off your device.

## What is stored, and where

- **Recent Trace Sessions, the free-preview counter, and the license record** are stored
  in `chrome.storage.local`, so they survive DevTools restarts. Saved sessions are always
  view-only.
- **The bridge's action history** (`zustand-devtools-bridge`) is a bounded, per-tab
  buffer kept in the inspected page's own `sessionStorage`, so a reload doesn't wipe your
  timeline. It follows the browser's normal tab/session lifetime and is under the
  inspected page's control, like everything else in that page's `sessionStorage`.
- **Trace files you export** are ordinary local files saved by your browser. They remain
  wherever you saved them until you delete them.

## License activation (the only network use)

If you paste a license key into the Trace Sessions tab to unlock the Pro tier, the
extension sends two things to Lemon Squeezy's license activation API: the license key you
entered and a generic instance name (the fixed string "Zustand DevTools", used by Lemon
Squeezy to label the activation). The activation result (instance ID, product metadata,
validation timestamp) is stored locally in `chrome.storage.local` so you don't have to
re-enter the key. If activation fails (for example, offline), you can retry it; each
attempt sends the same fields.

If a future version adds periodic license re-validation or a deactivate button, those
calls would send only the licensing fields Lemon Squeezy requires for them (the license
key and the stored instance ID). No application state, trace contents, browsing history,
or payment details are ever sent to Lemon Squeezy. Payment itself happens on Lemon
Squeezy's own checkout page, outside the extension.

## Third-party services

Lemon Squeezy (`https://api.lemonsqueezy.com`) receives the licensing fields described
above when you activate a license, and processes purchases as merchant of record on its
own site. See Lemon Squeezy's privacy policy for how they handle that data. No other
third party receives anything. The developer operates no server and receives no data:
apart from the licensing requests you trigger, nothing leaves your machine.

## Trace Session files (export/import)

The Pro tier can export a trace session file at your explicit request. That file is
created locally and saved by your browser; the extension never uploads it. Trace files
can contain application state, source file paths, and your own notes. The extension
warns before export and offers a metadata-only export, and the bridge redacts common
sensitive keys plus any patterns you configure, but you should review a file before
sharing it. Importing is local too: imported files are schema-validated, size-limited,
opened view-only, never executed, and never injected into the inspected page.

## Retention and deletion

- Uninstalling the extension clears everything it keeps in Chrome's extension storage:
  saved Trace Sessions, the preview counter, and the license record.
- Uninstalling does not delete trace files you exported; delete those like any other
  file.
- The bridge's history in an inspected page's `sessionStorage` follows that tab/session's
  lifetime and is cleared by the browser when the tab or session ends.

## Changes to this policy

If what this extension stores or transmits ever changes, this file will be updated and
the "Last updated" date above will change accordingly.

## Contact

Open an issue on the project's GitHub repository, or email the contact address listed on
the Chrome Web Store listing.
