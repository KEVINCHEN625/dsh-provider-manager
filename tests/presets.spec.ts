import { test, expect } from "vitest";
import {
  API_PRESETS,
  CONTEXT_1M,
  matchPreset,
  matchRegion,
  modelContextWindow,
  modelHas1m,
  presetDraft,
  regionBaseURL,
} from "../src/shared/api-presets.js";

test("ZCode is one route with China and Overseas coding endpoints", () => {
  const zcode = API_PRESETS.find((preset) => preset.id === "zcode");
  expect(zcode?.models.map((model) => model.id)).toContain("glm-5.3-flash");
  expect(zcode?.models.map((model) => model.id)).toContain("glm-5.3");
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

test("MiMo and MiniMax keep one route with China / Overseas URLs", () => {
  const mimo = API_PRESETS.find((preset) => preset.id === "mimo")!;
  expect(presetDraft(mimo).baseURL).toBe(
    "https://token-plan-cn.xiaomimimo.com/v1",
  );
  expect(presetDraft(mimo, "overseas").baseURL).toBe(
    "https://token-plan-sgp.xiaomimimo.com/v1",
  );
  expect(presetDraft(mimo, "overseas").route).toBe("mimo");
  expect(
    matchRegion(mimo, "https://token-plan-ams.xiaomimimo.com/v1")?.id,
  ).toBe("overseas");
  expect(regionBaseURL(mimo.regions![0], "anthropic-messages")).toBe(
    "https://token-plan-cn.xiaomimimo.com/anthropic",
  );

  const minimax = API_PRESETS.find((preset) => preset.id === "minimax")!;
  expect(presetDraft(minimax).baseURL).toBe("https://api.minimax.cn/v1");
  expect(presetDraft(minimax, "overseas").baseURL).toBe(
    "https://api.minimax.io/v1",
  );
  expect(matchRegion(minimax, "https://api.minimaxi.com/v1/")?.id).toBe(
    "china",
  );
  expect(regionBaseURL(minimax.regions![1], "anthropic-messages")).toBe(
    "https://api.minimax.io/anthropic",
  );
});

test("blank draft does not attach a known API", () => {
  expect(matchPreset({ route: "", baseURL: "" })).toBeUndefined();
});

test("preset routes and endpoint URLs do not collide", () => {
  const routes = API_PRESETS.map((preset) => preset.route);
  expect(new Set(routes).size).toBe(routes.length);
  for (const route of routes) {
    expect([
      "opencode-go",
      "commandcode",
      "deepseek-official",
      "cliproxy",
      "muse-code",
    ]).not.toContain(route);
  }
  const urls = API_PRESETS.flatMap((preset) => [
    preset.baseURL,
    ...(preset.regions ?? []).flatMap((region) => [
      region.baseURL,
      region.anthropicURL,
      ...(region.aliases ?? []),
    ]),
  ])
    .filter((value): value is string => !!value)
    .map((value) => value.replace(/\/$/, ""));
  expect(new Set(urls).size).toBe(urls.length);
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

test("plan presets tick 1M only on models that officially support it", () => {
  const zcode = API_PRESETS.find((preset) => preset.id === "zcode")!;
  const byId = Object.fromEntries(
    zcode.models.map((model) => [model.id, model.contextWindow]),
  );
  expect(byId["glm-5.3-flash"]).toBe(CONTEXT_1M);
  expect(byId["glm-5.3"]).toBe(CONTEXT_1M);
  expect(byId["glm-5.2"]).toBe(CONTEXT_1M);
  expect(byId["glm-5-turbo"]).toBe(200_000);
  const draft = presetDraft(zcode);
  expect(draft.models.split("\n")).toEqual([
    "glm-5.3-flash",
    "glm-5.3",
    "glm-5.2",
    "glm-5-turbo",
  ]);
  expect(draft.context1m.split("\n")).toEqual(["1", "1", "1", "0"]);
  expect(draft.defaultContextWindow).toBe("");
  expect(modelContextWindow("glm-5.3", true)).toBe(CONTEXT_1M);
  expect(modelContextWindow("glm-5-turbo", false)).toBe(200_000);
  expect(modelContextWindow("glm-5.3", false)).toBe(262_144);
  expect(modelHas1m({ id: "glm-5-turbo" })).toBe(false);
  expect(modelHas1m({ id: "glm-5-turbo" }, CONTEXT_1M)).toBe(false);

  const mimo = API_PRESETS.find((preset) => preset.id === "mimo")!;
  expect(mimo.models.every((model) => model.contextWindow === CONTEXT_1M)).toBe(
    true,
  );

  const minimax = API_PRESETS.find((preset) => preset.id === "minimax")!;
  expect(
    Object.fromEntries(
      minimax.models.map((model) => [model.id, model.contextWindow]),
    ),
  ).toEqual({
    "MiniMax-M3": 1_000_000,
    "MiniMax-M2.7": 204_800,
    "MiniMax-M2.7-highspeed": 204_800,
  });
  expect(modelContextWindow("MiniMax-M3", true)).toBe(1_000_000);
  expect(modelContextWindow("MiniMax-M2.7", false)).toBe(204_800);
  expect(modelContextWindow("MiniMax-M2.7", true)).toBe(CONTEXT_1M);
});
