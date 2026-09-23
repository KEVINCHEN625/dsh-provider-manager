import { expect, test } from "vitest";
import {
  GO_CATALOG,
  GO_MODELS,
  GO_ROUTE,
  GO_ENDPOINT,
  GO_ANTHROPIC_BASE,
  ZEN_ENDPOINT,
  requireGoModel,
  goEntry,
  selectableThinkingLevels,
  validateGoCatalog,
} from "../src/host/opencode/index.js";
test("catalog freeze keeps every official id and does not add ox-alpha-free", () => {
  expect(GO_CATALOG.models.map((m) => m.id)).toHaveLength(41);
  expect(GO_CATALOG.excluded.map((item) => item.id)).toEqual(["ox-alpha-free"]);
  expect(GO_MODELS).toHaveLength(32);
  expect(new Set(GO_MODELS.map((m) => m.id)).size).toBe(32);
  const blocked = GO_CATALOG.models.filter(
    (m) => m.disposition !== "supported",
  );
  expect(blocked.map((m) => m.id)).toEqual([
    "kimi-k2.5",
    "glm-5",
    "deepseek-flash",
    "qwen3.5-plus",
    "mimo-v2-pro",
    "mimo-v2-omni",
    "hy3-preview",
    "grok-4.5",
    "omen-alpha",
  ]);
  for (const entry of blocked) {
    expect(entry.blockReasons.length).toBeGreaterThan(0);
    expect(entry.api).toBeNull();
    expect(GO_MODELS.some((m) => m.id === entry.id)).toBe(false);
  }
  expect(goEntry("deepseek-flash")?.blockReasons.join(" ")).toMatch(
    /alias-forbidden/,
  );
  expect(goEntry("hy3-preview")?.blockReasons.join(" ")).toMatch(
    /alias-forbidden/,
  );
});
test("every catalog row pins thinkingLevelMap and keeps raw integer limits", () => {
  for (const entry of GO_CATALOG.models) {
    expect(Object.keys(entry.thinkingLevelMap).sort()).toEqual(
      ["high", "low", "max", "medium", "minimal", "off", "xhigh"].sort(),
    );
    if (entry.contextWindow !== null)
      expect(Number.isSafeInteger(entry.contextWindow)).toBe(true);
    if (entry.maxOutputTokens !== null)
      expect(Number.isSafeInteger(entry.maxOutputTokens)).toBe(true);
  }
  expect(goEntry("muse-spark-1.3")).toMatchObject({
    name: "Muse Spark 1.3",
    api: "openai-responses",
    contextWindow: 1048576,
    maxOutputTokens: 131072,
    nativeEfforts: ["minimal", "low", "medium", "high", "xhigh", "max"],
    compatPolicy: "muse-responses",
    baseUrl: ZEN_ENDPOINT,
    thinkingLevelMap: { max: "max", xhigh: "xhigh" },
  });
  expect(goEntry("muse-spark-1.3-contributor")).toMatchObject({
    contextWindow: 1048576,
    maxOutputTokens: 131072,
    thinkingLevelMap: { max: null, xhigh: "xhigh" },
  });
  expect(goEntry("deepseek-v4.1-flash")).toMatchObject({
    contextWindow: 1000000,
    maxOutputTokens: 384000,
  });
  expect(goEntry("kimi-k2.7-code")?.maxOutputTokens).toBe(262144);
  expect(goEntry("hy3")?.inputLimit).toBe(192000);
  expect(goEntry("gpt-5.6-luna")?.inputLimit).toBe(922000);
});
test("enabled models use official protocols and Anthropic base without /v1", () => {
  expect(requireGoModel("muse-spark-1.3")).toMatchObject({
    api: "openai-responses",
    baseUrl: ZEN_ENDPOINT,
    provider: GO_ROUTE,
  });
  expect(requireGoModel("muse-spark-1.3-contributor")).toMatchObject({
    api: "openai-responses",
    baseUrl: GO_ENDPOINT,
    provider: GO_ROUTE,
  });
  expect(requireGoModel("deepseek-v4.1-flash")).toMatchObject({
    api: "openai-completions",
    baseUrl: GO_ENDPOINT,
  });
  expect(requireGoModel("minimax-m3")).toMatchObject({
    api: "anthropic-messages",
    baseUrl: GO_ANTHROPIC_BASE,
  });
  expect(requireGoModel("qwen3.8-max").compat).toMatchObject({
    forceAdaptiveThinking: true,
  });
  expect(requireGoModel("qwen3.7-max").compat).toMatchObject({
    forceAdaptiveThinking: false,
  });
  expect(requireGoModel("grok-4.7").api).toBe("openai-responses");
  expect(goEntry("qwen3.7-max")?.localBudgetPresets.map((p) => p.id)).toEqual([
    "minimal",
    "low",
    "medium",
    "high",
  ]);
  expect(goEntry("qwen3.7-max")?.nativeEfforts).toEqual([]);
});
test("schema rejects missing thinking levels and silent id drops", () => {
  const clone = structuredClone(GO_CATALOG);
  delete clone.models[0].thinkingLevelMap.off;
  expect(() => validateGoCatalog(clone)).toThrow(
    /thinkingLevelMap missing off/,
  );
  clone.models[0].thinkingLevelMap.off = null;
  clone.models.pop();
  expect(() => validateGoCatalog(clone)).not.toThrow();
});
test("video is advertised but not claimed as a wired SDK input", () => {
  const muse = goEntry("muse-spark-1.3-contributor")!;
  expect(muse.advertisedInput).toContain("video");
  expect(muse.input).toEqual(["text", "image"]);
  expect(requireGoModel(muse.id).input).toEqual(["text", "image"]);
});
test("every enabled model offers a selectable effort", () => {
  for (const model of GO_MODELS) {
    expect(selectableThinkingLevels(goEntry(model.id)!).length).toBeGreaterThan(
      0,
    );
  }
  expect(selectableThinkingLevels(goEntry("mimo-v2.6-pro")!)).toEqual([
    "off",
    "low",
    "medium",
    "high",
  ]);
  expect(selectableThinkingLevels(goEntry("mimo-v2.6-flash")!)).toEqual([
    "off",
    "low",
    "medium",
    "high",
  ]);
  expect(selectableThinkingLevels(goEntry("kimi-k2.6")!)).toEqual([
    "off",
    "high",
  ]);
  expect(goEntry("kimi-k2.6")?.nativeEfforts).toEqual([]);
  expect(selectableThinkingLevels(goEntry("glm-5.1")!)).toEqual([
    "low",
    "high",
    "max",
  ]);
  expect(selectableThinkingLevels(goEntry("minimax-m2.7")!)).toEqual([
    "off",
    "high",
  ]);
  expect(goEntry("minimax-m2.7")?.compatPolicy).toBe("anthropic-toggle");
  expect(selectableThinkingLevels(goEntry("muse-spark-1.3")!)).toEqual([
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ]);
  expect(
    selectableThinkingLevels(goEntry("muse-spark-1.3-contributor")!),
  ).toEqual(["minimal", "low", "medium", "high", "xhigh"]);
  expect(selectableThinkingLevels(goEntry("deepseek-v4.1-flash")!)).toEqual([
    "low",
    "high",
    "max",
  ]);
});
