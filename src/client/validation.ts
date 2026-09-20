import { protocols, type Provider, type Snapshot } from "../shared/protocol.js";
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
