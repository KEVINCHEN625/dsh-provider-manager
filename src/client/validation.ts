import {
  protocols,
  type Provider,
  type Snapshot,
  type QuotaSnapshot,
  type QuotaWindow,
} from "../shared/protocol.js";
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw { code: "UNAVAILABLE" };
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== "string") throw { code: "UNAVAILABLE" };
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw { code: "UNAVAILABLE" };
  return value;
}
function revision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw { code: "UNAVAILABLE" };
  return value;
}
export function validateCredential(
  value: unknown,
): NonNullable<Provider["credential"]> {
  const data = record(value);
  return {
    configured: boolean(data.configured),
    writable: boolean(data.writable),
    ...(data.source === undefined ? {} : { source: string(data.source) }),
  };
}
export function validateProvider(value: unknown): Provider {
  const data = record(value);
  if (!Array.isArray(data.models)) throw { code: "UNAVAILABLE" };
  const provider: Provider = {
    id: string(data.id),
    name: string(data.name),
    available: boolean(data.available),
    revision: revision(data.revision),
    models: data.models.map((value) => {
      const model = record(value);
      return {
        id: string(model.id),
        ...(model.name === undefined ? {} : { name: string(model.name) }),
        ...(model.api === undefined ? {} : { api: string(model.api) }),
      };
    }),
  };
  for (const key of [
    "bindingToken",
    "notice",
    "baseURL",
    "error",
    "catalogError",
  ] as const)
    if (data[key] !== undefined) provider[key] = string(data[key]);
  for (const key of ["defaultContextWindow", "defaultMaxTokens"] as const)
    if (data[key] !== undefined) provider[key] = revision(data[key]);
  if (data.credential !== undefined)
    provider.credential = validateCredential(data.credential);
  if (data.api !== undefined) {
    if (!protocols.some((api) => api === data.api))
      throw { code: "UNAVAILABLE" };
    provider.api = data.api as Provider["api"];
  }
  return provider;
}
export function validateSnapshot(value: unknown): Snapshot {
  const data = record(value),
    muse = record(data.muse);
  if (!Array.isArray(data.providers) || muse.status !== "CLI_ONLY")
    throw { code: "UNAVAILABLE" };
  return {
    settingsWritable: boolean(data.settingsWritable),
    customRevision: revision(data.customRevision),
    providers: data.providers.map(validateProvider),
    muse: {
      installed: boolean(muse.installed),
      status: "CLI_ONLY",
      docs: string(muse.docs),
    },
  };
}
const quotaStatuses = [
  "ready",
  "unsupported",
  "missing-credential",
  "source-unverified",
  "error",
] as const;
const quotaErrors = [
  "TIMEOUT",
  "UNAUTHORIZED",
  "UNAVAILABLE",
  "INVALID_RESPONSE",
] as const;
const quotaSources = [
  "opencode-official",
  "command-default-reference",
] as const;
const quotaWindows = ["five-hour", "weekly", "monthly"] as const;
function iso(value: unknown): string {
  const text = string(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/.test(text))
    throw { code: "UNAVAILABLE" };
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) throw { code: "UNAVAILABLE" };
  const year = new Date(parsed).getUTCFullYear();
  if (year < 2000 || year > 2100) throw { code: "UNAVAILABLE" };
  return text;
}
function usedPercent(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw { code: "UNAVAILABLE" };
  return value;
}
function remainingPercent(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  )
    throw { code: "UNAVAILABLE" };
  return value;
}
export function validateQuota(
  value: unknown,
  expectedProviderId: string,
): QuotaSnapshot {
  const data = record(value);
  if (string(data.providerId) !== expectedProviderId)
    throw { code: "UNAVAILABLE" };
  if (!quotaStatuses.includes(data.status as (typeof quotaStatuses)[number]))
    throw { code: "UNAVAILABLE" };
  if (!Array.isArray(data.windows) || data.windows.length > 3)
    throw { code: "UNAVAILABLE" };
  const seen = new Set<string>();
  const windows: QuotaWindow[] = data.windows.map((item) => {
    const window = record(item);
    const id = window.id;
    if (
      !quotaWindows.includes(id as (typeof quotaWindows)[number]) ||
      seen.has(id as string)
    )
      throw { code: "UNAVAILABLE" };
    seen.add(id as string);
    const next: QuotaWindow = { id: id as QuotaWindow["id"] };
    if (window.usedPercent !== undefined)
      next.usedPercent = usedPercent(window.usedPercent);
    if (window.remainingPercent !== undefined)
      next.remainingPercent = remainingPercent(window.remainingPercent);
    if (
      next.usedPercent !== undefined &&
      next.remainingPercent !== undefined &&
      next.remainingPercent !== Math.max(0, 100 - next.usedPercent)
    )
      throw { code: "UNAVAILABLE" };
    if (window.resetsAt !== undefined) next.resetsAt = iso(window.resetsAt);
    return next;
  });
  const snapshot: QuotaSnapshot = {
    providerId: expectedProviderId,
    status: data.status as QuotaSnapshot["status"],
    windows,
    stale: boolean(data.stale),
  };
  if (data.fetchedAt !== undefined) snapshot.fetchedAt = iso(data.fetchedAt);
  if (data.error !== undefined) {
    if (!quotaErrors.includes(data.error as (typeof quotaErrors)[number]))
      throw { code: "UNAVAILABLE" };
    snapshot.error = data.error as QuotaSnapshot["error"];
  }
  if (data.source !== undefined) {
    if (!quotaSources.includes(data.source as (typeof quotaSources)[number]))
      throw { code: "UNAVAILABLE" };
    snapshot.source = data.source as QuotaSnapshot["source"];
  }
  return snapshot;
}
