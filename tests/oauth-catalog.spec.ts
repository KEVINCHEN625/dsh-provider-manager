import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { credentialKey } from "@deepseek-ai/dsh-credentials";
import { OAuthHost } from "../src/host/oauth-host.js";
import { oauthEntries } from "../src/host/login.js";
import {
  CatalogStore,
  catalogMirrors,
  joinCatalog,
  modelsDevMirrors,
  parseCatalogDocument,
  parseModelsDevDocument,
  reasoningEfforts,
  unwrapModelsDev,
} from "../src/host/oauth-catalog.js";
import { OAuthRoutes, routeState } from "../src/host/oauth-routes.js";
import { fixture } from "./fixtures/services.js";

const snapshotPath = new URL(
  "../src/host/oauth-catalogs/openai-codex.json",
  import.meta.url,
);

test("codex snapshots keep channel availability apart from models.dev specs", () => {
  const text = readFileSync(snapshotPath, "utf8");
  expect(text).not.toMatch(/access_token|refresh_token|\bsk-|\beyJ/);
  const parsed = parseCatalogDocument(JSON.parse(text), "openai-codex");
  expect(parsed.models.filter((model) => model.available).map((model) => model.id))
    .toEqual([
      "gpt-6-astra",
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-reserve",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "codex-auto-review",
    ]);
  expect(parsed.models.find((model) => model.id === "gpt-5.3-codex")).toMatchObject({
    available: false,
    verifiedAt: "2026-09-23",
  });
  expect(parsed.models.find((model) => model.id === "gpt-5.6-luna")?.contextWindow).toBe(
    undefined,
  );
  const specs = JSON.parse(
    readFileSync(
      new URL("../src/host/oauth-catalogs/models-dev-openai.json", import.meta.url),
      "utf8",
    ),
  ) as { models: { id: string; contextWindow: number; maxTokens: number }[] };
  const joined = joinCatalog(specs.models as never, parsed.models);
  const luna = joined.find((model) => model.id === "gpt-5.6-luna");
  expect(luna?.contextWindow).toBe(1_050_000);
  expect(luna?.specContextWindow).toBeUndefined();
  expect(joined.find((model) => model.id === "gpt-5.3-codex")?.contextWindow).toBe(400_000);
  expect(joined.find((model) => model.id === "gpt-5.3-codex-spark")?.contextWindow).toBe(
    128_000,
  );
  expect(joined.find((model) => model.id === "gpt-reserve")?.contextWindow).toBeUndefined();
  expect(joined.find((model) => model.id === "gpt-5.3-codex")?.available).toBe(false);
  expect(reasoningEfforts(["none", "low"])).toEqual({ off: "none", low: "low" });
  expect(modelsDevMirrors()[0]).toBe("https://models.dev/api.json");
  expect(catalogMirrors("openai-codex")[0]).toContain("dsh-provider-models");
});

test("a zero-context models.dev row does not discard the provider", () => {
  const models = parseModelsDevDocument(
    {
      openai: {
        models: {
          blank: { id: "blank", name: "Blank", limit: { context: 0, output: 0 } },
          "gpt-5.6-luna": {
            id: "gpt-5.6-luna",
            name: "GPT-5.6 Luna",
            limit: { context: 1_050_000, output: 128_000 },
            modalities: { input: ["text", "image", "pdf"] },
            reasoning_options: [{ type: "effort", values: ["low", "max"] }],
            cost: { input: 0.2, output: 1.2 },
          },
        },
      },
    },
    "openai",
  );
  expect(models.map((model) => model.id)).toEqual(["gpt-5.6-luna"]);
  expect(models[0]?.input).toEqual(["text", "image"]);
});

