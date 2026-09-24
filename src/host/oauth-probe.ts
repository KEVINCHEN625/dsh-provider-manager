import type { CatalogAvailability } from "../shared/protocol.js";
import { chatgptAccountId } from "./oauth-usage.js";

export const PROBE_BATCH = 8;
export const PROBE_COOLDOWN_MS = 86_400_000;
const OUTPUT_CAP = [
  "max_tokens",
  "max_output_tokens",
  "max_completion_tokens",
  "maxOutputTokens",
] as const;

export interface ProbeTarget {
  id: string;
  status?: CatalogAvailability;
}

export interface ProbeRequest {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export type ProbeClass =
  | { kind: "available"; servedModel?: string }
  | { kind: "unavailable" }
  | { kind: "credential" }
  | { kind: "keep" };

const PROMPT = "Reply ok";

export function assertNoOutputCap(body: unknown) {
  const text = JSON.stringify(body);
  for (const key of OUTPUT_CAP) {
    if (text.includes(`"${key}"`)) throw new Error("probe output cap");
  }
}

export function nextProbeIds(
  models: readonly ProbeTarget[],
  cooledUntil: Readonly<Record<string, number>>,
  now: number,
): string[] {
  const due = models.filter((model) => (cooledUntil[model.id] ?? 0) <= now);
  const unverified = due.filter((model) => (model.status ?? "unverified") === "unverified");
  const rest = due.filter((model) => (model.status ?? "unverified") !== "unverified");
  return [...unverified, ...rest].slice(0, PROBE_BATCH).map((model) => model.id);
}

/** Request shapes. None of them carry an output-cap field. */
export function probeRequest(
  providerId: string,
  modelId: string,
  token: string,
): ProbeRequest | undefined {
  const auth = { authorization: `Bearer ${token}` };
  if (providerId === "openai-codex") {
    const account = chatgptAccountId(token);
    const body = responsesBody(modelId, true);
    return {
      url: "https://chatgpt.com/backend-api/codex/responses",
      method: "POST",
      headers: {
        ...auth,
        accept: "text/event-stream",
        "content-type": "application/json",
        "OpenAI-Beta": "responses=experimental",
        ...(account ? { "chatgpt-account-id": account } : {}),
      },
      body,
    };
  }
  if (providerId === "anthropic" || providerId === "kimi-coding") {
    const root =
      providerId === "anthropic"
        ? "https://api.anthropic.com"
        : "https://api.kimi.com/coding";
    return {
      url: `${root}/v1/messages`,
      method: "POST",
      headers: {
        ...auth,
        accept: "text/event-stream",
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: thinkingBody(modelId),
    };
  }
  if (providerId === "github-copilot") {
    const claude = modelId.toLowerCase().includes("claude");
    return {
      url: claude
        ? "https://api.individual.githubcopilot.com/v1/messages"
        : "https://api.individual.githubcopilot.com/chat/completions",
      method: "POST",
      headers: {
        ...auth,
        accept: "text/event-stream",
        "content-type": "application/json",
        ...(claude ? { "anthropic-version": "2023-06-01" } : {}),
      },
      body: claude ? thinkingBody(modelId) : chatBody(modelId),
    };
  }
  if (providerId === "xai") {
    return {
      url: "https://api.x.ai/v1/responses",
      method: "POST",
      headers: {
        ...auth,
        accept: "text/event-stream",
        "content-type": "application/json",
      },
      body: responsesBody(modelId, true),
    };
  }
  if (providerId === "openrouter") {
    return {
      url: "https://openrouter.ai/api/v1/chat/completions",
      method: "POST",
      headers: {
        ...auth,
        accept: "text/event-stream",
        "content-type": "application/json",
      },
      body: chatBody(modelId),
    };
  }
  return undefined;
}

export function classifyProbe(
  status: number,
  body: string,
  requestedId: string,
): ProbeClass {
  if (status === 401 || status === 403) return { kind: "credential" };
  if (status === 200) {
    const served = servedModel(body);
    if (served && served !== requestedId)
      return { kind: "available", servedModel: served };
    return { kind: "available" };
  }
  if ((status === 400 || status === 404) && modelMissing(body))
    return { kind: "unavailable" };
  return { kind: "keep" };
}

function responsesBody(modelId: string, effort: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: modelId,
    store: false,
    stream: true,
    instructions: PROMPT,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: PROMPT }],
      },
    ],
    text: { verbosity: "low" },
  };
  if (effort) body.reasoning = { effort: "low" };
  assertNoOutputCap(body);
  return body;
}

function thinkingBody(modelId: string): Record<string, unknown> {
  const body = {
    model: modelId,
    stream: true,
    messages: [{ role: "user", content: PROMPT }],
    thinking: { type: "enabled", budget_tokens: 1024 },
  };
  assertNoOutputCap(body);
  return body;
}

function chatBody(modelId: string): Record<string, unknown> {
  const body = {
    model: modelId,
    stream: true,
    messages: [{ role: "user", content: PROMPT }],
  };
  assertNoOutputCap(body);
  return body;
}

function servedModel(body: string): string | undefined {
  const match = /"model"\s*:\s*"([^"]+)"/.exec(body);
  return match?.[1];
}

function modelMissing(body: string): boolean {
  const text = body.toLowerCase();
  return (
    text.includes("model_not_found") ||
    text.includes("unknown model") ||
    text.includes("invalid model") ||
    text.includes("no such model") ||
    text.includes("model does not exist") ||
    text.includes("not a valid model")
  );
}
