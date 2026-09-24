import { randomBytes } from "node:crypto";
import {
  AuthorizationDeclinedError,
  type AuthorizationInteraction,
  type AuthorizationPrompt,
  type AuthorizationRequest,
} from "@deepseek-ai/dsh-authorization";
import {
  credentialKey,
  credentialKeyId,
  credentialKeyScope,
  isCredentialKeySegment,
  type CredentialKey,
} from "@deepseek-ai/dsh-credentials";
import {
  LOGIN_CODE_MAX,
  LOGIN_EVENT_LIMIT,
  LOGIN_MESSAGE_MAX,
  LOGIN_SESSION_TTL_MS,
  PROMPT_WITHDRAWN,
  PLUGIN_SCOPE,
  RECORD_SCOPE,
  SafeError,
  clipText,
  exact,
  httpUrl,
  text,
  type IndexedLoginEvent,
  type LoginEvent,
  type LoginEventsResult,
  type LoginPromptEvent,
  type LoginPromptKind,
  type LoginResult,
  type LoginStartResult,
  type LoginStatus,
  type OAuthEntry,
  type OAuthKind,
} from "../shared/protocol.js";

export interface AuthorizationSurface {
  list(): readonly {
    key: CredentialKey;
    label: string;
    methods: readonly { id: string; label: string }[];
    inFlight: boolean;
  }[];
  describe(key: CredentialKey):
    | {
        key: CredentialKey;
        label: string;
        methods: readonly { id: string; label: string }[];
        inFlight: boolean;
      }
    | undefined;
  begin(request: AuthorizationRequest): Promise<{ status: "authorized" | "cancelled" }>;
  cancel(key: CredentialKey): void;
}

export interface RecordInfo {
  configured: boolean;
  kind?: string;
  writable?: boolean;
}

export function authorizationOf(value: unknown): AuthorizationSurface | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.list !== "function" ||
    typeof candidate.describe !== "function" ||
    typeof candidate.begin !== "function" ||
    typeof candidate.cancel !== "function"
  )
    return undefined;
  return value as AuthorizationSurface;
}

function grantPayload(record: unknown): unknown {
  if (!record || typeof record !== "object" || Array.isArray(record))
    return undefined;
  const value = record as { kind?: unknown; payload?: unknown };
  return value.kind === "grant" ? value.payload : undefined;
}

function kindOf(value: unknown): OAuthKind | undefined {
  return value === "api-key" || value === "grant" ? value : undefined;
}

const ACCOUNT_FIELDS = ["email", "displayName", "account", "name"] as const;

export function accountFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return undefined;
  const record = payload as Record<string, unknown>;
  for (const field of ACCOUNT_FIELDS) {
    const value = record[field];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    return trimmed.slice(0, 64);
  }
  return undefined;
}

export async function oauthEntries(
  authorization: AuthorizationSurface | undefined,
  describeRecord: (key: CredentialKey) => Promise<RecordInfo>,
  readRecord?: (key: CredentialKey) => Promise<unknown>,
): Promise<{ oauth: OAuthEntry[]; oauthUnavailable?: true }> {
  if (!authorization) return { oauth: [], oauthUnavailable: true };
  const listed = authorization.list().filter((entry) => {
    const scope = credentialKeyScope(entry.key);
    return scope === RECORD_SCOPE || scope === PLUGIN_SCOPE;
  });
  const oauth: OAuthEntry[] = [];
  for (const entry of listed) {
    let configured = false;
    let kind: OAuthKind | undefined;
    try {
      const info = await describeRecord(entry.key);
      configured = info.configured === true;
      kind = kindOf(info.kind);
    } catch {
      configured = false;
    }
    if (entry.methods.length < 1) continue;
    let account: string | undefined;
    if (configured && readRecord) {
      try {
        account = accountFromPayload(grantPayload(await readRecord(entry.key)));
      } catch {
        account = undefined;
      }
    }
    oauth.push({
      providerId: credentialKeyId(entry.key),
      label: entry.label,
      methods: entry.methods.map((method) => ({
        id: method.id,
        label: method.label,
      })),
      configured,
      ...(kind ? { kind } : {}),
      ...(account ? { account } : {}),
      inFlight: entry.inFlight === true,
      ...(credentialKeyScope(entry.key) === PLUGIN_SCOPE
        ? { builtin: true }
        : {}),
    });
  }
  oauth.sort((a, b) => {
    if (a.configured !== b.configured) return a.configured ? -1 : 1;
    return a.label.localeCompare(b.label, "en", { sensitivity: "base" });
  });
  return { oauth };
}

type PendingPrompt = {
  seq: number;
  promptKind: LoginPromptKind;
  message?: string;
  options?: { id: string; label: string }[];
  optionIds?: Set<string>;
  resolve: (value: string) => void;
  reject: (error: unknown) => void;
};

type Session = {
  id: string;
  key: CredentialKey;
  status: LoginStatus;
  result?: LoginResult;
  error?: string;
  declined: boolean;
  attempt: AbortController;
  events: IndexedLoginEvent[];
  nextIndex: number;
  prompts: number;
  pending?: PendingPrompt;
  endedAt?: number;
};

