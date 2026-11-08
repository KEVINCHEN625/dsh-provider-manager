import { expect, test, vi } from "vitest";
import { credentialKey } from "@deepseek-ai/dsh-credentials";
import { OAuthHost } from "../src/host/oauth-host.js";
import { QuotaReader } from "../src/host/quota.js";
const resetsAt = "2026-11-09T05:00:00.000Z";
function fixture(
  record: unknown,
  scope = "llm-pi-ai",
  body: unknown = {
    five_hour: { utilization: 0, resets_at: resetsAt },
    seven_day: { utilization: 17.5, resets_at: resetsAt },
  },
) {
  let current = record;
  let status = 200;
  const fetch = vi.fn(async () => Response.json(body, { status }));
  const key = credentialKey(scope, "anthropic");
  const row = {
    key,
    label: "Claude",
    methods: [
      { id: "oauth", label: "OAuth" },
      { id: "api-key", label: "API key" },
    ],
    inFlight: false,
  };
  const host = new OAuthHost(
    {
      list: () => [row],
      describe: () => row,
      begin: async () => ({ status: "cancelled" }),
      cancel() {},
    },
    {
      describeRecord: async () => ({
        configured: true,
        kind: (current as any).kind,
      }),
      readRecord: async (candidate) => {
        expect(candidate.toString()).toBe(key.toString());
        return current;
      },
      deleteRecord: async () => {},
    },
    new QuotaReader({ fetch: fetch as typeof globalThis.fetch }),
  );
  return {
    host,
    fetch,
    replace(value: unknown) {
      current = value;
    },
    status(value: number) {
      status = value;
    },
  };
}
const grant = {
  kind: "grant",
  payload: { access: "OAUTH-SECRET", refresh: "REFRESH-SECRET" },
};
test("Claude OAuth uses its usage endpoint and beta header with cached 5h/7d values", async () => {
  const f = fixture(grant);
  const {
    oauth: [entry],
  } = await f.host.snapshot();
  expect(entry!.quota).toBeUndefined();
  expect(f.fetch).not.toHaveBeenCalled();
  const result = await f.host.quota({
    providerId: "anthropic",
    bindingToken: entry!.bindingToken,
  });
  expect(result.quota).toEqual({
    status: "ready",
    windows: [
      { id: "five-hour", usedPercent: 0, remainingPercent: 100, resetsAt },
      { id: "weekly", usedPercent: 17.5, remainingPercent: 82.5, resetsAt },
    ],
  });
  expect(f.fetch).toHaveBeenCalledTimes(1);
  const args = f.fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(args[0]).toBe("https://api.anthropic.com/api/oauth/usage");
  expect(args[1]).toMatchObject({
    method: "GET",
    redirect: "error",
    headers: {
      Authorization: "Bearer OAUTH-SECRET",
      "anthropic-beta": "oauth-2025-04-20",
    },
  });
  expect(JSON.stringify(args[1])).not.toContain("REFRESH-SECRET");
  expect(JSON.stringify(result)).not.toContain("SECRET");
  await f.host.quota({
    providerId: "anthropic",
    bindingToken: entry!.bindingToken,
  });
  expect(f.fetch).toHaveBeenCalledTimes(1);
  f.status(401);
  expect(
    (
      await f.host.quota({
        providerId: "anthropic",
        bindingToken: entry!.bindingToken,
        refresh: true,
      })
    ).quota?.status,
  ).toBe("expired");
  f.replace({ kind: "grant", payload: { access: "NEW-SECRET" } });
  await expect(
    f.host.quota({
      providerId: "anthropic",
      bindingToken: entry!.bindingToken,
    }),
  ).rejects.toMatchObject({ code: "BINDING_CHANGED" });
  expect(f.fetch).toHaveBeenCalledTimes(2);
  f.host.dispose();
});
test.each([
  [{ kind: "api-key", key: "API-SECRET" }, "llm-pi-ai"],
  [grant, "provider-manager"],
])(
  "Claude usage is unsupported outside an llm-pi-ai grant",
  async (record, scope) => {
    const f = fixture(record, scope as string);
    const {
      oauth: [entry],
    } = await f.host.snapshot();
    expect(entry!.quota).toEqual({ status: "unsupported", windows: [] });
    expect(
      (
        await f.host.quota({
          providerId: "anthropic",
          bindingToken: entry!.bindingToken,
          refresh: true,
        })
      ).quota,
    ).toEqual(entry!.quota);
    expect(f.fetch).not.toHaveBeenCalled();
    f.host.dispose();
  },
);
test("grant containing only apiKey is never sent to Claude OAuth usage", async () => {
  const f = fixture({ kind: "grant", payload: { apiKey: "API-SECRET" } });
  const {
    oauth: [entry],
  } = await f.host.snapshot();
  expect(
    (
      await f.host.quota({
        providerId: "anthropic",
        bindingToken: entry!.bindingToken,
      })
    ).quota?.status,
  ).toBe("missing-credential");
  expect(f.fetch).not.toHaveBeenCalled();
  f.host.dispose();
});
test.each([
  [
    { five_hour: null, seven_day: { utilization: 25 } },
    [{ id: "weekly", usedPercent: 25, remainingPercent: 75 }],
  ],
  [
    { five_hour: { utilization: "20" }, seven_day: { utilization: 101 } },
    undefined,
  ],
  [
    { five_hour: { utilization: -1 }, seven_day: { utilization: NaN } },
    undefined,
  ],
  [
    {
      five_hour: { utilization: 20.25, resets_at: 1800000000 },
      seven_day: null,
    },
    [{ id: "five-hour", usedPercent: 20.25, remainingPercent: 79.75 }],
  ],
  [
    { five_hour: { utilization: 100, resets_at: "not-ISO" } },
    [{ id: "five-hour", usedPercent: 100, remainingPercent: 0 }],
  ],
])(
  "Claude parses only finite real windows and ISO reset times: %j",
  async (body, windows) => {
    const f = fixture(grant, "llm-pi-ai", body);
    const {
      oauth: [entry],
    } = await f.host.snapshot();
    const result = await f.host.quota({
      providerId: "anthropic",
      bindingToken: entry!.bindingToken,
    });
    expect(result.quota).toMatchObject(
      windows
        ? { status: "ready", windows }
        : { status: "error", windows: [], error: "INVALID_RESPONSE" },
    );
    f.host.dispose();
  },
);

test("invalid calendar reset dates do not become invented normalized dates", async () => {
  const f = fixture(grant, "llm-pi-ai", {
    five_hour: { utilization: 10, resets_at: "2026-02-30T05:00:00Z" },
  });
  const result = await f.host.quota({ providerId: "anthropic" });
  expect(result.quota).toEqual({
    status: "ready",
    windows: [{ id: "five-hour", usedPercent: 10, remainingPercent: 90 }],
  });
  f.host.dispose();
});
