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

  test("probe-verified families get reasoning with none as the off switch", () => {
    for (const id of ["deepseek/deepseek-v4.1-flash", "z-ai/glm-5.3-flash"]) {
      const model = toCcModel(entry({ id }));
      expect(model.reasoning).toBe(true);
      const levels = model.thinkingLevelMap as Record<string, string | null>;
      // Live probes 2026-10-31: reasoning_effort "none" suppresses
      // reasoning_content; "minimal" acts as an off alias so it stays hidden;
      // low..max are all accepted by the endpoint.
      expect(levels.off).toBe("none");
      expect(levels.minimal).toBeNull();
      expect(levels.low).toBe("low");
      expect(levels.medium).toBe("medium");
      expect(levels.high).toBe("high");
      expect(levels.xhigh).toBe("xhigh");
      expect(levels.max).toBe("max");
    }
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
