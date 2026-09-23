import { installBuiltInGo } from "./opencode/index.js";
export {
  createBuiltInGoProfile,
  createBuiltInGoAdapter,
  GO_ROUTE,
  GO_MODELS,
  GO_CATALOG,
  GO_MANAGER_VERSION,
  GO_ANTHROPIC_BASE,
  requireGoModel,
  goEntry,
} from "./opencode/index.js";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-connection";
import type {} from "@deepseek-ai/dsh-host-webserver";
import { Manager, type Config } from "./providers.js";
import { createRevealHandler } from "./http.js";
import { exact, text, SafeError } from "../shared/protocol.js";
export const inject = ["settings", "credentials", "llm"];
export function apply(ctx: Context, config: Config = {}) {
  installBuiltInGo(ctx);
  const manager = new Manager(ctx, config);
  ctx.effect(() => () => manager.dispose());
  ctx.inject(["connection", "webServer"], (scope) => {
    const lifetime = new AbortController();
    scope.effect(() => () => {
      lifetime.abort();
      manager.dispose();
    });
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
              case "quota/read":
                value = await manager.quota(
                  payload,
                  AbortSignal.any([signal, lifetime.signal]),
                );
                break;
              case "login/start":
                value = manager.logins.start(payload);
                break;
              case "login/events":
                value = manager.logins.events(payload);
                break;
              case "login/answer":
                value = manager.logins.answer(payload);
                break;
              case "login/cancel":
                value = manager.logins.cancel(payload);
                break;
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
