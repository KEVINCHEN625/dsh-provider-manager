import { expect, test, vi } from "vitest";
import {
  createBuiltInGoProfile,
  GO_ROUTE,
  GO_MODELS,
  GO_CATALOG,
  GO_MANAGER_VERSION,
  requireGoModel,
  goEntry,
  wrapGoApi,
  sanitizeMusePayload,
  normalizeDeepSeekContext,
  selectableThinkingLevels,
} from "../src/host/opencode/index.js";
const muse = () => requireGoModel("muse-spark-1.3-contributor");
const deepseek = () => requireGoModel("deepseek-v4.1-flash");
test("closed catalog uses independent identity and official endpoint", () => {
  const p = createBuiltInGoProfile();
  expect(p.provider).toBe(GO_ROUTE);
  expect(p.piProvider!.getModels()).toHaveLength(32);
  expect(GO_CATALOG.models).toHaveLength(41);
  expect(
    GO_MODELS.every(
      (m) =>
        m.provider === GO_ROUTE &&
        (m.id === "muse-spark-1.3"
          ? m.baseUrl === goEntry("muse-spark-1.3")?.baseUrl
          : m.api === "anthropic-messages"
            ? m.baseUrl === "https://opencode.ai/zen/go"
            : m.baseUrl === "https://opencode.ai/zen/go/v1"),
    ),
  ).toBe(true);
  expect(deepseek()).toMatchObject({
    contextWindow: 1000000,
    maxTokens: 384000,
    input: ["text", "image"],
  });
  expect(muse()).toMatchObject({
    contextWindow: 1048576,
    maxTokens: 131072,
    input: ["text", "image"],
  });
});
test("Muse strips only encrypted request/history and function item IDs, preserves pairing", () => {
  const payload = {
    include: ["reasoning.encrypted_content", "other"],
    input: [
      { type: "reasoning", encrypted_content: "cipher" },
      { type: "function_call", id: "fc_x", call_id: "call_x", arguments: "{}" },
      { type: "function_call_output", call_id: "call_x", output: "ok" },
      {
        type: "message",
        content: [
          { type: "input_image", image_url: "data:image/png;base64,AA" },
          { type: "input_text", text: "hello" },
        ],
      },
    ],
    reasoning: { effort: "xhigh" },
  };
  const before = structuredClone(payload);
  const result = sanitizeMusePayload(payload, muse()) as typeof payload;
  expect(result.include).toEqual(["other"]);
  expect(result.input).toEqual([
    { type: "function_call", call_id: "call_x", arguments: "{}" },
    ...payload.input.slice(2),
  ]);
  expect(result.reasoning).toEqual(payload.reasoning);
  expect(payload).toEqual(before);
  for (const m of [
    deepseek(),
    requireGoModel("grok-4.7"),
    { ...muse(), id: "unknown" },
    { ...muse(), provider: "opencode-go" },
    { ...muse(), api: "openai-completions" },
  ])
    expect(sanitizeMusePayload(payload, m)).toBe(payload);
});
test("reasoning_content clone covers catalog replay-field models, not Muse or foreign routes", () => {
  const assistant = {
    role: "assistant",
    provider: GO_ROUTE,
    model: deepseek().id,
    api: "openai-completions",
    content: [
      { type: "thinking", thinking: "plan", thinkingSignature: "reasoning" },
    ],
  };
  const context = {
    messages: [
      assistant,
      { ...assistant, provider: "opencode-go" },
      { ...assistant, model: muse().id },
      { ...assistant, api: "openai-responses" },
    ],
  };
  const before = structuredClone(context);
  const result = normalizeDeepSeekContext(context as any, deepseek());
  expect((result.messages[0] as any).content[0].thinkingSignature).toBe(
    "reasoning_content",
  );
  expect(result.messages.slice(1)).toEqual(context.messages.slice(1));
  expect(context).toEqual(before);
  expect(normalizeDeepSeekContext(context as any, muse())).toBe(context);
  const glm = requireGoModel("glm-5.3");
  const glmContext = {
    messages: [{ ...assistant, model: glm.id }],
  };
  expect(
    (normalizeDeepSeekContext(glmContext as any, glm).messages[0] as any)
      .content[0].thinkingSignature,
  ).toBe("reasoning_content");
});
test("direct wrappers retain stream result identity/options and isolate session headers", async () => {
  const returned = { result: () => 42 };
  const stream = vi.fn(() => returned);
  const api = wrapGoApi({ stream, streamSimple: stream } as any);
  const signal = new AbortController().signal;
  expect(
    api.streamSimple(
      muse(),
      { messages: [] },
      {
        sessionId: "one",
        signal,
        headers: {
          "X-Title": "DSH",
          "x-opencode-session": "bad",
          "User-Agent": "deepseek-harness/0.1.5-rc.2",
        },
      },
    ),
  ).toBe(returned);
  api.streamSimple(muse(), { messages: [] }, { sessionId: "two" });
  api.streamSimple(muse(), { messages: [] });
  api.streamSimple(muse(), { messages: [] });
  const opts = stream.mock.calls.map((x: any) => x[2]);
  expect(opts[0].signal).toBe(signal);
  expect(opts[0].headers).toMatchObject({
    "x-opencode-session": "one",
    "x-title": "DSH",
    "user-agent": `deepseek-harness/0.1.5-rc.2 dsh-provider-manager/${GO_MANAGER_VERSION}`,
  });
  expect(opts[1].headers["x-opencode-session"]).toBe("two");
  expect(opts[2].headers["x-opencode-session"]).not.toBe(
    opts[3].headers["x-opencode-session"],
  );
});
test("payload hook honors caller replacement before narrow filtering", async () => {
  let options: any;
  const api = wrapGoApi({
    stream: (_m: any, _c: any, o: any) => {
      options = o;
      return {};
    },
    streamSimple: () => ({}),
  } as any);
  api.stream(
    muse(),
    { messages: [] },
    { onPayload: () => ({ include: ["reasoning.encrypted_content", "safe"] }) },
  );
  expect(await options.onPayload({}, muse())).toEqual({ include: ["safe"] });
});

test("Go compatibility preserves existing protocol constraints", () => {
  expect(muse().compat).toMatchObject({
    supportsDeveloperRole: false,
    supportsStrictMode: false,
    supportsLongCacheRetention: false,
  });
  expect(deepseek().compat).toMatchObject({
    supportsDeveloperRole: false,
    supportsStore: false,
    maxTokensField: "max_tokens",
  });
});
for (const model of GO_MODELS)
  test(`public adapter exposes exact supported reasoning efforts for ${model.id}`, async () => {
    const { createBuiltInGoAdapter } = await import(
      "../src/host/opencode/index.js"
    );
    const adapter = createBuiltInGoAdapter({
      credentials: {
        resolve: () => {
          throw new Error("metadata must not resolve a credential");
        },
      },
      get: () => undefined,
    } as any);
    const resolved = await adapter.resolveModel(GO_ROUTE, model.id);
    const expected = selectableThinkingLevels(goEntry(model.id)!);
    if (expected.length === 0) expect(resolved.reasoning).toBeUndefined();
    else
      expect(resolved.reasoning?.efforts.map((effort) => effort.id)).toEqual(
        expected,
      );
  });
