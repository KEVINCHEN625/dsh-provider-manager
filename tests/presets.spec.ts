import { test, expect } from "vitest";
import {
  API_PRESETS,
  matchPreset,
  matchRegion,
  presetDraft,
  regionBaseURL,
} from "../src/shared/api-presets.js";

test("ZCode is one route with China and Overseas coding endpoints", () => {
  const zcode = API_PRESETS.find((preset) => preset.id === "zcode");
  expect(zcode?.route).toBe("zcode");
  expect(zcode?.regions?.map((region) => region.id)).toEqual([
    "china",
    "overseas",
  ]);
  expect(presetDraft(zcode!).baseURL).toBe(
    "https://open.bigmodel.cn/api/coding/paas/v4",
  );
  expect(presetDraft(zcode!, "overseas").baseURL).toBe(
    "https://api.z.ai/api/coding/paas/v4",
  );
  expect(presetDraft(zcode!, "overseas").route).toBe("zcode");
  expect(
    zcode?.regions?.some((region) =>
      /\/api\/paas\/v4$/.test(region.baseURL.replace(/\/$/, "")),
    ),
  ).toBe(false);
});

test("ZCode Anthropic URLs stay on the same card as Completions", () => {
  const zcode = API_PRESETS.find((preset) => preset.id === "zcode")!;
  const china = zcode.regions![0];
  const overseas = zcode.regions![1];
  expect(regionBaseURL(china, "anthropic-messages")).toBe(
    "https://open.bigmodel.cn/api/anthropic",
  );
  expect(regionBaseURL(overseas, "anthropic-messages")).toBe(
    "https://api.z.ai/api/anthropic",
  );
  expect(matchRegion(zcode, "https://open.bigmodel.cn/api/anthropic")?.id).toBe(
    "china",
  );
});

test("blank draft does not attach a known API", () => {
  expect(matchPreset({ route: "", baseURL: "" })).toBeUndefined();
});

test("OpenRouter and other gateways fill official base URLs", () => {
  const openrouter = API_PRESETS.find((preset) => preset.id === "openrouter");
  expect(presetDraft(openrouter!).baseURL).toBe("https://openrouter.ai/api/v1");
  expect(presetDraft(openrouter!).api).toBe("openai-completions");
  expect(matchPreset({ baseURL: "https://api.siliconflow.com/v1/" })?.id).toBe(
    "siliconflow",
  );
  expect(
    matchRegion(
      matchPreset({ route: "moonshot" }),
      "https://api.moonshot.cn/v1",
    )?.id,
  ).toBe("china");
  expect(
    presetDraft(API_PRESETS.find((preset) => preset.id === "gemini")!).baseURL,
  ).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
});
