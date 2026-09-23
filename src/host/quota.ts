import { createHmac, randomBytes } from "node:crypto";
import type {
  QuotaSnapshot,
  QuotaStatus,
  QuotaWindow,
} from "../shared/protocol.js";
import { SafeError } from "../shared/protocol.js";

export const OPENCODE_USAGE_URL = "https://opencode.ai/zen/go/v1/usage";
export const COMMAND_CREDITS_URL =
  "https://api.commandcode.ai/alpha/billing/credits";
export const QUOTA_TIMEOUT_MS = 10000;
export const QUOTA_MAX_BYTES = 1048576;
export const QUOTA_TTL_MS = 60000;
const OPENCODE_OFFICIAL = "https://opencode.ai/zen/go/v1";
const COMMAND_OFFICIAL = "https://api.commandcode.ai";
const DEFAULT_COMMAND_REF = "COMMANDCODE_API_KEY";

export interface QuotaReaderOptions {
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

export type QuotaKind = "opencode" | "command";

export interface QuotaLoadInput {
  providerId: string;
  source: NonNullable<QuotaSnapshot["source"]>;
  url: string;
  kind: QuotaKind;
  bindingToken: string;
  credentialSource?: string;
  key: string;
  refresh?: boolean;
  signal?: AbortSignal;
  timedOut?: () => boolean;
  stillCurrent: () => Promise<boolean>;
}

type CacheEntry = {
  identity: string;
  snapshot: QuotaSnapshot;
  storedAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function percents(
  usedPercent: number,
): Pick<QuotaWindow, "usedPercent" | "remainingPercent"> {
  return {
    usedPercent,
    remainingPercent: Math.max(0, 100 - usedPercent),
  };
}

function inRange(date: Date): boolean {
  if (Number.isNaN(date.getTime())) return false;
  const year = date.getUTCFullYear();
  return year >= 2000 && year <= 2100;
}

function isoFromOpenCode(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return undefined;
    const date = new Date(parsed);
    return inRange(date) ? date.toISOString() : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const date = new Date(value < 1e12 ? value * 1000 : value);
    return inRange(date) ? date.toISOString() : undefined;
  }
}

function isoFromCommandMs(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    return undefined;
  const date = new Date(value);
  return inRange(date) ? date.toISOString() : undefined;
}

function parseOpenCodeWindow(
  value: unknown,
): Omit<QuotaWindow, "id"> | undefined {
  if (!isRecord(value)) return undefined;
  const status = value.status;
  if (status !== undefined && status !== "ok" && status !== "rate-limited")
    return undefined;
  let usedPercent: number | undefined;
  const percent = finiteNonNegative(value.percent);
  const usagePercent = finiteNonNegative(value.usagePercent);
  const usage = finiteNonNegative(value.usage);
  if (percent !== undefined) usedPercent = percent;
  else if (usagePercent !== undefined) usedPercent = usagePercent;
  else if (usage !== undefined) usedPercent = usage > 1 ? usage : usage * 100;
  if (usedPercent === undefined || !Number.isFinite(usedPercent))
    return undefined;
  const resetsAt = isoFromOpenCode(
    value.resetsAt ?? value.resets_at ?? value.resetAt,
  );
  return { ...percents(usedPercent), ...(resetsAt ? { resetsAt } : {}) };
}

export function parseOpenCodeUsage(value: unknown): QuotaWindow[] | undefined {
  const root = isRecord(value) && isRecord(value.usage) ? value.usage : value;
  if (!isRecord(root)) return undefined;
  const windows: QuotaWindow[] = [];
  const five = parseOpenCodeWindow(
    root.rolling ?? root.rollingUsage ?? root.session,
  );
  const weekly = parseOpenCodeWindow(root.weekly ?? root.weeklyUsage);
  const monthly = parseOpenCodeWindow(root.monthly ?? root.monthlyUsage);
  if (five) windows.push({ id: "five-hour", ...five });
  if (weekly) windows.push({ id: "weekly", ...weekly });
  if (monthly) windows.push({ id: "monthly", ...monthly });
  return windows.length ? windows : undefined;
}

function parseCommandWindow(value: unknown): Omit<QuotaWindow, "id"> {
  const used = isRecord(value) ? finiteNonNegative(value.used) : undefined;
  const cap = isRecord(value) ? finiteNonNegative(value.cap) : undefined;
  const resetsAt = isRecord(value)
    ? isoFromCommandMs(value.resetAt)
    : undefined;
  const window: Omit<QuotaWindow, "id"> = {};
  if (used !== undefined && cap !== undefined && cap > 0) {
    const usedPercent = (used / cap) * 100;
    if (Number.isFinite(usedPercent))
      Object.assign(window, percents(usedPercent));
  }
  if (resetsAt) window.resetsAt = resetsAt;
  return window;
}

export function parseCommandCredits(value: unknown): QuotaWindow[] | undefined {
  if (!isRecord(value) || !isRecord(value.windowLimits)) return undefined;
  const limits = value.windowLimits;
  const windows: QuotaWindow[] = [];
  if (isRecord(limits.fiveHour))
    windows.push({ id: "five-hour", ...parseCommandWindow(limits.fiveHour) });
  if (isRecord(limits.weekly))
    windows.push({ id: "weekly", ...parseCommandWindow(limits.weekly) });
  if (isRecord(limits.monthly))
    windows.push({ id: "monthly", ...parseCommandWindow(limits.monthly) });
  return windows.length ? windows : undefined;
}

export function commandSourceAmbiguous(
  profile: Record<string, unknown>,
  secrets?: { path: string[]; set: boolean }[],
): boolean {
  if (!secrets) return true;
  const apiKeySecret = secrets.find(
    (item) => item.path.length === 1 && item.path[0] === "apiKey",
  );
  if (!apiKeySecret || apiKeySecret.set) return true;
  if (typeof profile.apiKey === "string" && profile.apiKey.trim() !== "")
    return true;
  const accounts = profile.accounts;
  if (accounts !== undefined) {
    if (!Array.isArray(accounts) || accounts.length > 0) return true;
  }
  const rules = profile.modelAccountRules;
  if (rules !== undefined) {
    if (!Array.isArray(rules) || rules.length > 0) return true;
  }
  const active = profile.activeAccount;
  if (active === undefined || active === "") return false;
  if (typeof active !== "string") return true;
  const trimmed = active.trim();
  const defaultRef =
    typeof profile.apiKeyEnv === "string" && profile.apiKeyEnv.trim()
      ? profile.apiKeyEnv.trim()
      : DEFAULT_COMMAND_REF;
  return trimmed !== "default" && trimmed !== defaultRef;
}

function normalizeBase(value: string) {
  return value.replace(/\/+$/, "");
}

export function unofficialEndpoint(
  kind: "opencode-go" | "commandcode",
  profile: Record<string, unknown>,
): boolean {
  const definition = {
    "opencode-go": {
      official: OPENCODE_OFFICIAL,
      fields: ["baseURL", "apiBase"],
    },
    commandcode: { official: COMMAND_OFFICIAL, fields: ["apiBase", "baseURL"] },
  }[kind];
  const official = definition.official;
  const raw = profile[definition.fields[0]] ?? profile[definition.fields[1]];
  if (raw === undefined || raw === "") return false;
  if (typeof raw !== "string") return true;
  return normalizeBase(raw) !== official;
}

export async function untilAborted<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  let stop = () => {};
  const aborted = new Promise<never>((_, reject) => {
    stop = () =>
      reject(
        signal.reason ??
          new DOMException("This operation was aborted", "AbortError"),
      );
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) stop();
  });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    signal.removeEventListener("abort", stop);
    promise.catch(() => {});
  }
}

