import { test, expect, vi } from "vitest";
import { Manager } from "../src/host/providers.js";
import {
  parseOpenCodeUsage,
  parseCommandCredits,
  commandSourceAmbiguous,
  unofficialEndpoint,
  QuotaReader,
  OPENCODE_USAGE_URL,
  COMMAND_CREDITS_URL,
} from "../src/host/quota.js";
import { fixture } from "./fixtures/services.js";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function manager(f = fixture(), reader?: QuotaReader) {
  return new Manager(f.services, {}, reader) as any;
}

function windowOf(windows: unknown[], id: string) {
  return (windows as { id: string }[]).find((w) => w.id === id);
}

test.each([
  {
    name: "used 0 → remaining 100",
    body: { rolling: { percent: 0 } },
    id: "five-hour",
    usedPercent: 0,
    remainingPercent: 100,
  },
  {
    name: "used 100 → remaining 0",
    body: { rollingUsage: { usagePercent: 100 } },
    id: "five-hour",
    usedPercent: 100,
    remainingPercent: 0,
  },
  {
    name: "overage keeps used and clips remaining",
    body: { session: { percent: 137 } },
    id: "five-hour",
    usedPercent: 137,
    remainingPercent: 0,
  },
  {
    name: "usage fraction ≤1",
    body: { rolling: { usage: 0.25 } },
    id: "five-hour",
    usedPercent: 25,
    remainingPercent: 75,
  },
  {
    name: "usage >1 is percent",
    body: { weekly: { usage: 40 } },
    id: "weekly",
    usedPercent: 40,
    remainingPercent: 60,
  },
])("OpenCode parser $name", ({ body, id, usedPercent, remainingPercent }) => {
  const windows = parseOpenCodeUsage(body);
  expect(windows).toBeDefined();
  expect(windowOf(windows!, id)).toMatchObject({
    id,
    usedPercent,
    remainingPercent,
  });
});

test("OpenCode unwraps usage envelope and keeps independent windows", () => {
  const windows = parseOpenCodeUsage({
    usage: {
      rolling: { percent: 10, status: "ok" },
      weeklyUsage: { percent: 90, status: "rate-limited" },
      monthly: { percent: 5 },
    },
  });
  expect(windows?.map((w) => w.id)).toEqual(["five-hour", "weekly", "monthly"]);
  expect(windowOf(windows!, "weekly")).toMatchObject({
    usedPercent: 90,
    remainingPercent: 10,
  });
});

test.each([
  { rolling: { percent: Number.NaN } },
  { rolling: { percent: Number.POSITIVE_INFINITY } },
  { rolling: { percent: -1 } },
  { rolling: { usagePercent: "12" } },
  { rolling: { usage: "0.2" } },
  { rolling: { status: "paused", percent: 10 } },
  { rolling: { status: 1, percent: 10 } },
])("OpenCode drops unusable window %j", (body) => {
  expect(parseOpenCodeUsage(body)).toBeUndefined();
});

test("OpenCode ISO and unix second/ms resets; bad reset omits time only", () => {
  const iso = parseOpenCodeUsage({
    rolling: { percent: 1, resetsAt: "2026-09-21T12:00:00.000Z" },
  });
  expect(windowOf(iso!, "five-hour")?.resetsAt).toBe(
    "2026-09-21T12:00:00.000Z",
  );
  const seconds = parseOpenCodeUsage({
    rolling: { percent: 1, resets_at: 1710000000 },
  });
  expect(windowOf(seconds!, "five-hour")?.resetsAt).toBe(
    new Date(1710000000 * 1000).toISOString(),
  );
  const ms = parseOpenCodeUsage({
    rolling: { percent: 1, resetAt: 1710000000000 },
  });
  expect(windowOf(ms!, "five-hour")?.resetsAt).toBe(
    new Date(1710000000000).toISOString(),
  );
  const bad = parseOpenCodeUsage({
    rolling: { percent: 12, resetsAt: "not-a-date" },
  });
  expect(windowOf(bad!, "five-hour")).toEqual({
    id: "five-hour",
    usedPercent: 12,
    remainingPercent: 88,
  });
  const expired = parseOpenCodeUsage({
    rolling: { percent: 40, resetsAt: "2020-01-01T00:00:00.000Z" },
  });
  expect(windowOf(expired!, "five-hour")).toMatchObject({
    usedPercent: 40,
    remainingPercent: 60,
    resetsAt: "2020-01-01T00:00:00.000Z",
  });
});

