import type { Context } from "@deepseek-ai/cordis";
import { credentialKey } from "@deepseek-ai/dsh-credentials";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import { LlmError, assertUsableApiKey } from "@deepseek-ai/dsh-llm";
import { accessTokenFromRecord } from "../oauth-usage.js";
import { MUSE_KEY_ID, MUSE_KEY_SCOPE, MUSE_ROUTE } from "./catalog.js";
import { createMuseProfile } from "./profile.js";

export function createMuseAdapter(ctx: Context): PiAiAdapter {
  const profiles = new Map([[MUSE_ROUTE, createMuseProfile()]]);
  const key = credentialKey(MUSE_KEY_SCOPE, MUSE_KEY_ID);
  return new PiAiAdapter({
    profiles: () => profiles,
    auth: {
      credentials: {
        read: async () => undefined,
        list: async () => [],
        modify: async () => {
          throw new Error("Muse uses the Provider Manager credential");
        },
        delete: async () => {
          throw new Error("Muse uses the Provider Manager credential");
        },
      },
      authContext: {
        env: async () => undefined,
        fileExists: async () => false,
      },
    },
    resolveApiKey: async () => {
      const record = await ctx.credentials.readRecord(key);
      const access = accessTokenFromRecord(record);
      if (!access)
        throw new LlmError(
          "Provider Manager: sign in to Muse before using this route",
          "MISSING_CREDENTIAL",
        );
      return assertUsableApiKey(access, MUSE_ROUTE, key);
    },
  });
}
