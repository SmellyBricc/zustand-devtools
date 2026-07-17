# Lemon Squeezy review packet

## Product summary

**Zustand DevTools** is a Chrome DevTools extension for developers who use the Zustand
state-management library in React apps (individual developers and small teams). The free
tier provides an accurate Stores inspector for registered stores, a searchable
multi-store Timeline, safe ID-based time-travel, and an experimental zero-setup
Component Hooks view. The paid tier, **Zustand DevTools Pro — Trace Sessions**
(**€9.99, one-time purchase, no subscription**), unlocks unlimited Trace Sessions:
recorded bug reproductions with deep path-level diffs, best-effort source call-sites,
snapshot comparison, filters, bookmarks/notes, and redacted session export with
validated view-only import. Every install includes three full preview Trace Sessions
before a license is required.

**Fulfilment:** entirely digital. Lemon Squeezy generates and delivers the license key
after purchase; the customer pastes it into the extension, which activates it through
Lemon Squeezy's License API (planned allowance: five device activations, no expiry).
No physical goods, services, consulting, regulated goods, or prohibited content.

**Status:** legitimate product in pre-launch testing. The Lemon Squeezy account is
awaiting approval; the existing product is test-mode only; the Chrome Web Store
submission is in progress (the extension is not publicly installable yet); no real
payments are being accepted. Live licensing is NOT claimed to work until the store is
approved and one real live-mode purchase has been tested end-to-end.

## Exact dashboard settings (Kuba must apply these manually)

| Setting | Value |
|---|---|
| Product name | `Zustand DevTools Pro — Trace Sessions` (rename from the old test name "Zustand DevTools — Action Log & Time-Travel") |
| Product type | Digital software license |
| Pricing model | Single payment |
| Price | €9.99 |
| Generate license keys | Enabled |
| Activation limit | 5 |
| License expiry | None |

Product description to paste:

> Unlock unlimited Trace Sessions in Zustand DevTools. Record a bug reproduction,
> inspect path-level diffs and likely source call-sites, compare snapshots, add
> bookmarks and notes, and export a redacted session for offline review. One-time
> purchase with up to five device activations.

These are dashboard changes only Kuba can make (I do not touch the Lemon Squeezy
dashboard). After approval: use "Copy to Live Mode", then put the live checkout URL and
store/product/variant IDs into `extension/panel/license-config.js` and test one real
purchase before any public launch.

## Draft email reply to the reviewer (Kuba sends this — do not send automatically)

> Hello,
>
> Thanks for reviewing my account — happy to explain the product.
>
> **1. What it is, how it's made and licensed, who it's for, purchase model.**
> Zustand DevTools is a Chrome DevTools extension I build and maintain for React
> developers who use the open-source Zustand state-management library. I am the project
> owner and publisher and hold the rights to distribute it; the source is public under
> the MIT license at the repository below, and the companion npm package
> (`zustand-devtools-bridge`) is published under my npm account. The free tier covers
> everyday state inspection. The paid tier, "Zustand DevTools Pro — Trace Sessions", is
> a **one-time €9.99 software license — not a subscription**. Lemon Squeezy generates
> and delivers the license key after purchase; the customer pastes the key into the
> extension, which activates it via the Lemon Squeezy License API (up to five device
> activations). The product is completely digital: no physical goods, no consulting or
> services, no regulated goods, and no prohibited content. It is currently in
> pre-launch testing — my Chrome Web Store submission is in progress and I am not
> accepting real payments until this review completes and I have verified one live-mode
> purchase end-to-end.
>
> **2. Website:** https://smellybricc.github.io/zustand-devtools-site/
>
> **3. Product examples and demonstrations:**
> - Source code (extension + bridge, MIT): https://github.com/SmellyBricc/zustand-devtools
> - Companion npm package: https://www.npmjs.com/package/zustand-devtools-bridge
> - Privacy policy: https://smellybricc.github.io/zustand-devtools-site/privacy.html
> - The website includes an interactive product illustration of the workflow. There is
>   no public demo video yet; I can supply a screen recording of the real extension or
>   a test build on request.
>
> Best regards,
> Kuba Opoczka

## Evidence checklist for the reviewer

**Inspectable today:** the public website (product, tiers, planned price, pre-launch
status, privacy, terms/refunds, contact); the full MIT source repository including the
extension, bridge, and 96-test automated suite; the published npm package
(`zustand-devtools-bridge` 0.1.1; 0.2.0 is built/tested locally, publishing before the
extension ships); the privacy policy and terms pages.

**Not yet available (honestly):** a public Chrome Web Store listing (submission in
progress); a live checkout (test-mode only, pending this review); a public demo video
(recording script prepared in `docs/lemon-squeezy-demo-recording-guide.md` — available
on request); live-mode license activation proof (blocked on store approval).
