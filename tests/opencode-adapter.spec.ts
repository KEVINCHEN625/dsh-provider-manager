import { chat, responses, messages } from "./fixtures/opencode-wire.mjs";
import { afterEach, expect, test, vi } from "vitest";
import {
  LlmRuntime,
  BlockAssembler,
  createUserMessage,
  createToolResultMessage,
} from "@deepseek-ai/dsh-llm";
import { Context } from "@deepseek-ai/cordis";
import {
  createBuiltInGoAdapter,
  GO_ROUTE,
  GO_MODELS,
  GO_MANAGER_VERSION,
  GO_CATALOG,
  requireGoModel,
  goEntry,
} from "../src/host/opencode/index.js";
import * as plugin from "../src/host/index.js";
import { fixture } from "./fixtures/services.js";
const muse = () => requireGoModel("muse-spark-1.3-contributor");
const muse12 = () => requireGoModel("muse-spark-1.2-contributor");
const deepseek = () => requireGoModel("deepseek-v4.1-flash");
afterEach(() => vi.unstubAllGlobals());
const tools = [
  {
    name: "lookup",
    description: "Lookup",
    parameters: { type: "object", properties: {} },
  },
];
const user = () =>
  createUserMessage({
    content: [{ type: "text", text: "Use lookup" }],
    source: { kind: "user" },
  });
function setup(field = "reasoning") {
  let key = "synthetic-one";
  const requests: any[] = [];
  const credentials = {
    resolve: vi.fn(async () => (key ? { value: key } : undefined)),
  };
  const adapter = createBuiltInGoAdapter({
    credentials,
    get: () => undefined,
  } as any);
  vi.stubGlobal("fetch", async (url: any, init: any) => {
    requests.push({
      url: String(url),
      body: JSON.parse(init.body),
      headers: new Headers(init.headers),
      signal: init.signal,
    });
    return String(url).includes("/messages")
      ? messages()
      : String(url).endsWith("/responses")
        ? responses()
        : chat(field);
  });
  return {
    adapter,
    requests,
    credentials,
    setKey: (next: string) => (key = next),
  };
}
async function run(
  adapter: any,
  model: string,
  messages: any[] = [user()],
  extra: any = {},
) {
  const assembler = new BlockAssembler();
  for await (const chunk of adapter.stream({
    provider: GO_ROUTE,
    model,
    messages,
    tools,
    sessionId: "session-A",
    ...extra,
  }))
    assembler.push(chunk);
  expect(assembler.finish.kind).not.toBe("error");
  return assembler.message({
    kind: "model",
    provider: GO_ROUTE,
    model,
    replayState: assembler.replayState,
  });
}
function results(message: any) {
  return message.content
    .filter((b: any) => b.type === "tool-call")
    .map((b: any) =>
      createToolResultMessage({
        callId: b.id,
        content: [{ type: "text", text: "tool result" }],
        isError: false,
      }),
    );
}
for (const field of ["reasoning", "reasoning_content"])
  for (const effort of ["high", "max"])
    test(`native ${field} roundtrips DSH replay for DeepSeek ${effort}`, async () => {
      const f = setup(field);
      const model = deepseek().id;
      const first = await run(f.adapter, model, [user()], {
        reasoningEffort: effort,
      });
      expect(first.content.some((b: any) => b.type === "tool-call")).toBe(true);
      const history = [user(), first, ...results(first)];
      const before = JSON.stringify(history);
      await run(f.adapter, model, history, { reasoningEffort: effort });
      expect(JSON.stringify(history)).toBe(before);
      expect(f.requests[1].body).toMatchObject({
        thinking: { type: "enabled" },
        reasoning_effort: effort,
      });
      expect(
        f.requests[1].body.messages.find((m: any) => m.role === "assistant")
          .reasoning_content,
      ).toBe("native thought");
      expect(
        f.requests[1].body.messages.find((m: any) => m.role === "tool")
          .tool_call_id,
      ).toBe("call_mock");
    });
