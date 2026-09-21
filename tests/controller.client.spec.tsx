import { test, expect, vi } from "vitest";
import { Controller } from "../src/client/controller.js";
import { validateQuota } from "../src/client/validation.js";
const fixtureCard = (id: string, model = id) => ({
  id,
  name: id,
  available: true,
  revision: 1,
  models: [{ id: model }],
});
const fixtureSnapshot = (providers: unknown[] = []) => ({
  settingsWritable: true,
  customRevision: 1,
  providers,
  muse: { installed: false, status: "CLI_ONLY", docs: "https://example.test" },
});
test("initial rejection leaves loading, retry succeeds, drafts preserved", async () => {
  let fail = true;
  const c: any = new Controller({
    rpc: async () => {
      if (fail) throw Error("secret");
      return fixtureSnapshot();
    },
    reveal: async () => ({}),
  });
  c.drafts.route = "draft";
  await c.load();
  expect(c.state.status).toBe("error");
  expect(JSON.stringify(c.state)).not.toContain("secret");
  fail = false;
  await c.load();
  expect(c.state.status).toBe("ready");
  expect(c.drafts.route).toBe("draft");
});
test("hide and disposal invalidate late reveal", async () => {
  let resolve: any;
  const c: any = new Controller({
    rpc: async () => fixtureSnapshot(),
    reveal: () => new Promise((r) => (resolve = r)),
  });
  const p = c.reveal({ id: "x", bindingToken: "t" });
  c.hide();
  resolve({ value: "SYNTHETIC", source: "file", revealTTL: 30000 });
  await p;
  expect(c.state.revealed).toBeUndefined();
  c.dispose();
  expect(c.state.revealed).toBeUndefined();
});
test("old load cannot override new load and read timeout leaves loading", async () => {
  let resolve: any;
  let n = 0;
  const c: any = new Controller(
    {
      rpc: () =>
        ++n === 1
          ? new Promise((r) => (resolve = r))
          : Promise.resolve(fixtureSnapshot([fixtureCard("new")])),
      reveal: async () => ({}),
    },
    10,
  );
  const first = c.load();
  await c.load();
  resolve(fixtureSnapshot([fixtureCard("old")]));
  await first;
  expect(c.state.snapshot.providers.map((p: any) => p.id)).toEqual(["new"]);
  const timeout: any = new Controller(
    { rpc: () => new Promise(() => {}), reveal: async () => ({}) },
    5,
  );
  await timeout.load();
  expect(timeout.state.status).toBe("error");
});
test("expiry and connection loss clear revealed value and reconnect preserves draft", async () => {
  vi.useFakeTimers();
  const c = new Controller({
    rpc: async () => fixtureSnapshot(),
    reveal: async () => ({ value: "SYNTHETIC", revealTTL: 30000 }),
  });
  c.drafts.route = "kept";
  await c.reveal({ id: "x", bindingToken: "t" });
  expect(c.state.revealed?.value).toBe("SYNTHETIC");
  await vi.advanceTimersByTimeAsync(30000);
  expect(c.state.revealed).toBeUndefined();
  await c.reveal({ id: "x", bindingToken: "t" });
  c.connectionChanged(false);
  expect(c.state.status).toBe("error");
  expect(c.state.revealed).toBeUndefined();
  c.connectionChanged(true);
  await vi.advanceTimersByTimeAsync(1);
  expect(c.state.status).toBe("ready");
  expect(c.drafts.route).toBe("kept");
  c.dispose();
  vi.useRealTimers();
});
test("catalog refresh cannot overwrite a newer full snapshot", async () => {
  let resolve: any;
  const c = new Controller({
    rpc: async (endpoint) =>
      endpoint === "models/refresh"
        ? new Promise((r) => (resolve = r))
        : fixtureSnapshot([fixtureCard("x", "new")]),
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  const refresh = c.refresh({ id: "x" } as any);
  await c.load();
  resolve(fixtureCard("x", "old"));
  await refresh;
  expect(c.state.snapshot?.providers[0].models[0].id).toBe("new");
  c.dispose();
});
test.each([
  { providers: [] },
  { providers: {}, muse: {} },
  {
    providers: [{ id: "x", models: {} }],
    muse: {
      installed: false,
      status: "CLI_ONLY",
      docs: "https://example.test",
    },
  },
])("malformed snapshot becomes retryable error: %j", async (invalid) => {
  let response: unknown = invalid;
  const c = new Controller({
    rpc: async () => response,
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  expect(c.state.status).toBe("error");
  expect(c.state.snapshot).toBeUndefined();
  response = {
    settingsWritable: true,
    customRevision: 1,
    providers: [],
    muse: {
      installed: false,
      status: "CLI_ONLY",
      docs: "https://example.test",
    },
  };
  await c.load();
  expect(c.state.status).toBe("ready");
  c.dispose();
});
test("malformed refreshed card is rejected without corrupting loaded catalog", async () => {
  const card = {
    id: "x",
    name: "X",
    available: true,
    revision: 1,
    models: [{ id: "kept" }],
  };
  const c = new Controller({
    rpc: async (endpoint) =>
      endpoint === "snapshot"
        ? {
            settingsWritable: true,
            customRevision: 1,
            providers: [card],
            muse: {
              installed: false,
              status: "CLI_ONLY",
              docs: "https://example.test",
            },
          }
        : { ...card, models: {} },
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  await c.refresh(card);
  expect(c.state.operations["models:x"].status).toBe("error");
  expect(c.state.snapshot?.providers[0].models).toEqual([{ id: "kept" }]);
  c.dispose();
});

const quotaFixture = (
  providerId: string,
  windows: unknown[],
  extra: Record<string, unknown> = {},
) => ({
  providerId,
  status: "ready",
  stale: false,
  source: "opencode-official",
  fetchedAt: "2026-09-21T00:00:00.000Z",
  windows,
  ...extra,
});

test("quota reads are per card and a slow card cannot block another", async () => {
  let release: (value: unknown) => void = () => {};
  const c = new Controller({
    rpc: async (endpoint, payload: any) => {
      if (endpoint === "snapshot")
        return fixtureSnapshot([
          fixtureCard("opencode-go"),
          fixtureCard("commandcode"),
        ]);
      if (payload?.providerId === "opencode-go")
        return new Promise((resolve) => (release = resolve));
      return quotaFixture("commandcode", [
        { id: "five-hour", usedPercent: 10, remainingPercent: 90 },
      ]);
    },
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  await vi.waitFor(() =>
    expect(c.state.quotas.commandcode?.status).toBe("ready"),
  );
  expect(c.state.quotas["opencode-go"]?.status).toBe("loading");
  expect(c.state.quotas.commandcode.snapshot?.windows[0].remainingPercent).toBe(
    90,
  );
  release(
    quotaFixture("opencode-go", [
      { id: "five-hour", usedPercent: 0, remainingPercent: 100 },
    ]),
  );
  await vi.waitFor(() =>
    expect(c.state.quotas["opencode-go"]?.status).toBe("ready"),
  );
  c.dispose();
});

test("quota RPC or validation failure does not keep previous windows", async () => {
  let fail = false;
  const c = new Controller({
    rpc: async (endpoint) => {
      if (endpoint === "snapshot")
        return fixtureSnapshot([
          { ...fixtureCard("opencode-go"), bindingToken: "t" },
        ]);
      if (fail) throw { code: "UNAUTHORIZED" };
      return quotaFixture("opencode-go", [
        { id: "five-hour", usedPercent: 0, remainingPercent: 100 },
      ]);
    },
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  await vi.waitFor(() =>
    expect(
      c.state.quotas["opencode-go"]?.snapshot?.windows[0].remainingPercent,
    ).toBe(100),
  );
  fail = true;
  await c.refreshQuota({ id: "opencode-go", bindingToken: "t" }, true);
  expect(c.state.quotas["opencode-go"]?.snapshot).toBeUndefined();
  expect(c.state.quotas["opencode-go"]?.status).toBe("error");
  c.dispose();
});

test("saving a new key with the same token drops the previous account quota", async () => {
  let key = "old";
  const provider = {
    ...fixtureCard("opencode-go"),
    bindingToken: "same-token",
    credential: { configured: true, writable: true, source: "file" },
  };
  const c = new Controller({
    rpc: async (endpoint) => {
      if (endpoint === "snapshot") return fixtureSnapshot([provider]);
      if (endpoint === "credential/set")
        return { configured: true, writable: true, source: "file" };
      if (key === "old")
        return quotaFixture("opencode-go", [
          { id: "five-hour", usedPercent: 5, remainingPercent: 95 },
        ]);
      throw { code: "UNAUTHORIZED" };
    },
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  await vi.waitFor(() =>
    expect(
      c.state.quotas["opencode-go"]?.snapshot?.windows[0].remainingPercent,
    ).toBe(95),
  );
  key = "new";
  await expect(c.saveKey(provider, "SYNTHETIC-NEW")).resolves.toBe(true);
  expect(c.state.operations["key:opencode-go"].status).toBe("success");
  expect(c.state.quotas["opencode-go"]?.snapshot).toBeUndefined();
  c.dispose();
});

test("late quota results after hide, disconnect or a newer snapshot are ignored", async () => {
  let release: (value: unknown) => void = () => {};
  const c = new Controller({
    rpc: async (endpoint) => {
      if (endpoint === "snapshot")
        return fixtureSnapshot([fixtureCard("opencode-go")]);
      return new Promise((resolve) => (release = resolve));
    },
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  c.visibilityChanged(false);
  release(
    quotaFixture("opencode-go", [
      { id: "five-hour", usedPercent: 0, remainingPercent: 100 },
    ]),
  );
  await Promise.resolve();
  expect(c.state.quotas["opencode-go"]?.snapshot).toBeUndefined();
  c.dispose();
});

test("quota poll stops while hidden and only rereads expired cards when visible", async () => {
  vi.useFakeTimers();
  let reads = 0;
  const c = new Controller(
    {
      rpc: async (endpoint) => {
        if (endpoint === "snapshot")
          return fixtureSnapshot([fixtureCard("opencode-go")]);
        reads += 1;
        return quotaFixture(
          "opencode-go",
          [
            {
              id: "five-hour",
              usedPercent: reads,
              remainingPercent: Math.max(0, 100 - reads),
            },
          ],
          { fetchedAt: new Date().toISOString() },
        );
      },
      reveal: async () => ({ value: "", revealTTL: 1 }),
    },
    15000,
    60_000,
  );
  await c.load();
  await vi.advanceTimersByTimeAsync(1);
  expect(reads).toBe(1);
  c.visibilityChanged(false);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(reads).toBe(1);
  c.visibilityChanged(true);
  await vi.advanceTimersByTimeAsync(1);
  expect(reads).toBe(2);
  c.dispose();
  vi.useRealTimers();
});

test("malformed quota payloads never enter client state", async () => {
  const c = new Controller({
    rpc: async (endpoint) => {
      if (endpoint === "snapshot")
        return fixtureSnapshot([fixtureCard("opencode-go")]);
      return { status: "ready", windows: [{ id: "nope", usedPercent: 1 }] };
    },
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  await vi.waitFor(() =>
    expect(c.state.quotas["opencode-go"]?.status).toBe("error"),
  );
  expect(c.state.quotas["opencode-go"]?.snapshot).toBeUndefined();
  c.dispose();
});

const validQuota = quotaFixture("opencode-go", [
  { id: "five-hour", usedPercent: 20, remainingPercent: 80 },
]);

test("validateQuota rejects mismatched id, non-ISO time, range, and remaining overflow", () => {
  expect(() =>
    validateQuota({ ...validQuota, providerId: "commandcode" }, "opencode-go"),
  ).toThrow();
  expect(() =>
    validateQuota(
      { ...validQuota, fetchedAt: "2026-09-21 00:00:00" },
      "opencode-go",
    ),
  ).toThrow();
  expect(() =>
    validateQuota(
      { ...validQuota, fetchedAt: "1999-01-01T00:00:00.000Z" },
      "opencode-go",
    ),
  ).toThrow();
  expect(() =>
    validateQuota(
      {
        ...validQuota,
        windows: [{ id: "five-hour", remainingPercent: 1000 }],
      },
      "opencode-go",
    ),
  ).toThrow();
  expect(() =>
    validateQuota(
      {
        ...validQuota,
        windows: [
          { id: "five-hour", remainingPercent: Number.POSITIVE_INFINITY },
        ],
      },
      "opencode-go",
    ),
  ).toThrow();
  expect(
    validateQuota(
      {
        ...validQuota,
        windows: [{ id: "weekly", remainingPercent: 40 }],
      },
      "opencode-go",
    ).windows[0].remainingPercent,
  ).toBe(40);
});

test("providerId mismatch or remaining overflow does not keep previous windows", async () => {
  let payload: unknown = quotaFixture("opencode-go", [
    { id: "five-hour", usedPercent: 0, remainingPercent: 100 },
  ]);
  const c = new Controller({
    rpc: async (endpoint) => {
      if (endpoint === "snapshot")
        return fixtureSnapshot([
          { ...fixtureCard("opencode-go"), bindingToken: "t" },
        ]);
      return payload;
    },
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  await vi.waitFor(() =>
    expect(
      c.state.quotas["opencode-go"]?.snapshot?.windows[0].remainingPercent,
    ).toBe(100),
  );
  payload = quotaFixture("commandcode", [
    { id: "five-hour", usedPercent: 1, remainingPercent: 99 },
  ]);
  await c.refreshQuota({ id: "opencode-go", bindingToken: "t" }, true);
  expect(c.state.quotas["opencode-go"]?.snapshot).toBeUndefined();
  expect(c.state.quotas["opencode-go"]?.status).toBe("error");
  payload = quotaFixture("opencode-go", [
    { id: "five-hour", remainingPercent: 1000 },
  ]);
  await c.refreshQuota({ id: "opencode-go", bindingToken: "t" }, true);
  expect(c.state.quotas["opencode-go"]?.snapshot).toBeUndefined();
  expect(c.state.quotas["opencode-go"]?.status).toBe("error");
  c.dispose();
});

test("snapshot without oauth stays ready with an empty oauth list", async () => {
  const c = new Controller({
    rpc: async () => fixtureSnapshot(),
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  expect(c.state.status).toBe("ready");
  expect(c.state.snapshot?.oauth).toEqual([]);
  expect(c.state.snapshot?.oauthUnavailable).toBe(false);
  c.dispose();
});

test("loginStart returns a session immediately and polls running events", async () => {
  const calls: string[] = [];
  const c = new Controller(
    {
      rpc: async (endpoint) => {
        calls.push(endpoint);
        if (endpoint === "login/start") return { sessionId: "sess-live" };
        if (endpoint === "login/events")
          return {
            events: [
              {
                kind: "notice",
                index: 0,
                message: "Open",
                url: "https://example.test/login",
              },
            ],
            nextIndex: 1,
            status: "running",
          };
        return fixtureSnapshot();
      },
      reveal: async () => ({ value: "", revealTTL: 1 }),
    },
    15000,
    300000,
    60_000,
  );
  await c.load();
  await c.loginStart("openai-codex", "oauth");
  expect(c.state.login?.sessionId).toBe("sess-live");
  expect(c.state.login?.phase).toBe("running");
  expect(c.state.login?.events[0]).toMatchObject({
    url: "https://example.test/login",
  });
  expect(calls.filter((item) => item === "login/start")).toEqual(["login/start"]);
  expect(calls).toContain("login/events");
  c.dispose();
});

test("BUSY loginStart takes over the existing sessionId", async () => {
  const c = new Controller(
    {
      rpc: async (endpoint) => {
        if (endpoint === "login/start")
          return { sessionId: "already", busy: true };
        if (endpoint === "login/events")
          return {
            events: [],
            nextIndex: 0,
            status: "awaiting-prompt",
            pendingPrompt: {
              kind: "prompt",
              seq: 1,
              promptKind: "text",
              message: "Paste code",
            },
          };
        return fixtureSnapshot();
      },
      reveal: async () => ({ value: "", revealTTL: 1 }),
    },
    15000,
    300000,
    60_000,
  );
  await c.load();
  await c.loginStart("openai-codex");
  expect(c.state.login?.sessionId).toBe("already");
  expect(c.state.login?.phase).toBe("awaiting-prompt");
  expect(c.state.operations.login?.status).not.toBe("error");
  c.dispose();
});

test("loginAnswer does not keep a secret on client state; NOT_FOUND stops polling", async () => {
  let gone = false;
  let events: unknown = {
    events: [],
    nextIndex: 0,
    status: "awaiting-prompt",
    pendingPrompt: {
      kind: "prompt",
      seq: 1,
      promptKind: "secret",
      message: "API key",
    },
  };
  const answers: unknown[] = [];
  const c = new Controller(
    {
      rpc: async (endpoint, payload) => {
        if (endpoint === "login/start") return { sessionId: "s" };
        if (endpoint === "login/events") {
          if (gone) throw { code: "NOT_FOUND" };
          return events;
        }
        if (endpoint === "login/answer") {
          answers.push(payload);
          events = { events: [], nextIndex: 0, status: "running" };
          return { answered: true };
        }
        if (endpoint === "login/cancel") return { cancelled: true };
        return fixtureSnapshot();
      },
      reveal: async () => ({ value: "", revealTTL: 1 }),
    },
    15000,
    300000,
    60_000,
  );
  await c.load();
  await c.loginStart("openai-codex");
  await c.loginAnswer(1, "SUPER-SECRET-VALUE");
  expect(answers[0]).toMatchObject({ seq: 1, value: "SUPER-SECRET-VALUE" });
  expect(JSON.stringify(c.state)).not.toContain("SUPER-SECRET-VALUE");
  gone = true;
  await c.loginCancel();
  expect(c.state.login?.error).toBe("NOT_FOUND");
  expect(c.state.login?.phase).toBe("done");
  c.dispose();
});

test("stale loginStart is discarded and its session is cancelled", async () => {
  let releaseA!: (value: { sessionId: string }) => void;
  const cancelled: string[] = [];
  const started: string[] = [];
  const c = new Controller(
    {
      rpc: async (endpoint, payload) => {
        if (endpoint === "login/start") {
          const id = (payload as { providerId: string }).providerId;
          started.push(id);
          if (id === "openai-codex")
            return await new Promise<{ sessionId: string }>((resolve) => {
              releaseA = resolve;
            });
          return { sessionId: "sess-b" };
        }
        if (endpoint === "login/events")
          return { events: [], nextIndex: 0, status: "running" };
        if (endpoint === "login/cancel") {
          cancelled.push((payload as { sessionId: string }).sessionId);
          return { cancelled: true };
        }
        return fixtureSnapshot();
      },
      reveal: async () => ({ value: "", revealTTL: 1 }),
    },
    15000,
    300000,
    60_000,
  );
  await c.load();
  const first = c.loginStart("openai-codex");
  await vi.waitFor(() => expect(started).toEqual(["openai-codex"]));
  const second = c.loginStart("github-copilot");
  await second;
  releaseA({ sessionId: "sess-a" });
  await first;
  expect(c.state.login?.providerId).toBe("github-copilot");
  expect(c.state.login?.sessionId).toBe("sess-b");
  expect(cancelled).toEqual(["sess-a"]);
  c.dispose();
});

test("login error codes stay uncollapsed", async () => {
  const c = new Controller({
    rpc: async (endpoint) => {
      if (endpoint === "login/start") throw { code: "NO_FLOW" };
      return fixtureSnapshot();
    },
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  await c.loginStart("openai-codex");
  expect(c.state.operations.login).toEqual({
    status: "error",
    error: "NO_FLOW",
  });
  c.dispose();
});

test("ALREADY_IN_FLIGHT stays uncollapsed", async () => {
  const c = new Controller({
    rpc: async (endpoint) => {
      if (endpoint === "login/start") throw { code: "ALREADY_IN_FLIGHT" };
      return fixtureSnapshot();
    },
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  await c.loginStart("openai-codex");
  expect(c.state.operations.login).toEqual({
    status: "error",
    error: "ALREADY_IN_FLIGHT",
  });
  c.dispose();
});
