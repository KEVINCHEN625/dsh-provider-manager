import type { Context } from "@deepseek-ai/cordis";
import AuthorizationService from "@deepseek-ai/dsh-authorization";
import type {} from "@deepseek-ai/dsh-client-connection";
import type {} from "@deepseek-ai/dsh-host-webserver";
import { exact, SafeError } from "../shared/protocol.js";
import { authorizationOf } from "./login.js";
import { OAuthHost, type OAuthCredentialStore, type OAuthHostConfig } from "./oauth-host.js";

export const inject = ["credentials"];
export interface OAuthEntryConfig extends OAuthHostConfig {
  mountService?: boolean;
}

export function apply(ctx: Context, config: OAuthEntryConfig = {}) {
  if (config.mountService !== false) {
    try {
      if (!authorizationOf(ctx.get("authorization"))) {
        const mounted = ctx.plugin(AuthorizationService);
        ctx.effect(() => () => {
          void mounted.dispose();
        });
      }
    } catch {
      /* The official service could not be mounted. This row stays quiet. */
    }
  }
  const credentials = credentialStore(ctx);
  // webServer stays a nested inject. A required export inject would leave this
  // row pending on headless and fail the whole boot.
  ctx.inject(["authorization", "connection", "webServer"], (scope) => {
    const authorization = authorizationOf(scope.get("authorization"));
    if (!authorization || !credentials) return;
    const host = new OAuthHost(authorization, credentials, undefined, config);
    const lifetime = new AbortController();
    scope.effect(() => () => {
      lifetime.abort();
      host.dispose();
    });
    // Cordis 4 scopes getter-returned RPC closures through a shadow Context.
    // Expose the already injected carrier on this same-fiber Context so the
    // public Connection helper can read it without borrowing its owner fiber.
    const rpcOwner = scope.extend({ webServer: scope.webServer });
    scope.effect(() =>
      rpcOwner.connection.rpc.handle(
        "/provider-manager-oauth",
        async (endpoint, payload, signal) => {
          try {
            signal.throwIfAborted();
            lifetime.signal.throwIfAborted();
            const combined = AbortSignal.any([signal, lifetime.signal]);
            let value: unknown;
            switch (endpoint) {
              case "oauth/snapshot":
                exact(payload, []);
                value = await host.snapshot(combined);
                break;
              case "oauth/quota":
                value = await host.quota(payload, combined);
                break;
              case "oauth/logout":
                value = await host.logout(payload);
                break;
              case "login/start":
                value = host.logins.start(payload);
                break;
              case "login/events":
                value = host.logins.events(payload);
                break;
              case "login/answer":
                value = host.logins.answer(payload);
                break;
              case "login/cancel":
                value = host.logins.cancel(payload);
                break;
              default:
                throw new SafeError("UNSUPPORTED");
            }
            signal.throwIfAborted();
            lifetime.signal.throwIfAborted();
            return { ok: true, value };
          } catch (error) {
            return {
              ok: false,
              error: {
                code: error instanceof SafeError ? error.code : "UNAVAILABLE",
                message: error instanceof SafeError ? error.code : "UNAVAILABLE",
                details: {},
              },
            };
          }
        },
      ),
    );
  });
}

function credentialStore(ctx: Context): OAuthCredentialStore | undefined {
  const credentials = ctx.get("credentials") as
    | {
        describeRecord?: OAuthCredentialStore["describeRecord"];
        readRecord?: OAuthCredentialStore["readRecord"];
        deleteRecord?: OAuthCredentialStore["deleteRecord"];
      }
    | undefined;
  if (
    !credentials ||
    typeof credentials.describeRecord !== "function" ||
    typeof credentials.readRecord !== "function" ||
    typeof credentials.deleteRecord !== "function"
  )
    return undefined;
  return {
    describeRecord: (key) => credentials.describeRecord!(key),
    readRecord: (key) => credentials.readRecord!(key),
    deleteRecord: (key) => credentials.deleteRecord!(key),
  };
}
