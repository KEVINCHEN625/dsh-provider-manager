import z from "@deepseek-ai/schemastery";
import { SafeError } from "../shared/protocol.js";
import type { OAuthCatalogModel, OAuthRouteState } from "../shared/protocol.js";
import { reasoningEfforts } from "./oauth-catalog.js";

export const OWNED_OAUTH_NS = "dsh-provider-manager";
const OwnedOAuthSchema = z.object({
  ownedOauthRoutes: z.dict(z.boolean()).default({}),
});

export function installOwnedRoutes(settings: SettingsSurface, owner: unknown) {
  settings.installSection?.(owner, OWNED_OAUTH_NS, OwnedOAuthSchema, {
    ownedOauthRoutes: {},
  }, {
    setSource: () => {},
    onChange: () => {},
  });
}

export interface SettingsSection {
  ns: string;
  revision: number;
  value: unknown;
  user?: unknown;
}

export interface SettingsSurface {
  describe(options?: { redactSecrets?: boolean }): SettingsSection[];
  mutate(
    ns: string,
    ops: { op: "set" | "unset"; path: string[]; value?: unknown }[],
    revision: number,
  ): Promise<void>;
  installSection?(
    owner: unknown,
    ns: string,
    schema: unknown,
    entry: unknown,
    hooks: {
      setSource: () => void;
      onChange: () => void;
    },
  ): void;
}

export function routeState(
  userProfile: unknown,
  owned: boolean,
): OAuthRouteState {
  if (!userProfile || typeof userProfile !== "object" || Array.isArray(userProfile))
    return "missing";
  const profile = userProfile as Record<string, unknown>;
  const models = profile.models;
  const pinned = Array.isArray(models) && models.length > 0;
  const extra = Object.keys(profile).filter((key) => key !== "models");
  if ((pinned || extra.length > 0) && !owned) return "custom";
  if (pinned) return "pinned";
  return "empty";
}

export function modelProfiles(models: readonly OAuthCatalogModel[]) {
  return models.flatMap((model) => {
    if (
      !model.available ||
      model.contextWindow === undefined ||
      model.maxTokens === undefined ||
      model.efforts.length < 1 ||
      model.input.length < 1
    )
      return [];
    const efforts = reasoningEfforts(model.efforts);
    if (!Object.keys(efforts).some((key) => key !== "off")) return [];
    return [
      {
        id: model.id,
        name: model.name,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        input: [...model.input],
        reasoningEfforts: efforts,
      },
    ];
  });
}

export class OAuthRoutes {
  private memoryOwned = new Set<string>();
  constructor(private settings: SettingsSurface | undefined) {}
  async onAuthorized(providerId: string, models: readonly OAuthCatalogModel[]) {
    return this.write(providerId, models, "login");
  }
  async activate(providerId: string, models: readonly OAuthCatalogModel[]) {
    return this.write(providerId, models, "explicit");
  }
  async reset(providerId: string) {
    if (!this.owned(providerId)) throw new SafeError("UNSUPPORTED");
    await this.mutate("llm-pi-ai", [
      { op: "unset", path: ["providers", providerId, "models"] },
    ]);
    return { reset: true };
  }
  async removeOwned(providerId: string) {
    if (!this.owned(providerId)) return false;
    await this.mutate("llm-pi-ai", [
      { op: "unset", path: ["providers", providerId] },
    ]);
    this.memoryOwned.delete(providerId);
    if (this.section(OWNED_OAUTH_NS))
      await this.mutate(OWNED_OAUTH_NS, [
        { op: "unset", path: ["ownedOauthRoutes", providerId] },
      ]);
    return true;
  }
  state(providerId: string): OAuthRouteState {
    return routeState(this.userProfile(providerId), this.owned(providerId));
  }
  owned(providerId: string) {
    if (this.memoryOwned.has(providerId)) return true;
    const section = this.section(OWNED_OAUTH_NS);
    const value = section?.user;
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const routes = (value as { ownedOauthRoutes?: unknown }).ownedOauthRoutes;
    return (
      !!routes &&
      typeof routes === "object" &&
      !Array.isArray(routes) &&
      (routes as Record<string, unknown>)[providerId] === true
    );
  }
  private async write(
    providerId: string,
    models: readonly OAuthCatalogModel[],
    mode: "login" | "explicit",
  ) {
    const state = this.state(providerId);
    if (mode === "login" && state !== "missing") return { written: false };
    if (mode === "explicit" && state === "custom")
      throw new SafeError("UNSUPPORTED");
    if (mode === "explicit" && state === "pinned") return { written: false };
    const profiles = modelProfiles(models);
    const value = profiles.length > 0 ? { models: profiles } : {};
    await this.mutate("llm-pi-ai", [
      { op: "set", path: ["providers", providerId], value },
    ]);
    this.memoryOwned.add(providerId);
    if (this.section(OWNED_OAUTH_NS))
      await this.mutate(OWNED_OAUTH_NS, [
        {
          op: "set",
          path: ["ownedOauthRoutes", providerId],
          value: true,
        },
      ]);
    return { written: true };
  }
  async syncPinned(providerId: string, models: readonly OAuthCatalogModel[]) {
    if (this.state(providerId) !== "pinned") return false;
    const next = modelProfiles(models);
    if (next.length < 1) return false;
    const current = this.userProfile(providerId);
    const existing =
      current && typeof current === "object" && !Array.isArray(current)
        ? (current as { models?: unknown }).models
        : undefined;
    if (JSON.stringify(existing) === JSON.stringify(next)) return false;
    await this.mutate("llm-pi-ai", [
      { op: "set", path: ["providers", providerId], value: { models: next } },
    ]);
    return true;
  }
  private userProfile(providerId: string): unknown {
    const section = this.section("llm-pi-ai");
    const source = section?.user;
    if (!source || typeof source !== "object" || Array.isArray(source))
      return undefined;
    const providers = (source as { providers?: unknown }).providers;
    if (!providers || typeof providers !== "object" || Array.isArray(providers))
      return undefined;
    if (!Object.hasOwn(providers, providerId)) return undefined;
    return (providers as Record<string, unknown>)[providerId];
  }
  private section(ns: string) {
    return this.settings
      ?.describe({ redactSecrets: true })
      .find((item) => item.ns === ns);
  }
  private async mutate(
    ns: string,
    ops: { op: "set" | "unset"; path: string[]; value?: unknown }[],
  ) {
    const settings = this.settings;
    if (!settings) throw new SafeError("UNAVAILABLE");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const section = settings
        .describe({ redactSecrets: true })
        .find((item) => item.ns === ns);
      if (!section) throw new SafeError("UNAVAILABLE");
      try {
        await settings.mutate(ns, ops, section.revision);
        return;
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (attempt === 0 && code?.includes("CONFLICT")) continue;
        if (code?.includes("CONFLICT") || (error as Error).name === "SettingsConflictError")
          throw new SafeError("CONFLICT");
        throw new SafeError("UNAVAILABLE");
      }
    }
  }
}
