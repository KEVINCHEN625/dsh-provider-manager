import { describe, expect, test, vi } from "vitest";
import { ensureSection } from "../src/host/compat.js";
import { ConfigSchema } from "../src/host/providers.js";

const noop = () => {};

function legacySettings(ns: string) {
  return {
    installSection: vi.fn(noop),
    describe: () => [{ ns }],
  };
}

function modernSettings(ns: string | undefined) {
  return {
    describe: () => (ns === undefined ? [] : [{ ns }]),
  };
}

describe("dual-host settings compatibility", () => {
  test("0.1.5 hosts install the section imperatively", () => {
    const settings = legacySettings("dsh-provider-manager");
    ensureSection(settings, {}, "dsh-provider-manager", {}, {});
    expect(settings.installSection).toHaveBeenCalledTimes(1);
  });

  test("0.1.7 hosts rely on the declared Config; a listed section passes", () => {
    expect(() =>
      ensureSection(modernSettings("dsh-provider-manager"), {}, "dsh-provider-manager", {}, {}),
    ).not.toThrow();
  });

  test("an invisible section on 0.1.7 fails loudly instead of degrading", () => {
    expect(() =>
      ensureSection(modernSettings(undefined), {}, "dsh-provider-manager", {}, {}),
    ).toThrow(/volatile/);
  });

  test("exported Config marks every runtime-owned field volatile (0.1.7 gate)", () => {
    for (const field of [
      "ownedOauthRoutes",
      "probe",
      "selections",
      "credential",
      "goApiKeyEnv",
    ]) {
      const entry = (ConfigSchema as { dict: { [key: string]: { meta?: { volatile?: boolean } } } })
        .dict[field];
      expect(entry?.meta?.volatile, `${field} must be volatile`).toBe(true);
    }
  });
});
