import type { Context } from "@deepseek-ai/cordis";
import type { ConnectionHandle } from "@deepseek-ai/dsh-client-connection/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import { Controller } from "./controller.js";
import { installConfigFormsCompat } from "./config-forms-compat.js";
import { createTransport } from "./transport.js";
import { ProviderManager } from "./ProviderManager.js";
import { en, zh, type LocaleKey } from "./locales.js";
import { styles } from "./styles.js";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    "provider-manager": LocaleKey;
  }
}
export const inject = ["slots", "locale", "connection"];
export function apply(ctx: Context & { connection: ConnectionHandle }) {
  installConfigFormsCompat(ctx);
  ctx.effect(() => ctx.locale.register("provider-manager", { en, zh }));
  ctx.effect(() => {
    const style = document.createElement("style");
    style.textContent = styles;
    document.head.append(style);
    return () => style.remove();
  });
  const subscribeConnection = (listener: (connected: boolean) => void) =>
    ctx.connection.generation.subscribe(() =>
      listener(!!ctx.connection.generation.getSnapshot()),
    );
  ctx.slots.inject("settings.section", () =>
    ctx.slots.register(
      {
        name: "settings.section",
        id: "provider-manager",
        order: 21,
        label: () => ctx.locale.bind("provider-manager")("nav"),
        locale: "provider-manager",
        inject: () => ({
          createController: () =>
            new Controller(createTransport(ctx.connection.rpc)),
          subscribeConnection,
        }),
      },
      ProviderManager,
    ),
  );
}
