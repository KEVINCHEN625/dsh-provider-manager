import { test, expect } from "vitest";
import { Manager } from "../src/host/providers.js";
import { fixture } from "./fixtures/services.js";
const draft = {
  route: "test-api",
  name: "Test",
  baseURL: "https://example.com/v1",
  api: "openai-completions",
  models: ["m"],
  revision: 1,
};
test("snapshot excludes literal secrets and preserves model protocols", async () => {
  const m: any = new Manager(fixture().services);
  const s = await m.snapshot();
  expect(JSON.stringify(s)).not.toContain("SENTINEL");
  expect(s.providers[0].models[0].api).toBe("anthropic-messages");
});
test("route conflicts and stale revisions never write", async () => {
  const f = fixture();
  const m: any = new Manager(f.services);
  await expect(
    m.save({ ...draft, route: "opencode-go" }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(m.save({ ...draft, revision: 0 })).rejects.toMatchObject({
    code: "CONFLICT",
  });
  expect(f.writes).toHaveLength(0);
});
test("local save preserves other provider fields and namespace fields", async () => {
  const f = fixture();
  const m: any = new Manager(f.services);
  await m.save(draft);
  expect(f.sections[2].value.untouched).toBe("keep");
  expect(f.sections[2].value.providers["test-api"].apiKeyEnv).toBe(
    "DSH_PROVIDER_MANAGER_746573742d617069_API_KEY",
  );
  expect(f.writes[0].every((x: any) => x.path.length === 3)).toBe(true);
});
test("secret save success survives separate config conflict", async () => {
  const f = fixture();
  const m: any = new Manager(f.services);
  const p = (await m.snapshot()).providers[0];
  await m.set({ providerId: p.id, bindingToken: p.bindingToken, value: "NEW" });
  await expect(m.save({ ...draft, revision: 0 })).rejects.toMatchObject({
    code: "CONFLICT",
  });
  expect(f.values.get("OPENCODE_API_KEY")).toBe("NEW");
});
test("read-only settings clearly reported and refuse writes", async () => {
  const f = fixture();
  f.services.settings.writable = false;
  const m: any = new Manager(f.services);
  expect((await m.snapshot()).settingsWritable).toBe(false);
  await expect(m.save(draft)).rejects.toMatchObject({ code: "READ_ONLY" });
  expect(f.writes).toHaveLength(0);
});
test("editing models retains existing capability and unknown configuration fields", async () => {
  const f = fixture();
  const m: any = new Manager(f.services);
  await m.save(draft);
  const profile = f.sections[2].value.providers["test-api"];
  profile.models = [{ id: "m", contextWindow: 123, compat: { unknown: true } }];
  profile.headers = { "x-test": "keep" };
  await m.save({ ...draft, revision: 2, editing: true, models: ["m", "new"] });
  expect(profile.models).toEqual([
    { id: "m", contextWindow: 123, compat: { unknown: true } },
    { id: "new" },
  ]);
  expect(profile.headers).toEqual({ "x-test": "keep" });
});
test("per-model contextWindow overwrites capacity and keeps unknown fields", async () => {
  const f = fixture();
  const m: any = new Manager(f.services);
  await m.save(draft);
  const profile = f.sections[2].value.providers["test-api"];
  profile.models = [{ id: "m", contextWindow: 123, compat: { unknown: true } }];
  await m.save({
    ...draft,
    revision: 2,
    editing: true,
    models: [
      { id: "m", contextWindow: 1_048_576 },
      { id: "turbo", contextWindow: 200_000 },
    ],
  });
  expect(profile.models).toEqual([
    { id: "m", contextWindow: 1_048_576, compat: { unknown: true } },
    { id: "turbo", contextWindow: 200_000 },
  ]);
  f.services.llm.listModels = async () => [
    { id: "m", name: "M" },
    { id: "turbo", name: "Turbo" },
  ];
  const card = await m.card("custom:test-api");
  expect(card.models).toEqual([
    { id: "m", name: "M", contextWindow: 1_048_576 },
    { id: "turbo", name: "Turbo", contextWindow: 200_000 },
  ]);
});
test("duplicate model ids and invalid contextWindow are refused", async () => {
  const f = fixture();
  const m: any = new Manager(f.services);
  await expect(
    m.save({
      ...draft,
      models: [
        { id: "m", contextWindow: 1_048_576 },
        { id: "m", contextWindow: 200_000 },
      ],
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    m.save({ ...draft, models: [{ id: "m", contextWindow: 0 }] }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    m.save({ ...draft, models: [{ id: "m", extra: true }] }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(f.writes).toHaveLength(0);
});
test("advanced values only mutate when explicitly submitted, reject invalid numbers", async () => {
  const f = fixture();
  const m: any = new Manager(f.services);
  await m.save({ ...draft, defaultContextWindow: 4096 });
  expect(
    f.writes[0].some(
      (op: any) =>
        op.path.at(-1) === "defaultContextWindow" && op.value === 4096,
    ),
  ).toBe(true);
  expect(
    f.writes[0].some((op: any) => op.path.at(-1) === "defaultMaxTokens"),
  ).toBe(false);
  await expect(
    m.save({ ...draft, route: "other", revision: 2, defaultMaxTokens: -1 }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
test("editing an explicitly authorized existing reference preserves its authentication binding", async () => {
  const f = fixture();
  f.sections[2].value.providers.acme = {
    api: "openai-completions",
    apiKeyEnv: "ACME_EXISTING",
    baseURL: "https://example.com",
    models: [{ id: "m" }],
  };
  const m: any = new Manager(f.services, {
    authorizedExistingRefs: { "custom:acme": "ACME_EXISTING" },
  });
  await m.save({ ...draft, route: "acme", editing: true });
  expect(f.sections[2].value.providers.acme.apiKeyEnv).toBe("ACME_EXISTING");
});
test("catalog failure is independent of credential management failure", async () => {
  const f = fixture();
  const m: any = new Manager(f.services);
  f.sections[0].value.apiKeyEnv = "UNMANAGED";
  const readable = await m.card("opencode-go");
  expect(readable.error).toBe("REF_NOT_ALLOWED");
  expect(readable.catalogError).toBeUndefined();
  expect(readable.models).toHaveLength(1);
  f.services.llm.listModels = async () => {
    throw Error("synthetic");
  };
  const unavailable = await m.card("opencode-go");
  expect(unavailable.catalogError).toBe("UNAVAILABLE");
});
test("reserved Muse route and unknown cards are rejected", async () => {
  const m: any = new Manager(fixture().services);
  await expect(m.save({ ...draft, route: "muse-code" })).rejects.toMatchObject({
    code: "CONFLICT",
  });
  await expect(m.card("not-a-provider")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  const s = await m.snapshot();
  expect(s.muse.status).toBe("CLI_ONLY");
  expect(s.providers.every((p: { notice?: string }) => !p.notice)).toBe(true);
});
