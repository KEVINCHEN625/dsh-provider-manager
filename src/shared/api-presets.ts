import type { Protocol } from "./protocol.js";

export type RegionId = "china" | "overseas";

/** DSH / GLM-style 1,048,576-token window. */
export const CONTEXT_1M = 1_048_576;
/** Smallest official window that still counts as “1M” (MiniMax-M3 is 1,000,000). */
export const CONTEXT_1M_MIN = 1_000_000;
/** llm-pi-ai fallback when a model has no listed size. */
export const CONTEXT_FALLBACK = 262_144;

export interface ApiRegion {
  id: RegionId;
  labelKey: "regionChina" | "regionOverseas";
  baseURL: string;
  anthropicURL?: string;
  aliases?: readonly string[];
}

export interface PresetModel {
  id: string;
  contextWindow: number;
}

export interface ApiPreset {
  id: string;
  name: string;
  route: string;
  api: Protocol;
  models: readonly PresetModel[];
  baseURL?: string;
  regions?: readonly ApiRegion[];
  defaultContextWindow?: string;
  defaultMaxTokens?: string;
}

const china = (baseURL: string): ApiRegion => ({
  id: "china",
  labelKey: "regionChina",
  baseURL,
});

const overseas = (baseURL: string): ApiRegion => ({
  id: "overseas",
  labelKey: "regionOverseas",
  baseURL,
});

const model = (id: string, contextWindow: number): PresetModel => ({
  id,
  contextWindow,
});

