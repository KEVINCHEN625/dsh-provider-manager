import { randomUUID } from "node:crypto";
import {
  createProvider,
  type Api,
  type Model,
  type ProviderStreams,
  type StreamOptions,
} from "@earendil-works/pi-ai";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import type { ResolvedPiAiProviderProfile } from "@deepseek-ai/dsh-llm-pi-ai";
import {
  GO_ROUTE,
  GO_NAME,
  GO_ENDPOINT,
  GO_KEY,
  GO_MODELS,
  GO_MANAGER_VERSION,
} from "./catalog.js";
import { isMuseResponses, sanitizeMusePayload } from "./policies/responses.js";
import { normalizeReasoningContentContext } from "./policies/completions.js";
import { wrapMessagesApi } from "./policies/messages.js";
export { sanitizeMusePayload, isMuseResponses } from "./policies/responses.js";
export { normalizeDeepSeekContext } from "./policies/completions.js";
/** Return the original stream synchronously: no iterator or lifecycle ownership. */
export function wrapGoApi(api: ProviderStreams): ProviderStreams {
  function optionsFor(
    model: Model<Api>,
    options?: StreamOptions,
  ): StreamOptions {
    const headers = Object.fromEntries(
      Object.entries(options?.headers ?? {}).map(([key, value]) => [
        key.toLowerCase(),
        value,
      ]),
    );
    headers["x-opencode-session"] = options?.sessionId || randomUUID();
    headers["user-agent"] = [
      headers["user-agent"],
      `dsh-provider-manager/${GO_MANAGER_VERSION}`,
    ]
      .filter(Boolean)
      .join(" ");
    if (model.api === "anthropic-messages") headers["anthropic-beta"] = null;
    // Go docs do not document Anthropic beta features. Null suppresses pi-ai's
    // default interleaved-thinking / tool-streaming beta headers. pi-ai 0.85.1
    // still calls client.beta.messages, which appends ?beta=true; drop that
    // query so the request matches the official /zen/go/v1/messages path.
    const callerFetch = options?.fetch;
    return {
      ...options,
      headers,
      ...(model.api === "anthropic-messages"
        ? {
            fetch: (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
              const base = callerFetch ?? fetch;
              if (typeof input === "string" || input instanceof URL) {
                const url = new URL(input);
                if (url.search === "?beta=true") url.search = "";
                return base(url, init);
              }
              return base(input, init);
            },
          }
        : {}),
      ...(isMuseResponses(model)
        ? {
            async onPayload(payload: unknown, callbackModel: Model<Api>) {
              const replacement = await options?.onPayload?.(
                payload,
                callbackModel,
              );
              return sanitizeMusePayload(
                replacement === undefined ? payload : replacement,
                model,
              );
            },
          }
        : {}),
    };
  }
  return {
    ...api,
    stream: (model, context, options) =>
      api.stream(
        model,
        normalizeReasoningContentContext(context, model),
        optionsFor(model, options),
      ),
    streamSimple: (model, context, options) =>
      api.streamSimple(
        model,
        normalizeReasoningContentContext(context, model),
        {
          ...options,
          ...optionsFor(model, options),
        },
      ),
  };
}
export function createBuiltInGoProfile(): ResolvedPiAiProviderProfile {
  return {
    provider: GO_ROUTE,
    displayName: GO_NAME,
    apiKeyEnv: credentialRef(GO_KEY),
    streamIdleTimeoutMs: 300000,
    maxRequestImageBytes: 20 * 1024 * 1024,
    requestImagePixelBudget: 2048 * 2048,
    requestImageMaxBytes: 1024 * 1024,
    retryPolicy: resolveRetryPolicy(undefined, GO_ROUTE),
    modelErrors: new Map(),
    configuredMaxTokens: new Map(),
    piProvider: createProvider({
      id: GO_ROUTE,
      name: GO_NAME,
      baseUrl: GO_ENDPOINT,
      models: GO_MODELS,
      auth: {
        apiKey: {
          name: GO_NAME,
          resolve: async ({ credential }) => ({
            auth:
              credential?.key === undefined ? {} : { apiKey: credential.key },
            source: GO_NAME,
          }),
        },
      },
      api: {
        "openai-responses": wrapGoApi(openAIResponsesApi()),
        "openai-completions": wrapGoApi(openAICompletionsApi()),
        "anthropic-messages": wrapGoApi(
          wrapMessagesApi(anthropicMessagesApi()),
        ),
      },
    }),
  };
}
