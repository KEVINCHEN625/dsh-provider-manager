import type { ClientConnectionRpc } from "@deepseek-ai/dsh-client-connection/client";
import type { Transport } from "./controller.js";
import { errorCode } from "./controller.js";
export function createTransport(
  rpc: ClientConnectionRpc,
  fetcher: typeof fetch = fetch,
): Transport {
  return {
    async rpc(endpoint, payload, signal) {
      const result = await rpc.call(
        "/provider-manager",
        endpoint,
        payload,
        signal,
      );
      if (!result.ok) throw { code: errorCode(result.error) };
      return result.value;
    },
    async reveal(payload, signal) {
      const response = await fetcher("/provider-manager/reveal", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw { code: errorCode({ code: result.error }) };
      if (
        typeof result.value !== "string" ||
        typeof result.revealTTL !== "number"
      )
        throw { code: "UNAVAILABLE" };
      return {
        value: result.value,
        source: typeof result.source === "string" ? result.source : undefined,
        revealTTL: result.revealTTL,
      };
    },
  };
}
