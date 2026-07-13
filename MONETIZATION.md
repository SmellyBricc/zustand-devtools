# Monetization setup — manual steps only you can do

**Status (2026-07-13): store, product, and checkout link are done.** Store is
`zustand-devtools-app.lemonsqueezy.com` (Test mode — identity verification/payout still
pending review before real payments work), product "Zustand DevTools — Action Log &
Time-Travel" is published at €9.99 one-time with license keys enabled (unlimited length, 5
activations). Checkout URL is already wired into `extension/panel.js`'s
`LEMON_SQUEEZY_CHECKOUT_URL`. Remaining: do a test-mode purchase to get a real license key
and confirm the Activate flow end-to-end, then finish identity verification + connect a
payout method (Settings → Payouts) before going live for real customers.

The extension and the `bridge/` package are fully wired for a one-time-purchase license
model via Lemon Squeezy (merchant-of-record, handles EU/Irish VAT automatically). None of
the code below depends on these steps being done first — until you finish them, the
"Action Log" tab's paywall just shows "Checkout isn't set up yet."

I can't do any of this for you — creating accounts and entering payment/business details
isn't something I can do on your behalf. Here's exactly what to do, and exactly what to
hand back to me afterward.

## 1. Create the Lemon Squeezy account & store

1. Sign up at lemonsqueezy.com and create a store (their onboarding walks you through
   basic business details and payout setup).
2. Note your **Store ID** — visible in Settings → Stores.

## 2. Create the product

1. Products → New Product.
2. Name: something like "Zustand DevTools — Action Log & Time-Travel".
3. Pricing model: **Single payment** (one-time purchase, not a subscription) — matches the
   plan's "one-time purchase" model and how comparable tools (e.g. CSS Scan) price this
   category. A reasonable starting point given the researched comparable ($69 one-time for
   CSS Scan, a similar solo-built dev-tool extension) is somewhere in the $19–$39 range —
   your call.
4. Under this product, enable **License Keys** (Lemon Squeezy has a toggle for this per
   product/variant) — this is what makes the License API validate calls work.
5. Note the **Product ID** and **Variant ID** (Settings show both once created).

## 3. Get the checkout URL

Products → your product → "Get a checkout link" (or "Share" → copy the checkout URL).
It looks like `https://YOUR-STORE.lemonsqueezy.com/buy/VARIANT-UUID`.

## 4. Hand these back to me

- Checkout URL (from step 3)
- Store ID, Product ID, Variant ID (from steps 1–2, in case webhook/API work is needed later)

Once I have the checkout URL, I'll drop it into
`extension/panel.js`'s `LEMON_SQUEEZY_CHECKOUT_URL` constant — that's the only code change
needed to make the "Buy license" button work. The "Activate" flow (paste a license key,
validate against Lemon Squeezy's public License API) is already fully wired and needs no
further code changes — it'll work the moment a real license key exists to test against.

## What's already built, so you know what NOT to duplicate

- License validation: `extension/panel.js` calls
  `https://api.lemonsqueezy.com/v1/licenses/validate` directly from the DevTools panel
  (never from the inspected page) and stores the result in `chrome.storage.local`.
- No custom backend, no webhook server, no license-generation code to write — Lemon
  Squeezy's own License API and dashboard cover all of it.
