import { test, expect } from "vitest";
import { credentialKey, type CredentialKey } from "@deepseek-ai/dsh-credentials";
import * as plugin from "../src/host/index.js";
import { Manager } from "../src/host/providers.js";
import { OAuthHost } from "../src/host/oauth-host.js";
import {
  accountFromPayload,
  authorizationOf,
  oauthEntries,
} from "../src/host/login.js";
import { fixture } from "./fixtures/services.js";

test("authorization is optional and is not a required inject", () => {
  expect(plugin.inject).toEqual(["settings", "credentials", "llm"]);
  expect(authorizationOf(undefined)).toBeUndefined();
  expect(authorizationOf({ list: () => [] })).toBeUndefined();
});

test("oauthEntries keep llm-pi-ai flows, skip other scopes, and never copy record payloads", async () => {
  const kept = credentialKey("llm-pi-ai", "openai-codex");
  const skipped = credentialKey("other-plugin", "hidden");
  const described: CredentialKey[] = [];
  const result = await oauthEntries(
    {
      list: () => [
        {
          key: kept,
          label: "ChatGPT Codex",
          methods: [
            { id: "oauth", label: "OAuth" },
            { id: "api-key", label: "API key" },
          ],
          inFlight: true,
        },
        {
          key: skipped,
          label: "Hidden",
          methods: [{ id: "oauth", label: "OAuth" }],
          inFlight: false,
        },
      ],
      describe: () => undefined,
      begin: async () => ({ status: "cancelled" }),
      cancel: () => {},
    },
    async (key) => {
      described.push(key);
      return {
        configured: true,
        kind: "grant",
        value: "SECRET-GRANT",
        refresh: "SECRET-REFRESH",
      };
    },
  );
  expect(described).toEqual([kept]);
  expect(result).toEqual({
    oauth: [
      {
        providerId: "openai-codex",
        label: "ChatGPT Codex",
        methods: [
          { id: "oauth", label: "OAuth" },
          { id: "api-key", label: "API key" },
        ],
        configured: true,
        kind: "grant",
        inFlight: true,
      },
    ],
  });
  expect(JSON.stringify(result)).not.toMatch(/SECRET/);
});

test("missing authorization degrades to an empty oauth list", async () => {
  expect(
    await oauthEntries(undefined, async () => ({ configured: true })),
  ).toEqual({ oauth: [], oauthUnavailable: true });
  const snapshot = await new Manager(fixture().services).snapshot();
  expect(snapshot.oauth).toEqual([]);
  expect(snapshot.oauthUnavailable).toBeUndefined();
  expect(JSON.stringify(snapshot)).not.toContain("SENTINEL");
});

test("the main snapshot does not read authorization records", async () => {
  const f = fixture();
  let describeRecord = 0;
  f.services.credentials.describeRecord = async () => {
    describeRecord += 1;
    return { configured: true, kind: "grant" };
  };
  const snapshot = await new Manager(f.services).snapshot();
  expect(describeRecord).toBe(0);
  expect(snapshot.oauth).toEqual([]);
});

test("account label keeps the first whitelist field and drops token fields", async () => {
  const key = credentialKey("llm-pi-ai", "openai-codex");
  const result = await oauthEntries(
    {
      list: () => [
        {
          key,
          label: "ChatGPT Codex",
          methods: [{ id: "oauth", label: "OAuth" }],
          inFlight: false,
        },
      ],
      describe: () => undefined,
      begin: async () => ({ status: "cancelled" }),
      cancel: () => {},
    },
    async () => ({ configured: true, kind: "grant" }),
    async () => ({
      kind: "grant",
      payload: {
        email: "ada@example.com",
        access_token: "SECRET-TOKEN",
        refresh_token: "SECRET-REFRESH",
      },
    }),
  );
  expect(result.oauth[0]?.account).toBe("ada@example.com");
  expect(accountFromPayload({ displayName: "Ada", email: "" })).toBe("Ada");
  expect(accountFromPayload({ name: "x".repeat(80) })).toHaveLength(64);
  expect(JSON.stringify(result)).not.toMatch(/SECRET/);
});

test("logout deletes the credential record and does not echo it", async () => {
  const key = credentialKey("llm-pi-ai", "openrouter");
  const deleted: CredentialKey[] = [];
  const host = new OAuthHost(
    {
      list: () => [
        {
          key,
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
      readRecord: async () => ({
        kind: "grant",
        payload: { email: "ada@example.com", access_token: "SECRET-TOKEN" },
      }),
      deleteRecord: async (record) => {
        deleted.push(record);
      },
    },
  );
  expect(await host.logout({ providerId: "openrouter" })).toEqual({
    removed: true,
  });
  expect(deleted).toEqual([key]);
  host.dispose();
});
