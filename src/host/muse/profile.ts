import {
  createProvider,
  type Api,
  type Model,
  type ProviderStreams,
  type StreamOptions,
} from "@earendil-works/pi-ai";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import type { ResolvedPiAiProviderProfile } from "@deepseek-ai/dsh-llm-pi-ai";
import { sanitizeMuseWire } from "../opencode/policies/responses.js";
import {
  MUSE_ENDPOINT,
  MUSE_KEY_ID,
  MUSE_KEY_SCOPE,
  MUSE_MODEL_IDS,
  MUSE_MODELS,
  MUSE_NAME,
  MUSE_ROUTE,
} from "./catalog.js";

function wrapMuseApi(api: ProviderStreams): ProviderStreams {
  const stream = (
    model: Model<Api>,
    context: Parameters<ProviderStreams["stream"]>[1],
    options?: StreamOptions,
  ) =>
    api.stream(model, context, {
      ...options,
      async onPayload(payload, callbackModel) {
        const replacement = await options?.onPayload?.(payload, callbackModel);
        const next = replacement === undefined ? payload : replacement;
        return MUSE_MODEL_IDS.has(model.id)
          ? sanitizeMuseWire(next)
          : next;
      },
    });
  return { ...api, stream, streamSimple: stream };
}

export function createMuseProfile(): ResolvedPiAiProviderProfile {
  const key = `${MUSE_KEY_SCOPE}/${MUSE_KEY_ID}`;
  return {
    provider: MUSE_ROUTE,
    displayName: MUSE_NAME,
    apiKeyEnv: credentialRef(key),
    streamIdleTimeoutMs: 300000,
    maxRequestImageBytes: 20 * 1024 * 1024,
    requestImagePixelBudget: 2048 * 2048,
    requestImageMaxBytes: 1024 * 1024,
    retryPolicy: resolveRetryPolicy(undefined, MUSE_ROUTE),
    modelErrors: new Map(),
    configuredMaxTokens: new Map(),
    piProvider: createProvider({
      id: MUSE_ROUTE,
      name: MUSE_NAME,
      baseUrl: MUSE_ENDPOINT,
      models: MUSE_MODELS,
      auth: {
        apiKey: {
          name: MUSE_NAME,
          resolve: async ({ credential }) => ({
            auth:
              credential?.key === undefined ? {} : { apiKey: credential.key },
            source: MUSE_NAME,
          }),
        },
      },
      api: { "openai-responses": wrapMuseApi(openAIResponsesApi()) },
    }),
  };
}
