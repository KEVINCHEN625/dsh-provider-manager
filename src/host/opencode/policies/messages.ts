import type {
  Api,
  Context,
  Model,
  ProviderStreamOptions,
  ProviderStreams,
  SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { goEntry } from "../catalog.js";
const ANSWER_ROOM = 1024;
function messagesOptions(
  model: Model<Api>,
  options: SimpleStreamOptions | undefined,
): ProviderStreamOptions {
  const entry = goEntry(model.id);
  const base: ProviderStreamOptions = { ...options };
  if (!entry || model.api !== "anthropic-messages") return base;
  if (entry.compatPolicy === "anthropic-toggle") {
    return {
      ...base,
      thinkingEnabled: Boolean(options?.reasoning),
      interleavedThinking: false,
    };
  }
  if (entry.compatPolicy === "anthropic-budget") {
    if (!options?.reasoning) return { ...base, thinkingEnabled: false };
    const preset = entry.localBudgetPresets.find(
      (item) => item.id === options.reasoning,
    );
    const outputCap = options.maxTokens ?? entry.maxOutputTokens ?? ANSWER_ROOM;
    const nativeMax = entry.budgetTokensMax ?? outputCap;
    const tokens = Math.min(
      preset?.tokens ?? ANSWER_ROOM,
      nativeMax,
      Math.max(0, outputCap - ANSWER_ROOM),
    );
    return {
      ...base,
      thinkingEnabled: true,
      thinkingBudgetTokens: tokens,
      maxTokens: outputCap,
      interleavedThinking: false,
    };
  }
  return base;
}
export function wrapMessagesApi(api: ProviderStreams): ProviderStreams {
  return {
    ...api,
    stream: (
      model: Model<Api>,
      context: Context,
      options?: ProviderStreamOptions,
    ) => api.stream(model, context, options),
    streamSimple: (
      model: Model<Api>,
      context: Context,
      options?: SimpleStreamOptions,
    ) => {
      const entry = goEntry(model.id);
      if (
        entry?.compatPolicy === "anthropic-toggle" ||
        entry?.compatPolicy === "anthropic-budget"
      )
        return api.stream(model, context, messagesOptions(model, options));
      return api.streamSimple(model, context, options);
    },
  };
}
