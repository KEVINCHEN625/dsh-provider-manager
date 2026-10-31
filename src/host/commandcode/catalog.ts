import { credentialRef } from "@deepseek-ai/dsh-credentials";

/** Route id for the built-in Command Code connection. */
export const CC_ROUTE = "provider-manager-commandcode";
export const CC_NAME = "Command Code (Provider Manager)";
/** Public Provider API base. Claude models answer on /messages; the rest on /chat/completions (most also on /responses). */
export const CC_ENDPOINT = "https://api.commandcode.ai/provider/v1";
/** Credential refs. GOAT subscriptions authenticate with a Studio API key. */
export const CC_KEY = "COMMANDCODE_API_KEY";
export const CC_KEY_2 = "COMMANDCODE_API_KEY_2";
export const CC_MANAGER_VERSION = "0.5.0";

/** One live entry from GET /provider/v1/models. */
export interface CcCatalogEntry {
  id: string;
  name: string;
  contextWindow: number;
  /** pi-ai protocol chosen from supported_endpoints. */
  api: "anthropic-messages" | "openai-completions";
}

/** Map supported_endpoints onto the pi-ai protocol. Claude answers on /messages only. */
export function ccApiFor(supportedEndpoints: readonly string[]): CcCatalogEntry["api"] {
  if (supportedEndpoints.includes("/messages") && !supportedEndpoints.includes("/chat/completions"))
    return "anthropic-messages";
  return "openai-completions";
}

/** Fetch the live model catalog. Throws on non-200 or a malformed body. */
export async function fetchCcCatalog(apiKey: string): Promise<CcCatalogEntry[]> {
  const response = await fetch(`${CC_ENDPOINT}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok)
    throw new Error(`commandcode: models endpoint returned ${response.status}`);
  const body = (await response.json()) as {
    data?: { id?: unknown; name?: unknown; context_length?: unknown; supported_endpoints?: unknown }[];
  };
  const entries = body.data;
  if (!Array.isArray(entries)) throw new Error("commandcode: malformed models body");
  return entries.flatMap((entry) => {
    if (typeof entry.id !== "string" || entry.id.length === 0) return [];
    const endpoints = Array.isArray(entry.supported_endpoints)
      ? entry.supported_endpoints.filter((e): e is string => typeof e === "string")
      : ["/chat/completions"];
    return [
      {
        id: entry.id,
        name: typeof entry.name === "string" && entry.name.length > 0 ? entry.name : entry.id,
        contextWindow:
          typeof entry.context_length === "number" && entry.context_length > 0
            ? entry.context_length
            : 262_144,
        api: ccApiFor(endpoints),
      },
    ];
  });
}

/** The credential ref for the Command Code key. */
export function ccKeyRef(): string {
  return credentialRef(CC_KEY).toString();
}
