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
  CC_KEY_2,
  CC_NAME,
  CC_ROUTE,
  fetchCcCatalog,
  type CcCatalogEntry,
} from "./catalog.js";
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
 * key-authenticated probes): chat/completions accepts OpenAI-style
 * `reasoning_effort` for deepseek/* and z-ai/* models, including "none",
 * which fully suppresses reasoning_content. `thinking: {type:"disabled"}` is
 * ignored by the endpoint, so "none" is the only working off switch.
 * "minimal" behaves as an off alias there, so it stays hidden (null).
 */
const CC_EFFORTS: Record<string, string | null> = {
  off: "none",
  minimal: null,
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max",
};

/** Vendor prefixes whose reasoning_effort support is probe-verified. */
function ccReasoning(id: string): boolean {
  return id.startsWith("deepseek/") || id.startsWith("z-ai/");
}

/** Convert one live catalog entry into a pi-ai Model on this route. */
export function toCcModel(entry: CcCatalogEntry): Model<Api> {
  const reasoning = ccReasoning(entry.id);
  return {
    id: entry.id,
    name: entry.name,
    provider: CC_ROUTE,
    baseUrl: CC_ENDPOINT,
    api: entry.api,
    reasoning,
    ...(reasoning ? { thinkingLevelMap: CC_EFFORTS } : {}),
    input: ["text"],
    contextWindow: entry.contextWindow,
    maxTokens: Math.min(entry.contextWindow, 128_000),
    // pi-ai's calculateCost() dereferences model.cost on every completed
    // stream; a subscription channel reports zero-cost accounting.
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  } as unknown as Model<Api>;
}

/**
 * Built-in Command Code adapter. The catalog is pulled live from
 * GET /provider/v1/models (95 entries at authoring time) and cached for the
 * process lifetime; a refresh failure keeps the previous list.
 */
export function createBuiltInCcAdapter(ctx: Context): PiAiAdapter {
  let models: Model<Api>[] = [];
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

  // Keep the profile's model list in sync with the catalog after the first
  // authenticated refresh.
  const originalResolveModel = adapter.resolveModel.bind(adapter);
  adapter.resolveModel = (provider, model, signal) => {
    if (models.length === 0) {
      const ref = credentialRef(CC_KEY).toString();
      return Promise.reject(
        new LlmError(
          `Command Code: catalog not loaded yet (store ${CC_KEY} and retry)`,
          "CATALOG_PENDING",
        ),
      );
    }
    return originalResolveModel(provider, model, signal);
  };

  return adapter;
}
