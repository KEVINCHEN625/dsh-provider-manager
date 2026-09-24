import { randomBytes } from "node:crypto";
import type { CredentialKey } from "@deepseek-ai/dsh-credentials";
import { credentialKey, isCredentialKeySegment } from "@deepseek-ai/dsh-credentials";
import {
  RECORD_SCOPE,
  SafeError,
  exact,
  text,
  type OAuthEntry,
  type OAuthQuota,
  type QuotaSnapshot,
} from "../shared/protocol.js";
import {
  LoginSessionManager,
  oauthEntries,
  type AuthorizationSurface,
  type RecordInfo,
} from "./login.js";
import { QuotaReader } from "./quota.js";
import {
  OAUTH_QUOTA_TTL_MS,
  accessTokenFromRecord,
  oauthUsageAdapters,
  recordDigest,
} from "./oauth-usage.js";
import { CatalogStore } from "./oauth-catalog.js";
import { OAuthRoutes, type SettingsSurface } from "./oauth-routes.js";
import type { OAuthCatalogView } from "../shared/protocol.js";

export interface OAuthCredentialStore {
  describeRecord(key: CredentialKey): Promise<RecordInfo>;
  readRecord(key: CredentialKey): Promise<unknown>;
  deleteRecord(key: CredentialKey): Promise<void>;
}

export interface OAuthHostConfig {
  oauthQuotaTtlMs?: number;
  oauthCatalogTtlMs?: number;
}