for (const model of [muse12(), muse()])
  test(`Muse ${model.id} actual wire filters replay, retains tools and xhigh`, async () => {
    const f = setup();
    const first = await run(f.adapter, model.id, [user()], {
      reasoningEffort: "xhigh",
    });
    await run(f.adapter, model.id, [user(), first, ...results(first)], {
      reasoningEffort: "xhigh",
    });
    for (const r of f.requests) {
      expect(r.url).toBe("https://opencode.ai/zen/go/v1/responses");
      expect(r.body.include ?? []).not.toContain("reasoning.encrypted_content");
      expect(r.body.input.some((i: any) => i.type === "reasoning")).toBe(false);
      expect(r.body.reasoning.effort).toBe("xhigh");
      expect(r.headers.get("x-opencode-session")).toBe("session-A");
      expect(r.headers.get("user-agent")).toContain("deepseek-harness/");
      expect(r.headers.get("user-agent")).toContain(
        "dsh-provider-manager/" + GO_MANAGER_VERSION,
      );
    }
    const input = f.requests[1].body.input;
    expect(
      input.find((i: any) => i.type === "function_call"),
    ).not.toHaveProperty("id");
    expect(input.find((i: any) => i.type === "function_call").call_id).toBe(
      input.find((i: any) => i.type === "function_call_output").call_id,
    );
  });
test("concurrent sessions, prepared calls resolve current key, no key/unknown model fails before fetch", async () => {
  const f = setup();
  const prepared = await f.adapter.prepareCall(GO_ROUTE, deepseek().id);
  expect(f.credentials.resolve).not.toHaveBeenCalled();
  f.setKey("synthetic-two");
  await Promise.all(
    ["session-A", "session-B"].map((sessionId) =>
      run(prepared, deepseek().id, [user()], { sessionId }),
    ),
  );
  expect(
    new Set(f.requests.map((r) => r.headers.get("x-opencode-session"))),
  ).toEqual(new Set(["session-A", "session-B"]));
  expect(
    f.requests.every(
      (r) => r.headers.get("authorization") === "Bearer synthetic-two",
    ),
  ).toBe(true);
  f.setKey("");
  await expect(run(f.adapter, deepseek().id)).rejects.toMatchObject({
    code: "MISSING_CREDENTIAL",
  });
  await expect(run(f.adapter, "missing")).rejects.toThrow();
  expect(f.requests).toHaveLength(2);
});
test("headless Cordis registers owned adapter/directory outside Web injection and unloads", async () => {
  const ctx = new Context();
  const f = fixture();
  ctx.plugin(LlmRuntime);
  for (const [name, value] of Object.entries(f.services))
    if (name !== "llm") ctx.provide(name, value);
  const fork = ctx.plugin(plugin);
  await new Promise((r) => setTimeout(r, 20));
  expect(ctx.llm.listProviders().map((p) => p.id)).toContain(GO_ROUTE);
  expect(f.sections.some((s) => s.ns === GO_ROUTE)).toBe(true);
  await fork.dispose();
  expect(ctx.llm.listProviders().map((p) => p.id)).not.toContain(GO_ROUTE);
});
test("image attachments absent fail before outbound request", async () => {
  const f = setup();
  await expect(
    run(f.adapter, muse().id, [
      {
        id: "image",
        role: "user",
        source: { kind: "user" },
        content: [
          {
            type: "image",
            attachment: { id: "missing", mimeType: "image/png" },
          },
        ],
      },
    ]),
  ).rejects.toMatchObject({ code: "UNSUPPORTED_CONTENT" });
  expect(f.requests).toHaveLength(0);
});
for (const [from, to] of [
  ["muse-spark-1.3-contributor", "deepseek-v4.1-flash"],
  ["deepseek-v4.1-flash", "muse-spark-1.3-contributor"],
])
  test(`model switch ${from} to ${to} preserves tool pairs without foreign native state`, async () => {
    const f = setup();
    const first = await run(f.adapter, from);
    await run(f.adapter, to, [user(), first, ...results(first)]);
    const body = f.requests[1].body;
    if (to === "deepseek-v4.1-flash") {
      const assistant = body.messages.find((m: any) => m.role === "assistant");
      expect(assistant.tool_calls[0].id).toBe(
        body.messages.find((m: any) => m.role === "tool").tool_call_id,
      );
      expect(assistant.reasoning_content).not.toBe("native thought");
    } else {
      expect(
        body.input.find((m: any) => m.type === "function_call").call_id,
      ).toBe(
        body.input.find((m: any) => m.type === "function_call_output").call_id,
      );
      expect(body.input.some((m: any) => m.type === "reasoning")).toBe(false);
    }
  });
