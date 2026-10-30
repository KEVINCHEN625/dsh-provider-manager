import type { Context } from "@deepseek-ai/cordis";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import {
  LlmError,
  assertUsableApiKey,
  resolveImageAttachmentAccess,
} from "@deepseek-ai/dsh-llm";
import { GO_ROUTE, GO_KEY, GO_KEY_2 } from "./catalog.js";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { createBuiltInGoProfile } from "./profile.js";
export function createBuiltInGoAdapter(ctx: Context): PiAiAdapter {
  const profiles = new Map([[GO_ROUTE, createBuiltInGoProfile()]]);
  const adapter = new PiAiAdapter({
    profiles: () => profiles,
    // This closed API-key-only lane never performs ambient discovery or OAuth.
    auth: {
      credentials: {
        read: async () => undefined,
        list: async () => [],
        modify: async () => {
          throw new Error("OpenCode Go uses the DSH API key service");
        },
        delete: async () => {
          throw new Error("OpenCode Go uses the DSH API key service");
        },
      },
      authContext: {
        env: async () => undefined,
        fileExists: async () => false,
      },
    },
    resolveApiKey: async (_provider, profile) => {
      const primary = await ctx.credentials.resolve(profile.apiKeyEnv!);
      if (primary?.value)
        return assertUsableApiKey(primary.value, GO_ROUTE, GO_KEY);
      // Key-pool fallback: when the primary ref is absent or its quota is
      // marked exhausted (the settings layer writes an empty string after a
      // terminal 429/403), try the second ref before giving up.
      const secondary = await ctx.credentials.resolve(credentialRef(GO_KEY_2));
      if (secondary?.value)
        return assertUsableApiKey(secondary.value, GO_ROUTE, GO_KEY_2);
      throw new LlmError(
        `Provider Manager: store ${GO_KEY} (or ${GO_KEY_2}) before using OpenCode Go`,
        "MISSING_CREDENTIAL",
      );
    },
    resolveAttachments: () => ctx.get("attachments"),
    resolveImageAccess: (attachments, ref) =>
      resolveImageAttachmentAccess(
        attachments,
        (hostPath) => ctx.get("fs")?.processPathFromHostPath(hostPath),
        ref,
      ),
  });
  const resolveModel = adapter.resolveModel.bind(adapter);
  const prepareCall = adapter.prepareCall.bind(adapter);
  const hideEmptyReasoning = <
    T extends { reasoning?: { efforts: readonly unknown[] } },
  >(
    info: T,
  ): T => {
    if (info.reasoning && info.reasoning.efforts.length === 0) {
      const { reasoning: _unused, ...rest } = info;
      return rest as T;
    }
    return info;
  };
  adapter.resolveModel = (provider, model, signal) =>
    Promise.resolve(resolveModel(provider, model, signal)).then(
      hideEmptyReasoning,
    );
  adapter.prepareCall = (provider, model, signal) =>
    Promise.resolve(prepareCall(provider, model, signal)).then((call) => ({
      ...call,
      model: hideEmptyReasoning(call.model),
    }));
  return adapter;
}