test("remote catalog prefers the first mirror, honors ttl, and falls back", async () => {
  let now = 0;
  let fail = false;
  let calls = 0;
  const store = new CatalogStore({
    ttlMs: 1000,
    now: () => now,
    fetch: async (url) => {
      calls += 1;
      if (fail || String(url).includes("jsdelivr")) throw new Error("mirror down");
      if (String(url).includes("models.dev")) {
        return new Response(
          JSON.stringify({
            openai: {
              models: {
                "gpt-5.6-luna": {
                  id: "gpt-5.6-luna",
                  name: "GPT-5.6 Luna",
                  limit: { context: 1_050_000, output: 128_000 },
                  modalities: { input: ["text", "image"] },
                  reasoning_options: [{ type: "effort", values: ["low", "high"] }],
                  cost: { input: 0.2, output: 1.2 },
                },
              },
            },
          }),
        );
      }
      return new Response(
        JSON.stringify({
          providerId: "openai-codex",
          models: [
            {
              id: "gpt-5.6-luna",
              available: true,
              verifiedAt: "2026-09-23",
              contextWindow: 272_000,
              servedModel: "gpt-5.6-sol",
            },
          ],
        }),
      );
    },
  });
  const fresh = await store.current("openai-codex");
  expect(fresh.source).toBe("remote");
  expect(fresh.specSource).toBe("remote");
  expect(fresh.fetchedAt).toBe(new Date(0).toISOString());
  expect(fresh.models.find((model) => model.id === "gpt-5.6-luna")).toMatchObject({
    contextWindow: 272_000,
    specContextWindow: 1_050_000,
    servedModel: "gpt-5.6-sol",
    available: true,
  });
  expect(calls).toBe(2);
  now = 999;
  expect((await store.current("openai-codex")).source).toBe("remote");
  expect(calls).toBe(2);
  now = 1000;
  fail = true;
  const fallback = await store.current("openai-codex");
  expect(fallback.source).toBe("snapshot");
  expect(fallback.specSource).toBe("snapshot");
  expect(fallback.models.find((model) => model.id === "gpt-5.6-luna")?.contextWindow).toBe(
    1_050_000,
  );
  expect(JSON.stringify(fallback)).not.toMatch(/access_token|refresh_token|\bsk-|\beyJ/);
});

test("a remote document carrying a token is discarded", async () => {
  const store = new CatalogStore({
    ttlMs: 1,
    now: () => 0,
    fetch: async () =>
      new Response(
        JSON.stringify({
          providerId: "openai-codex",
          access_token: "eyJhbGciOiJub25lIn0.payload.sig",
          models: [],
        }),
      ),
  });
  const hit = await store.current("openai-codex");
  expect(hit.source).toBe("snapshot");
  expect(hit.specSource).toBe("snapshot");
  expect(JSON.stringify(hit)).not.toMatch(/eyJ|access_token/);
  expect(
    unwrapModelsDev('const data = JSON.parse("{\\"openai\\":{\\"models\\":{}}}");'),
  ).toEqual({ openai: { models: {} } });
});

test("an empty signed-in profile becomes a managed selector and a handwritten route stays", async () => {
  const user = {
    providers: {
      "openai-codex": {} as Record<string, unknown>,
      foreign: { baseURL: "https://example.test/v1" },
    },
  };
  const settings = {
    describe: () => [{ ns: "llm-pi-ai", revision: 1, value: user, user }],
    mutate: async (
      _ns: string,
      ops: { op: "set"; path: string[]; value?: unknown }[],
    ) => {
      for (const op of ops) {
        if (op.path[0] !== "providers" || !op.path[1]) continue;
        user.providers[op.path[1] as "openai-codex"] = op.value as Record<
          string,
          unknown
        >;
      }
    },
  };
  const routes = new OAuthRoutes(settings);
  expect(routeState(user.providers["openai-codex"], false)).toBe("empty");
  expect(routeState(user.providers.foreign, false)).toBe("custom");
  const row = {
    id: "gpt-reserve",
    name: "gpt-reserve",
    available: true,
    efforts: [],
    input: [],
  };
  await routes.onAuthorized("openai-codex", "OpenAI Codex", [row]);
  expect(user.providers["openai-codex"]).toEqual({
    displayName: "OpenAI Codex (Provider Manager)",
    models: [{ id: "gpt-reserve" }],
  });
  expect(await routes.onAuthorized("foreign", "Foreign", [row])).toEqual({
    written: false,
  });
  expect(user.providers.foreign.baseURL).toBe("https://example.test/v1");
});

test("oauth entries put configured providers first, then labels", async () => {
  const result = await oauthEntries(
    {
      list: () => [
        flow("zebra", "Zebra"),
        flow("alpha", "Alpha"),
        flow("middle", "Middle"),
      ],
      describe: () => undefined,
      begin: async () => ({ status: "cancelled" }),
      cancel: () => {},
    },
    async (key) => ({ configured: String(key).endsWith("/middle") }),
  );
  expect(result.oauth.map((entry) => entry.providerId)).toEqual([
    "middle",
    "alpha",
    "zebra",
  ]);
});

