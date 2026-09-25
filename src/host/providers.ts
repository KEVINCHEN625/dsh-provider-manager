import {
  GO_ROUTE,
  GO_NAME,
  GO_KEY,
  GO_CATALOG,
  catalogModelDto,
} from "./opencode/catalog.js";
import { createHmac, randomBytes } from "node:crypto";
import z from "@deepseek-ai/schemastery";
import { ProbeRowSchema } from "./oauth-routes.js";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-settings";
import type {} from "@deepseek-ai/dsh-llm";
import {
  exact,
  object,
  text,
  protocols,
  SafeError,
  type Provider,
  type Snapshot,
  type Protocol,
} from "../shared/protocol.js";
import { detectMuse } from "./muse.js";
import {
  QuotaReader,
  commandSourceAmbiguous,
  unofficialEndpoint,
  untilAborted,
  OPENCODE_USAGE_URL,
  COMMAND_CREDITS_URL,
} from "./quota.js";
import type { QuotaSnapshot } from "../shared/protocol.js";
type Services = Pick<Context, "settings" | "credentials" | "llm"> & {
  get?(name: string): unknown;
};
export interface Config {
  authorizedExistingRefs?: Record<string, string>;
  revealTimeoutMs?: number;
}

/**
 * The full plugin Config schema. On dsh 0.1.7 the Loader collects this
 * declaratively as the `dsh-provider-manager` settings section; on 0.1.5 the
 * same shape is installed imperatively via `ensureSection`. The four owned
 * OAuth fields mirror `OwnedOAuthSchema` so both hosts read one section.
 */
/**
 * Mark a schema field volatile on hosts whose schemastery supports it.
 * dsh 0.1.7 requires volatile fields for the declarative settings section;
 * 0.1.5's schemastery predates the method and the imperative install path
 * there never reads the flag — returning the field unmarked is correct.
 */
function vol(field: any): any {
  return typeof field?.volatile === "function" ? field.volatile() : field;
}

export const ConfigSchema: any = z.object({
  authorizedExistingRefs: z.dict(z.string()).default({}),
  revealTimeoutMs: z.number().step(1).min(1).default(30_000),
  // volatile: dsh 0.1.7 only collects volatile fields into the settings form
  // (volatileForm in dsh-settings); without it the section never appears and
  // describe()/mutate() reject the entry. 0.1.5 ignores the flag harmlessly.
  ownedOauthRoutes: vol(z.dict(z.boolean()).default({})),
  probe: vol(z.dict(ProbeRowSchema).default({})),
  selections: vol(z.dict(z.array(z.string())).default({})),
  credential: vol(z.dict(z.string()).default({})),
  goApiKeyEnv: vol(z.string().role("credential-ref").default("OPENCODE_API_KEY")),
});
const fixed: Record<string, { ns: string; ref: string; name: string }> = {
  "opencode-go": {
    ns: "llm-opencode-go",
    ref: "OPENCODE_API_KEY",
    name: "OpenCode Go (legacy plugin)",
  },
  commandcode: {
    ns: "llm-commandcode",
    ref: "COMMANDCODE_API_KEY",
    name: "Command Code GOAT",
  },
  [GO_ROUTE]: { ns: GO_ROUTE, ref: GO_KEY, name: GO_NAME },
};
const quotaDefinitions: Record<
  string,
  {
    source: NonNullable<QuotaSnapshot["source"]>;
    url: string;
    kind: "opencode" | "command";
    endpointKind: "opencode-go" | "commandcode";
  }
