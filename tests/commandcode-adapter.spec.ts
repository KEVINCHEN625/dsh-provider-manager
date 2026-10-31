import { describe, expect, test } from "vitest";
import { toCcModel } from "../src/host/commandcode/adapter.js";
import { CC_ROUTE } from "../src/host/commandcode/catalog.js";
import type { CcCatalogEntry } from "../src/host/commandcode/catalog.js";

function entry(overrides: Partial<CcCatalogEntry>): CcCatalogEntry {
  return {
    id: "z-ai/glm-5.3-flash",
    name: "GLM-5.3 Flash",
    contextWindow: 1_048_576,
    supportedEndpoints: ["/chat/completions"],
    api: "openai-completions",
    ...overrides,
  } as CcCatalogEntry;
}

describe("Command Code catalog → pi-ai model", () => {
  test("every model carries the cost object pi-ai calculateCost dereferences", () => {
    // calculateCost() reads model.cost.tiers after each completed stream; a
    // missing cost object crashed live turns with PI_AI_ERROR
    // "Cannot read properties of undefined (reading 'tiers')".
    for (const model of [
      toCcModel(entry({})),
      toCcModel(entry({ id: "deepseek/deepseek-v4.1-flash" })),
      toCcModel(entry({ id: "anthropic/claude-opus-5.5", api: "anthropic-messages" })),
    ]) {
      expect(model.cost).toEqual({
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      });
      expect(model.provider).toBe(CC_ROUTE);
    }
  });

  test("probe-verified families get reasoning; only deepseek gets a working off", () => {
    // Content-checked probes 2026-10-31: the gateway vocabulary is
    // off|low|medium|high|xhigh|max ("none" is a 400). deepseek honors "off";
    // z-ai accepts "off" but returns a silently empty stream, so it hides off.
    const deepseek = toCcModel(entry({ id: "deepseek/deepseek-v4.1-flash" }));
    expect(deepseek.reasoning).toBe(true);
    const ds = deepseek.thinkingLevelMap as Record<string, string | null>;
    expect(ds.off).toBe("off");
    expect(ds.minimal).toBeNull();
    expect(ds.max).toBe("max");
    const glm = toCcModel(entry({ id: "z-ai/glm-5.3-flash" }));
    expect(glm.reasoning).toBe(true);
    const zai = glm.thinkingLevelMap as Record<string, string | null>;
    expect(zai.off).toBeNull();
    expect(zai.low).toBe("low");
    expect(zai.max).toBe("max");
  });

  test("unprobed vendors stay non-reasoning with no effort map", () => {
    const model = toCcModel(entry({ id: "qwen/qwen3.8-max" }));
    expect(model.reasoning).toBe(false);
    expect(model.thinkingLevelMap).toBeUndefined();
  });

  test("context window comes from the catalog and output is clamped", () => {
    expect(
      toCcModel(entry({ contextWindow: 2_000_000 })).contextWindow,
    ).toBe(2_000_000);
    expect(toCcModel(entry({ contextWindow: 2_000_000 })).maxTokens).toBe(
      128_000,
    );
    expect(
      toCcModel(entry({ contextWindow: 65_536, id: "x/old" })).maxTokens,
    ).toBe(65_536);
  });
});

describe("Command Code static seed", () => {
  test("seed is non-empty and the adapter boots from it without any network", async () => {
    const { CC_SEED } = await import("../src/host/commandcode/seed.js");
    expect(CC_SEED.length).toBeGreaterThanOrEqual(90);
    const ids = new Set(CC_SEED.map((entry) => entry.id));
    // The two families the headless workflow drives first.
    expect(ids.has("deepseek/deepseek-v4.1-flash")).toBe(true);
    expect(ids.has("z-ai/glm-5.3-flash")).toBe(true);
    // Claude-only models map to anthropic-messages; the rest to completions.
    expect(CC_SEED.filter((e) => e.api === "anthropic-messages").length).toBe(
      11,
    );
    // Every seed entry is directly convertible into a valid pi-ai model.
    for (const entry of CC_SEED) {
      const model = toCcModel(entry);
      expect(model.cost).toBeDefined();
      expect(model.contextWindow).toBeGreaterThan(0);
    }
  });
});
