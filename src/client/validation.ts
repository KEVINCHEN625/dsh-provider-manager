import {
  protocols,
  httpUrl,
  type Provider,
  type Snapshot,
  type QuotaSnapshot,
  type QuotaWindow,
  type OAuthEntry,
  type OAuthKind,
  type LoginStartResult,
  type LoginEventsResult,
  type IndexedLoginEvent,
  type LoginPromptEvent,
  type LoginPromptKind,
  type LoginStatus,
  type LoginResult,
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
function optionalInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    throw { code: "UNAVAILABLE" };
  return value;
}
function optionalStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    throw { code: "UNAVAILABLE" };
  return value as string[];
}
function validateModel(value: unknown): Provider["models"][number] {
  const model = record(value);
  const next: Provider["models"][number] = {
    id: string(model.id),
    ...(model.name === undefined ? {} : { name: string(model.name) }),
    ...(model.api === undefined ? {} : { api: string(model.api) }),
  };
  for (const key of [
    "contextWindow",
    "inputLimit",
    "maxOutputTokens",
    "budgetTokensMax",
  ] as const)
    if (model[key] !== undefined) next[key] = optionalInteger(model[key]);
  if (model.reasoning !== undefined) next.reasoning = boolean(model.reasoning);
  if (model.toggle !== undefined) next.toggle = boolean(model.toggle);
  if (model.budgetTokensUnbounded !== undefined)
    next.budgetTokensUnbounded = boolean(model.budgetTokensUnbounded);
  if (model.inputLimitEnforced !== undefined)
    next.inputLimitEnforced = boolean(model.inputLimitEnforced);
  for (const key of [
    "nativeEfforts",
    "input",
    "advertisedInput",
    "blockReasons",
    "selectableEfforts",
  ] as const)
    if (model[key] !== undefined) next[key] = optionalStringArray(model[key]);
  if (model.localBudgetPresets !== undefined) {
    if (!Array.isArray(model.localBudgetPresets)) throw { code: "UNAVAILABLE" };
    next.localBudgetPresets = model.localBudgetPresets.map((item) => {
      const preset = record(item);
      return { id: string(preset.id), tokens: optionalInteger(preset.tokens) };
    });
  }
  if (model.toggleOnLevel !== undefined)
    next.toggleOnLevel = string(model.toggleOnLevel);
  if (model.disposition !== undefined) {
    const disposition = string(model.disposition);
    if (
      disposition !== "supported" &&
      disposition !== "confirmed-alias" &&
      disposition !== "officially-retired" &&
      disposition !== "blocked-with-evidence"
    )
      throw { code: "UNAVAILABLE" };
    next.disposition = disposition;
  }
  if (model.checkedAt !== undefined) next.checkedAt = string(model.checkedAt);
  if (model.compatPolicy !== undefined)
    next.compatPolicy = string(model.compatPolicy);
  return next;
}
export function validateProvider(value: unknown): Provider {
  const data = record(value);
  if (!Array.isArray(data.models)) throw { code: "UNAVAILABLE" };
  const provider: Provider = {
    id: string(data.id),
    name: string(data.name),
    available: boolean(data.available),
    revision: revision(data.revision),
    models: data.models.map(validateModel),
  };
  for (const key of [
    "bindingToken",
    "notice",
    "baseURL",
    "error",
    "catalogError",
    "catalogCheckedAt",
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
    oauth:
      data.oauth === undefined
        ? []
        : Array.isArray(data.oauth)
          ? data.oauth.map(validateOAuthEntry)
          : (() => {
              throw { code: "UNAVAILABLE" };
            })(),
    oauthUnavailable:
      data.oauthUnavailable === undefined
        ? false
        : boolean(data.oauthUnavailable),
  };
}
function validateOAuthEntry(value: unknown): OAuthEntry {
  const data = record(value);
  if (!Array.isArray(data.methods) || data.methods.length < 1)
    throw { code: "UNAVAILABLE" };
  const kinds: OAuthKind[] = ["api-key", "grant"];
  const entry: OAuthEntry = {
    providerId: string(data.providerId),
    label: string(data.label),
    methods: data.methods.map((item) => {
      const method = record(item);
      return { id: string(method.id), label: string(method.label) };
    }),
    configured: boolean(data.configured),
    inFlight: boolean(data.inFlight),
  };
  if (data.kind !== undefined) {
    if (!kinds.includes(data.kind as OAuthKind)) throw { code: "UNAVAILABLE" };
    entry.kind = data.kind as OAuthKind;
  }
  return entry;
}
export function validateLoginStart(value: unknown): LoginStartResult {
  const data = record(value);
  const result: LoginStartResult = { sessionId: string(data.sessionId) };
  if (data.busy === true) result.busy = true;
  else if (data.busy !== undefined) throw { code: "UNAVAILABLE" };
  return result;
}
const promptKinds: LoginPromptKind[] = ["text", "secret", "select"];
const loginStatuses: LoginStatus[] = ["running", "awaiting-prompt", "done"];
const loginResults: LoginResult[] = ["ok", "declined", "failed", "cancelled"];
function validatePrompt(value: unknown): LoginPromptEvent {
  const data = record(value);
  if (!promptKinds.includes(data.promptKind as LoginPromptKind))
    throw { code: "UNAVAILABLE" };
  if (
    typeof data.seq !== "number" ||
    !Number.isSafeInteger(data.seq) ||
    data.seq < 1
  )
    throw { code: "UNAVAILABLE" };
  const event: LoginPromptEvent = {
    kind: "prompt",
    seq: data.seq,
    promptKind: data.promptKind as LoginPromptKind,
  };
  if (data.message !== undefined) event.message = string(data.message);
  if (data.options !== undefined) {
    if (!Array.isArray(data.options)) throw { code: "UNAVAILABLE" };
    event.options = data.options.map((item) => {
      const option = record(item);
      return { id: string(option.id), label: string(option.label) };
    });
  }
  return event;
}
function validateIndexedEvent(value: unknown): IndexedLoginEvent {
  const data = record(value);
  if (
    typeof data.index !== "number" ||
    !Number.isSafeInteger(data.index) ||
    data.index < 0
  )
    throw { code: "UNAVAILABLE" };
  if (data.kind === "notice") {
    const event: IndexedLoginEvent = {
      kind: "notice",
      index: data.index,
      message: string(data.message),
    };
    if (data.url !== undefined) {
      const url = httpUrl(string(data.url));
      if (!url) throw { code: "UNAVAILABLE" };
      event.url = url;
    }
    if (data.code !== undefined) event.code = string(data.code);
    return event;
  }
  if (data.kind === "prompt")
    return { ...validatePrompt(data), index: data.index };
  throw { code: "UNAVAILABLE" };
}
export function validateLoginEvents(value: unknown): LoginEventsResult {
  const data = record(value);
  if (
    !Array.isArray(data.events) ||
    !loginStatuses.includes(data.status as LoginStatus)
  )
    throw { code: "UNAVAILABLE" };
  if (
    typeof data.nextIndex !== "number" ||
    !Number.isSafeInteger(data.nextIndex) ||
    data.nextIndex < 0
  )
    throw { code: "UNAVAILABLE" };
  const result: LoginEventsResult = {
    events: data.events.map(validateIndexedEvent),
    nextIndex: data.nextIndex,
    status: data.status as LoginStatus,
  };
  if (data.reset === true) result.reset = true;
  else if (data.reset !== undefined) throw { code: "UNAVAILABLE" };
  if (data.result !== undefined) {
    if (!loginResults.includes(data.result as LoginResult))
      throw { code: "UNAVAILABLE" };
    result.result = data.result as LoginResult;
  }
  if (data.error !== undefined) result.error = string(data.error);
  if (data.pendingPrompt !== undefined)
    result.pendingPrompt = validatePrompt(data.pendingPrompt);
  return result;
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
