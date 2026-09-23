import type { Api, Context, Model } from "@earendil-works/pi-ai";
import { GO_ROUTE, goEntry } from "../catalog.js";
export function normalizeReasoningContentContext(
  context: Context,
  model: Model<Api>,
): Context {
  if (model.provider !== GO_ROUTE || model.api !== "openai-completions")
    return context;
  if (goEntry(model.id)?.replayField !== "reasoning_content") return context;
  return {
    ...context,
    messages: context.messages.map((message) => {
      if (
        message.role !== "assistant" ||
        message.provider !== model.provider ||
        message.model !== model.id ||
        message.api !== model.api
      )
        return message;
      return {
        ...message,
        content: message.content.map((block) =>
          block.type === "thinking" && block.thinkingSignature === "reasoning"
            ? { ...block, thinkingSignature: "reasoning_content" }
            : block,
        ),
      };
    }),
  };
}
export const normalizeDeepSeekContext = normalizeReasoningContentContext;
