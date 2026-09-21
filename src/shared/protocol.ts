export const protocols = [
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
] as const;
export type Protocol = (typeof protocols)[number];
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
  models: { id: string; name?: string; api?: string }[];
  notice?: string;
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
}
export type QuotaStatus =
  | "ready"
  | "unsupported"
  | "missing-credential"
  | "source-unverified"
  | "error";
export interface QuotaWindow {
  id: "five-hour" | "weekly" | "monthly";
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
