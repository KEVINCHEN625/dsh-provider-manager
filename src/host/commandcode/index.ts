import type { Context } from "@deepseek-ai/cordis";
import { CC_ROUTE, CC_NAME, CC_KEY } from "./catalog.js";
import { createBuiltInCcAdapter } from "./adapter.js";
import { ensureSection } from "../compat.js";
import z from "@deepseek-ai/schemastery";

const Settings = z.object({ apiKeyEnv: z.const(CC_KEY).default(CC_KEY) });

/** Mount the built-in Command Code connection on this host. */
export function installBuiltInCc(ctx: Context): void {
  ensureSection(ctx.settings, ctx, CC_ROUTE, Settings, {
    apiKeyEnv: CC_KEY,
  });
  ctx.llm.registerAdapter([CC_ROUTE], createBuiltInCcAdapter(ctx));
  ctx.llm.registerConfigurableProviders([
    {
      provider: CC_ROUTE,
      displayName: CC_NAME,
      settingsNs: CC_ROUTE,
      settingsPath: [],
      declared: true,
    },
  ]);
}