export class LoginSessionManager {
  private sessions = new Map<string, Session>();
  private byKey = new Map<CredentialKey, string>();
  constructor(
    private getAuthorization: () => AuthorizationSurface | undefined,
    private now: () => number = () => Date.now(),
    private id: () => string = () => randomBytes(16).toString("hex"),
    private onAuthorized?: (
      providerId: string,
      scope: string,
    ) => Promise<void>,
  ) {}
  start(input: unknown): LoginStartResult {
    this.sweep();
    const authorization = this.requireAuthorization();
    const p = exact(input, ["providerId", "method"]);
    const providerId = text(p.providerId);
    if (!isCredentialKeySegment(providerId))
      throw new SafeError("INVALID_INPUT");
    const key = resolveLoginKey(authorization, providerId);
    const existing = this.byKey.get(key);
    if (existing && this.sessions.get(existing)?.status !== "done")
      return { sessionId: existing, busy: true };
    const flow = authorization.describe(key);
    if (!flow) throw new SafeError("NO_FLOW");
    if (flow.inFlight) throw new SafeError("ALREADY_IN_FLIGHT");
    const method =
      p.method === undefined ? flow.methods[0]?.id : text(p.method);
    if (!method || !flow.methods.some((item) => item.id === method))
      throw new SafeError("UNKNOWN_METHOD");
    const session: Session = {
      id: this.id(),
      key,
      status: "running",
      declined: false,
      attempt: new AbortController(),
      events: [],
      nextIndex: 0,
      prompts: 0,
    };
    this.sessions.set(session.id, session);
    this.byKey.set(key, session.id);
    void this.run(session, authorization, method);
    return { sessionId: session.id };
  }
  events(input: unknown): LoginEventsResult {
    this.sweep();
    const p = exact(input, ["sessionId", "sinceIndex"]);
    const session = this.live(text(p.sessionId));
    if (
      typeof p.sinceIndex !== "number" ||
      !Number.isSafeInteger(p.sinceIndex) ||
      p.sinceIndex < 0
    )
      throw new SafeError("INVALID_INPUT");
    const start = session.events[0]?.index ?? session.nextIndex;
    const reset = p.sinceIndex < start ? true : undefined;
    const from = reset ? start : p.sinceIndex;
    return {
      events: session.events.filter((item) => item.index >= from),
      nextIndex: session.nextIndex,
      ...(reset ? { reset: true as const } : {}),
      status: session.status,
      ...(session.result ? { result: session.result } : {}),
      ...(session.error ? { error: session.error } : {}),
      ...(session.pending
        ? {
            pendingPrompt: {
              kind: "prompt" as const,
              seq: session.pending.seq,
              promptKind: session.pending.promptKind,
              ...(session.pending.message
                ? { message: session.pending.message }
                : {}),
              ...(session.pending.options
                ? { options: session.pending.options }
                : {}),
            },
          }
        : {}),
    };
  }
  answer(input: unknown) {
    this.sweep();
    const p = exact(input, ["sessionId", "seq", "decline", "value"]);
    const session = this.live(text(p.sessionId));
    if (
      typeof p.seq !== "number" ||
      !Number.isSafeInteger(p.seq) ||
      p.seq < 1
    )
      throw new SafeError("INVALID_INPUT");
    const pending = session.pending;
    if (!pending || pending.seq !== p.seq) throw new SafeError("STALE");
    if (p.decline === true) {
      session.declined = true;
      session.pending = undefined;
      if (session.status === "awaiting-prompt") session.status = "running";
      pending.reject(new AuthorizationDeclinedError());
      return { answered: true };
    }
    if (p.decline !== undefined && p.decline !== false)
      throw new SafeError("INVALID_INPUT");
    const value = text(p.value, LOGIN_MESSAGE_MAX);
    if (pending.optionIds && !pending.optionIds.has(value))
      throw new SafeError("INVALID_INPUT");
    session.pending = undefined;
    if (session.status === "awaiting-prompt") session.status = "running";
    pending.resolve(value);
    return { answered: true };
  }
  cancel(input: unknown) {
    this.sweep();
    const p = exact(input, ["sessionId"]);
    const session = this.live(text(p.sessionId));
    session.attempt.abort();
    this.getAuthorization()?.cancel(session.key);
    return { cancelled: true };
  }
  dispose() {
    for (const session of this.sessions.values()) {
      session.attempt.abort();
      try {
        this.getAuthorization()?.cancel(session.key);
      } catch {
        /* dispose must not throw */
      }
      this.finish(session, "cancelled");
    }
    this.sessions.clear();
    this.byKey.clear();
  }
  private requireAuthorization() {
    const authorization = this.getAuthorization();
    if (!authorization) throw new SafeError("UNAVAILABLE");
    return authorization;
  }
  private live(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new SafeError("NOT_FOUND");
    return session;
  }
  private async run(
    session: Session,
    authorization: AuthorizationSurface,
    method: string,
  ) {
    const interaction: AuthorizationInteraction = {
      notify: (notice) => {
        const event = noticeEvent(notice);
        if (event) this.push(session, event);
      },
      prompt: (prompt) => this.prompt(session, prompt),
    };
    try {
      const outcome = await authorization.begin({
        key: session.key,
        method,
        interaction,
        signal: session.attempt.signal,
      });
      if (outcome.status === "authorized") {
        try {
          await this.onAuthorized?.(
            credentialKeyId(session.key),
            credentialKeyScope(session.key),
          );
        } catch {
          /* The credential is already stored. A route write must not fail login. */
        }
        this.finish(session, "ok");
      } else this.finish(session, session.declined ? "declined" : "cancelled");
    } catch (error) {
      if (session.attempt.signal.aborted) {
        this.finish(session, session.declined ? "declined" : "cancelled");
        return;
      }
      const code =
        error &&
        typeof error === "object" &&
        "code" in error &&
        typeof (error as { code: unknown }).code === "string"
          ? (error as { code: string }).code
          : "UNAVAILABLE";
      if (code === "DECLINED") {
        this.finish(session, "declined");
        return;
      }
      const mapped = [
        "NO_FLOW",
        "UNKNOWN_METHOD",
        "NOT_COMMITTED",
        "BUSY",
        "ALREADY_IN_FLIGHT",
      ].includes(code)
        ? code
        : "UNAVAILABLE";
      this.finish(session, "failed", mapped);
    }
  }
  private prompt(session: Session, prompt: AuthorizationPrompt): Promise<string> {
    const seq = ++session.prompts;
    const promptKind: LoginPromptKind =
      prompt.kind === "secret" || prompt.kind === "select"
        ? prompt.kind
        : "text";
    const message = clipText(prompt.message, LOGIN_MESSAGE_MAX);
    const options =
      prompt.kind === "select"
        ? prompt.options
            .map((option) => {
              const id = clipText(option.id, 256);
              const label = clipText(option.label, 256);
              return id && label ? { id, label } : undefined;
            })
            .filter((item): item is { id: string; label: string } => !!item)
        : undefined;
    const event: LoginPromptEvent = {
      kind: "prompt",
      seq,
      promptKind,
      ...(message ? { message } : {}),
      ...(options && options.length ? { options } : {}),
    };
    this.push(session, event);
    session.status = "awaiting-prompt";
    return new Promise<string>((resolve, reject) => {
      const pending: PendingPrompt = {
        seq,
        promptKind,
        ...(message ? { message } : {}),
        ...(options && options.length ? { options } : {}),
        ...(options ? { optionIds: new Set(options.map((item) => item.id)) } : {}),
        resolve,
        reject,
      };
      session.pending = pending;
      const withdraw = () => {
        if (session.pending !== pending) return;
        session.pending = undefined;
        if (session.status === "awaiting-prompt") session.status = "running";
        this.push(session, { kind: "notice", message: PROMPT_WITHDRAWN });
        reject(new Error("withdrawn"));
      };
      if (prompt.signal?.aborted) {
        withdraw();
        return;
      }
      prompt.signal?.addEventListener("abort", withdraw, { once: true });
    });
  }
  private push(session: Session, event: LoginEvent) {
    const indexed: IndexedLoginEvent = { ...event, index: session.nextIndex };
    session.nextIndex += 1;
    session.events.push(indexed);
    while (session.events.length > LOGIN_EVENT_LIMIT) session.events.shift();
  }
  private finish(session: Session, result: LoginResult, error?: string) {
    if (session.status === "done") return;
    if (session.pending) {
      const pending = session.pending;
      session.pending = undefined;
      pending.reject(new Error("ended"));
    }
    session.status = "done";
    session.result = result;
    if (error) session.error = error;
    session.endedAt = this.now();
    if (this.byKey.get(session.key) === session.id)
      this.byKey.delete(session.key);
  }
  private sweep() {
    const now = this.now();
    for (const [id, session] of this.sessions) {
      if (
        session.status === "done" &&
        session.endedAt !== undefined &&
        now - session.endedAt >= LOGIN_SESSION_TTL_MS
      ) {
        this.sessions.delete(id);
        if (this.byKey.get(session.key) === id) this.byKey.delete(session.key);
      }
    }
  }
}

export function resolveLoginKey(
  authorization: AuthorizationSurface,
  providerId: string,
): CredentialKey {
  const candidates = [
    credentialKey(RECORD_SCOPE, providerId),
    credentialKey(PLUGIN_SCOPE, providerId),
  ];
  return (
    candidates.find((key) => authorization.describe(key)) ?? candidates[0]!
  );
}

function noticeEvent(notice: {
  message: string;
  url?: string;
  code?: string;
}): LoginEvent | undefined {
  const message = clipText(notice.message, LOGIN_MESSAGE_MAX);
  if (!message) return undefined;
  const url =
    typeof notice.url === "string" ? httpUrl(notice.url) : undefined;
  const code = clipText(notice.code, LOGIN_CODE_MAX);
  return {
    kind: "notice",
    message,
    ...(url ? { url } : {}),
    ...(code ? { code } : {}),
  };
}
