import type { Context } from "@deepseek-ai/cordis";
import { credentialKey } from "@deepseek-ai/dsh-credentials";
import type { AuthorizationFlow } from "@deepseek-ai/dsh-authorization";
import { MUSE_KEY_ID, MUSE_KEY_SCOPE, MUSE_NAME } from "./catalog.js";
import { runMuseDeviceFlow, type MuseDeviceDeps } from "./device.js";

export function createMuseFlow(
  ctx: Context,
  deps: MuseDeviceDeps = {},
): AuthorizationFlow {
  const key = credentialKey(MUSE_KEY_SCOPE, MUSE_KEY_ID);
  return {
    key,
    label: MUSE_NAME,
    methods: [{ id: "device", label: "Device code" }],
    async run(session) {
      const credential = await runMuseDeviceFlow(session, deps);
      await ctx.credentials.modifyRecord(key, () =>
        Promise.resolve({
          kind: "grant",
          payload: credential,
        }),
      );
    },
  };
}