async function readBounded(
  response: Response,
  max: number,
  signal: AbortSignal,
): Promise<string> {
  if (!response.body) {
    const text = await untilAborted(response.text(), signal);
    if (Buffer.byteLength(text) > max) throw new SafeError("INVALID_RESPONSE");
    return text;
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  const release = () => {
    void reader.cancel().catch(() => {});
  };
  try {
    while (true) {
      const { done, value } = await untilAborted(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        release();
        throw new SafeError("INVALID_RESPONSE");
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    release();
    throw error;
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function copySnapshot(snapshot: QuotaSnapshot): QuotaSnapshot {
  return {
    ...snapshot,
    windows: snapshot.windows.map((window) => ({ ...window })),
  };
}

export class QuotaReader {
  private fetchImpl: typeof fetch;
  private now: () => number;
  readonly timeoutMs: number;
  private salt = randomBytes(32);
  private cache = new Map<string, CacheEntry>();
  private inflight = new Map<string, AbortController>();
  private generation = new Map<string, number>();

  constructor(options: QuotaReaderOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? QUOTA_TIMEOUT_MS;
  }

  bindDeadline(signal?: AbortSignal) {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), this.timeoutMs);
    return {
      signal: signal
        ? AbortSignal.any([signal, timeout.signal])
        : timeout.signal,
      timedOut: () => timeout.signal.aborted && !signal?.aborted,
      dispose: () => clearTimeout(timer),
    };
  }

  private fingerprint(
    providerId: string,
    bindingToken: string,
    credentialSource: string | undefined,
    key: string,
  ) {
    return createHmac("sha256", this.salt)
      .update(
        JSON.stringify([providerId, bindingToken, credentialSource ?? "", key]),
      )
      .digest("hex");
  }

  invalidate(providerId: string) {
    this.cache.delete(providerId);
    this.generation.set(providerId, (this.generation.get(providerId) ?? 0) + 1);
    this.inflight.get(providerId)?.abort();
    this.inflight.delete(providerId);
  }

  abort(providerId?: string) {
    if (providerId) {
      this.generation.set(
        providerId,
        (this.generation.get(providerId) ?? 0) + 1,
      );
      this.inflight.get(providerId)?.abort();
      this.inflight.delete(providerId);
      return;
    }
    for (const id of [...this.inflight.keys()]) this.abort(id);
  }

  dispose() {
    this.abort();
    this.cache.clear();
  }

  async load(input: QuotaLoadInput): Promise<QuotaSnapshot> {
    const identity = this.fingerprint(
      input.providerId,
      input.bindingToken,
      input.credentialSource,
      input.key,
    );
    const cached = this.cache.get(input.providerId);
    if (cached && cached.identity !== identity)
      this.cache.delete(input.providerId);
    const current = this.cache.get(input.providerId);
    const bound = input.timedOut
      ? {
          signal: input.signal as AbortSignal,
          timedOut: input.timedOut,
          dispose: () => {},
        }
      : this.bindDeadline(input.signal);
    const empty = (
      status: QuotaStatus,
      error?: QuotaSnapshot["error"],
    ): QuotaSnapshot => ({
      providerId: input.providerId,
      source: input.source,
      status,
      error,
      stale: false,
      windows: [],
    });
    try {
      if (bound.signal.aborted) {
        if (bound.timedOut()) return empty("error", "TIMEOUT");
        throw (
          bound.signal.reason ??
          new DOMException("This operation was aborted", "AbortError")
        );
      }
      if (
        current &&
        current.identity === identity &&
        input.refresh !== true &&
        this.now() - current.storedAt < QUOTA_TTL_MS
      ) {
        try {
          const same = await untilAborted(
            Promise.resolve(input.stillCurrent()),
            bound.signal,
          );
          if (!same) return empty("error", "UNAVAILABLE");
          return copySnapshot(current.snapshot);
        } catch (error) {
          if (bound.timedOut()) return empty("error", "TIMEOUT");
          throw error;
        }
      }
      if (this.inflight.has(input.providerId))
        throw new SafeError("UNAVAILABLE");
      const generation = (this.generation.get(input.providerId) ?? 0) + 1;
      this.generation.set(input.providerId, generation);
      const local = new AbortController();
      this.inflight.set(input.providerId, local);
      const combined = AbortSignal.any([bound.signal, local.signal]);
      const abortedByCaller = () => combined.aborted && !bound.timedOut();
      const confirm = async () => {
        try {
          return await untilAborted(
            Promise.resolve(input.stillCurrent()),
            combined,
          );
        } catch (error) {
          if (bound.timedOut() || abortedByCaller()) throw error;
          return false;
        }
      };
      const fail = async (
        status: QuotaStatus,
        error?: QuotaSnapshot["error"],
        stale = false,
      ): Promise<QuotaSnapshot> => {
        let usable: QuotaSnapshot | undefined;
        if (stale && current && current.identity === identity) {
          let same = false;
          try {
            same = await untilAborted(
              Promise.resolve(input.stillCurrent()),
              combined,
            );
          } catch (caught) {
            if (bound.timedOut()) same = false;
            else if (abortedByCaller()) throw caught;
            else same = false;
          }
          if (same) usable = current.snapshot;
        }
        return {
          providerId: input.providerId,
          source: input.source,
          status,
          error,
          stale: Boolean(usable),
          windows: usable
            ? usable.windows.map((window) => ({ ...window }))
            : [],
          ...(usable?.fetchedAt ? { fetchedAt: usable.fetchedAt } : {}),
        };
      };
      try {
        if (!(await confirm())) return empty("error", "UNAVAILABLE");
        let response: Response;
        try {
          response = await untilAborted(
            Promise.resolve(
              this.fetchImpl(input.url, {
                method: "GET",
                redirect: "error",
                cache: "no-store",
                signal: combined,
                headers: {
                  Accept: "application/json",
                  Authorization: "Bearer " + input.key,
                },
              }),
            ),
            combined,
          );
        } catch (error) {
          if (this.generation.get(input.providerId) !== generation) throw error;
          if (bound.timedOut()) return fail("error", "TIMEOUT", true);
          if (abortedByCaller()) throw error;
          return fail("error", "UNAVAILABLE", true);
        }
        if (this.generation.get(input.providerId) !== generation)
          return empty("error", "UNAVAILABLE");
        if (!(await confirm())) return empty("error", "UNAVAILABLE");
        if (response.status === 401 || response.status === 403) {
          void response.body?.cancel().catch(() => {});
          return fail("error", "UNAUTHORIZED", true);
        }
        if (response.status === 404) {
          void response.body?.cancel().catch(() => {});
          return {
            providerId: input.providerId,
            source: input.source,
            status: "unsupported",
            windows: [],
            stale: false,
          };
        }
        if (!response.ok) {
          void response.body?.cancel().catch(() => {});
          return fail("error", "UNAVAILABLE", true);
        }
        let text: string;
        try {
          text = await readBounded(response, QUOTA_MAX_BYTES, combined);
        } catch (error) {
          if (this.generation.get(input.providerId) !== generation) throw error;
          if (bound.timedOut()) return fail("error", "TIMEOUT", true);
          if (abortedByCaller()) throw error;
          return fail("error", "INVALID_RESPONSE", true);
        }
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          return fail("error", "INVALID_RESPONSE", true);
        }
        const windows =
          input.kind === "opencode"
            ? parseOpenCodeUsage(body)
            : parseCommandCredits(body);
        if (!windows) return fail("error", "INVALID_RESPONSE", true);
        const snapshot: QuotaSnapshot = {
          providerId: input.providerId,
          source: input.source,
          status: "ready",
          stale: false,
          windows,
          fetchedAt: new Date(this.now()).toISOString(),
        };
        if (this.generation.get(input.providerId) !== generation)
          return empty("error", "UNAVAILABLE");
        if (!(await confirm())) return empty("error", "UNAVAILABLE");
        this.cache.set(input.providerId, {
          identity,
          snapshot: copySnapshot(snapshot),
          storedAt: this.now(),
        });
        return snapshot;
      } catch (error) {
        if (this.generation.get(input.providerId) !== generation) throw error;
        if (bound.timedOut()) return fail("error", "TIMEOUT", true);
        if (abortedByCaller()) throw error;
        throw error;
      } finally {
        if (this.inflight.get(input.providerId) === local)
          this.inflight.delete(input.providerId);
      }
    } finally {
      bound.dispose();
    }
  }
}
