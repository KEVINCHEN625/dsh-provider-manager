import { expect, test, vi } from "vitest";
import type { AuthorizationSession } from "@deepseek-ai/dsh-authorization";
import { credentialKey } from "@deepseek-ai/dsh-credentials";
import { runMuseDeviceFlow } from "../src/host/muse/device.js";
import { createMuseFlow } from "../src/host/muse/flow.js";
import { OAuthHost } from "../src/host/oauth-host.js";
import { recordDigest } from "../src/host/oauth-usage.js";

const fetchedAt = "2026-11-08T00:00:00.000Z";
const resetSeconds = Date.parse("2026-11-08T05:00:00Z") / 1000;
const session = () =>
  ({
    signal: new AbortController().signal,
    method: "device",
    notify() {},
    prompt: async () => "",
  }) as AuthorizationSession;
function deps(body: unknown, status = 200) {
  const fetch = vi.fn(async () => {
    if (fetch.mock.calls.length === 1)
      return Response.json({
        device_code: "DEVICE-SECRET",
        user_code: "CODE",
        verification_uri: "https://auth.meta.com/activate",
      });
    if (fetch.mock.calls.length === 2)
      return Response.json({ access_token: "DCA-SECRET" });
    return Response.json(body, { status });
  });
  return { fetch, now: () => Date.parse(fetchedAt), wait: async () => {} };
}
const five = {
  id: "five-hour",
  usedPercent: 0,
  remainingPercent: 100,
  resetsAt: "2026-11-08T05:00:00.000Z",
};
const weekly = { id: "weekly", usedPercent: 17.5, remainingPercent: 82.5 };
test("login persists only minted key, account and whitelisted usage from the existing mint", async () => {
  const options = deps({
    api_key: "MINTED-KEY",
    user_email: "a@example.com",
    subs_usage: {
      window: {
        used_percent: 0,
        resets_at: resetSeconds,
        window_duration_mins: 300,
        private: "SECRET",
      },
      weekly: { used_percent: 17.5 },
    },
    payment_method: "SECRET",
    dca_token: "DCA-SECRET",
  });
  const writes: unknown[] = [];
  const flow = createMuseFlow(
    {
      credentials: {
        modifyRecord: async (_key: unknown, update: () => Promise<unknown>) => {
          writes.push(await update());
        },
      },
    } as never,
    options,
  );
  await flow.run(session());
  expect(writes).toEqual([
    {
      kind: "grant",
      payload: {
        access: "MINTED-KEY",
        email: "a@example.com",
        museUsage: { fetchedAt, windows: [five, weekly] },
      },
    },
  ]);
  expect(options.fetch).toHaveBeenCalledTimes(3);
  expect(JSON.stringify(writes)).not.toContain("SECRET");
});
test.each([{}, null, { api_key: "" }, { api_key: "   " }, { api_key: 123 }])(
  "mint without a valid key cannot persist DCA: %j",
  async (body) => {
    const writes = vi.fn();
    const flow = createMuseFlow(
      { credentials: { modifyRecord: writes } } as never,
      deps(body),
    );
    await expect(flow.run(session())).rejects.toThrow();
    expect(writes).not.toHaveBeenCalled();
  },
);
test("mint HTTP failure cannot persist DCA", async () => {
  await expect(
    runMuseDeviceFlow(session(), deps({ api_key: "INVALID" }, 403)),
  ).rejects.toThrow();
});
test.each([
  [undefined, undefined],
  [{ weekly: { used_percent: 17.5 } }, [weekly]],
  [
    { window: { used_percent: 0 } },
    [{ id: "five-hour", usedPercent: 0, remainingPercent: 100 }],
  ],
  [{ window: { used_percent: "0" }, weekly: { used_percent: -1 } }, undefined],
  [
    { window: { used_percent: 101 }, weekly: { used_percent: null } },
    undefined,
  ],
  [
    {
      window: { used_percent: 20, window_duration_mins: 60 },
      weekly: { used_percent: 17.5, resets_at: "not-a-date" },
    },
    [weekly],
  ],
  [
    { window: { used_percent: 0, resets_at: resetSeconds * 1000 } },
    [{ id: "five-hour", usedPercent: 0, remainingPercent: 100 }],
  ],
])(
  "usage omits missing and invalid fields instead of inventing quota: %j",
  async (subs_usage, windows) => {
    const result = await runMuseDeviceFlow(
      session(),
      deps({ api_key: "MINTED", subs_usage }),
    );
    expect((result as any).museUsage).toEqual(
      windows ? { fetchedAt, windows } : undefined,
    );
  },
);
function hostFixture(payload: Record<string, unknown>) {
  const key = credentialKey("provider-manager", "muse");
  let record = { kind: "grant", payload };
  const row = {
    key,
    label: "Muse",
    methods: [{ id: "device", label: "Device code" }],
    inFlight: false,
  };
  const reads: string[] = [];
  const host = new OAuthHost(
    {
      list: () => [row],
      describe: (candidate) =>
        candidate.toString() === key.toString() ? row : undefined,
      begin: async () => ({ status: "cancelled" }),
      cancel() {},
    },
    {
      describeRecord: async () => ({ configured: true, kind: "grant" }),
      readRecord: async (candidate) => {
        reads.push(candidate.toString());
        expect(candidate.toString()).toBe(key.toString());
        return record;
      },
      deleteRecord: async () => {},
    },
  );
  return {
    host,
    reads,
    key,
    change: (next: typeof record) => {
      record = next;
    },
  };
}
test("snapshot and local quota keep Muse usage, account and binding on the plugin record", async () => {
  const payload = {
    access: "KEY-SECRET",
    email: "muse@example.com",
    museUsage: { fetchedAt, windows: [five, weekly], private: "SECRET" },
  };
  const f = hostFixture(payload);
  const {
    oauth: [entry],
  } = await f.host.snapshot();
  expect(f.reads).toHaveLength(1);
  expect(entry).toMatchObject({
    providerId: "muse",
    builtin: true,
    account: "muse@example.com",
    bindingToken: recordDigest({ kind: "grant", payload }),
    quota: { status: "ready", windows: [five, weekly] },
    quotaFetchedAt: fetchedAt,
  });
  const refreshed = await f.host.quota({
    providerId: "muse",
    bindingToken: entry!.bindingToken,
    refresh: true,
  });
  expect(refreshed).toEqual(entry);
  expect(JSON.stringify(refreshed)).not.toContain("SECRET");
  f.change({ kind: "grant", payload: { access: "NEW-KEY" } });
  await expect(
    f.host.quota({ providerId: "muse", bindingToken: entry!.bindingToken }),
  ).rejects.toMatchObject({ code: "BINDING_CHANGED" });
  f.host.dispose();
});
test.each([
  {},
  { museUsage: { fetchedAt: "bad", windows: [five] } },
  { museUsage: { fetchedAt, windows: [{ id: "five-hour", usedPercent: -1 }] } },
])("old or malformed grants honestly report unsupported: %j", async (extra) => {
  const f = hostFixture({ access: "KEY", ...extra });
  const {
    oauth: [entry],
  } = await f.host.snapshot();
  expect(entry!.quota).toEqual({ status: "unsupported", windows: [] });
  expect(entry!.quotaFetchedAt).toBeUndefined();
  expect(
    await f.host.quota({
      providerId: "muse",
      bindingToken: entry!.bindingToken,
    }),
  ).toEqual(entry);
  f.host.dispose();
});

