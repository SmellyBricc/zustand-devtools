import { describe, expect, it } from "vitest";
import { LICENSE_CONFIG, configProblem, checkActivationResponse } from "../extension/panel/license-config.js";

const testCfg = { ...LICENSE_CONFIG };
const liveCfgIncomplete = { ...LICENSE_CONFIG, mode: "live" };
const liveCfgComplete = {
  ...LICENSE_CONFIG,
  mode: "live",
  expectedStoreId: 111,
  expectedProductId: 222,
  expectedVariantId: 333,
};

describe("licensing configuration", () => {
  it("ships in test mode with no invented live IDs", () => {
    expect(LICENSE_CONFIG.mode).toBe("test");
    expect(LICENSE_CONFIG.expectedProductId).toBeNull();
    expect(LICENSE_CONFIG.expectedVariantId).toBeNull();
  });

  it("test mode config is usable; incomplete live mode fails closed with a clear message", () => {
    expect(configProblem(testCfg)).toBeNull();
    expect(configProblem(liveCfgIncomplete)).toMatch(/incomplete/i);
    expect(configProblem(liveCfgComplete)).toBeNull();
  });

  it("accepts a valid activation and captures instance + validation metadata", () => {
    const out = checkActivationResponse(testCfg, {
      activated: true,
      instance: { id: "inst_1" },
      meta: { store_id: 111, product_id: 222, variant_id: 333 },
    });
    expect(out.ok).toBe(true);
    expect(out.instanceId).toBe("inst_1");
    expect(out.meta.product_id).toBe(222);
  });

  it("rejects a valid key that belongs to a different product/variant when expectations are configured", () => {
    const wrongProduct = checkActivationResponse(liveCfgComplete, {
      activated: true,
      instance: { id: "i" },
      meta: { store_id: 111, product_id: 999, variant_id: 333 },
    });
    expect(wrongProduct.ok).toBe(false);
    expect(wrongProduct.error).toMatch(/different product/i);
    const wrongVariant = checkActivationResponse(liveCfgComplete, {
      activated: true,
      meta: { store_id: 111, product_id: 222, variant_id: 999 },
    });
    expect(wrongVariant.ok).toBe(false);
  });

  it("live mode with unconfigured IDs refuses to activate at all", () => {
    const out = checkActivationResponse(liveCfgIncomplete, { activated: true, meta: {} });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/incomplete/i);
  });

  it("failed activations surface the server error and never echo the key", () => {
    const out = checkActivationResponse(testCfg, { activated: false, error: "license_key not found" });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("license_key not found");
    const empty = checkActivationResponse(testCfg, null);
    expect(empty.ok).toBe(false);
  });
});
