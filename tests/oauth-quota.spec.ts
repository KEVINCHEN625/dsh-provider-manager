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
  expect(accessTokenFromRecord({ kind: "api-key", key: "stored-key" })).toBe(
    "stored-key",
  );
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
  const initialQuota = await oauth.quota({
    providerId: "openrouter",
    bindingToken: first.oauth[0]?.bindingToken,
    refresh: false,
  });
  expect(initialQuota.quota).toMatchObject({
    status: "ready",
    windows: [{ id: "credits", remainingPercent: 75, usedPercent: 25 }],
  });
  expect(JSON.stringify(first)).not.toContain(token);
  expect(JSON.stringify(first)).not.toContain(refresh);
  now += 3_600_000 - 1;
  await oauth.quota({
    providerId: "openrouter",
    bindingToken: first.oauth[0]?.bindingToken,
    refresh: false,
  });
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
  await oauth.quota({ providerId: "openrouter", bindingToken: digest });
  replace({
    kind: "grant",
    payload: { access_token: token, refresh_token: refresh, email: "b@b.co" },
  });
  const changed = await oauth.snapshot();
  await oauth.quota({
    providerId: "openrouter",
    bindingToken: changed.oauth[0]?.bindingToken,
  });
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

test("metadata snapshot never fetches quota or catalog and binds one record read", async () => {
  const { oauth, calls } = host({
    fetch: async () => {
      throw Error("metadata must stay local");
    },
  });
  const result = await oauth.snapshot();
  expect(calls).toEqual([]);
  expect(result.oauth[0].bindingToken).toBe(
    recordDigest({
      kind: "grant",
      payload: { access_token: token, refresh_token: refresh, email: "a@b.co" },
    }),
  );
  expect(result.oauth[0].quota).toBeUndefined();
  oauth.dispose();
});

test("metadata makes zero catalog requests or settings writes and leaves persisted routes intact", async () => {
  const { fixture } = await import("./fixtures/services.js");
  const { CatalogStore } = await import("../src/host/oauth-catalog.js");
  const f = fixture();
  f.sections[2].value.providers["openrouter"] = {
    models: ["persisted-model"],
    apiKeyEnv: "preserved",
  };
  let catalogs = 0;
  let usages = 0;
  let reads = 0;
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
      readRecord: async () => {
        reads++;
        return {
          kind: "grant",
          payload: { access_token: "synthetic", email: "same@example.test" },
        };
      },
      deleteRecord: async () => {},
    },
    new QuotaReader({
      fetch: async () => {
        usages++;
        throw Error("no usage");
      },
    }),
    {},
    f.services.settings,
    new CatalogStore({
      fetch: async () => {
        catalogs++;
        throw Error("no catalog");
      },
    }),
  );
  const before = structuredClone(f.sections);
  const snap = await oauth.snapshot();
  expect(snap.oauth[0].account).toBe("same@example.test");
  expect(reads).toBe(1);
  expect(catalogs).toBe(0);
  expect(usages).toBe(0);
  expect(f.writes).toEqual([]);
  expect(f.sections).toEqual(before);
  oauth.dispose();
});
