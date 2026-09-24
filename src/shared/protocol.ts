export const protocols = [
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
] as const;
export type Protocol = (typeof protocols)[number];
export type CatalogDisposition =
  | "supported"
  | "confirmed-alias"
  | "officially-retired"
  | "blocked-with-evidence";
export interface LocalBudgetPreset {
  id: string;
  tokens: number;
}
export interface ProviderModel {
  id: string;
  name?: string;
  api?: string;
  contextWindow?: number;
  inputLimit?: number;
  maxOutputTokens?: number;
  reasoning?: boolean;
  nativeEfforts?: string[];
  toggle?: boolean;
  budgetTokensMax?: number;
  budgetTokensUnbounded?: boolean;
  localBudgetPresets?: LocalBudgetPreset[];
  toggleOnLevel?: string;
  input?: string[];
  advertisedInput?: string[];
  disposition?: CatalogDisposition;
  blockReasons?: string[];
  checkedAt?: string;
  compatPolicy?: string;
  selectableEfforts?: string[];
  inputLimitEnforced?: boolean;
}
export class SafeError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new SafeError("INVALID_INPUT");
  return value as Record<string, unknown>;
}
export function exact(value: unknown, keys: string[]) {
  const v = object(value);
  if (Object.keys(v).some((k) => !keys.includes(k)))
    throw new SafeError("INVALID_INPUT");
  return v;
}
export function text(value: unknown, max = 256): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new SafeError("INVALID_INPUT");
  return value;
}
export interface Provider {
  id: string;
  name: string;
  available: boolean;
  revision: number;
  bindingToken?: string;
  credential?: { configured: boolean; writable: boolean; source?: string };
  models: ProviderModel[];
  notice?: string;
  catalogCheckedAt?: string;
  baseURL?: string;
  defaultContextWindow?: number;
  defaultMaxTokens?: number;
  api?: Protocol;
  error?: string;
  catalogError?: string;
}
export interface Snapshot {
  settingsWritable: boolean;
  providers: Provider[];
  customRevision: number;
  muse: { installed: boolean; status: "CLI_ONLY"; docs: string };
  oauth: readonly OAuthEntry[];
  oauthUnavailable?: boolean;
}
export const RECORD_SCOPE = "llm-pi-ai";
export const PLUGIN_SCOPE = "provider-manager";
export const LOGIN_EVENT_LIMIT = 100;
export const LOGIN_SESSION_TTL_MS = 60_000;
export const LOGIN_MESSAGE_MAX = 2048;
export const LOGIN_URL_MAX = 2048;
export const LOGIN_CODE_MAX = 128;
export const PROMPT_WITHDRAWN = "Prompt withdrawn";
export type OAuthKind = "api-key" | "grant";
export interface OAuthMethod {
  id: string;
  label: string;
}
export interface OAuthEntry {
  providerId: string;
  label: string;
  methods: readonly OAuthMethod[];
  configured: boolean;
  builtin?: boolean;
  kind?: OAuthKind;
  inFlight: boolean;
  account?: string;
  bindingToken?: string;
  quota?: OAuthQuota;
  quotaFetchedAt?: string;
}
export type OAuthCatalogSource = "snapshot" | "remote" | "official";
export type OAuthRouteState = "missing" | "empty" | "pinned" | "custom";
export interface OAuthCatalogCost {
  input: number;
  output: number;
}
export interface OAuthCatalogModel {
  id: string;
  name: string;
  available: boolean;
  efforts: string[];
  input: Array<"text" | "image">;
  contextWindow?: number;
  specContextWindow?: number;
  maxTokens?: number;
  cost?: OAuthCatalogCost;
  verifiedAt?: string;
  servedModel?: string;
}
export interface OAuthCatalogView {
  providerId: string;
  source: OAuthCatalogSource;
  specSource: OAuthCatalogSource;
  route: OAuthRouteState;
  models: OAuthCatalogModel[];
  fetchedAt?: string;
  specFetchedAt?: string;
}
export type LoginPromptKind = "text" | "secret" | "select";
export type LoginNoticeEvent = {
  kind: "notice";
  message: string;
  url?: string;
  code?: string;
};
export type LoginPromptOption = { id: string; label: string };
export type LoginPromptEvent = {
  kind: "prompt";
  seq: number;
  promptKind: LoginPromptKind;
  message?: string;
  options?: readonly LoginPromptOption[];
};
export type LoginEvent = LoginNoticeEvent | LoginPromptEvent;
export type IndexedLoginEvent = LoginEvent & { index: number };
export type LoginResult = "ok" | "declined" | "failed" | "cancelled";
export type LoginStatus = "running" | "awaiting-prompt" | "done";
export interface LoginStartResult {
  sessionId: string;
  busy?: true;
}
export interface LoginEventsResult {
  events: IndexedLoginEvent[];
  nextIndex: number;
  reset?: true;
  status: LoginStatus;
  result?: LoginResult;
  error?: string;
  pendingPrompt?: LoginPromptEvent;
}
export function httpUrl(
  value: string,
  max = LOGIN_URL_MAX,
): string | undefined {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    return undefined;
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}
export function clipText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const next = value.trim();
  if (!next || next.length > max) return undefined;
  return next;
}
export type QuotaStatus =
  | "ready"
  | "unsupported"
  | "missing-credential"
  | "source-unverified"
  | "error";
export type OAuthQuotaStatus =
  | "ready"
  | "unsupported"
  | "missing-credential"
  | "expired"
  | "error";
export interface OAuthQuota {
  status: OAuthQuotaStatus;
  windows: QuotaWindow[];
  error?: "TIMEOUT" | "UNAUTHORIZED" | "UNAVAILABLE" | "INVALID_RESPONSE";
}
export interface QuotaWindow {
  id: "five-hour" | "weekly" | "monthly" | "credits";
  usedPercent?: number;
  remainingPercent?: number;
  resetsAt?: string;
}
export interface QuotaSnapshot {
  providerId: string;
  status: QuotaStatus;
  windows: QuotaWindow[];
  fetchedAt?: string;
  stale: boolean;
  source?: "opencode-official" | "command-default-reference";
  error?: "TIMEOUT" | "UNAUTHORIZED" | "UNAVAILABLE" | "INVALID_RESPONSE";
}
export interface QuotaRequest {
  providerId: string;
  bindingToken?: string;
  refresh?: boolean;
}
