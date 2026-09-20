import { createHmac, randomBytes } from "node:crypto";
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
type Services = Pick<Context, "settings" | "credentials" | "llm">;
export interface Config {
  authorizedExistingRefs?: Record<string, string>;
  revealTimeoutMs?: number;
}
const fixed: Record<string, { ns: string; ref: string; name: string }> = {
  "opencode-go": {
    ns: "llm-opencode-go",
    ref: "OPENCODE_API_KEY",
    name: "OpenCode Go",
  },
  commandcode: {
    ns: "llm-commandcode",
    ref: "COMMANDCODE_API_KEY",
    name: "Command Code GOAT",
  },
};
const reserved = new Set([
  "opencode-go",
  "commandcode",
  "deepseek-official",
  "cliproxy",
  "muse-code",
  "constructor",
  "prototype",
  "__proto__",
]);
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
  ) {}
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
    const f = fixed[id];
    const route = f ? id : id.slice(7);
    const d = this.descriptors().find((d) => d.ns === (f?.ns ?? "llm-pi-ai"));
    const card: Provider = {
      id,
      name: f?.name ?? route,
      available: this.services.llm.listProviders().some((p) => p.id === route),
      revision: d?.revision ?? 0,
      models: [],
    };
    if (id === "commandcode")
      card.notice =
        "默认引用管理：字面 apiKey、多账户及官方 auth.json 可能优先或 fallback。本页不读取登录文件、不代表每次请求实际 key；套餐资格请在原插件确认。原入口：设置 → Models / Command Code。";
    if (id === "opencode-go")
      card.notice =
        "保留原插件套餐过滤与额度入口：设置 → LLM Providers → OpenCode Go。";
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
      }
    } catch {
      card.error = "REF_NOT_ALLOWED";
    }
    try {
      card.models = (await this.services.llm.listModels(route)).map((m) => ({
        id: m.id,
        name: m.name,
        ...("api" in m && typeof m.api === "string" ? { api: m.api } : {}),
      }));
    } catch {
      card.catalogError = "UNAVAILABLE";
    }
    return card;
  }
  async snapshot(): Promise<Snapshot> {
    const d = this.descriptors().find((d) => d.ns === "llm-pi-ai");
    const providers = d ? object(d.value).providers : undefined;
    const ids = [
      ...Object.keys(fixed),
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
      const id = text(m);
      const old = existingModels.find((model) => object(model).id === id);
      return old ?? { id };
    });
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
