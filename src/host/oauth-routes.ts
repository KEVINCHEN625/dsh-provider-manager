import z from "@deepseek-ai/schemastery";
import { ensureSection, hostSectionNs } from "./compat.js";
import { SafeError } from "../shared/protocol.js";
import {
  HOST_THINKING_LEVELS,
  type OAuthCatalogModel,
  type OAuthRouteState,
} from "../shared/protocol.js";
import {
  displayModelName,
  reasoningEfforts,
  type AvailabilityModel,
} from "./oauth-catalog.js";

export const OWNED_OAUTH_NS = "dsh-provider-manager";
export const ProbeRowSchema: any = z.object({
  status: z.union([
    z.const("available"),
    z.const("unavailable"),
    z.const("unverified"),
  ]),
  verifiedAt: z.string(),
  cooledUntil: z.number(),
  servedModel: z.string().required(false),
  noneEnabled: z.boolean().required(false),
});
const OwnedOAuthSchema = z.object({
  ownedOauthRoutes: z.dict(z.boolean()).default({}),
  probe: z.dict(ProbeRowSchema).default({}),
  selections: z.dict(z.array(z.string())).default({}),
  credential: z.dict(z.string()).default({}),
});

export function installOwnedRoutes(settings: SettingsSurface, owner: unknown) {
  ensureSection(settings, owner, OWNED_OAUTH_NS, OwnedOAuthSchema, {
    ownedOauthRoutes: {},
    probe: {},
    selections: {},
    credential: {},
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
  const marked = hasManagedMark(profile);
  const models = profile.models;
  const pinned = Array.isArray(models) && models.length > 0;
  const foreign = Object.keys(profile).filter(
    (key) => key !== "models" && key !== "displayName",
  );
  if (marked || (owned && foreign.length === 0))
    return pinned ? "pinned" : "empty";
  if (Object.keys(profile).length === 0) return "empty";
  return "custom";
}

export const MANAGED_MARK = "(Provider Manager)";

export function managedDisplayName(label: string) {
  const name = label.trim();
  if (!name) return `Provider ${MANAGED_MARK}`;
  return name.includes(MANAGED_MARK) ? name : `${name} ${MANAGED_MARK}`;
}

export function hasManagedMark(profile: unknown) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile))
    return false;
  const displayName = (profile as { displayName?: unknown }).displayName;
  return typeof displayName === "string" && displayName.includes(MANAGED_MARK);
}

function injectedName(model: OAuthCatalogModel) {
  if (model.name && model.name !== model.id) return model.name;
  return displayModelName(model.id);
}

/** Available rows become selector entries. A row without a spec keeps id and name. */
export function selectorModels(models: readonly OAuthCatalogModel[]) {
  return models.flatMap((model) => {
    if (!model.available) return [];
    const name = injectedName(model);
    const efforts = Object.fromEntries(
      Object.entries(
        reasoningEfforts(model.efforts, {
          noneEnabled: model.noneEnabled === true,
        }),
      ).filter(([key]) =>
        (HOST_THINKING_LEVELS as readonly string[]).includes(key),
      ),
    );
    const ready =
      !model.pendingProbe &&
      model.contextWindow !== undefined &&
      model.maxTokens !== undefined &&
      Object.keys(efforts).length > 0;
    if (!ready) return [{ id: model.id, name }];
    return [
      {
        id: model.id,
        name,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        reasoningEfforts: efforts,
      },
    ];
  });
}

export function modelProfiles(models: readonly OAuthCatalogModel[]) {
  return selectorModels(models).filter((model) => "reasoningEfforts" in model);
}

