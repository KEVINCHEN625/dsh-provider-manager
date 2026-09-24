import type { Context } from "@deepseek-ai/cordis";
import { MUSE_NAME, MUSE_ROUTE } from "./catalog.js";
import { createMuseAdapter } from "./adapter.js";
import { createMuseFlow } from "./flow.js";
import type { MuseDeviceDeps } from "./device.js";

export function installMuseAdapter(ctx: Context) {
  ctx.llm.registerAdapter([MUSE_ROUTE], createMuseAdapter(ctx));
  ctx.llm.registerConfigurableProviders([
    {
      provider: MUSE_ROUTE,
      displayName: MUSE_NAME,
      settingsNs: MUSE_ROUTE,
      settingsPath: [],
      declared: true,
    },
  ]);
}

export function registerMuseFlow(ctx: Context, deps: MuseDeviceDeps = {}) {
  const authorization = ctx.get("authorization") as
    | { registerFlow?: (flow: unknown) => () => void }
    | undefined;
  if (!authorization?.registerFlow) return;
  const dispose = authorization.registerFlow(createMuseFlow(ctx, deps));
  ctx.effect(() => dispose);
}
