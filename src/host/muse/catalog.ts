import type { Api, Model } from "@earendil-works/pi-ai";

export const MUSE_ROUTE = "provider-manager-muse";
export const MUSE_NAME = "Muse (Provider Manager)";
export const MUSE_ENDPOINT = "https://api.meta.ai/v1";
export const MUSE_CLIENT_ID = "1031625952748946";
export const MUSE_DEVICE_URL =
  "https://auth.meta.com/oidc/device/authorization/";
export const MUSE_TOKEN_URL = "https://auth.meta.com/oidc/device/token/";
export const MUSE_MINT_URL = "https://api.meta.ai/muse-code/key";
export const MUSE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
export const MUSE_POLL_MS = 5_000;
export const MUSE_POLL_LIMIT_MS = 15 * 60_000;
export const MUSE_KEY_SCOPE = "provider-manager";
export const MUSE_KEY_ID = "muse";

const efforts = {
  off: null,
  minimal: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
} as const;

function model(
  id: string,
  name: string,
  max: boolean,
): Model<Api> {
  return {
    id,
    name,
    provider: MUSE_ROUTE,
    api: "openai-responses",
    baseUrl: MUSE_ENDPOINT,
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    thinkingLevelMap: max ? { ...efforts, max: "max" } : { ...efforts, max: null },
    compat: {
      supportsDeveloperRole: false,
      supportsLongCacheRetention: false,
      supportsStrictMode: false,
      supportsOpenAIGrammarTools: false,
      supportsToolSearch: false,
      supportsExplicitPromptCacheMode: false,
    },
  };
}

export const MUSE_MODELS: Model<Api>[] = [
  model("muse-spark-1.3", "Muse Spark 1.3", true),
  model("muse-spark-1.3-contributor", "Muse Spark 1.3 Contributor", false),
  model("muse-spark-1.2-contributor", "Muse Spark 1.2 Contributor", false),
];

export const MUSE_MODEL_IDS = new Set(MUSE_MODELS.map((item) => item.id));