test("login writes the catalog once, reset returns to {}, and logout keeps foreign routes", async () => {
  const f = fixture();
  f.sections.push({
    ns: "dsh-provider-manager",
    revision: 1,
    value: { ownedOauthRoutes: {} },
  });
  const settings = {
    describe: () =>
      f.services.settings.describe().map((section: { value: unknown }) => ({
        ...section,
        user: structuredClone(section.value),
      })),
    mutate: f.services.settings.mutate,
  };
  const host = new OAuthHost(
    {
      list: () => [flow("openai-codex", "ChatGPT Codex")],
      describe: (key) =>
        String(key).endsWith("/openai-codex")
          ? {
              key,
              label: "ChatGPT Codex",
              methods: [{ id: "oauth", label: "OAuth" }],
              inFlight: false,
            }
          : undefined,
      begin: async () => ({ status: "authorized" }),
      cancel: () => {},
    },
    {
      describeRecord: async () => ({ configured: true, kind: "grant" }),
      readRecord: async () => ({ kind: "grant", payload: { email: "ada@example.com" } }),
      deleteRecord: async () => {},
    },
    undefined,
    { oauthCatalogTtlMs: 1000 },
    settings,
    new CatalogStore({
      ttlMs: 1000,
      now: () => 0,
      fetch: async () => {
        throw new Error("offline");
      },
    }),
  );
  const started = host.logins.start({
    providerId: "openai-codex",
    method: "oauth",
  });
  const done = await untilDone(host, started.sessionId);
  expect(done.result).toBe("ok");
  const models = providers(f)["openai-codex"].models as {
    id: string;
    contextWindow: number;
    reasoningEfforts: Record<string, string>;
  }[];
  expect(models.find((model) => model.id === "gpt-5.3-codex")).toBeUndefined();
  expect(models.find((model) => model.id === "gpt-5.3-codex-spark")).toBeUndefined();
  expect(models.find((model) => model.id === "gpt-5.6-luna")).toMatchObject({
    contextWindow: 1_050_000,
    reasoningEfforts: { off: "none", low: "low", max: "max" },
  });
  expect(models).toHaveLength(9);
  expect(models.find((model) => model.id === "gpt-reserve")).toEqual({
    id: "gpt-reserve",
  });
  expect(providers(f)["openai-codex"].displayName).toBe(
    "ChatGPT Codex (Provider Manager)",
  );
  expect(JSON.stringify(providers(f))).not.toMatch(/access_token|refresh_token|\bsk-|\beyJ/);
  const pinned = JSON.stringify(providers(f)["openai-codex"]);
  const again = host.logins.start({
    providerId: "openai-codex",
    method: "oauth",
  });
  expect((await untilDone(host, again.sessionId)).result).toBe("ok");
  expect(JSON.stringify(providers(f)["openai-codex"])).toBe(pinned);
  const routes = new OAuthRoutes(settings);
  expect(routes.state("openai-codex")).toBe("pinned");
  await host.resetCatalog({ providerId: "openai-codex" });
  expect(providers(f)["openai-codex"].models).toBeUndefined();
  expect(routes.state("openai-codex")).toBe("empty");
  await host.activateCatalog({ providerId: "openai-codex" });
  expect(
    (providers(f)["openai-codex"].models as { id: string }[]).some(
      (model) => model.id === "gpt-5.6-terra",
    ),
  ).toBe(true);
  providers(f).foreign = { baseURL: "https://example.test/v1" };
  const removed = await routes.removeOwned("foreign");
  expect(removed).toBe(false);
  expect(providers(f).foreign.baseURL).toBe("https://example.test/v1");
  await host.logout({ providerId: "openai-codex" });
  expect(providers(f)["openai-codex"]).toBeUndefined();
  expect(providers(f).foreign.baseURL).toBe("https://example.test/v1");
});

function flow(id: string, label: string) {
  return {
    key: credentialKey("llm-pi-ai", id),
    label,
    methods: [{ id: "oauth", label: "OAuth" }],
    inFlight: false,
  };
}

function providers(f: ReturnType<typeof fixture>) {
  const section = f.sections.find((item) => item.ns === "llm-pi-ai");
  return section.value.providers as Record<string, any>;
}

async function untilDone(host: OAuthHost, sessionId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const events = host.logins.events({ sessionId, sinceIndex: 0 });
    if (events.status === "done") return events;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("login did not finish");
}
