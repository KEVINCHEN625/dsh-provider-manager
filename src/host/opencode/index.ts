import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { GO_ROUTE, GO_NAME, GO_KEY } from "./catalog.js";
import { createBuiltInGoAdapter } from "./adapter.js";
export * from "./catalog.js";
export * from "./catalog-schema.js";
export * from "./profile.js";
export * from "./adapter.js";
const Settings = z.object({ apiKeyEnv: z.const(GO_KEY).default(GO_KEY) });
export function installBuiltInGo(ctx: Context) {
  ctx.settings.installSection(
    ctx,
    GO_ROUTE,
    Settings,
    { apiKeyEnv: GO_KEY },
    { setSource: () => {}, onChange: () => {} },
  );
  ctx.llm.registerAdapter([GO_ROUTE], createBuiltInGoAdapter(ctx));
  ctx.llm.registerConfigurableProviders([
    {
      provider: GO_ROUTE,
      displayName: GO_NAME,
      settingsNs: GO_ROUTE,
      settingsPath: [],
      declared: true,
    },
  ]);
}