test("mint network failure is not a successful login", async () => {
  const options = deps({});
  const original = options.fetch;
  let count = 0;
  const writes = vi.fn();
  const flow = createMuseFlow(
    { credentials: { modifyRecord: writes } } as never,
    {
      ...options,
      fetch: async () => {
        if (++count === 3) throw new Error("offline");
        return original();
      },
    },
  );
  await expect(flow.run(session())).rejects.toThrow("offline");
  expect(writes).not.toHaveBeenCalled();
});

test("cancellation while mint finishes prevents any credential write", async () => {
  const attempt = new AbortController();
  const options = deps({ api_key: "KEY" });
  const original = options.fetch;
  const writes = vi.fn();
  const flow = createMuseFlow(
    { credentials: { modifyRecord: writes } } as never,
    {
      ...options,
      fetch: async () => {
        const result = await original();
        if (original.mock.calls.length === 3) attempt.abort();
        return result;
      },
    },
  );
  await expect(
    flow.run({ ...session(), signal: attempt.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(writes).not.toHaveBeenCalled();
});

test("nonfinite usage, ISO wire resets and invalid durations do not produce invented values", async () => {
  const { parseMuseUsage } = await import("../src/host/muse/usage.js");
  for (const used_percent of [NaN, Infinity, -Infinity]) {
    expect(
      parseMuseUsage({ window: { used_percent } }, Date.parse(fetchedAt)),
    ).toBeUndefined();
  }
  expect(
    parseMuseUsage(
      {
        window: { used_percent: 10, resets_at: "2026-11-08T05:00:00Z" },
        weekly: {
          used_percent: 100,
          window_duration_mins: 10080,
          resets_at: resetSeconds,
        },
      },
      Date.parse(fetchedAt),
    ),
  ).toEqual({
    fetchedAt,
    windows: [
      { id: "five-hour", usedPercent: 10, remainingPercent: 90 },
      {
        id: "weekly",
        usedPercent: 100,
        remainingPercent: 0,
        resetsAt: five.resetsAt,
      },
    ],
  });
  expect(
    parseMuseUsage(
      {
        window: { used_percent: 10, window_duration_mins: "300" },
        weekly: { used_percent: 10, window_duration_mins: -1 },
      },
      Date.parse(fetchedAt),
    ),
  ).toBeUndefined();
});

test("local Muse quota never invokes remote fetch even when refresh is requested", async () => {
  const f = hostFixture({
    access: "KEY",
    museUsage: { fetchedAt, windows: [five] },
  });
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("Unexpected network"));
  try {
    const {
      oauth: [entry],
    } = await f.host.snapshot();
    expect(
      await f.host.quota({
        providerId: "muse",
        bindingToken: entry!.bindingToken,
        refresh: true,
      }),
    ).toEqual(entry);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
    f.host.dispose();
  }
});

test("Muse device and mint requests reject redirects containing authorization secrets", async () => {
  const options = deps({ api_key: "KEY" });
  const requests: RequestInit[] = [];
  await runMuseDeviceFlow(session(), {
    ...options,
    fetch: async (_url, init) => {
      requests.push(init!);
      return options.fetch();
    },
  });
  expect(requests).toHaveLength(3);
  for (const request of requests) expect(request.redirect).toBe("error");
});