test.each([
  {
    name: "used 0 cap 10",
    body: {
      windowLimits: { fiveHour: { used: 0, cap: 10, resetAt: 1710000000000 } },
    },
    usedPercent: 0,
    remainingPercent: 100,
  },
  {
    name: "used equals cap",
    body: { windowLimits: { fiveHour: { used: 8, cap: 8 } } },
    usedPercent: 100,
    remainingPercent: 0,
  },
  {
    name: "overage",
    body: { windowLimits: { fiveHour: { used: 12, cap: 8 } } },
    usedPercent: 150,
    remainingPercent: 0,
  },
])("Command parser $name", ({ body, usedPercent, remainingPercent }) => {
  const windows = parseCommandCredits(body);
  expect(windowOf(windows!, "five-hour")).toMatchObject({
    id: "five-hour",
    usedPercent,
    remainingPercent,
  });
});

test("Command weekly is independent and resetAt is milliseconds", () => {
  const windows = parseCommandCredits({
    windowLimits: {
      fiveHour: { used: 1, cap: 10, resetAt: 1710000000000 },
      weekly: { used: 9, cap: 10, resetAt: 1810000000000 },
    },
    credits: { monthlyCredits: 99, purchasedCredits: 1, freeCredits: 2 },
  });
  expect(windows?.map((w) => w.id)).toEqual(["five-hour", "weekly"]);
  expect(windowOf(windows!, "five-hour")?.resetsAt).toBe(
    new Date(1710000000000).toISOString(),
  );
  expect(JSON.stringify(windows)).not.toContain("99");
});

test("Command zero cap and missing fields do not invent percents", () => {
  const zero = parseCommandCredits({
    windowLimits: { fiveHour: { used: 3, cap: 0, resetAt: 1710000000000 } },
  });
  expect(windowOf(zero!, "five-hour")).toEqual({
    id: "five-hour",
    resetsAt: new Date(1710000000000).toISOString(),
  });
  const missingCap = parseCommandCredits({
    windowLimits: { weekly: { used: 4 } },
  });
  expect(windowOf(missingCap!, "weekly")).toEqual({ id: "weekly" });
  const missingUsed = parseCommandCredits({
    windowLimits: { weekly: { cap: 10 } },
  });
  expect(windowOf(missingUsed!, "weekly")).toEqual({ id: "weekly" });
  expect(
    parseCommandCredits({ credits: { monthlyCredits: 1 } }),
  ).toBeUndefined();
});

test("Command does not treat second-scale numbers as unix seconds", () => {
  const windows = parseCommandCredits({
    windowLimits: { fiveHour: { used: 1, cap: 2, resetAt: 1710000000 } },
  });
  expect(windowOf(windows!, "five-hour")?.resetsAt).toBeUndefined();
});

test("empty default Command fields are not ambiguous; extra accounts and keys are", () => {
  expect(
    commandSourceAmbiguous(
      { accounts: [], modelAccountRules: [], activeAccount: "" },
      [{ path: ["apiKey"], set: false }],
    ),
  ).toBe(false);
  expect(
    commandSourceAmbiguous(
      { activeAccount: "default", apiKeyEnv: "COMMANDCODE_API_KEY" },
      [{ path: ["apiKey"], set: false }],
    ),
  ).toBe(false);
  expect(
    commandSourceAmbiguous({ activeAccount: "COMMANDCODE_API_KEY" }, [
      { path: ["apiKey"], set: false },
    ]),
  ).toBe(false);
  expect(commandSourceAmbiguous({}, [{ path: ["apiKey"], set: true }])).toBe(
    true,
  );
  expect(
    commandSourceAmbiguous({ apiKey: "sk-live" }, [
      { path: ["apiKey"], set: true },
    ]),
  ).toBe(true);
  expect(
    commandSourceAmbiguous(
      { accounts: [{ apiKeyEnv: "COMMANDCODE_API_KEY_2" }] },
      [{ path: ["apiKey"], set: false }],
    ),
  ).toBe(true);
  expect(
    commandSourceAmbiguous(
      { modelAccountRules: [{ models: ["a"], account: "default" }] },
      [{ path: ["apiKey"], set: false }],
    ),
  ).toBe(true);
  expect(
    commandSourceAmbiguous({ activeAccount: "COMMANDCODE_API_KEY_2" }, [
      { path: ["apiKey"], set: false },
    ]),
  ).toBe(true);
  expect(commandSourceAmbiguous({}, undefined)).toBe(true);
});

