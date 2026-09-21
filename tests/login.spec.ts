import { test, expect } from "vitest";
import { AuthorizationDeclinedError } from "@deepseek-ai/dsh-authorization";
import { credentialKey, type CredentialKey } from "@deepseek-ai/dsh-credentials";
import { LoginSessionManager } from "../src/host/login.js";
import {
  LOGIN_EVENT_LIMIT,
  LOGIN_SESSION_TTL_MS,
  PROMPT_WITHDRAWN,
  httpUrl,
  type LoginStartResult,
} from "../src/shared/protocol.js";
import type { AuthorizationRequest } from "@deepseek-ai/dsh-authorization";

const tick = () => new Promise((r) => setTimeout(r, 0));

function recordKey(id = "openai-codex") {
  return credentialKey("llm-pi-ai", id);
}

function manager(
  begin: (request: AuthorizationRequest) => Promise<{ status: "authorized" | "cancelled" }>,
  options: {
    inFlight?: boolean;
    methods?: { id: string; label: string }[];
    now?: () => number;
    ids?: () => string;
    cancel?: (key: CredentialKey) => void;
    describe?: (key: CredentialKey) =>
      | {
          key: CredentialKey;
          label: string;
          methods: readonly { id: string; label: string }[];
          inFlight: boolean;
        }
      | undefined;
  } = {},
) {
  const key = recordKey();
  const methods = options.methods ?? [
    { id: "oauth", label: "OAuth" },
    { id: "api-key", label: "API key" },
  ];
  const cancelled: CredentialKey[] = [];
  let inFlight = options.inFlight === true;
  const auth = {
    list: () => [
      { key, label: "ChatGPT Codex", methods, inFlight },
    ],
    describe: (query: CredentialKey) =>
      options.describe
        ? options.describe(query)
        : query === key
          ? { key, label: "ChatGPT Codex", methods, inFlight }
          : undefined,
    begin: async (request: AuthorizationRequest) => {
      inFlight = true;
      try {
        return await begin(request);
      } finally {
        inFlight = false;
      }
    },
    cancel: (target: CredentialKey) => {
      cancelled.push(target);
      options.cancel?.(target);
    },
  };
  let n = 0;
  const logins = new LoginSessionManager(
    () => auth,
    options.now ?? (() => Date.now()),
    options.ids ?? (() => `session-${++n}`),
  );
  return { logins, cancelled, key };
}

test("loginStart returns before begin settles", async () => {
  let settle!: (value: { status: "authorized" }) => void;
  const { logins } = manager(
    () =>
      new Promise((resolve) => {
        settle = resolve;
      }),
  );
  const started = logins.start({
    providerId: "openai-codex",
  }) as LoginStartResult;
  expect(started).toEqual({ sessionId: "session-1" });
  expect(logins.events({ sessionId: started.sessionId, sinceIndex: 0 }).status).toBe(
    "running",
  );
  settle({ status: "authorized" });
  await tick();
  expect(logins.events({ sessionId: started.sessionId, sinceIndex: 0 })).toMatchObject({
    status: "done",
    result: "ok",
  });
});

test("second start for the same key returns BUSY with the live sessionId", () => {
  const { logins } = manager(
    () => new Promise(() => {}),
  );
  const first = logins.start({ providerId: "openai-codex" });
  const second = logins.start({ providerId: "openai-codex" });
  expect(second).toEqual({ sessionId: first.sessionId, busy: true });
});

test("in-flight flow without a local session is ALREADY_IN_FLIGHT not BUSY", () => {
  const { logins } = manager(() => new Promise(() => {}), { inFlight: true });
  expect(() => logins.start({ providerId: "openai-codex" })).toThrow(
    expect.objectContaining({ code: "ALREADY_IN_FLIGHT" }),
  );
});

test("missing flow and unknown method are explicit SafeError codes", () => {
  const { logins } = manager(() => new Promise(() => {}));
  expect(() => logins.start({ providerId: "no-such-provider" })).toThrow(
    expect.objectContaining({ code: "NO_FLOW" }),
  );
  expect(() =>
    logins.start({ providerId: "openai-codex", method: "sms" }),
  ).toThrow(expect.objectContaining({ code: "UNKNOWN_METHOD" }));
  expect(() => logins.start({ providerId: "Not Valid" })).toThrow(
    expect.objectContaining({ code: "INVALID_INPUT" }),
  );
});