test("abort and consumer close propagate through unchanged PiAiAdapter lifecycle", async () => {
  const f = setup();
  let upstream: AbortSignal | undefined;
  vi.stubGlobal("fetch", async (_url: any, init: any) => {
    upstream = init.signal;
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              "data: " +
                JSON.stringify({
                  id: "mock",
                  choices: [{ index: 0, delta: { content: "first" } }],
                }) +
                "\n\n",
            ),
          );
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    );
  });
  const options: any = {
    provider: GO_ROUTE,
    model: deepseek().id,
    messages: [user()],
    tools,
  };
  const it = f.adapter.stream(options)[Symbol.asyncIterator]();
  await it.next();
  await it.return!();
  expect(upstream?.aborted).toBe(true);
  const abort = new AbortController();
  abort.abort();
  const chunks = [];
  for await (const chunk of f.adapter.stream({
    ...options,
    signal: abort.signal,
  }))
    chunks.push(chunk);
  expect(chunks.at(-1)).toMatchObject({
    type: "finish",
    reason: { kind: "aborted" },
  });
});
test("reasoning-only response is not relabeled as visible answer", async () => {
  const f = setup();
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        "data: " +
          JSON.stringify({
            id: "mock",
            choices: [
              {
                index: 0,
                delta: { reasoning: "hidden only" },
                finish_reason: "stop",
              },
            ],
          }) +
          "\n\ndata: [DONE]\n\n",
        { headers: { "content-type": "text/event-stream" } },
      ),
  );
  const first = await run(f.adapter, deepseek().id);
  expect(
    first.content.some(
      (b: any) => b.type === "text" && b.text.includes("hidden only"),
    ),
  ).toBe(false);
});
test("real LlmRuntime ownership strips old adapter replay, same adapter model switches retain tool pairs", async () => {
  const { PiAiAdapter } = await import("@deepseek-ai/dsh-llm-pi-ai");
  const { createProvider } = await import("@earendil-works/pi-ai");
  const { openAICompletionsApi } = await import(
    "@earendil-works/pi-ai/api/openai-completions.lazy"
  );
  const f = setup();
  const ctx = new Context();
  ctx.plugin(LlmRuntime);
  await new Promise((r) => setTimeout(r, 10));
  const current = ctx.llm.registerAdapter([GO_ROUTE], f.adapter);
  const oldProfile = plugin.createBuiltInGoProfile();
  oldProfile.provider = "opencode-go";
  const oldModel = { ...deepseek(), provider: "opencode-go" };
  oldProfile.piProvider = createProvider({
    id: "opencode-go",
    name: "Old Go test",
    models: [oldModel],
    auth: {
      apiKey: {
        name: "fixture",
        resolve: async ({ credential }) => ({
          auth: { apiKey: credential!.key },
          source: "fixture",
        }),
      },
    },
    api: openAICompletionsApi(),
  });
  const oldAdapter = new PiAiAdapter({
    profiles: () => new Map([["opencode-go", oldProfile]]),
    resolveApiKey: async () => "synthetic-old",
    auth: {
      credentials: {
        read: async () => undefined,
        list: async () => [],
        modify: async () => undefined,
        delete: async () => {},
      },
      authContext: {
        env: async () => undefined,
        fileExists: async () => false,
      },
    },
  });
  const old = ctx.llm.registerAdapter(["opencode-go"], oldAdapter);
  const stream = async (provider: string, model: string, messages: any[]) => {
    const a = new BlockAssembler();
    for await (const chunk of ctx.llm.stream({
      provider,
      model,
      messages,
      tools,
    }))
      a.push(chunk);
    expect(a.finish.kind).not.toBe("error");
    return a.message({
      kind: "model",
      provider,
      model,
      replayState: a.replayState,
    });
  };
  for (const [route, from, to] of [
    [GO_ROUTE, "muse-spark-1.3-contributor", "deepseek-v4.1-flash"],
    [GO_ROUTE, "deepseek-v4.1-flash", "muse-spark-1.3-contributor"],
    ["opencode-go", "deepseek-v4.1-flash", "deepseek-v4.1-flash"],
    ["opencode-go", "deepseek-v4.1-flash", "muse-spark-1.3-contributor"],
  ] as const) {
    const first = await stream(route, from, [user()]);
    expect(first.source).toHaveProperty("replayState");
    const before = JSON.stringify(first);
    await stream(GO_ROUTE, to, [user(), first, ...results(first)]);
    expect(JSON.stringify(first)).toBe(before);
    const body = f.requests.at(-1).body;
    if (to === "deepseek-v4.1-flash") {
      const a = body.messages.find((m: any) => m.role === "assistant");
      expect(a.tool_calls[0].id).toBe(
        body.messages.find((m: any) => m.role === "tool").tool_call_id,
      );
      if (route === "opencode-go")
        expect(a.reasoning_content).not.toBe("native thought");
    } else {
      const call = body.input.find((m: any) => m.type === "function_call");
      expect(call.call_id).toBe(
        body.input.find((m: any) => m.type === "function_call_output").call_id,
      );
    }
  }
  old();
  current();
});
test("prepared call keeps captured profile while a later call uses next profile; credentials resolve at stream start", async () => {
  const { PiAiAdapter } = await import("@deepseek-ai/dsh-llm-pi-ai");
  const f = setup();
  let key = "before";
  let profile = plugin.createBuiltInGoProfile();
  profile.headers = { "x-fixture-profile": "first" };
  let profiles = new Map([[GO_ROUTE, profile]]);
  const resolved: string[] = [];
  const adapter = new PiAiAdapter({
    profiles: () => profiles,
    resolveApiKey: async (_route, p) => {
      resolved.push(p.headers!["x-fixture-profile"]);
      return key;
    },
    auth: {
      credentials: {
        read: async () => undefined,
        list: async () => [],
        modify: async () => undefined,
        delete: async () => {},
      },
      authContext: {
        env: async () => undefined,
        fileExists: async () => false,
      },
    },
  });
  const prepared = await adapter.prepareCall(GO_ROUTE, deepseek().id);
  expect(resolved).toEqual([]);
  profile = plugin.createBuiltInGoProfile();
  profile.headers = { "x-fixture-profile": "second" };
  profiles = new Map([[GO_ROUTE, profile]]);
  key = "after";
  await run(prepared, deepseek().id);
  await run(adapter, deepseek().id);
  expect(resolved).toEqual(["first", "second"]);
  expect(f.requests.map((r) => r.headers.get("x-fixture-profile"))).toEqual([
    "first",
    "second",
  ]);
  expect(
    f.requests.every((r) => r.headers.get("authorization") === "Bearer after"),
  ).toBe(true);
});
function pathOf(api: string) {
  if (api === "openai-responses") return "/responses";
  if (api === "openai-completions") return "/chat/completions";
  return "/v1/messages";
}
function expectOfficialEndpoint(url: URL, model: { id: string; api: string }) {
  expect(url.pathname.endsWith(pathOf(model.api))).toBe(true);
  expect(url.pathname).not.toContain("/v1/v1/");
  if (model.id === "muse-spark-1.3") {
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://opencode.ai/zen/v1/responses",
    );
    return;
  }
  expect(url.pathname).toContain("/zen/go/");
  if (model.api === "anthropic-messages")
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://opencode.ai/zen/go/v1/messages",
    );
}
for (const model of GO_MODELS)
  test(`enabled ${model.id} uses the official ${model.api} path`, async () => {
    const f = setup();
    const map = model.thinkingLevelMap ?? {};
    const effort = ["xhigh", "max", "high", "medium", "low", "minimal"].find(
      (level) => map[level as keyof typeof map],
    );
    await run(
      f.adapter,
      model.id,
      [user()],
      effort ? { reasoningEffort: effort } : {},
    );
    expect(f.requests).toHaveLength(1);
    const url = new URL(f.requests[0].url);
    expectOfficialEndpoint(url, model);
    expect(f.requests[0].headers.get("x-opencode-session")).toBe("session-A");
    expect(f.requests[0].headers.get("user-agent")).toContain(
      `dsh-provider-manager/${GO_MANAGER_VERSION}`,
    );
  });