test("non-official bases are unofficial; empty and official defaults are not", () => {
  expect(unofficialEndpoint("opencode-go", {})).toBe(false);
  expect(
    unofficialEndpoint("opencode-go", {
      baseURL: "https://opencode.ai/zen/go/v1",
    }),
  ).toBe(false);
  expect(
    unofficialEndpoint("opencode-go", {
      baseURL: "https://other.example/zen/go/v1",
    }),
  ).toBe(true);
  expect(unofficialEndpoint("commandcode", {})).toBe(false);
  expect(
    unofficialEndpoint("commandcode", {
      apiBase: "https://api.commandcode.ai",
    }),
  ).toBe(false);
  expect(
    unofficialEndpoint("commandcode", {
      apiBase: "https://proxy.example/command",
    }),
  ).toBe(true);
});

test("unknown provider is rejected; existing custom is unsupported without fetch", async () => {
  const f = fixture();
  const fetchImpl = vi.fn();
  const m = manager(f, new QuotaReader({ fetch: fetchImpl }));
  await expect(m.quota({ providerId: "nope" })).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await m.save({
    route: "demo",
    name: "Demo",
    baseURL: "https://example.test/v1",
    api: "openai-completions",
    models: ["m"],
    revision: 1,
  });
  await expect(m.quota({ providerId: "custom:demo" })).resolves.toMatchObject({
    providerId: "custom:demo",
    status: "unsupported",
    windows: [],
    stale: false,
  });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("missing Command key and source ambiguity never fetch", async () => {
  const f = fixture();
  const fetchImpl = vi.fn();
  const m = manager(f, new QuotaReader({ fetch: fetchImpl }));
  await expect(m.quota({ providerId: "commandcode" })).resolves.toMatchObject({
    status: "missing-credential",
    windows: [],
    stale: false,
    source: "command-default-reference",
  });
  f.values.set("COMMANDCODE_API_KEY", "SYNTHETIC-CC");
  f.sections[1].value.accounts = [{ apiKeyEnv: "COMMANDCODE_API_KEY_2" }];
  await expect(m.quota({ providerId: "commandcode" })).resolves.toMatchObject({
    status: "source-unverified",
    windows: [],
  });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("unofficial OpenCode base is unsupported without sending the key", async () => {
  const f = fixture();
  f.sections[0].value.baseURL = "https://evil.example/v1";
  const fetchImpl = vi.fn();
  const m = manager(f, new QuotaReader({ fetch: fetchImpl }));
  await expect(m.quota({ providerId: "opencode-go" })).resolves.toMatchObject({
    status: "unsupported",
    windows: [],
  });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("OpenCode fetch uses the official URL, redirect error, and bearer key", async () => {
  const f = fixture();
  const fetchImpl = vi.fn(async (url, init) => {
    expect(url).toBe(OPENCODE_USAGE_URL);
    expect(init.method).toBe("GET");
    expect(init.redirect).toBe("error");
    expect(init.cache).toBe("no-store");
    expect(init.headers.Accept).toBe("application/json");
    expect(init.headers.Authorization).toBe("Bearer SYNTHETIC");
    expect(JSON.stringify(init.headers)).not.toMatch(/x-command-code-version/i);
    return jsonResponse({ rolling: { percent: 20 } });
  });
  const m = manager(f, new QuotaReader({ fetch: fetchImpl }));
  const result = await m.quota({ providerId: "opencode-go" });
  expect(result).toMatchObject({
    status: "ready",
    source: "opencode-official",
    stale: false,
    windows: [{ id: "five-hour", usedPercent: 20, remainingPercent: 80 }],
  });
  expect(result.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(JSON.stringify(result)).not.toContain("SYNTHETIC");
});

test("Command default key fetch uses credits URL and does not send extra CLI headers", async () => {
  const f = fixture();
  f.values.set("COMMANDCODE_API_KEY", "SYNTHETIC-CC");
  const fetchImpl = vi.fn(async (url, init) => {
    expect(url).toBe(COMMAND_CREDITS_URL);
    expect(init.headers.Authorization).toBe("Bearer SYNTHETIC-CC");
    expect(init.redirect).toBe("error");
    expect(Object.keys(init.headers).sort()).toEqual([
      "Accept",
      "Authorization",
    ]);
    return jsonResponse({
      windowLimits: { fiveHour: { used: 1, cap: 4, resetAt: 1910000000000 } },
    });
  });
  const m = manager(f, new QuotaReader({ fetch: fetchImpl }));
  await expect(m.quota({ providerId: "commandcode" })).resolves.toMatchObject({
    status: "ready",
    source: "command-default-reference",
    windows: [
      {
        id: "five-hour",
        usedPercent: 25,
        remainingPercent: 75,
        resetsAt: new Date(1910000000000).toISOString(),
      },
    ],
  });
});

test.each([
  { status: 401, error: "UNAUTHORIZED" },
  { status: 403, error: "UNAUTHORIZED" },
  { status: 500, error: "UNAVAILABLE" },
])(
  "HTTP $status maps to $error without leaking the body",
  async ({ status, error }) => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ secret: "nope" }, status),
    );
    const m = manager(fixture(), new QuotaReader({ fetch: fetchImpl }));
    const result = await m.quota({ providerId: "opencode-go" });
    expect(result).toMatchObject({
      status: "error",
      error,
      windows: [],
      stale: false,
    });
    expect(JSON.stringify(result)).not.toContain("nope");
  },
);

test("malformed JSON, oversize body and missing windows are INVALID_RESPONSE", async () => {
  const badJson = manager(
    fixture(),
    new QuotaReader({
      fetch: async () => new Response("not-json", { status: 200 }),
    }),
  );
  await expect(
    badJson.quota({ providerId: "opencode-go" }),
  ).resolves.toMatchObject({
    error: "INVALID_RESPONSE",
    status: "error",
  });
  const oversized = manager(
    fixture(),
    new QuotaReader({
      fetch: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(1024 * 1024 + 8));
              controller.close();
            },
          }),
          { status: 200 },
        ),
    }),
  );
  await expect(
    oversized.quota({ providerId: "opencode-go" }),
  ).resolves.toMatchObject({ error: "INVALID_RESPONSE" });
  const empty = manager(
    fixture(),
    new QuotaReader({
      fetch: async () => jsonResponse({ hello: true }),
    }),
  );
  await expect(
    empty.quota({ providerId: "opencode-go" }),
  ).resolves.toMatchObject({
    error: "INVALID_RESPONSE",
  });
});

