import type { Protocol } from "./protocol.js";

export type RegionId = "china" | "overseas";

export interface ApiRegion {
  id: RegionId;
  labelKey: "regionChina" | "regionOverseas";
  baseURL: string;
  anthropicURL?: string;
  aliases?: readonly string[];
}

export interface ApiPreset {
  id: string;
  name: string;
  route: string;
  api: Protocol;
  models: string;
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

/** Known OpenAI-compatible (or Anthropic Messages) APIs for the custom llm-pi-ai form. */
export const API_PRESETS: readonly ApiPreset[] = [
  {
    id: "zcode",
    name: "ZCode",
    route: "zcode",
    api: "openai-completions",
    models: "glm-5.3-flash\nglm-5.3\nglm-5.2\nglm-5-turbo",
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
    defaultContextWindow: "1048576",
    defaultMaxTokens: "131072",
  },
  {
    id: "mimo",
    name: "MiMo",
    route: "mimo",
    api: "openai-completions",
    models: "mimo-v2.5-pro\nmimo-v2.5",
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
    defaultContextWindow: "1048576",
    defaultMaxTokens: "131072",
  },
  {
    id: "minimax",
    name: "MiniMax",
    route: "minimax",
    api: "openai-completions",
    models: "MiniMax-M3\nMiniMax-M2.7\nMiniMax-M2.7-highspeed",
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
    defaultContextWindow: "1048576",
    defaultMaxTokens: "131072",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    route: "openrouter",
    api: "openai-completions",
    baseURL: "https://openrouter.ai/api/v1",
    models: "openai/gpt-4o-mini\ngoogle/gemini-2.5-flash",
  },
  {
    id: "siliconflow",
    name: "SiliconFlow",
    route: "siliconflow",
    api: "openai-completions",
    models: "deepseek-ai/DeepSeek-V3.2",
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
    models: "kimi-k2.5",
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
    models: "deepseek-chat\ndeepseek-reasoner",
  },
  {
    id: "openai",
    name: "OpenAI",
    route: "openai-api",
    api: "openai-completions",
    baseURL: "https://api.openai.com/v1",
    models: "gpt-4.1-mini",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    route: "anthropic-api",
    api: "anthropic-messages",
    baseURL: "https://api.anthropic.com",
    models: "claude-sonnet-4-5",
  },
  {
    id: "groq",
    name: "Groq",
    route: "groq",
    api: "openai-completions",
    baseURL: "https://api.groq.com/openai/v1",
    models: "llama-3.3-70b-versatile",
  },
  {
    id: "together",
    name: "Together",
    route: "together",
    api: "openai-completions",
    baseURL: "https://api.together.xyz/v1",
    models: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  },
  {
    id: "fireworks",
    name: "Fireworks",
    route: "fireworks",
    api: "openai-completions",
    baseURL: "https://api.fireworks.ai/inference/v1",
    models: "accounts/fireworks/models/llama-v3p3-70b-instruct",
  },
  {
    id: "dashscope",
    name: "DashScope",
    route: "dashscope",
    api: "openai-completions",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: "qwen-plus",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    route: "gemini-api",
    api: "openai-completions",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: "gemini-2.5-flash",
  },
  {
    id: "mistral",
    name: "Mistral",
    route: "mistral",
    api: "openai-completions",
    baseURL: "https://api.mistral.ai/v1",
    models: "mistral-small-latest",
  },
  {
    id: "meta",
    name: "Meta Model API",
    route: "meta",
    api: "openai-responses",
    baseURL: "https://api.meta.ai/v1",
    models: "muse-spark-1.3\nmuse-spark-1.3-contributor",
    defaultContextWindow: "1048576",
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
    models: preset.models,
    defaultContextWindow: preset.defaultContextWindow ?? "",
    defaultMaxTokens: preset.defaultMaxTokens ?? "",
  };
}