test("notices whitelist url/code and drop javascript urls and extra fields", async () => {
  const { logins } = manager(async (request) => {
    request.interaction.notify({
      message: "Open this page",
      url: "javascript:alert(1)",
      code: "CODE-1",
    });
    request.interaction.notify({
      message: "Device login",
      url: "https://example.test/device",
      code: "WXYZ",
      token: "SECRET-TOKEN",
    } as never);
    return { status: "cancelled" };
  });
  const { sessionId } = logins.start({ providerId: "openai-codex" });
  await tick();
  const result = logins.events({ sessionId, sinceIndex: 0 });
  expect(result.events).toEqual([
    {
      kind: "notice",
      index: 0,
      message: "Open this page",
      code: "CODE-1",
    },
    {
      kind: "notice",
      index: 1,
      message: "Device login",
      url: "https://example.test/device",
      code: "WXYZ",
    },
  ]);
  expect(JSON.stringify(result)).not.toContain("SECRET");
  expect(httpUrl("javascript:alert(1)")).toBeUndefined();
  expect(httpUrl("https://user:pass@example.test/")).toBeUndefined();
});

test("text prompt answer, select validation, and secret stay off the event log", async () => {
  const seen: string[] = [];
  const { logins } = manager(async (request) => {
    seen.push(
      await request.interaction.prompt({
        kind: "secret",
        message: "Paste the API key",
      }),
    );
    seen.push(
      await request.interaction.prompt({
        kind: "select",
        message: "Sign-in method",
        options: [
          { id: "oauth", label: "OAuth" },
          { id: "api-key", label: "API key" },
        ],
      }),
    );
    return { status: "authorized" };
  });
  const { sessionId } = logins.start({ providerId: "openai-codex" });
  await tick();
  expect(
    logins.events({ sessionId, sinceIndex: 0 }).pendingPrompt?.promptKind,
  ).toBe("secret");
  logins.answer({ sessionId, seq: 1, value: "SYNTHETIC-SECRET" });
  await tick();
  expect(() =>
    logins.answer({ sessionId, seq: 2, value: "nope" }),
  ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
  logins.answer({ sessionId, seq: 2, value: "oauth" });
  await tick();
  expect(seen).toEqual(["SYNTHETIC-SECRET", "oauth"]);
  expect(JSON.stringify(logins.events({ sessionId, sinceIndex: 0 }))).not.toContain(
    "SYNTHETIC-SECRET",
  );
  expect(logins.events({ sessionId, sinceIndex: 0 })).toMatchObject({
    status: "done",
    result: "ok",
  });
});

test("decline rejects with AuthorizationDeclinedError and settles declined", async () => {
  let declined = false;
  const { logins } = manager(async (request) => {
    try {
      await request.interaction.prompt({ kind: "text", message: "Continue?" });
    } catch (error) {
      declined = error instanceof AuthorizationDeclinedError;
      return { status: "cancelled" };
    }
    return { status: "authorized" };
  });
  const { sessionId } = logins.start({ providerId: "openai-codex" });
  await tick();
  logins.answer({ sessionId, seq: 1, decline: true });
  await tick();
  expect(declined).toBe(true);
  expect(logins.events({ sessionId, sinceIndex: 0 })).toMatchObject({
    status: "done",
    result: "declined",
  });
});

test("withdrawn prompt is a non-DECLINED reject, emits notice, and stays running", async () => {
  let withdrawError: unknown;
  const { logins } = manager(async (request) => {
    const signal = new AbortController();
    const pending = request.interaction.prompt({
      kind: "text",
      message: "Paste the code or wait for the browser",
      signal: signal.signal,
    });
    signal.abort();
    try {
      await pending;
    } catch (error) {
      withdrawError = error;
    }
    request.interaction.notify({
      message: "Browser finished first",
      url: "https://example.test/callback",
    });
    await new Promise<void>((resolve) => {
      request.signal?.addEventListener("abort", () => resolve(), { once: true });
    });
    return { status: "cancelled" };
  });
  const { sessionId } = logins.start({ providerId: "openai-codex" });
  await tick();
  const result = logins.events({ sessionId, sinceIndex: 0 });
  expect(withdrawError).toBeInstanceOf(Error);
  expect(withdrawError).not.toBeInstanceOf(AuthorizationDeclinedError);
  expect(result.status).toBe("running");
  expect(result.pendingPrompt).toBeUndefined();
  expect(result.events.some((event) => event.kind === "notice" && event.message === PROMPT_WITHDRAWN)).toBe(
    true,
  );
  expect(() => logins.answer({ sessionId, seq: 1, value: "late" })).toThrow(
    expect.objectContaining({ code: "STALE" }),
  );
});

test("cancel aborts the attempt signal and maps to cancelled", async () => {
  const { logins, cancelled, key } = manager(async (request) => {
    await new Promise<void>((resolve) => {
      request.signal?.addEventListener("abort", () => resolve(), { once: true });
    });
    return { status: "cancelled" };
  });
  const { sessionId } = logins.start({ providerId: "openai-codex" });
  expect(logins.cancel({ sessionId })).toEqual({ cancelled: true });
  expect(cancelled).toEqual([key]);
  await tick();
  expect(logins.events({ sessionId, sinceIndex: 0 })).toMatchObject({
    status: "done",
    result: "cancelled",
  });
});

test("begin throw codes map through and unused sessions 404 after TTL", async () => {
  const { logins: inflight } = manager(async () => {
    throw Object.assign(new Error("busy"), { code: "ALREADY_IN_FLIGHT" });
  });
  const blocked = inflight.start({ providerId: "openai-codex" });
  await tick();
  expect(
    inflight.events({ sessionId: blocked.sessionId, sinceIndex: 0 }),
  ).toMatchObject({
    status: "done",
    result: "failed",
    error: "ALREADY_IN_FLIGHT",
  });
  const { logins: failing } = manager(async () => {
    throw Object.assign(new Error("no write"), { code: "NOT_COMMITTED" });
  });
  const failed = failing.start({ providerId: "openai-codex" });
  await tick();
  expect(failing.events({ sessionId: failed.sessionId, sinceIndex: 0 })).toMatchObject(
    {
      status: "done",
      result: "failed",
      error: "NOT_COMMITTED",
    },
  );
  expect(() => failing.events({ sessionId: "missing", sinceIndex: 0 })).toThrow(
    expect.objectContaining({ code: "NOT_FOUND" }),
  );
  let now = 1_000;
  const { logins } = manager(
    async () => ({ status: "authorized" }),
    { now: () => now },
  );
  const { sessionId } = logins.start({ providerId: "openai-codex" });
  await tick();
  now += LOGIN_SESSION_TTL_MS;
  expect(() => logins.events({ sessionId, sinceIndex: 0 })).toThrow(
    expect.objectContaining({ code: "NOT_FOUND" }),
  );
});

test("event buffer overflow returns RESET with the retained window", async () => {
  const { logins } = manager(async (request) => {
    for (let i = 0; i < LOGIN_EVENT_LIMIT + 5; i++)
      request.interaction.notify({ message: `step-${i}` });
    return { status: "cancelled" };
  });
  const { sessionId } = logins.start({ providerId: "openai-codex" });
  await tick();
  const result = logins.events({ sessionId, sinceIndex: 0 });
  expect(result.reset).toBe(true);
  expect(result.events).toHaveLength(LOGIN_EVENT_LIMIT);
  expect(result.events[0]).toMatchObject({
    kind: "notice",
    index: 5,
    message: "step-5",
  });
});

test("dispose aborts live attempts", async () => {
  let aborted = false;
  const { logins } = manager(async (request) => {
    await new Promise<void>((resolve) => {
      request.signal?.addEventListener(
        "abort",
        () => {
          aborted = true;
          resolve();
        },
        { once: true },
      );
    });
    return { status: "cancelled" };
  });
  const { sessionId } = logins.start({ providerId: "openai-codex" });
  logins.dispose();
  await tick();
  expect(aborted).toBe(true);
  expect(() => logins.events({ sessionId, sinceIndex: 0 })).toThrow(
    expect.objectContaining({ code: "NOT_FOUND" }),
  );
});

test("two keys can run at once", () => {
  const firstKey = recordKey("openai-codex");
  const secondKey = recordKey("google-gemini-cli");
  const methods = [{ id: "oauth", label: "OAuth" }] as const;
  const auth = {
    list: () => [
      { key: firstKey, label: "A", methods, inFlight: false },
      { key: secondKey, label: "B", methods, inFlight: false },
    ],
    describe: (key: CredentialKey) =>
      key === firstKey || key === secondKey
        ? { key, label: "X", methods, inFlight: false }
        : undefined,
    begin: () => new Promise<{ status: "authorized" }>(() => {}),
    cancel: () => {},
  };
  const logins = new LoginSessionManager(() => auth, () => 0, (() => {
    let n = 0;
    return () => `s${++n}`;
  })());
  expect(logins.start({ providerId: "openai-codex" }).sessionId).toBe("s1");
  expect(logins.start({ providerId: "google-gemini-cli" }).sessionId).toBe("s2");
});