test("timeout and caller cancel do not commit a late body", async () => {
  let release: ((value: Response) => void) | undefined;
  let calls = 0;
  const fetchImpl = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        calls += 1;
        if (calls === 1) release = resolve;
        else resolve(jsonResponse({ rolling: { percent: 3 } }));
      }),
  );
  const timed = manager(
    fixture(),
    new QuotaReader({ fetch: fetchImpl, timeoutMs: 20 }),
  );
  await expect(
    timed.quota({ providerId: "opencode-go" }),
  ).resolves.toMatchObject({
    status: "error",
    error: "TIMEOUT",
    stale: false,
    windows: [],
  });
  release?.(jsonResponse({ rolling: { percent: 1 } }));
  await new Promise((r) => setTimeout(r, 20));
  expect(await timed.quota({ providerId: "opencode-go" })).toMatchObject({
    status: "ready",
    windows: [{ id: "five-hour", usedPercent: 3, remainingPercent: 97 }],
  });
  const abort = new AbortController();
  let secondRelease: ((value: Response) => void) | undefined;
  let secondCalls = 0;
  const cancelled = manager(
    fixture(),
    new QuotaReader({
      timeoutMs: 5000,
      fetch: () =>
        new Promise<Response>((resolve) => {
          secondCalls += 1;
          if (secondCalls === 1) secondRelease = resolve;
          else resolve(jsonResponse({ rolling: { percent: 4 } }));
        }),
    }),
  );
  const pending = cancelled.quota({ providerId: "opencode-go" }, abort.signal);
  await vi.waitFor(() => expect(secondCalls).toBe(1));
  abort.abort();
  await expect(pending).rejects.toBeDefined();
  secondRelease?.(jsonResponse({ rolling: { percent: 99 } }));
  await new Promise((r) => setTimeout(r, 20));
  expect(await cancelled.quota({ providerId: "opencode-go" })).toMatchObject({
    windows: [{ id: "five-hour", usedPercent: 4, remainingPercent: 96 }],
  });
});

