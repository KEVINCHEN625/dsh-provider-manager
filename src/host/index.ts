import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-connection";
import type {} from "@deepseek-ai/dsh-host-webserver";
import { Manager, type Config } from "./providers.js";
import { createRevealHandler } from "./http.js";
import { exact, text, SafeError } from "../shared/protocol.js";
export const inject = ["settings", "credentials", "llm"];
export function apply(ctx: Context, config: Config = {}) {
  const manager = new Manager(ctx, config);
  ctx.inject(["connection", "webServer"], (scope) => {
    const lifetime = new AbortController();
    scope.effect(() => () => lifetime.abort());
    // Cordis 4 scopes getter-returned RPC closures through a shadow Context.
    // Expose the already injected carrier on this same-fiber Context so the
    // public Connection helper can read it without borrowing its owner fiber.
    const rpcOwner = scope.extend({ webServer: scope.webServer });
    scope.effect(() =>
      rpcOwner.connection.rpc.handle(
        "/provider-manager",
        async (endpoint, payload, signal) => {
          try {
            signal.throwIfAborted();
            lifetime.signal.throwIfAborted();
            let value: unknown;
            switch (endpoint) {
              case "snapshot":
                exact(payload, []);
                value = await manager.snapshot();
                break;
              case "credential/set":
                value = await manager.set(
                  payload,
                  AbortSignal.any([signal, lifetime.signal]),
                );
                break;
              case "provider/save":
                value = await manager.save(payload);
                break;
              case "models/refresh": {
                const p = exact(payload, ["providerId"]);
                value = await manager.card(text(p.providerId));
                break;
              }
              default:
                throw new SafeError("UNSUPPORTED");
            }
            signal.throwIfAborted();
            lifetime.signal.throwIfAborted();
            return { ok: true, value };
          } catch (e) {
            return {
              ok: false,
              error: {
                code: e instanceof SafeError ? e.code : "UNAVAILABLE",
                message: e instanceof SafeError ? e.code : "UNAVAILABLE",
                details: {},
              },
            };
          }
        },
      ),
    );
    scope.effect(() =>
      scope.webServer.register({
        kind: "exact",
        path: "/provider-manager/reveal",
        handler: createRevealHandler(
          manager,
          (req) => scope.connection.requestRejection(req),
          lifetime.signal,
        ),
      }),
    );
  });
}