/** Known OpenAI-compatible (or Anthropic Messages) APIs for the custom llm-pi-ai form. */
export const API_PRESETS: readonly ApiPreset[] = [
  {
    id: "zcode",
    name: "ZCode",
    route: "zcode",
    api: "openai-completions",
    models: [
      model("glm-5.3-flash", CONTEXT_1M),
      model("glm-5.3", CONTEXT_1M),
      model("glm-5.2", CONTEXT_1M),
      model("glm-5-turbo", 200_000),
    ],
    regions: [
      {
        ...china("https://open.bigmodel.cn/api/coding/paas/v4"),
        anthropicURL: "https://open.bigmodel.cn/api/anthropic",
      },
      {
        ...overseas("https://api.z.ai/api/coding/paas/v4"),
        anthropicURL: "https://api.z.ai/api/anthropic",
      },
    ],
    defaultMaxTokens: "131072",
  },
  {
    id: "mimo",
    name: "MiMo",
    route: "mimo",
    api: "openai-completions",
    models: [
      model("mimo-v2.5-pro", CONTEXT_1M),
      model("mimo-v2.5", CONTEXT_1M),
    ],
    regions: [
      {
        ...china("https://token-plan-cn.xiaomimimo.com/v1"),
        anthropicURL: "https://token-plan-cn.xiaomimimo.com/anthropic",
      },
      {
        ...overseas("https://token-plan-sgp.xiaomimimo.com/v1"),
        anthropicURL: "https://token-plan-sgp.xiaomimimo.com/anthropic",
        aliases: [
          "https://token-plan-ams.xiaomimimo.com/v1",
          "https://token-plan-ams.xiaomimimo.com/anthropic",
        ],
      },
    ],
    defaultMaxTokens: "131072",
  },
  {
    id: "minimax",
    name: "MiniMax",
    route: "minimax",
    api: "openai-completions",
    models: [
      model("MiniMax-M3", 1_000_000),
      model("MiniMax-M2.7", 204_800),
      model("MiniMax-M2.7-highspeed", 204_800),
    ],
    regions: [
      {
        ...china("https://api.minimax.cn/v1"),
        anthropicURL: "https://api.minimax.cn/anthropic",
        aliases: [
          "https://api.minimaxi.com/v1",
          "https://api.minimaxi.com/anthropic",
        ],
      },
      {
        ...overseas("https://api.minimax.io/v1"),
        anthropicURL: "https://api.minimax.io/anthropic",
      },
    ],
    defaultMaxTokens: "131072",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    route: "openrouter",
    api: "openai-completions",
    baseURL: "https://openrouter.ai/api/v1",
    models: [
      model("openai/gpt-4o-mini", 128_000),
      model("google/gemini-2.5-flash", CONTEXT_1M),
    ],
  },
  {
    id: "siliconflow",
    name: "SiliconFlow",
    route: "siliconflow",
    api: "openai-completions",
    models: [model("deepseek-ai/DeepSeek-V3.2", 128_000)],
    regions: [
      china("https://api.siliconflow.cn/v1"),
      overseas("https://api.siliconflow.com/v1"),
    ],
  },
  {
    id: "moonshot",
    name: "Moonshot",
    route: "moonshot",
    api: "openai-completions",
    models: [model("kimi-k2.5", 262_144)],
    regions: [
      china("https://api.moonshot.cn/v1"),
      overseas("https://api.moonshot.ai/v1"),
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    route: "deepseek-api",
    api: "openai-completions",
    baseURL: "https://api.deepseek.com",
    models: [
      model("deepseek-chat", 128_000),
      model("deepseek-reasoner", 128_000),
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    route: "openai-api",
    api: "openai-completions",
    baseURL: "https://api.openai.com/v1",
    models: [model("gpt-4.1-mini", CONTEXT_1M)],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    route: "anthropic-api",
    api: "anthropic-messages",
    baseURL: "https://api.anthropic.com",
    models: [model("claude-sonnet-4-5", 200_000)],
  },
  {
    id: "groq",
    name: "Groq",
    route: "groq",
    api: "openai-completions",
    baseURL: "https://api.groq.com/openai/v1",
    models: [model("llama-3.3-70b-versatile", 128_000)],
  },
  {
    id: "together",
    name: "Together",
    route: "together",
    api: "openai-completions",
    baseURL: "https://api.together.xyz/v1",
    models: [model("meta-llama/Llama-3.3-70B-Instruct-Turbo", 128_000)],
  },
  {
    id: "fireworks",
    name: "Fireworks",
    route: "fireworks",
    api: "openai-completions",
    baseURL: "https://api.fireworks.ai/inference/v1",
    models: [
      model("accounts/fireworks/models/llama-v3p3-70b-instruct", 128_000),
    ],
  },
  {
    id: "dashscope",
    name: "DashScope",
    route: "dashscope",
    api: "openai-completions",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: [model("qwen-plus", 131_072)],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    route: "gemini-api",
    api: "openai-completions",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: [model("gemini-2.5-flash", CONTEXT_1M)],
  },
  {
    id: "mistral",
    name: "Mistral",
    route: "mistral",
    api: "openai-completions",
    baseURL: "https://api.mistral.ai/v1",
    models: [model("mistral-small-latest", 128_000)],
  },
  {
    id: "meta",
    name: "Meta Model API",
    route: "meta",
    api: "openai-responses",
    baseURL: "https://api.meta.ai/v1",
    models: [
      model("muse-spark-1.3", CONTEXT_1M),
      model("muse-spark-1.3-contributor", CONTEXT_1M),
    ],
    defaultMaxTokens: "131072",
  },
];

function normalizeUrl(value: string | undefined) {
  return (value || "").trim().replace(/\/$/, "");
}

export function matchPreset(input: {
  route?: string;
  baseURL?: string;
}): ApiPreset | undefined {
  const route = input.route?.replace(/^custom:/, "").trim();
  const url = normalizeUrl(input.baseURL);
  return (
    (route
      ? API_PRESETS.find((preset) => preset.route === route)
      : undefined) ||
    (url
      ? API_PRESETS.find((preset) =>
          preset.regions?.some((region) => regionUrls(region).includes(url)),
        )
      : undefined) ||
    (url
      ? API_PRESETS.find((preset) => normalizeUrl(preset.baseURL) === url)
      : undefined)
  );
}

function regionUrls(region: ApiRegion) {
  return [region.baseURL, region.anthropicURL, ...(region.aliases ?? [])]
    .filter((value): value is string => !!value)
    .map(normalizeUrl);
}

export function regionBaseURL(region: ApiRegion, api?: string) {
  return api === "anthropic-messages" && region.anthropicURL
    ? region.anthropicURL
    : region.baseURL;
}

export function matchRegion(preset: ApiPreset | undefined, baseURL?: string) {
  const url = normalizeUrl(baseURL);
  if (!url) return undefined;
  return preset?.regions?.find((region) => regionUrls(region).includes(url));
}

export function isContext1m(window: number | undefined) {
  return (window ?? 0) >= CONTEXT_1M_MIN;
}

export function lookupPresetModel(id: string): PresetModel | undefined {
  const needle = id.trim();
  if (!needle) return undefined;
  for (const preset of API_PRESETS) {
    const found = preset.models.find((item) => item.id === needle);
    if (found) return found;
  }
}

export function modelContextWindow(id: string, context1m: boolean): number {
  const known = lookupPresetModel(id)?.contextWindow;
  if (context1m) {
    if (typeof known === "number" && isContext1m(known)) return known;
    return CONTEXT_1M;
  }
  if (typeof known === "number" && !isContext1m(known)) return known;
  return CONTEXT_FALLBACK;
}

export function modelHas1m(
  model: { id: string; contextWindow?: number },
  fallback?: number,
) {
  if (typeof model.contextWindow === "number")
    return isContext1m(model.contextWindow);
  const known = lookupPresetModel(model.id);
  if (known) return isContext1m(known.contextWindow);
  return isContext1m(fallback);
}

export function formatContextWindow(window: number) {
  if (isContext1m(window)) return "1M";
  if (window % 1000 === 0) return `${window / 1000}K`;
  return String(window);
}

export function parseModelRows(
  models: string | undefined,
  flags: string | undefined,
): { id: string; context1m: boolean }[] {
  const ids = models === undefined || models === "" ? [""] : models.split("\n");
  const bits = (flags ?? "").split("\n");
  return ids.map((id, i) => {
    const bit = bits[i];
    if (bit === "1") return { id, context1m: true };
    if (bit === "0") return { id, context1m: false };
    return {
      id,
      context1m: isContext1m(lookupPresetModel(id)?.contextWindow),
    };
  });
}

export function serializeModelDraft(
  rows: { id: string; context1m: boolean }[],
): { models: string; context1m: string } {
  return {
    models: rows.map((row) => row.id).join("\n"),
    context1m: rows.map((row) => (row.context1m ? "1" : "0")).join("\n"),
  };
}

export function presetDraft(
  preset: ApiPreset,
  regionId?: RegionId,
): Record<string, string> {
  const region =
    preset.regions?.find((item) => item.id === regionId) ?? preset.regions?.[0];
  return {
    name: preset.name,
    route: preset.route,
    baseURL: region?.baseURL ?? preset.baseURL ?? "",
    api: preset.api,
    ...serializeModelDraft(
      preset.models.map((item) => ({
        id: item.id,
        context1m: isContext1m(item.contextWindow),
      })),
    ),
    defaultContextWindow: preset.defaultContextWindow ?? "",
    defaultMaxTokens: preset.defaultMaxTokens ?? "",
  };
}
