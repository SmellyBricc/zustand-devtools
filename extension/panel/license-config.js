// Licensing configuration — the ONLY place checkout/product identifiers live.
//
// OWNER SWAP CHECKLIST (before any paid launch):
//   1. In Lemon Squeezy, activate the store and "Copy to Live Mode" the
//      product; the live copy gets a NEW checkout URL and NEW IDs.
//   2. Fill in checkoutUrl, expectedStoreId, expectedProductId,
//      expectedVariantId below with the LIVE values.
//   3. Set mode to "live".
//   4. Re-run the automated tests and do one real purchase + activation.
//
// Still-open licensing lifecycle work (deliberately NOT in the validation
// build; a paid launch is not ready until these exist): periodic /validate
// re-checks with an offline grace window, /deactivate on demand, and
// refund/revocation handling.
export const LICENSE_CONFIG = {
  mode: "test", // "test" | "live"
  checkoutUrl:
    "https://zustand-devtools-app.lemonsqueezy.com/checkout/buy/2e844294-f46f-4786-b425-2b0245b58f3b", // TEST-MODE product
  activateUrl: "https://api.lemonsqueezy.com/v1/licenses/activate",
  // Live-mode expectations — null means "not configured". In live mode all
  // three MUST be set; activation fails closed otherwise.
  expectedStoreId: null,
  expectedProductId: null,
  expectedVariantId: null,
};

/** Returns a human-readable problem string, or null when the config is
 * usable for the current mode. */
export function configProblem(cfg) {
  if (!cfg.checkoutUrl || !cfg.activateUrl) return "Licensing configuration is incomplete (missing URLs).";
  if (cfg.mode === "live") {
    if (cfg.expectedStoreId == null || cfg.expectedProductId == null || cfg.expectedVariantId == null) {
      return "Licensing configuration is incomplete: live mode requires the expected store, product and variant IDs.";
    }
  }
  return null;
}

/**
 * Interpret a Lemon Squeezy /activate response. Never logs or returns the
 * license key itself. When expected IDs are configured, the response's
 * meta must match — a valid key for a DIFFERENT product is rejected.
 * @returns {{ok: true, instanceId: string|null, meta: object} | {ok: false, error: string}}
 */
export function checkActivationResponse(cfg, data) {
  const problem = configProblem(cfg);
  if (problem) return { ok: false, error: problem };
  if (!data || typeof data !== "object") return { ok: false, error: "Empty response from the license server." };
  if (!data.activated) {
    return { ok: false, error: typeof data.error === "string" ? data.error : "That license key isn't valid." };
  }
  const meta = data.meta && typeof data.meta === "object" ? data.meta : {};
  const mismatch =
    (cfg.expectedStoreId != null && meta.store_id !== cfg.expectedStoreId) ||
    (cfg.expectedProductId != null && meta.product_id !== cfg.expectedProductId) ||
    (cfg.expectedVariantId != null && meta.variant_id !== cfg.expectedVariantId);
  if (mismatch) {
    return { ok: false, error: "That license key belongs to a different product." };
  }
  return {
    ok: true,
    instanceId: (data.instance && data.instance.id) || null,
    meta: { store_id: meta.store_id ?? null, product_id: meta.product_id ?? null, variant_id: meta.variant_id ?? null },
  };
}