test("success cache lasts 60s, manual refresh bypasses, duplicate in-flight is rejected", async () => {
  let now = 1_000_000;
  let n = 0;
  const fetchImpl = vi.fn(async () => {
    n += 1;
    return jsonResponse({ rolling: { percent: n === 1 ? 10 : 40 } });
  });
  const m = manager(
    fixture(),
    new QuotaReader({ fetch: fetchImpl, now: () => now }),
  );
  expect(
    (await m.quota({ providerId: "opencode-go" })).windows[0].usedPercent,
  ).toBe(10);
  now += 59_000;
  expect(
    (await m.quota({ providerId: "opencode-go" })).windows[0].usedPercent,
  ).toBe(10);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  now += 2_000;
  expect(
    (await m.quota({ providerId: "opencode-go" })).windows[0].usedPercent,
  ).toBe(40);
  await m.quota({ providerId: "opencode-go", refresh: true });
  expect(fetchImpl).toHaveBeenCalledTimes(3);
  let release: ((value: Response) => void) | undefined;
  const hanging = manager(
    fixture(),
    new QuotaReader({
      fetch: () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    }),
  );
  const first = hanging.quota({ providerId: "opencode-go" });
  await Promise.resolve();
  await expect(
    hanging.quota({ providerId: "opencode-go", refresh: true }),
  ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  release?.(jsonResponse({ rolling: { percent: 2 } }));
  await first;
});

test("key change hides old cache; a late old fetch cannot replace the new identity", async () => {
  const f = fixture();
  let current = "SYNTHETIC";
  f.services.credentials.resolve = async (ref: string) =>
    ref === "OPENCODE_API_KEY" ? { value: current, source: "file" } : undefined;
  const pending = new Map<string, (value: Response) => void>();
  const fetchWait = vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((resolve) => {
        pending.set(
          String((init.headers as Record<string, string>).Authorization),
          resolve,
        );
      }),
  );
  const m = manager(f, new QuotaReader({ fetch: fetchWait }));
  const first = m.quota({ providerId: "opencode-go" });
  await vi.waitFor(() => expect(pending.has("Bearer SYNTHETIC")).toBe(true));
  current = "SYNTHETIC-NEW";
  pending.get("Bearer SYNTHETIC")?.(jsonResponse({ rolling: { percent: 11 } }));
  const late = await first;
  expect(late.windows).toEqual([]);
  expect(late.status).toBe("error");
  const second = m.quota({ providerId: "opencode-go" });
  await vi.waitFor(() =>
    expect(pending.has("Bearer SYNTHETIC-NEW")).toBe(true),
  );
  pending.get("Bearer SYNTHETIC-NEW")?.(
    jsonResponse({ rolling: { percent: 88 } }),
  );
  expect((await second).windows[0].usedPercent).toBe(88);
});

test("failed fetch on a new key does not return the previous account windows", async () => {
  const f = fixture();
  let impl: typeof fetch = async () =>
    jsonResponse({ rolling: { percent: 7 } }) as never;
  const m = manager(
    f,
    new QuotaReader({
      fetch: ((...args: Parameters<typeof fetch>) =>
        impl(...args)) as typeof fetch,
    }),
  );
  const p = (await m.snapshot()).providers[0];
  expect(
    (await m.quota({ providerId: p.id, bindingToken: p.bindingToken }))
      .windows[0].remainingPercent,
  ).toBe(93);
  await m.set({
    providerId: p.id,
    bindingToken: p.bindingToken,
    value: "SYNTHETIC-ROTATED",
  });
  impl = async () => jsonResponse({ error: "nope" }, 401) as never;
  const again = await m.quota({
    providerId: p.id,
    bindingToken: p.bindingToken,
  });
  expect(again.status).toBe("error");
  expect(again.error).toBe("UNAUTHORIZED");
  expect(again.windows).toEqual([]);
  expect(again.stale).toBe(false);
});

test("same-identity error may keep host stale windows; timeout does not invent 100%", async () => {
  let n = 0;
  const fetchImpl = vi.fn(async () => {
    n += 1;
    if (n === 1) return jsonResponse({ rolling: { percent: 22 } });
    return jsonResponse({ error: "down" }, 500);
  });
  const m = manager(fixture(), new QuotaReader({ fetch: fetchImpl }));
  await m.quota({ providerId: "opencode-go" });
  const failed = await m.quota({
    providerId: "opencode-go",
    refresh: true,
  });
  expect(failed).toMatchObject({
    status: "error",
    error: "UNAVAILABLE",
    stale: true,
    windows: [{ id: "five-hour", usedPercent: 22, remainingPercent: 78 }],
  });
});
