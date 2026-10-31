import type { Context } from "@deepseek-ai/cordis";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import { LlmError, assertUsableApiKey } from "@deepseek-ai/dsh-llm";
import type {
  Api,
  Model,
  ProviderStreams,
  StreamOptions,
} from "@earendil-works/pi-ai";
import { normalizeContext } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import type { ResolvedPiAiProviderProfile } from "@deepseek-ai/dsh-llm-pi-ai";
import {
  CC_ENDPOINT,
  CC_KEY,
  CC_NAME,
  CC_ROUTE,
  fetchCcCatalog,
  type CcCatalogEntry,
} from "./catalog.js";
import { CC_SEED } from "./seed.js";
import { createProvider } from "@earendil-works/pi-ai";

/** Command Code never documents Anthropic beta features. Null suppresses pi-ai defaults. */
function wrapCcApi(api: ProviderStreams): ProviderStreams {
  return {
    ...api,
    stream: (model: Model<Api>, context, options?: StreamOptions) => {
      const headers = Object.fromEntries(
        Object.entries(options?.headers ?? {}).map(([key, value]) => [
          key.toLowerCase(),
          value,
        ]),
      );
      if (model.api === "anthropic-messages") headers["anthropic-beta"] = null;
      return api.stream(model, normalizeContext(context), {
        ...options,
        headers,
      });
    },
    streamSimple: (model: Model<Api>, context, options?: StreamOptions) => {
      const headers = Object.fromEntries(
        Object.entries(options?.headers ?? {}).map(([key, value]) => [
          key.toLowerCase(),
          value,
        ]),
      );
      if (model.api === "anthropic-messages") headers["anthropic-beta"] = null;
      return api.streamSimple(model, normalizeContext(context), {
        ...options,
        headers,
      });
    },
  };
}

/**
 * Effort levels proven against the live Command Code endpoint (2026-10-31,
 * key-authenticated streaming probes that checked the response content, not
 * just the status code). The gateway validates `reasoning_effort` against
 * off|low|medium|high|xhigh|max — "none" is a hard 400. Per family:
 * deepseek/* honors "off" (reasoning stops, content flows); z-ai/* accepts
 * "off" at the gateway but returns a silently empty stream, so GLM gets no
 * off level. `thinking: {type:"disabled"}` is ignored by the endpoint, and
 * "minimal" is not in the gateway vocabulary, so it stays hidden (null).
 */
const CC_EFFORTS_DEEPSEEK: Record<string, string | null> = {
  off: "off",
  minimal: null,
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max",
};
const CC_EFFORTS_ZAI: Record<string, string | null> = {
  off: null,
  minimal: null,
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max",
};

/** Per-vendor effort map for probe-verified families, else undefined. */
function ccEfforts(id: string): Record<string, string | null> | undefined {
  if (id.startsWith("deepseek/")) return CC_EFFORTS_DEEPSEEK;
  if (id.startsWith("z-ai/")) return CC_EFFORTS_ZAI;
  return undefined;
}

/** Convert one live catalog entry into a pi-ai Model on this route. */
export function toCcModel(entry: CcCatalogEntry): Model<Api> {
  const efforts = ccEfforts(entry.id);
  return {
    id: entry.id,
    name: entry.name,
    provider: CC_ROUTE,
    baseUrl: CC_ENDPOINT,
    api: entry.api,
    reasoning: efforts !== undefined,
    ...(efforts ? { thinkingLevelMap: efforts } : {}),
    input: ["text"],
    contextWindow: entry.contextWindow,
    maxTokens: Math.min(entry.contextWindow, 128_000),
    // pi-ai's calculateCost() dereferences model.cost on every completed
    // stream; a subscription channel reports zero-cost accounting.
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  } as unknown as Model<Api>;
}

/**
 * Built-in Command Code adapter. The process starts from a static seed of
 * the provider catalog (see seed.ts) so synchronous model lookups succeed on
 * the very first headless run; the first authenticated stream then refreshes
 * the list live from GET /provider/v1/models, and a refresh failure keeps
 * the previous list.
 */
export function createBuiltInCcAdapter(ctx: Context): PiAiAdapter {
  let models: Model<Api>[] = CC_SEED.map(toCcModel);
  let catalogError: string | undefined;

  async function refreshCatalog(apiKey: string): Promise<void> {
    try {
      const entries = await fetchCcCatalog(apiKey);
      models = entries.map((entry) => ({
        ...(toCcModel(entry) as Model<Api>),
        contextWindow: entry.contextWindow,
        maxTokens: Math.min(entry.contextWindow, 128_000),
      })) as Model<Api>[];
      catalogError = undefined;
    } catch (error) {
      catalogError = error instanceof Error ? error.message : String(error);
      if (models.length === 0)
        throw new LlmError(
          `Command Code catalog unavailable: ${catalogError}`,
          "CATALOG_UNAVAILABLE",
        );
    }
  }

  const adapter = new PiAiAdapter({
    profiles: () => new Map([[CC_ROUTE, buildProfile()]]),
    auth: {
      credentials: {
        read: async () => undefined,
        list: async () => [],
        modify: async () => {
          throw new Error("Command Code uses the DSH API key service");
        },
        delete: async () => {
          throw new Error("Command Code uses the DSH API key service");
        },
      },
      authContext: {
        env: async () => undefined,
        fileExists: async () => false,
      },
    },
    resolveApiKey: async (_provider, profile) => {
      const hit = await ctx.credentials.resolve(profile.apiKeyEnv!);
      if (!hit?.value)
        throw new LlmError(
          `Provider Manager: store ${CC_KEY} before using Command Code`,
          "MISSING_CREDENTIAL",
        );
      if (models.length === 0) await refreshCatalog(hit.value);
      return assertUsableApiKey(hit.value, CC_ROUTE, CC_KEY);
    },
    resolveAttachments: () => ctx.get("attachments"),
    resolveImageAccess: (attachments, ref) => undefined as never,
  }) as PiAiAdapter;

  function buildProfile(): ResolvedPiAiProviderProfile {
    return {
      provider: CC_ROUTE,
      displayName: CC_NAME,
      apiKeyEnv: credentialRef(CC_KEY),
      streamIdleTimeoutMs: 300_000,
      maxRequestImageBytes: 20 * 1024 * 1024,
      requestImagePixelBudget: 2048 * 2048,
      requestImageMaxBytes: 1024 * 1024,
      retryPolicy: resolveRetryPolicy(undefined, CC_ROUTE),
      modelErrors: new Map(),
      configuredMaxTokens: new Map(),
      piProvider: createProvider({
        id: CC_ROUTE,
        name: CC_NAME,
        baseUrl: CC_ENDPOINT,
        models: models,
        auth: {
          apiKey: {
            name: CC_NAME,
            resolve: async ({ credential }) => ({
              auth:
                credential?.key === undefined ? {} : { apiKey: credential.key },
              source: CC_NAME,
            }),
          },
        },
        api: {
          "openai-completions": wrapCcApi(openAICompletionsApi()),
          "anthropic-messages": wrapCcApi(anthropicMessagesApi()),
        },
      }),
    };
  }

  return adapter;
}
