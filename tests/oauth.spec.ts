import { test, expect } from "vitest";
import { credentialKey, type CredentialKey } from "@deepseek-ai/dsh-credentials";
import * as plugin from "../src/host/index.js";
import { Manager } from "../src/host/providers.js";
import {
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
  expect(snapshot.oauthUnavailable).toBe(true);
  expect(JSON.stringify(snapshot)).not.toContain("SENTINEL");
});

test("snapshot joins describeRecord and never calls describe for oauth keys", async () => {
  const f = fixture();
  const key = credentialKey("llm-pi-ai", "google-gemini-cli");
  let describeRecord = 0;
  let describe = 0;
  const originalDescribe = f.services.credentials.describe;
  f.services.credentials.describe = async (ref: string) => {
    describe += 1;
    return originalDescribe(ref);
  };
  f.services.credentials.describeRecord = async (record: CredentialKey) => {
    describeRecord += 1;
    expect(record).toBe(key);
    return { configured: true, kind: "grant", payload: "SECRET-GRANT" };
  };
  f.services.get = (name: string) =>
    name === "authorization"
      ? {
          list: () => [
            {
              key,
              label: "Gemini CLI",
              methods: [{ id: "oauth", label: "Google" }],
              inFlight: false,
            },
          ],
          describe: () => undefined,
          begin: async () => ({ status: "cancelled" }),
          cancel: () => {},
        }
      : undefined;
  const snapshot = await new Manager(f.services).snapshot();
  expect(describeRecord).toBe(1);
  expect(describe).toBeGreaterThan(0);
  expect(snapshot.oauth).toEqual([
    {
      providerId: "google-gemini-cli",
      label: "Gemini CLI",
      methods: [{ id: "oauth", label: "Google" }],
      configured: true,
      kind: "grant",
      inFlight: false,
    },
  ]);
  expect(snapshot.oauthUnavailable).toBeUndefined();
  expect(JSON.stringify(snapshot.oauth)).not.toMatch(/SECRET|payload/);
});