export class OAuthRoutes {
  private memoryOwned = new Set<string>();
  constructor(private settings: SettingsSurface | undefined) {}
  async onAuthorized(
    providerId: string,
    label: string,
    models: readonly OAuthCatalogModel[],
  ) {
    return this.writeManaged(providerId, label, models);
  }
  async activate(
    providerId: string,
    label: string,
    models: readonly OAuthCatalogModel[],
  ) {
    if (!this.settings) throw new SafeError("UNAVAILABLE");
    if (this.state(providerId) === "custom") throw new SafeError("UNSUPPORTED");
    return this.writeManaged(providerId, label, models);
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
  async writeManaged(
    providerId: string,
    label: string,
    models: readonly OAuthCatalogModel[],
  ) {
    if (!this.settings) return { written: false };
    const state = this.state(providerId);
    if (state === "custom") return { written: false };
    const nextModels = selectorModels(models);
    if (nextModels.length < 1) return { written: false };
    const current = this.userProfile(providerId);
    const preserved =
      current && typeof current === "object" && !Array.isArray(current)
        ? Object.fromEntries(
            Object.entries(current as Record<string, unknown>).filter(
              ([key]) => key !== "models" && key !== "displayName",
            ),
          )
        : {};
    const currentName =
      current &&
      typeof current === "object" &&
      !Array.isArray(current) &&
      typeof (current as { displayName?: unknown }).displayName === "string"
        ? (current as { displayName: string }).displayName
        : undefined;
    const value = {
      ...preserved,
      displayName:
        currentName && hasManagedMark(current) ? currentName : managedDisplayName(label),
      models: nextModels,
    };
    if (JSON.stringify(current) === JSON.stringify(value))
      return { written: false };
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
  async syncPinned(
    providerId: string,
    label: string,
    models: readonly OAuthCatalogModel[],
  ) {
    if (this.state(providerId) !== "pinned") return false;
    const result = await this.writeManaged(providerId, label, models);
    return result.written;
  }
  catalogOverlay(providerId: string): {
    local: AvailabilityModel[];
    picks: string[];
  } {
    const owned = this.ownedValue();
    const probe = record(owned.probe);
    const local: AvailabilityModel[] = [];
    const cooledPrefix = `${providerId}::`;
    for (const [key, value] of Object.entries(probe)) {
      if (!key.startsWith(cooledPrefix)) continue;
      const row = record(value);
      const status = row.status;
      if (status !== "available" && status !== "unavailable" && status !== "unverified")
        continue;
      const id = key.slice(cooledPrefix.length);
      if (!id) continue;
      local.push({
        id,
        available: status === "available",
        status,
        source: "probe",
        verifiedAt:
          typeof row.verifiedAt === "string" ? row.verifiedAt : "1970-01-01",
        ...(typeof row.servedModel === "string" ? { servedModel: row.servedModel } : {}),
        ...(row.noneEnabled === true ? { noneEnabled: true } : {}),
      });
    }
    const selections = record(owned.selections);
    const picks = Array.isArray(selections[providerId])
      ? selections[providerId].filter((item): item is string => typeof item === "string")
      : [];
    return { local, picks };
  }
  cooledUntil(providerId: string): Record<string, number> {
    const probe = record(this.ownedValue().probe);
    const prefix = `${providerId}::`;
    const cooled: Record<string, number> = {};
    for (const [key, value] of Object.entries(probe)) {
      if (!key.startsWith(prefix)) continue;
      const row = record(value);
      if (typeof row.cooledUntil === "number")
        cooled[key.slice(prefix.length)] = row.cooledUntil;
    }
    return cooled;
  }
  credentialState(providerId: string): "ok" | "expired" | undefined {
    const credential = record(this.ownedValue().credential);
    const value = credential[providerId];
    return value === "expired" || value === "ok" ? value : undefined;
  }
  async rememberProbe(
    providerId: string,
    modelId: string,
    row: {
      status: "available" | "unavailable" | "unverified";
      verifiedAt: string;
      cooledUntil: number;
      servedModel?: string;
      noneEnabled?: boolean;
    },
  ) {
    if (!this.section(OWNED_OAUTH_NS)) return;
    await this.mutate(OWNED_OAUTH_NS, [
      {
        op: "set",
        path: ["probe", `${providerId}::${modelId}`],
        value: row,
      },
    ]);
  }
  async rememberCredential(providerId: string, state: "ok" | "expired") {
    if (!this.section(OWNED_OAUTH_NS)) return;
    await this.mutate(OWNED_OAUTH_NS, [
      { op: "set", path: ["credential", providerId], value: state },
    ]);
  }
  async addSelection(providerId: string, modelId: string) {
    if (!this.section(OWNED_OAUTH_NS)) return;
    const current = this.catalogOverlay(providerId).picks;
    if (current.includes(modelId)) return;
    await this.mutate(OWNED_OAUTH_NS, [
      {
        op: "set",
        path: ["selections", providerId],
        value: [...current, modelId].slice(0, 50),
      },
    ]);
  }
  private ownedValue(): Record<string, unknown> {
    const section = this.section(OWNED_OAUTH_NS);
    const value = section?.user;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
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
    const listed = this.settings?.describe({ redactSecrets: true }) ?? [];
    const direct = listed.find((item) => item.ns === ns);
    if (direct) return direct;
    // 0.1.7 derives the namespace from the profile entry id instead of the
    // package name ("dsh-provider-manager" -> "provider-manager").
    const entryId = ns.replace(/^dsh-/, "");
    return listed.find((item) => item.ns === entryId);
  }
  private async mutate(
    requestedNs: string,
    ops: { op: "set" | "unset"; path: string[]; value?: unknown }[],
  ) {
    const ns =
      hostSectionNs(this.settings, requestedNs, requestedNs.replace(/^dsh-/, "")) ??
      requestedNs;
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

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
