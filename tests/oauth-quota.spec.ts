import { test, expect } from "vitest";
import { credentialKey } from "@deepseek-ai/dsh-credentials";
import { OAuthHost } from "../src/host/oauth-host.js";
import { QuotaReader } from "../src/host/quota.js";
import { SafeError } from "../src/shared/protocol.js";
import {
  accessTokenFromRecord,
  parseCodexUsage,
  parseOpenRouterCredits,
  recordDigest,
} from "../src/host/oauth-usage.js";

const token = "access-token";
const refresh = "refresh-token";

test("parsers read official windows and ignore unrelated fields", () => {
  expect(
    parseCodexUsage({
      rate_limit: {
        primary_window: {
          used_percent: 20,
          limit_window_seconds: 18000,
          reset_at: 1_800_000_000,
        },
        secondary_window: {
          used_percent: 5,
          limit_window_seconds: 604800,
          reset_at: 1_806_000_000,
        },
      },
      access_token: token,
    }),
  ).toEqual([
    {
      id: "five-hour",
      usedPercent: 20,
      remainingPercent: 80,
      resetsAt: new Date(1_800_000_000 * 1000).toISOString(),
    },
    {
      id: "weekly",
      usedPercent: 5,
      remainingPercent: 95,
      resetsAt: new Date(1_806_000_000 * 1000).toISOString(),
    },
  ]);
  expect(
    parseOpenRouterCredits({
      data: { total_credits: 10, total_usage: 4, key: token },
    }),
  ).toEqual([{ id: "credits", usedPercent: 40, remainingPercent: 60 }]);
  expect(parseCodexUsage({ usage: { leftover: token } })).toBeUndefined();
  expect(parseOpenRouterCredits({ data: {} })).toBeUndefined();
});

test("token whitelist uses access_token or apiKey and skips refresh_token", () => {
  expect(
    accessTokenFromRecord({
      kind: "grant",
      payload: { access_token: token, refresh_token: refresh, email: "a@b.co" },
    }),
  ).toBe(token);
  expect(
    accessTokenFromRecord({
      kind: "grant",
      payload: { apiKey: "key-value", refresh_token: refresh },
    }),
  ).toBe("key-value");
  expect(
    accessTokenFromRecord({
      kind: "grant",
      payload: { refresh_token: refresh },
    }),
  ).toBeUndefined();
  expect(
    accessTokenFromRecord({ kind: "api-key", key: "stored-key" }),
  ).toBe("stored-key");
});

function host(options: {
  fetch: typeof fetch;
  now?: () => number;
  record?: unknown;
  ttl?: number;
}) {
  let record = options.record ?? {
    kind: "grant",
    payload: { access_token: token, refresh_token: refresh, email: "a@b.co" },
  };
  const calls: string[] = [];
  const reader = new QuotaReader({
    fetch: (async (url, init) => {
      calls.push(String(url));
      const headers = JSON.stringify(init?.headers ?? {});
      expect(headers).toContain(`Bearer ${token}`);
      expect(headers).not.toContain(refresh);
      return options.fetch(url, init);
    }) as typeof fetch,
    now: options.now,
  });
  const oauth = new OAuthHost(
    {
      list: () => [
        {
          key: credentialKey("llm-pi-ai", "openrouter"),
          label: "OpenRouter",
          methods: [{ id: "oauth", label: "OAuth" }],
          inFlight: false,
        },
      ],
      describe: () => undefined,
      begin: async () => ({ status: "cancelled" }),
      cancel: () => {},
    },
    {
      describeRecord: async () => ({ configured: true, kind: "grant" }),
      readRecord: async () => record,
      deleteRecord: async () => {
        record = undefined;
      },
    },
    reader,
    { oauthQuotaTtlMs: options.ttl ?? 3_600_000 },
  );
  return {
    oauth,
    calls,
    replace(next: unknown) {
      record = next;
    },
  };
}

test("oauth quota waits an hour, forced refresh refetches, and 401 expires", async () => {
  let now = 1_000;
  let status = 200;
  const body = () =>
    new Response(
      JSON.stringify({ data: { total_credits: 8, total_usage: 2 } }),
      { status, headers: { "content-type": "application/json" } },
    );
  const { oauth, calls } = host({
    now: () => now,
    fetch: async () => body(),
  });
  const first = await oauth.snapshot();
  expect(first.oauth[0]?.quota).toMatchObject({
    status: "ready",
    windows: [{ id: "credits", remainingPercent: 75, usedPercent: 25 }],
  });
  expect(JSON.stringify(first)).not.toContain(token);
  expect(JSON.stringify(first)).not.toContain(refresh);
  now += 3_600_000 - 1;
  await oauth.snapshot();
  expect(calls).toHaveLength(1);
  const forced = await oauth.quota({
    providerId: "openrouter",
    bindingToken: first.oauth[0]?.bindingToken,
    refresh: true,
  });
  expect(calls).toHaveLength(2);
  expect(forced.quota?.status).toBe("ready");
  status = 401;
  const expired = await oauth.quota({
    providerId: "openrouter",
    bindingToken: first.oauth[0]?.bindingToken,
    refresh: true,
  });
  expect(expired.quota?.status).toBe("expired");
  expect(JSON.stringify(expired)).not.toContain(token);
  oauth.dispose();
});

test("a changed record drops the cache and a foreign binding is rejected", async () => {
  const { oauth, calls, replace } = host({
    fetch: async () =>
      new Response(
        JSON.stringify({ data: { total_credits: 4, total_usage: 1 } }),
        { status: 200 },
      ),
  });
  const first = await oauth.snapshot();
  const digest = recordDigest({
    kind: "grant",
    payload: { access_token: token, refresh_token: refresh, email: "a@b.co" },
  });
  expect(first.oauth[0]?.bindingToken).toBe(digest);
  replace({
    kind: "grant",
    payload: { access_token: token, refresh_token: refresh, email: "b@b.co" },
  });
  await oauth.snapshot();
  expect(calls).toHaveLength(2);
  await expect(
    oauth.quota({
      providerId: "openrouter",
      bindingToken: "not-the-record",
      refresh: true,
    }),
  ).rejects.toMatchObject({ code: "BINDING_CHANGED" });
  expect(new SafeError("BINDING_CHANGED").code).toBe("BINDING_CHANGED");
  oauth.dispose();
});

test("a provider without an endpoint is unsupported and invents no percent", async () => {
  const { oauth } = host({
    fetch: async () => {
      throw new Error("network");
    },
  });
  const listed = new OAuthHost(
    {
      list: () => [
        {
          key: credentialKey("llm-pi-ai", "anthropic"),
          label: "Anthropic",
          methods: [{ id: "oauth", label: "OAuth" }],
          inFlight: false,
        },
      ],
      describe: () => undefined,
      begin: async () => ({ status: "cancelled" }),
      cancel: () => {},
    },
    {
      describeRecord: async () => ({ configured: true, kind: "grant" }),
      readRecord: async () => ({
        kind: "grant",
        payload: { access_token: token },
      }),
      deleteRecord: async () => {},
    },
  );
  const snapshot = await listed.snapshot();
  expect(snapshot.oauth[0]?.quota).toEqual({
    status: "unsupported",
    windows: [],
  });
  expect(JSON.stringify(snapshot)).not.toContain(token);
  listed.dispose();
  oauth.dispose();
});
