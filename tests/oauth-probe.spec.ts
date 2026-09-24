import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "vitest";
import { credentialKey } from "@deepseek-ai/dsh-credentials";
import { OAuthHost } from "../src/host/oauth-host.js";
import { CatalogStore, selectOpenRouterIds } from "../src/host/oauth-catalog.js";
import {
  classifyProbe,
  nextProbeIds,
  probeRequest,
  PROBE_BATCH,
} from "../src/host/oauth-probe.js";
import { fixture } from "./fixtures/services.js";

const token = `eyJhbGciOiJub25lIn0.${Buffer.from(
  JSON.stringify({
    "https://api.openai.com/auth": { chatgpt_account_id: "acct-test" },
  }),
).toString("base64url")}.sig`;

test("probe requests never carry an output cap and 401 is not a delist", () => {
  for (const providerId of [
    "openai-codex",
    "anthropic",
    "github-copilot",
    "kimi-coding",
    "xai",
    "openrouter",
  ]) {
    const request = probeRequest(providerId, "claude-probe", token);
    expect(request).toBeTruthy();
    expect(JSON.stringify(request?.body)).not.toMatch(
      /max_tokens|max_output_tokens|max_completion_tokens|maxOutputTokens/,
    );
  }
  expect(probeRequest("openai-codex", "gpt-6-sol", token)?.body).toMatchObject({
    reasoning: { effort: "low" },
    stream: true,
  });
  expect(probeRequest("anthropic", "claude-opus-5-5", token)?.body).toMatchObject({
    thinking: { type: "enabled", budget_tokens: 1024 },
  });
  expect(
    probeRequest("anthropic", "claude-opus-5-5", token)?.body,
  ).not.toHaveProperty("reasoning");
  expect(classifyProbe(200, '{"model":"gpt-6-sol"}', "gpt-6-sol")).toEqual({
    kind: "available",
  });
  expect(classifyProbe(200, '{"model":"gpt-6-sol-pro"}', "gpt-6-sol")).toEqual({
    kind: "available",
    servedModel: "gpt-6-sol-pro",
  });
  expect(classifyProbe(400, "model_not_found", "gone")).toEqual({
    kind: "unavailable",
  });
  expect(classifyProbe(400, "max_tokens is required", "gone")).toEqual({
    kind: "keep",
  });
  expect(classifyProbe(401, "unauthorized", "gone")).toEqual({ kind: "credential" });
  expect(classifyProbe(403, "forbidden", "gone")).toEqual({ kind: "credential" });
  const ids = Array.from({ length: 20 }, (_, index) => ({
    id: `m${index}`,
    status: "unverified" as const,
  }));
  expect(nextProbeIds(ids, {}, 0)).toHaveLength(PROBE_BATCH);
  expect(nextProbeIds(ids, { m0: 10 }, 0)[0]).toBe("m1");
});

test("openrouter selection is free, newest, and the allowlist, capped at 50", () => {
  const models = [
    ...Array.from({ length: 3 }, (_, index) => ({
      id: `free-${index}`,
      releaseDate: `2026-01-0${index + 1}`,
      cost: { input: 0 },
    })),
    ...Array.from({ length: 25 }, (_, index) => ({
      id: `new-${String(index).padStart(2, "0")}`,
      releaseDate: `2026-02-${String(index + 1).padStart(2, "0")}`,
      cost: { input: 1 },
    })),
    {
      id: "anthropic/claude-sonnet-4.6",
      releaseDate: "2026-01-01",
      cost: { input: 3 },
    },
  ];
  const selected = selectOpenRouterIds(models, ["free-0", "missing"]);
  expect(selected).toContain("free-0");
  expect(selected).toContain("anthropic/claude-sonnet-4.6");
  expect(selected[0]).toBe("free-0");
  expect(selected).not.toContain("missing");
  expect(selected.length).toBeLessThanOrEqual(50);
  expect(selected.filter((id) => id.startsWith("new-"))).toHaveLength(20);
});

test("models.dev is fetched once for every provider", async () => {
  const seen: string[] = [];
  const store = new CatalogStore({
    now: () => 0,
    ttlMs: 1_000,
    fetch: async (url) => {
      seen.push(String(url));
      if (String(url).includes("models.dev")) {
        return new Response(
          JSON.stringify({ anthropic: { models: {} }, xai: { models: {} } }),
          { status: 200 },
        );
      }
      return new Response("no", { status: 404 });
    },
  });
  await store.current("anthropic");
  await store.current("xai");
  expect(seen.filter((url) => url.includes("models.dev"))).toHaveLength(1);
  const radius = await store.current("radius");
  expect(radius.models).toEqual([]);
  expect(radius.source).toBe("official");
});