test("Qwen budget models send local presets, never the advertised max as default", async () => {
  const f = setup();
  await run(f.adapter, "qwen3.7-max", [user()], { reasoningEffort: "high" });
  const thinking = f.requests[0].body.thinking;
  expect(thinking.type).toBe("enabled");
  expect(thinking.budget_tokens).toBe(16384);
  expect(thinking.budget_tokens).toBeLessThan(262144);
  expect(f.requests[0].body).not.toHaveProperty("output_config");
});
test("Qwen 3.8 adaptive thinking sends native xhigh rather than a budget conversion", async () => {
  const f = setup();
  await run(f.adapter, "qwen3.8-max", [user()], { reasoningEffort: "xhigh" });
  const body = f.requests[0].body;
  expect(body.thinking?.type).toBe("adaptive");
  expect(body.output_config?.effort).toBe("xhigh");
  expect(body.thinking?.budget_tokens).toBeUndefined();
});
const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
function declaredLevels(id: string) {
  const entry = goEntry(id)!;
  return LEVELS.filter((level) => entry.thinkingLevelMap[level] !== null);
}
function localBudget(id: string, level: string) {
  const entry = goEntry(id)!;
  const preset = entry.localBudgetPresets.find((item) => item.id === level);
  const cap = entry.maxOutputTokens ?? 1024;
  const nativeMax = entry.budgetTokensMax ?? cap;
  return Math.min(preset?.tokens ?? 1024, nativeMax, Math.max(0, cap - 1024));
}
function expectControl(id: string, body: any, level: string | undefined) {
  const entry = goEntry(id)!;
  const mapped = level ? entry.thinkingLevelMap[level] : null;
  if (entry.api === "openai-responses") {
    if (!level) expect(body.reasoning).toBeUndefined();
    else expect(body.reasoning?.effort).toBe(mapped);
    if (entry.compatPolicy === "muse-responses")
      expect(body.include ?? []).not.toContain("reasoning.encrypted_content");
    else if (level && level !== "off")
      expect(body.include).toContain("reasoning.encrypted_content");
    return;
  }
  if (entry.compatPolicy === "deepseek-reasoning-content") {
    if (!level) expect(body.thinking).toBeUndefined();
    else if (level === "off")
      expect(body.thinking).toEqual({ type: "disabled" });
    else {
      expect(body.thinking).toEqual({ type: "enabled" });
      if (entry.nativeEfforts.length)
        expect(body.reasoning_effort).toBe(mapped);
      else expect(body.reasoning_effort).toBeUndefined();
    }
    return;
  }
  if (entry.api === "openai-completions") {
    if (!level) expect(body.reasoning_effort).toBeUndefined();
    else expect(body.reasoning_effort).toBe(mapped);
    return;
  }
  if (entry.compatPolicy === "anthropic-adaptive") {
    if (!level || level === "off") {
      expect(body.thinking?.type).not.toBe("adaptive");
      expect(body.output_config).toBeUndefined();
    } else {
      expect(body.thinking?.type).toBe("adaptive");
      expect(body.output_config?.effort).toBe(mapped);
      expect(body.thinking?.budget_tokens).toBeUndefined();
    }
    return;
  }
  if (entry.compatPolicy === "anthropic-budget") {
    if (!level || level === "off") expect(body.thinking?.type).toBe("disabled");
    else {
      expect(body.thinking?.type).toBe("enabled");
      expect(body.thinking?.budget_tokens).toBe(localBudget(id, level));
      expect(body.output_config).toBeUndefined();
    }
    return;
  }
  if (entry.compatPolicy === "anthropic-toggle") {
    if (!level || level === "off") expect(body.thinking?.type).toBe("disabled");
    else {
      expect(body.thinking?.type).toBe("enabled");
      expect(body.thinking?.budget_tokens).toBe(1024);
    }
    return;
  }
  expect(body.thinking).toBeUndefined();
  expect(body.output_config).toBeUndefined();
}
for (const model of GO_MODELS) {
  const levels = declaredLevels(model.id);
  const cases = levels.length ? levels : [undefined];
  for (const level of cases)
    test(`${model.id} wire ${level ?? "provider-default"}`, async () => {
      const f = setup();
      await run(
        f.adapter,
        model.id,
        [user()],
        level ? { reasoningEffort: level } : {},
      );
      const request = f.requests[0];
      const url = new URL(request.url);
      expectOfficialEndpoint(url, model);
      expect(url.pathname).not.toContain("/v1/v1/");
      expect(url.search).not.toContain("beta=true");
      expect(request.headers.get("anthropic-beta")).toBeNull();
      expect(request.headers.get("x-opencode-session")).toBe("session-A");
      expect(request.headers.get("user-agent")).toContain(
        `dsh-provider-manager/${GO_MANAGER_VERSION}`,
      );
      if (model.api === "anthropic-messages") {
        expect(url.pathname).toBe("/zen/go/v1/messages");
        expect(request.headers.get("x-api-key")).toBe("synthetic-one");
        expect(request.headers.get("authorization")).toBeNull();
      } else {
        expect(request.headers.get("authorization")).toBe(
          "Bearer synthetic-one",
        );
      }
      expectControl(model.id, request.body, level);
    });
}
for (const entry of GO_CATALOG.models.filter(
  (item) => item.disposition !== "supported",
))
  test(`blocked ${entry.id} fails before any request`, async () => {
    const f = setup();
    await expect(run(f.adapter, entry.id)).rejects.toThrow();
    expect(f.requests).toHaveLength(0);
    expect(f.credentials.resolve).not.toHaveBeenCalled();
  });
test("provider-default calls still stream when an effort menu exists", async () => {
  const f = setup();
  const ctx = new Context();
  ctx.plugin(LlmRuntime);
  await new Promise((r) => setTimeout(r, 10));
  const current = ctx.llm.registerAdapter([GO_ROUTE], f.adapter);
  for (const model of ["minimax-m2.7", "glm-5.1"]) {
    const assembler = new BlockAssembler();
    for await (const chunk of ctx.llm.stream({
      provider: GO_ROUTE,
      model,
      messages: [user()],
      tools,
      sessionId: "session-A",
    }))
      assembler.push(chunk);
    expect(assembler.finish.kind).not.toBe("error");
  }
  expect(f.requests.map((request) => new URL(request.url).pathname)).toEqual([
    "/zen/go/v1/messages",
    "/zen/go/v1/chat/completions",
  ]);
  current();
});