> = Object.fromEntries([
  [
    "opencode-go",
    {
      source: "opencode-official",
      url: OPENCODE_USAGE_URL,
      kind: "opencode",
      endpointKind: "opencode-go",
    },
  ],
  [
    GO_ROUTE,
    {
      source: "opencode-official",
      url: OPENCODE_USAGE_URL,
      kind: "opencode",
      endpointKind: "opencode-go",
    },
  ],
  [
    "commandcode",
    {
      source: "command-default-reference",
      url: COMMAND_CREDITS_URL,
      kind: "command",
      endpointKind: "commandcode",
    },
  ],
]);
// The legacy management card is retired. The route stays reserved and the
// shared OPENCODE_API_KEY binding stays usable by the built-in card.
const retiredCards = new Set(["opencode-go"]);
const reserved = new Set([
  GO_ROUTE,
  "provider-manager-muse",
  "opencode-go",
  "commandcode",
  "deepseek-official",
  "cliproxy",
  "muse-code",
  "constructor",
  "prototype",
  "__proto__",
]);
function parseSavedModel(value: unknown): {
  id: string;
  contextWindow?: number;
} {
  if (typeof value === "string") return { id: text(value) };
  const entry = object(value);
  if (Object.keys(entry).some((key) => key !== "id" && key !== "contextWindow"))
    throw new SafeError("INVALID_INPUT");
  const parsed: { id: string; contextWindow?: number } = { id: text(entry.id) };
  if (entry.contextWindow !== undefined) {
    if (
      !Number.isSafeInteger(entry.contextWindow) ||
      (entry.contextWindow as number) < 1 ||
      (entry.contextWindow as number) > 16_777_216
    )
      throw new SafeError("INVALID_INPUT");
    parsed.contextWindow = entry.contextWindow as number;
  }
  return parsed;
}
export function canonicalRef(route: string) {
  return (
    "DSH_PROVIDER_MANAGER_" + Buffer.from(route).toString("hex") + "_API_KEY"
  );
}
export class Manager {
  private salt = randomBytes(32);
  constructor(
    private services: Services,
    private config: Config = {},
    private quotaReader: QuotaReader = new QuotaReader(),
  ) {}
  disposeQuota() {
    this.quotaReader.dispose();
  }
  dispose() {
    this.disposeQuota();
  }
  private customExists(route: string) {
    const d = this.descriptors().find((item) => item.ns === "llm-pi-ai");
    const value = d?.value;
    const providers =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>).providers
        : undefined;
    if (
      providers &&
      typeof providers === "object" &&
      !Array.isArray(providers) &&
      Object.hasOwn(providers, route)
    )
      return true;
    if (this.services.llm.listProviders().some((item) => item.id === route))
      return true;
    return this.services.llm
      .listConfigurableProviders()
      .some((item) => item.provider === route);
  }
  async quota(input: unknown, signal?: AbortSignal): Promise<QuotaSnapshot> {
    signal?.throwIfAborted();
    const p = exact(input, ["providerId", "bindingToken", "refresh"]);
    const providerId = text(p.providerId);
    if (p.refresh !== undefined && typeof p.refresh !== "boolean")
      throw new SafeError("INVALID_INPUT");
    if (p.bindingToken !== undefined && typeof p.bindingToken !== "string")
      throw new SafeError("INVALID_INPUT");
    if (providerId.startsWith("custom:")) {
      if (!this.customExists(providerId.slice(7)))
        throw new SafeError("INVALID_INPUT");
      return {
        providerId,
        status: "unsupported",
        windows: [],
        stale: false,
      };
    }
    const quota = Object.hasOwn(quotaDefinitions, providerId)
      ? quotaDefinitions[providerId]
      : undefined;
    if (!quota) throw new SafeError("INVALID_INPUT");
    const { source } = quota;
    const timeoutSnapshot = (): QuotaSnapshot => ({
      providerId,
      source,
      status: "error",
      error: "TIMEOUT",
      windows: [],
      stale: false,
    });
    let binding: ReturnType<Manager["binding"]>;
    try {
      binding = this.binding(providerId);
    } catch (error) {
      if (error instanceof SafeError && error.code === "REF_NOT_ALLOWED")
        return {
          providerId,
          source,
          status: "missing-credential",
          windows: [],
          stale: false,
        };
      throw error;
    }
    if (p.bindingToken && p.bindingToken !== binding.token)
      throw new SafeError("BINDING_CHANGED");
    const profile = binding.profile as Record<string, unknown>;
    if (unofficialEndpoint(quota.endpointKind, profile))
      return {
        providerId,
        source,
        status: "unsupported",
        windows: [],
        stale: false,
      };
    if (
      providerId === "commandcode" &&
      commandSourceAmbiguous(
        profile,
        binding.d.secrets as { path: string[]; set: boolean }[] | undefined,
      )
    )
      return {
        providerId,
        source,
        status: "source-unverified",
        windows: [],
        stale: false,
      };
    const bound = this.quotaReader.bindDeadline(signal);
    try {
      const resolve = () =>
        this.services.credentials.resolve(credentialRef(binding.ref));
      let resolved: Awaited<ReturnType<typeof resolve>>;
      try {
        resolved = await untilAborted(resolve(), bound.signal);
      } catch (error) {
        if (bound.timedOut()) return timeoutSnapshot();
        throw error;
      }
      const key =
        typeof resolved?.value === "string" ? resolved.value.trim() : "";
      if (!key)
        return {
          providerId,
          source,
          status: "missing-credential",
          windows: [],
          stale: false,
        };
      const credentialSource =
        typeof resolved?.source === "string" ? resolved.source : undefined;
      let latest: ReturnType<Manager["binding"]>;
      try {
        latest = this.binding(providerId);
      } catch (error) {
        if (error instanceof SafeError && error.code === "REF_NOT_ALLOWED")
          return {
            providerId,
            source,
            status: "missing-credential",
            windows: [],
            stale: false,
          };
        throw error;
      }
      if (latest.token !== binding.token)
        throw new SafeError("BINDING_CHANGED");
      let again: Awaited<ReturnType<typeof resolve>>;
      try {
        again = await untilAborted(
          this.services.credentials.resolve(credentialRef(latest.ref)),
          bound.signal,
        );
      } catch (error) {
        if (bound.timedOut()) return timeoutSnapshot();
        throw error;
      }
      const againKey =
        typeof again?.value === "string" ? again.value.trim() : "";
      if (againKey !== key || again?.source !== credentialSource) {
        if (!againKey)
          return {
            providerId,
            source,
            status: "missing-credential",
            windows: [],
            stale: false,
          };
        return {
          providerId,
          source,
          status: "error",
          error: "UNAVAILABLE",
          windows: [],
          stale: false,
        };
      }
      return await this.quotaReader.load({
        providerId,
        source,
        url: quota.url,
        kind: quota.kind,
        bindingToken: binding.token,
        credentialSource,
        key,
        refresh: p.refresh === true,
        signal: bound.signal,
        timedOut: bound.timedOut,
        stillCurrent: async () => {
          bound.signal.throwIfAborted();
          const live = this.binding(providerId);
          if (live.token !== binding.token) return false;
          const now = await untilAborted(
            this.services.credentials.resolve(credentialRef(live.ref)),
            bound.signal,
          );
          return now?.value === key && now?.source === credentialSource;
        },
      });
    } catch (error) {
      if (bound.timedOut()) return timeoutSnapshot();
      throw error;
    } finally {
      bound.dispose();
    }
  }
  descriptors() {
    return this.services.settings.describe({ redactSecrets: true });
  }
  binding(id: string) {
    const defs = this.descriptors();
    const f = fixed[id];
    if (!f && !id.startsWith("custom:")) throw new SafeError("REF_NOT_ALLOWED");
    const route = id.startsWith("custom:") ? id.slice(7) : id;
    const ns = f?.ns ?? "llm-pi-ai";
    const d = defs.find((d) => d.ns === ns);
    if (!d) throw new SafeError("UNAVAILABLE");
    const v = object(d.value);
    const profile = f ? v : object(object(v.providers)[route]);
    const ref =
      typeof profile.apiKeyEnv === "string" ? profile.apiKeyEnv : f?.ref;
    let allowed = f ? ref === f.ref : false;
    if (!f) {
      const catalog = this.services.llm.listConfigurableProviders();
      const entry = catalog.find((p) => p.provider === route);
      if (
        reserved.has(route) ||
        (entry &&
          (entry.settingsNs !== "llm-pi-ai" || entry.declared !== true)) ||
        (!entry &&
          this.services.llm.listProviders().some((p) => p.id === route))
      )
        throw new SafeError("REF_NOT_ALLOWED");
      allowed =
        !reserved.has(route) &&
        /^[a-z][a-z0-9-]*$/.test(route) &&
        ref === canonicalRef(route) &&
        protocols.includes(profile.api as Protocol) &&
        (!entry ||
          (entry.settingsNs === "llm-pi-ai" && entry.declared === true));
    }
    allowed ||=
      typeof ref === "string" &&
      this.config.authorizedExistingRefs?.[id] === ref;
    if (!allowed || !ref) throw new SafeError("REF_NOT_ALLOWED");
    const token = createHmac("sha256", this.salt)
      .update(JSON.stringify([id, ns, ref, d.revision]))
      .digest("hex");
    return { ref, token, d, profile, route, ns };
  }
  check(input: unknown, save = false) {
    const p = exact(
      input,
      save
        ? ["providerId", "bindingToken", "value"]
        : ["providerId", "bindingToken"],
    );
    const b = this.binding(text(p.providerId));
    if (p.bindingToken !== b.token) throw new SafeError("BINDING_CHANGED");
    return { p, b };
  }
  async set(input: unknown, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const { p, b } = this.check(input, true);
    const value = text(p.value, 16384);
    const ref = credentialRef(b.ref);
    if (!(await this.services.credentials.describe(ref)).writable)
      throw new SafeError("READ_ONLY");
    signal?.throwIfAborted();
    this.check(input, true);
    await this.services.credentials.set(ref, value);
    for (const [id, definition] of Object.entries(fixed))
      if (definition.ref === b.ref) this.quotaReader.invalidate(id);
    this.quotaReader.invalidate(text(p.providerId));
    const info = await this.services.credentials.describe(ref);
    return {
      configured: info.configured,
      writable: info.writable,
      source: info.source,
    };
  }
  async reveal(input: unknown, signal?: AbortSignal) {
    const { b } = this.check(input);
    signal?.throwIfAborted();
    const result = await this.services.credentials.resolve(
      credentialRef(b.ref),
    );
    signal?.throwIfAborted();
    this.check(input);
    if (!result) throw new SafeError("UNAVAILABLE");
    return {
      value: result.value,
      source: result.source,
      revealTTL: Math.min(
        30000,
        Math.max(1000, this.config.revealTimeoutMs ?? 30000),
      ),
    };
  }
  async card(id: string): Promise<Provider> {
    if (retiredCards.has(id)) throw new SafeError("INVALID_INPUT");
    const f = fixed[id];
    if (!f && (!id.startsWith("custom:") || id.length <= "custom:".length))
      throw new SafeError("INVALID_INPUT");
    const route = f ? id : id.slice(7);
    const d = this.descriptors().find((d) => d.ns === (f?.ns ?? "llm-pi-ai"));
    const card: Provider = {
      id,
      name: f?.name ?? route,
      available: this.services.llm.listProviders().some((p) => p.id === route),
      revision: d?.revision ?? 0,
      models: [],
    };
    const savedWindows = new Map<string, number>();
    try {
      const b = this.binding(id);
      const info = await this.services.credentials.describe(
        credentialRef(b.ref),
      );
      card.bindingToken = b.token;
      card.credential = {
        configured: info.configured,
        writable: info.writable,
        source: info.source,
      };
      if (!f) {
        card.baseURL =
          typeof b.profile.baseURL === "string" ? b.profile.baseURL : undefined;
        card.api = b.profile.api as Protocol;
        card.name =
          typeof b.profile.displayName === "string"
            ? b.profile.displayName
            : route;
        for (const k of ["defaultContextWindow", "defaultMaxTokens"] as const)
          if (typeof b.profile[k] === "number") card[k] = b.profile[k];
        const listed = b.profile.models;
        if (Array.isArray(listed))
          for (const item of listed) {
            if (!item || typeof item !== "object" || Array.isArray(item))
              continue;
            const entry = item as Record<string, unknown>;
            if (
              typeof entry.id === "string" &&
              typeof entry.contextWindow === "number" &&
              Number.isSafeInteger(entry.contextWindow) &&
              entry.contextWindow >= 1
            )
              savedWindows.set(entry.id, entry.contextWindow);
          }
      }
    } catch {
      card.error = "REF_NOT_ALLOWED";
    }
    try {
      const listed = await this.services.llm.listModels(route);
      if (id === GO_ROUTE) {
        card.catalogCheckedAt = GO_CATALOG.checkedAt;
        card.models = GO_CATALOG.models.map((entry) => {
          const live = listed.find((item) => item.id === entry.id);
          return {
            ...catalogModelDto(entry),
            ...(live?.name ? { name: live.name } : {}),
          };
        });
      } else
        card.models = listed.map((m) => {
          const contextWindow = savedWindows.get(m.id);
          return {
            id: m.id,
            name: m.name,
            ...("api" in m && typeof m.api === "string" ? { api: m.api } : {}),
            ...(contextWindow !== undefined ? { contextWindow } : {}),
          };
        });
    } catch {
      card.catalogError = "UNAVAILABLE";
    }
    return card;
  }
  async snapshot(): Promise<Snapshot> {
    const d = this.descriptors().find((d) => d.ns === "llm-pi-ai");
    const providers = d ? object(d.value).providers : undefined;
    const ids = [
      ...Object.keys(fixed).filter((id) => !retiredCards.has(id)),
      ...Object.keys(
        providers && typeof providers === "object" ? providers : {},
      ).map((r) => "custom:" + r),
    ];
    return {
      settingsWritable: this.services.settings.writable,
      providers: await Promise.all(
        ids.map(async (id) => {
          try {
            return await this.card(id);
          } catch {
            return {
              id,
              name: id,
              available: false,
              revision: 0,
              models: [],
              error: "UNAVAILABLE",
            };
          }
        }),
      ),
      customRevision: d?.revision ?? 0,
      muse: {
        installed: await detectMuse(),
        status: "CLI_ONLY",
        docs: "https://dev.meta.ai/docs/muse-code/subscriptions",
      },
      oauth: [],
    };
  }
  async save(input: unknown) {
    if (!this.services.settings.writable) throw new SafeError("READ_ONLY");
    const p = exact(input, [
      "route",
      "name",
      "baseURL",
      "api",
      "models",
      "revision",
      "editing",
      "defaultContextWindow",
      "defaultMaxTokens",
    ]);
    const route = text(p.route);
    if (!/^[a-z][a-z0-9-]*$/.test(route)) throw new SafeError("INVALID_INPUT");
    if (reserved.has(route)) throw new SafeError("CONFLICT");
    if (!Number.isInteger(p.revision)) throw new SafeError("INVALID_INPUT");
    const d = this.descriptors().find((d) => d.ns === "llm-pi-ai");
    if (!d) throw new SafeError("UNAVAILABLE");
    if (d.revision !== p.revision) throw new SafeError("CONFLICT");
    const providers = object(object(d.value).providers ?? {});
    const existing = Object.hasOwn(providers, route);
    const catalog = this.services.llm.listConfigurableProviders();
    const conflict =
      existing ||
      this.services.llm.listProviders().some((x) => x.id === route) ||
      catalog.some((x) => x.provider === route);
    if (conflict) {
      if (p.editing !== true || !existing) throw new SafeError("CONFLICT");
      this.binding("custom:" + route);
    }
    const url = new URL(text(p.baseURL, 2048));
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new SafeError("INVALID_INPUT");
    if (
      !protocols.includes(p.api as Protocol) ||
      !Array.isArray(p.models) ||
      !p.models.length ||
      p.models.length > 500
    )
      throw new SafeError("INVALID_INPUT");
    const existingModels =
      existing && Array.isArray(object(providers[route]).models)
        ? (object(providers[route]).models as unknown[])
        : [];
    const models = p.models.map((m) => {
      const parsed = parseSavedModel(m);
      const old = existingModels.find(
        (model) => object(model).id === parsed.id,
      );
      const next: Record<string, unknown> = {
        ...(old && typeof old === "object" && !Array.isArray(old)
          ? (old as Record<string, unknown>)
          : {}),
        id: parsed.id,
      };
      if (parsed.contextWindow !== undefined)
        next.contextWindow = parsed.contextWindow;
      return next;
    });
    if (new Set(models.map((model) => model.id)).size !== models.length)
      throw new SafeError("INVALID_INPUT");
    const advanced: Record<string, number> = {};
    for (const key of ["defaultContextWindow", "defaultMaxTokens"])
      if (p[key] !== undefined) {
        if (!Number.isSafeInteger(p[key]) || (p[key] as number) < 1)
          throw new SafeError("INVALID_INPUT");
        advanced[key] = p[key] as number;
      }
    const fields = {
      ...advanced,
      displayName: text(p.name),
      baseURL: url.toString(),
      api: p.api,
      models,
      apiKeyEnv: existing
        ? this.binding("custom:" + route).ref
        : canonicalRef(route),
    };
    try {
      await this.services.settings.mutate(
        "llm-pi-ai",
        Object.entries(fields).map(([field, value]) => ({
          op: "set" as const,
          path: ["providers", route, field],
          value,
        })),
        p.revision as number,
      );
    } catch (e) {
      if (
        (e as { code?: string }).code?.includes("CONFLICT") ||
        (e as Error).name === "SettingsConflictError"
      )
        throw new SafeError("CONFLICT");
      throw new SafeError("UNAVAILABLE");
    }
    return { saved: true };
  }
}
