import { createHash } from "node:crypto";
import type { QuotaWindow } from "../shared/protocol.js";

export const OAUTH_QUOTA_TTL_MS = 3_600_000;
export const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
export const OPENROUTER_CREDITS_URL = "https://openrouter.ai/api/v1/credits";
const OPENAI_AUTH_CLAIM = "https://api.openai.com/auth";
const TOKEN_FIELDS = ["access_token", "apiKey", "access"] as const;

export interface OAuthUsageRequest {
  url: string;
  headers: Record<string, string>;
}

export interface OAuthUsageAdapter {
  buildRequest(token: string): OAuthUsageRequest | undefined;
  parse(body: unknown): QuotaWindow[] | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function percent(value: unknown): number | undefined {
  const next = finite(value);
  return next !== undefined && next <= 100 ? next : undefined;
}

function isoFromEpoch(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
    return undefined;
  const date = new Date(value * 1000);
  const year = date.getUTCFullYear();
  if (year < 2000 || year > 2100) return undefined;
  return date.toISOString();
}

export function recordDigest(record: unknown): string {
  return createHash("sha256").update(stable(record)).digest("hex");
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (isRecord(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function accessTokenFromRecord(record: unknown): string | undefined {
  if (!isRecord(record)) return undefined;
  if (record.kind === "api-key" && typeof record.key === "string") {
    const key = record.key.trim();
    return key || undefined;
  }
  if (record.kind !== "grant" || !isRecord(record.payload)) return undefined;
  for (const field of TOKEN_FIELDS) {
    const value = record.payload[field];
    if (typeof value !== "string") continue;
    const token = value.trim();
    if (token) return token;
  }
  return undefined;
}

export function chatgptAccountId(token: string): string | undefined {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return undefined;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    if (!isRecord(payload)) return undefined;
    const auth = payload[OPENAI_AUTH_CLAIM];
    if (!isRecord(auth)) return undefined;
    const id = auth.chatgpt_account_id;
    return typeof id === "string" && id.trim() ? id.trim() : undefined;
  } catch {
    return undefined;
  }
}

function bearer(token: string): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
}

function windowId(seconds: number): QuotaWindow["id"] {
  if (seconds >= 2_000_000) return "monthly";
  if (seconds >= 500_000) return "weekly";
  return "five-hour";
}

function codexWindow(value: unknown): QuotaWindow | undefined {
  if (!isRecord(value)) return undefined;
  const used = percent(value.used_percent);
  const seconds = finite(value.limit_window_seconds);
  if (used === undefined || seconds === undefined || !Number.isInteger(seconds))
    return undefined;
  const usedPercent = Math.round(used);
  const resetsAt = isoFromEpoch(value.reset_at);
  return {
    id: windowId(seconds),
    usedPercent,
    remainingPercent: Math.max(0, 100 - usedPercent),
    ...(resetsAt ? { resetsAt } : {}),
  };
}

export function parseCodexUsage(body: unknown): QuotaWindow[] | undefined {
  if (!isRecord(body)) return undefined;
  const limit = isRecord(body.rate_limit) ? body.rate_limit : undefined;
  if (!limit) return undefined;
  const windows = [codexWindow(limit.primary_window), codexWindow(limit.secondary_window)].filter(
    (window): window is QuotaWindow => !!window,
  );
  return windows.length ? windows : undefined;
}

export function parseOpenRouterCredits(body: unknown): QuotaWindow[] | undefined {
  if (!isRecord(body)) return undefined;
  const data = isRecord(body.data) ? body.data : body;
  const total = finite(data.total_credits);
  const used = finite(data.total_usage);
  if (total === undefined || used === undefined || total <= 0) return undefined;
  const remainingPercent = Math.round(
    Math.max(0, Math.min(100, ((total - used) / total) * 100)),
  );
  return [
    {
      id: "credits",
      usedPercent: 100 - remainingPercent,
      remainingPercent,
    },
  ];
}

export const oauthUsageAdapters: Record<string, OAuthUsageAdapter> = {
  "openai-codex": {
    buildRequest(token) {
      const accountId = chatgptAccountId(token);
      if (!accountId) return undefined;
      return {
        url: CODEX_USAGE_URL,
        headers: { ...bearer(token), "chatgpt-account-id": accountId },
      };
    },
    parse: parseCodexUsage,
  },
  openrouter: {
    buildRequest(token) {
      return { url: OPENROUTER_CREDITS_URL, headers: bearer(token) };
    },
    parse: parseOpenRouterCredits,
  },
};
