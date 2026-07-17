# Monetization setup — manual steps only you can do

**Status (2026-07-16): TEST MODE.** Store is `zustand-devtools-app.lemonsqueezy.com`
(activation application submitted 2026-07-15, awaiting Lemon Squeezy review). The
test-mode product (created as "Zustand DevTools — Action Log & Time-Travel"; rename to
"Zustand DevTools Pro — Trace Sessions" when copying to live mode) is €9.99 one-time with license keys
enabled (5 activations). All licensing configuration now lives in ONE module:
`extension/panel/license-config.js` (`LICENSE_CONFIG`) — checkout URL, /activate URL,
and the expected live store/product/variant IDs (currently null; live mode fails closed
until filled). The paid feature is **Pro Trace Sessions**; Stores, Timeline and safe
time-travel are free.

**Exact information still needed from Kuba before a paid launch:**
1. Lemon Squeezy approval, then "Copy to Live Mode" → the LIVE checkout URL.
2. The LIVE store ID, product ID and variant ID (for `license-config.js` expectations).
3. One real live-mode purchase + activation to confirm the flow end-to-end.
4. Sign-off on refund handling (terms page promises 14-day no-questions).

**Hard launch blockers beyond configuration** (documented, deliberately not in the
validation build): periodic `/validate` re-checks with an offline grace window,
`/deactivate` support, refund/revocation handling. Bridge 0.2.0 must be published to npm
BEFORE extension 1.1.0 is submitted (protocol v2 dependency). Payouts are NOT ready until
Lemon Squeezy approves the store.

The extension and the `bridge/` package are fully wired for a one-time-purchase license
model via Lemon Squeezy (merchant-of-record, handles EU/Irish VAT automatically). None of
the code below depends on these steps being done first — until you finish them, the
Trace Sessions paywall simply offers the (test-mode) checkout.

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

Once I have the live checkout URL + IDs, they go into
`extension/panel/license-config.js` — the only file that needs changing. The "Activate" flow (paste a license key,
validate against Lemon Squeezy's public License API) is already fully wired and needs no
further code changes — it'll work the moment a real license key exists to test against.

## What's already built, so you know what NOT to duplicate

- License activation: `extension/panel/main.js` calls Lemon Squeezy's
  `/v1/licenses/activate` (activation, not bare validation — activation limits are
  enforced) directly from the DevTools panel (never from the inspected page), verifies
  product/variant metadata via `license-config.js`, and stores the instance ID +
  validation timestamp in `chrome.storage.local`.
- No custom backend, no webhook server, no license-generation code to write — Lemon
  Squeezy's own License API and dashboard cover all of it.


## Licensing work still required before a PAID launch (post-validation)

The current gate is unchanged: Lemon Squeezy /activate with the TEST-mode product, key in
chrome.storage.local. Before charging real customers, add: product/variant ID validation
on activation (reject keys from other products), periodic /validate re-checks with an
offline grace window, device deactivation, refund/revocation handling, and clearer
activation-limit errors. Live product + checkout URL swap remains an external owner step.
The validation build deliberately ships without these — do not block beta testing on them.
