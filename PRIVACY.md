# Privacy Policy for Zustand DevTools

Last updated: 2026-07-13

Zustand DevTools does not collect, store, or transmit your personal data or browsing
history to any server.

## What Data We Collect

None, by default. The extension reads component state from pages you inspect while Chrome
DevTools is open with the "Zustand" panel active, and displays it in that same panel. This
data never leaves your device — it's relayed entirely through the browser's own internal
extension messaging, from the inspected page to your own open DevTools window.

If you use the optional `zustand-devtools-bridge` package and paste a license key into the
Action Log tab to unlock the paid tier, that key is sent to Lemon Squeezy's license
validation API to confirm it's valid, and the result is stored locally in your browser
(`chrome.storage.local`) so you don't have to re-enter it. No other data accompanies that
request.

## How Data Is Stored

- Component state: not stored — read live and discarded once displayed.
- License key (only if you activate the paid tier): stored locally in your browser via
  `chrome.storage.local`. Never synced, never sent anywhere except the one-time validation
  call described above.

## How Data Is Used

- Component state is used solely to render the DevTools panel you're looking at.
- A license key is used solely to unlock the Action Log/time-travel tab locally.

## Third-Party Services

License-key validation uses Lemon Squeezy's public License API
(`https://api.lemonsqueezy.com`). See Lemon Squeezy's own privacy policy for how they
handle that request. No other third-party service is used.

## Data Sharing

We don't share any data with third parties. We don't operate a server that could share
data even if we wanted to — there is no backend to this extension.

## Data Retention and Deletion

Uninstalling the extension removes everything it stored, including any saved license key.

## Changes to This Policy

If what this extension collects or does ever changes, this file will be updated and the
"Last updated" date above will change accordingly.

## Contact

Open an issue on the project's GitHub repository, or email the contact address listed on
the Chrome Web Store listing.