test("mock probes cover 200, 400, and 401 through injection and cooldown", async () => {
  const f = fixture();
  f.sections.push({
    ns: "dsh-provider-manager",
    revision: 1,
    value: { ownedOauthRoutes: {}, probe: {}, selections: {}, credential: {} },
  });
  const settings = {
    describe: () =>
      f.services.settings.describe().map((section: { value: unknown }) => ({
        ...section,
        user: structuredClone(section.value),
      })),
    mutate: f.services.settings.mutate,
  };
  let clock = Date.parse("2026-09-24T00:00:00Z");
  const calls: { url: string; model?: string; hasAuth: boolean }[] = [];
  const responses = new Map<string, { status: number; body: string }>([
    ["ok-model", { status: 200, body: '{"model":"ok-model"}' }],
    ["listed-model", { status: 200, body: '{"model":"listed-model"}' }],
    ["spare-model", { status: 200, body: '{"model":"spare-model"}' }],
    ["tail-model", { status: 200, body: '{"model":"tail-model"}' }],
  ]);
  const availability = {
    providerId: "openai-codex",
    models: ["ok-model", "listed-model", "spare-model", "tail-model"].map((id) => ({
      id,
      available: false,
      status: "unverified",
      source: "models.dev",
      verifiedAt: "2026-09-24",
    })),
  };
  const specs = {
    providerId: "openai",
    models: ["ok-model", "listed-model", "spare-model", "tail-model"].map((id) => ({
      id,
      name: id,
      contextWindow: 1_000,
      maxTokens: 100,
      efforts: ["low", "high"],
      input: ["text"],
    })),
  };
  const host = new OAuthHost(
    {
      list: () => [
        {
          key: credentialKey("llm-pi-ai", "openai-codex"),
          label: "ChatGPT Codex",
          methods: [{ id: "oauth", label: "OAuth" }],
          inFlight: false,
        },
      ],
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
      readRecord: async () => ({ kind: "grant", payload: { access: token } }),
      deleteRecord: async () => {},
    },
    undefined,
    {
      oauthCatalogTtlMs: 86_400_000,
      now: () => clock,
      probeFetch: async (url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
        const headers = new Headers(init?.headers);
        calls.push({
          url: String(url),
          model: body.model,
          hasAuth: headers.has("authorization"),
        });
        const next = responses.get(body.model ?? "") ?? {
          status: 500,
          body: "no",
        };
        return new Response(next.body, { status: next.status });
      },
    },
    settings,
    new CatalogStore({
      ttlMs: 86_400_000,
      now: () => clock,
      fetch: async () => {
        throw new Error("offline");
      },
      availability: { "openai-codex": availability },
      specs: { openai: specs },
    }),
  );
  const started = host.logins.start({
    providerId: "openai-codex",
    method: "oauth",
  });
  expect((await untilDone(host, started.sessionId)).result).toBe("ok");
  expect(calls.map((call) => call.model)).toEqual([
    "ok-model",
    "listed-model",
    "spare-model",
    "tail-model",
  ]);
  const models = () =>
    (providers(f)["openai-codex"].models as { id: string; reasoningEfforts: Record<string, string> }[])
      .map((model) => model.id);
  expect(models().sort()).toEqual([
    "listed-model",
    "ok-model",
    "spare-model",
    "tail-model",
  ]);
  expect(
    (providers(f)["openai-codex"].models as { id: string; reasoningEfforts: Record<string, string> }[])
      .find((model) => model.id === "ok-model")?.reasoningEfforts,
  ).toEqual({ low: "low", high: "high" });
  const afterLogin = calls.length;
  await host.probeCatalog({ providerId: "openai-codex" });
  expect(calls).toHaveLength(afterLogin);

  clock += 86_400_000 + 1;
  responses.set("listed-model", { status: 400, body: "model_not_found" });
  await host.probeCatalog({ providerId: "openai-codex" });
  expect(models()).not.toContain("listed-model");
  expect(models()).toContain("ok-model");

  clock += 86_400_000 + 1;
  responses.set("spare-model", { status: 401, body: "unauthorized" });
  const beforeAuth = calls.length;
  const view = await host.probeCatalog({ providerId: "openai-codex" });
  expect(view.credential).toBe("expired");
  expect(calls.length).toBeGreaterThan(beforeAuth);
  expect(calls.at(-1)?.model).toBe("spare-model");
  expect(models()).toContain("tail-model");
  expect(view.models.find((model) => model.id === "spare-model")?.status).not.toBe(
    "unavailable",
  );

  mkdirSync(new URL("../artifacts", import.meta.url), { recursive: true });
  writeFileSync(
    new URL("../artifacts/r5-probe-pipeline.json", import.meta.url),
    `${JSON.stringify(
      {
        calls: calls.map((call) => ({ url: call.url, model: call.model, hasAuth: call.hasAuth })),
        injected: models(),
        credential: view.credential,
        spare: view.models.find((model) => model.id === "spare-model")?.status,
      },
      null,
      2,
    )}\n`,
  );
  expect(JSON.stringify(calls)).not.toMatch(/eyJ|acct-test|access/);
});

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
