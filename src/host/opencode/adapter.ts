import type { Context } from "@deepseek-ai/cordis";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import {
  LlmError,
  assertUsableApiKey,
  resolveImageAttachmentAccess,
} from "@deepseek-ai/dsh-llm";
import { GO_ROUTE, GO_KEY, GO_KEY_2 } from "./catalog.js";
import { goSlotOrder, readGoPreferred } from "./pool.js";
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
    resolveApiKey: async (_provider, _profile) => {
      // Key pool: the preferred slot (persisted via readGoPreferred, default
      // primary = the earliest-configured ref) is tried first; the other slot
      // answers only when the preferred one has no usable key.
      const preferred = await readGoPreferred((ref) =>
        ctx.credentials.resolve(ref),
      );
      for (const ref of goSlotOrder(preferred)) {
        const hit = await ctx.credentials.resolve(credentialRef(ref));
        if (hit?.value) return assertUsableApiKey(hit.value, GO_ROUTE, ref);
      }
      throw new LlmError(
        `Provider Manager: store ${GO_KEY} (and optionally ${GO_KEY_2}) before using OpenCode Go`,
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
