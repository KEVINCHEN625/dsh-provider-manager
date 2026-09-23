import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { Context } from "@deepseek-ai/cordis";
import {
  LlmRuntime,
  BlockAssembler,
  createUserMessage,
  createToolResultMessage,
} from "@deepseek-ai/dsh-llm";
import * as plugin from "dsh-provider-manager";
import { chat, responses, messages } from "./opencode-wire.mjs";
const require = createRequire(import.meta.url);
assert.throws(() => require.resolve("dsh-llm-opencode-go"));
const requests = [];
globalThis.fetch = async (url, init) => {
  assert.ok(String(url).startsWith("https://opencode.ai/zen/go/v1/"));
  requests.push({
    url: String(url),
    body: JSON.parse(init.body),
    headers: new Headers(init.headers),
  });
  return String(url).includes("/messages")
    ? messages()
    : String(url).endsWith("/responses")
      ? responses()
      : chat();
};
const ctx = new Context();
ctx.plugin(LlmRuntime);
ctx.provide("credentials", {
  resolve: async () => ({ value: "synthetic-package-key" }),
  describe: async () => ({
    configured: true,
    writable: true,
    source: "fixture",
  }),
});
const sections = [];
ctx.provide("settings", {
  writable: true,
  installSection: (_ctx, ns, _schema, value) => {
    sections.push({ ns, value, revision: 0 });
  },
  describe: () => sections,
});
const mounted = ctx.plugin(plugin);
await new Promise((r) => setTimeout(r, 20));
assert.equal(
  ctx.llm.listProviders().filter((p) => p.id === plugin.GO_ROUTE).length,
  1,
);
assert.equal((await ctx.llm.listModels(plugin.GO_ROUTE)).length, 31);
assert.equal(plugin.GO_CATALOG.models.length, 40);
const user = () =>
  createUserMessage({
    source: { kind: "user" },
    content: [{ type: "text", text: "Use lookup" }],
  });
const tools = [
  {
    name: "lookup",
    description: "Lookup",
    parameters: { type: "object", properties: {} },
  },
];
for (const model of plugin.GO_MODELS) {
  const info = await plugin
    .createBuiltInGoAdapter(ctx)
    .resolveModel(plugin.GO_ROUTE, model.id);
  const expected = [
    "off",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ].filter((level) => model.thinkingLevelMap?.[level]);
  assert.deepEqual(
    (info.reasoning?.efforts ?? []).map((e) => e.id),
    expected,
  );
  const effort = ["xhigh", "max", "high", "medium", "low", "minimal"].find(
    (level) => model.thinkingLevelMap?.[level],
  );
  const run = async (messages) => {
    const assembler = new BlockAssembler();
    for await (const chunk of ctx.llm.stream({
      provider: plugin.GO_ROUTE,
      model: model.id,
      ...(effort === undefined ? {} : { reasoningEffort: effort }),
      messages,
      tools,
      sessionId: "packed-session",
    }))
      assembler.push(chunk);
    assert.notEqual(
      assembler.finish.kind,
      "error",
      JSON.stringify(assembler.finish),
    );
    return assembler.message({
      kind: "model",
      provider: plugin.GO_ROUTE,
      model: model.id,
      replayState: assembler.replayState,
    });
  };
  const first = await run([user()]);
  const calls = first.content.filter((b) => b.type === "tool-call");
  assert.equal(calls.length, 1);
  await run([
    user(),
    first,
    ...calls.map((c) =>
      createToolResultMessage({
        callId: c.id,
        content: [{ type: "text", text: "done" }],
        isError: false,
      }),
    ),
  ]);
  const last = requests.at(-1);
  assert.match(last.headers.get("user-agent"), /deepseek-harness\//);
  assert.match(last.headers.get("user-agent"), /dsh-provider-manager\/0.2.9/);
  assert.equal(last.headers.get("x-opencode-session"), "packed-session");
  if (model.api === "openai-responses") {
    if (model.id.startsWith("muse-spark-")) {
      assert.ok(!last.body.include?.includes("reasoning.encrypted_content"));
      assert.ok(!last.body.input.some((i) => i.type === "reasoning"));
      assert.ok(
        !Object.hasOwn(
          last.body.input.find((i) => i.type === "function_call"),
          "id",
        ),
      );
    }
  } else if (model.api === "openai-completions") {
    const assistant = last.body.messages?.find((m) => m.role === "assistant");
    if (assistant?.reasoning_content !== undefined)
      assert.equal(assistant.reasoning_content, "native thought");
  } else {
    assert.equal(new URL(last.url).pathname, "/zen/go/v1/messages");
    assert.ok(!last.url.includes("/v1/v1/"));
  }
}
await mounted.dispose();
assert.ok(!ctx.llm.listProviders().some((p) => p.id === plugin.GO_ROUTE));
const host = readFileSync(require.resolve("dsh-provider-manager"), "utf8");
assert.ok(
  !/\/Users\/|deepseek-harness\/packages|dsh-llm-opencode-go/.test(host),
);
console.log(
  JSON.stringify({
    fixture: process.cwd(),
    models: plugin.GO_MODELS.map((m) => m.id),
    requests: requests.length,
    headlessRegistration: true,
    unload: true,
    thirdPartyGo: false,
    realNetworkRequests: 0,
  }),
);