export class OAuthHost {
  readonly logins: LoginSessionManager;
  private routes: OAuthRoutes;
  private catalogs: CatalogStore;
  constructor(
    private authorization: AuthorizationSurface,
    private credentials: OAuthCredentialStore,
    private quotaReader: QuotaReader = new QuotaReader(),
    private config: OAuthHostConfig = {},
    settings?: SettingsSurface,
    catalogs?: CatalogStore,
  ) {
    this.catalogs =
      catalogs ??
      new CatalogStore({ ttlMs: config.oauthCatalogTtlMs });
    this.routes = new OAuthRoutes(settings);
    this.logins = new LoginSessionManager(
      () => this.authorization,
      () => Date.now(),
      () => randomBytes(16).toString("hex"),
      (providerId) => this.afterAuthorized(providerId),
    );
  }
  dispose() {
    this.logins.dispose();
    this.quotaReader.dispose();
  }
  async snapshot(signal?: AbortSignal) {
    const listed = await oauthEntries(
      this.authorization,
      (key) => this.credentials.describeRecord(key),
      (key) => this.credentials.readRecord(key),
    );
    const oauth: OAuthEntry[] = [];
    for (const entry of listed.oauth) {
      if (entry.configured && this.routes.state(entry.providerId) !== "custom") {
        const hit = await this.catalogs.current(entry.providerId, signal);
        await this.routes.writeManaged(entry.providerId, entry.label, hit.models);
      }
      oauth.push(await this.decorate(entry, false, signal));
    }
    return { oauth };
  }
  async quota(input: unknown, signal?: AbortSignal) {
    const parsed = exact(input, ["providerId", "bindingToken", "refresh"]);
    const providerId = text(parsed.providerId);
    if (parsed.refresh !== undefined && typeof parsed.refresh !== "boolean")
      throw new SafeError("INVALID_INPUT");
    if (
      parsed.bindingToken !== undefined &&
      typeof parsed.bindingToken !== "string"
    )
      throw new SafeError("INVALID_INPUT");
    const entry = await this.requireEntry(providerId);
    const record = await this.credentials.readRecord(
      credentialKey(RECORD_SCOPE, providerId),
    );
    const bindingToken = recordDigest(record);
    if (parsed.bindingToken && parsed.bindingToken !== bindingToken)
      throw new SafeError("BINDING_CHANGED");
    return this.decorate(entry, parsed.refresh === true, signal);
  }
  async logout(input: unknown) {
    const parsed = exact(input, ["providerId"]);
    const providerId = text(parsed.providerId);
    if (!isCredentialKeySegment(providerId))
      throw new SafeError("INVALID_INPUT");
    await this.credentials.deleteRecord(credentialKey(RECORD_SCOPE, providerId));
    this.quotaReader.invalidate(`oauth:${providerId}`);
    await this.routes.removeOwned(providerId);
    return { removed: true };
  }
  async catalog(input: unknown, signal?: AbortSignal): Promise<OAuthCatalogView> {
    const providerId = providerIdOf(input);
    await this.requireEntry(providerId);
    return this.view(providerId, signal);
  }
  async activateCatalog(input: unknown, signal?: AbortSignal) {
    const providerId = providerIdOf(input);
    const entry = await this.requireEntry(providerId);
    const hit = await this.catalogs.current(providerId, signal);
    await this.routes.activate(providerId, entry.label, hit.models);
    return this.view(providerId, signal);
  }
  async resetCatalog(input: unknown, signal?: AbortSignal) {
    const providerId = providerIdOf(input);
    await this.requireEntry(providerId);
    await this.routes.reset(providerId);
    return this.view(providerId, signal);
  }
  private async afterAuthorized(providerId: string) {
    const described = this.authorization.describe(
      credentialKey(RECORD_SCOPE, providerId),
    );
    const hit = await this.catalogs.current(providerId);
    await this.routes.onAuthorized(
      providerId,
      described?.label ?? providerId,
      hit.models,
    );
  }
  private async view(providerId: string, signal?: AbortSignal): Promise<OAuthCatalogView> {
    const described = this.authorization.describe(
      credentialKey(RECORD_SCOPE, providerId),
    );
    const hit = await this.catalogs.current(providerId, signal);
    if (hit.source === "remote")
      await this.routes.syncPinned(
        providerId,
        described?.label ?? providerId,
        hit.models,
      );
    const route = this.routes.state(providerId);
    return {
      providerId,
      source: hit.source,
      specSource: hit.specSource,
      route,
      models: hit.models,
      ...(hit.fetchedAt ? { fetchedAt: hit.fetchedAt } : {}),
      ...(hit.specFetchedAt ? { specFetchedAt: hit.specFetchedAt } : {}),
    };
  }
  private async requireEntry(providerId: string) {
    const listed = await oauthEntries(
      this.authorization,
      (key) => this.credentials.describeRecord(key),
      (key) => this.credentials.readRecord(key),
    );
    const entry = listed.oauth.find((item) => item.providerId === providerId);
    if (!entry) throw new SafeError("NO_FLOW");
    return entry;
  }
  private async decorate(
    entry: OAuthEntry,
    refresh: boolean,
    signal?: AbortSignal,
  ): Promise<OAuthEntry> {
    if (!entry.configured || !oauthUsageAdapters[entry.providerId]) {
      if (!entry.configured) return entry;
      return {
        ...entry,
        quota: { status: "unsupported", windows: [] },
      };
    }
    const key = credentialKey(RECORD_SCOPE, entry.providerId);
    let record: unknown;
    try {
      record = await this.credentials.readRecord(key);
    } catch {
      return { ...entry, quota: { status: "error", windows: [], error: "UNAVAILABLE" } };
    }
    const token = accessTokenFromRecord(record);
    const bindingToken = recordDigest(record);
    if (!token)
      return {
        ...entry,
        bindingToken,
        quota: { status: "missing-credential", windows: [] },
      };
    const adapter = oauthUsageAdapters[entry.providerId]!;
    const request = adapter.buildRequest(token);
    if (!request)
      return {
        ...entry,
        bindingToken,
        quota: { status: "error", windows: [], error: "UNAVAILABLE" },
      };
    let loaded: QuotaSnapshot;
    try {
      loaded = await this.quotaReader.load({
        providerId: `oauth:${entry.providerId}`,
        source: "opencode-official",
        url: request.url,
        kind: "opencode",
        bindingToken,
        key: token,
        identityKey: bindingToken,
        headers: request.headers,
        parse: adapter.parse,
        refresh,
        ttlMs: this.ttl(),
        signal,
        stillCurrent: async () => {
          try {
            const live = await this.credentials.readRecord(key);
            return recordDigest(live) === bindingToken;
          } catch {
            return false;
          }
        },
      });
    } catch {
      return {
        ...entry,
        bindingToken,
        quota: { status: "error", windows: [], error: "UNAVAILABLE" },
      };
    }
    return {
      ...entry,
      bindingToken,
      quota: quotaOf(loaded),
      ...(loaded.fetchedAt ? { quotaFetchedAt: loaded.fetchedAt } : {}),
    };
  }
  private ttl() {
    const value = this.config.oauthQuotaTtlMs;
    return typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : OAUTH_QUOTA_TTL_MS;
  }
}

function providerIdOf(input: unknown) {
  const parsed = exact(input, ["providerId"]);
  const providerId = text(parsed.providerId);
  if (!isCredentialKeySegment(providerId)) throw new SafeError("INVALID_INPUT");
  return providerId;
}

function quotaOf(snapshot: QuotaSnapshot): OAuthQuota {
  if (snapshot.error === "UNAUTHORIZED")
    return { status: "expired", windows: [], error: "UNAUTHORIZED" };
  if (snapshot.status === "unsupported")
    return { status: "unsupported", windows: [] };
  if (snapshot.status === "missing-credential")
    return { status: "missing-credential", windows: [] };
  if (snapshot.status !== "ready")
    return {
      status: "error",
      windows: snapshot.windows,
      ...(snapshot.error ? { error: snapshot.error } : {}),
    };
  return { status: "ready", windows: snapshot.windows };
}
