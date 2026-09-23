import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { wrapOpenCodeGoMuseResponses } from "../compat/opencode-go-muse.mjs";
import { runCompatibility } from "../scripts/apply-opencode-go-muse-compat.mjs";
import { auditedOriginal } from "./muse-compat-fixture.mjs";
const liveRoot =
  process.env.MUSE_COMPAT_PLUGIN_ROOT ||
  path.join(os.homedir(), ".dsh/profiles/web/node_modules/dsh-llm-opencode-go");
const piRoot = path.join(liveRoot, "node_modules/@earendil-works/pi-ai");
const { openAIResponsesApi } = await import(
  pathToFileURL(path.join(piRoot, "dist/api/openai-responses.lazy.js"))
);
const model = {
  id: "muse-spark-1.3-contributor",
  provider: "opencode-go",
  api: "openai-responses",
  name: "Muse",
  baseUrl: "https://offline.invalid/v1",
  reasoning: true,
  input: ["text", "image"],
  contextWindow: 200000,
  maxTokens: 32000,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  thinkingLevelMap: { xhigh: "xhigh" },
};
const longCall = "call_" + "x".repeat(100);
const longItem = "fc_" + "y".repeat(100);
const output = [
  {
    type: "reasoning",
    id: "rs_old",
    summary: [{ type: "summary_text", text: "Think carefully" }],
    encrypted_content: "encrypted-fixture",
  },
  ...["first", "second"].map((name, index) => ({
    type: "function_call",
    id: longItem + index,
    call_id: longCall + index,
    name,
    arguments: JSON.stringify({ index }),
    status: "completed",
  })),
];
function response(items = output) {
  const events = [
    {
      type: "response.created",
      response: { id: "resp_local", status: "in_progress" },
    },
  ];
  items.forEach((item, output_index) => {
    events.push({ type: "response.output_item.added", output_index, item });
    if (item.type === "reasoning")
      events.push({
        type: "response.reasoning_summary_text.delta",
        output_index,
        delta: "Think carefully",
      });
    events.push({ type: "response.output_item.done", output_index, item });
  });
  events.push({
    type: "response.completed",
    response: {
      id: "resp_local",
      status: "completed",
      output: items,
      usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 },
    },
  });
  return new Response(
    events
      .map(
        (event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
      )
      .join(""),
    { headers: { "content-type": "text/event-stream" } },
  );
}
function recorder() {
  const requests = [];
  return {
    requests,
    fetch: async (url, init) => {
      requests.push({
        url: String(url),
        body: JSON.parse(init.body),
        headers: new Headers(init.headers),
      });
      return response();
    },
  };
}
const context = () => ({
  messages: [{ role: "user", content: "Use both tools", timestamp: 1 }],
  tools: ["first", "second"].map((name) => ({
    name,
    description: name,
    parameters: { type: "object", properties: { index: { type: "number" } } },
  })),
});
async function consume(stream) {
  assert.equal(typeof stream.result, "function");
  assert.equal(typeof stream.then, "undefined");
  const events = [];
  for await (const event of stream) events.push(event.type);
  const result = await stream.result();
  assert.notEqual(result.stopReason, "error", result.errorMessage);
  return { result, events };
}
function assertClean(body) {
  assert.ok(!body.include?.includes("reasoning.encrypted_content"));
  assert.ok(!body.input.some((item) => item.type === "reasoning"));
  assert.ok(
    body.input
      .filter((item) => item.type === "function_call")
      .every((item) => !Object.hasOwn(item, "id")),
  );
  assert.equal(body.reasoning.effort, "xhigh");
}
async function twoTurns(api, method, selectedModel = model) {
  const capture = recorder();
  const ctx = context();
  const options = {
    apiKey: "offline-test-key",
    fetch: capture.fetch,
    sessionId: "session-A",
    headers: { "x-local-fixture": "kept" },
    reasoning: "xhigh",
    reasoningEffort: "xhigh",
    maxRetries: 0,
  };
  const first = await consume(api[method](selectedModel, ctx, options));
  assert.ok(first.events.includes("thinking_end"));
  assert.ok(first.events.includes("toolcall_end"));
  assert.equal(
    first.result.content.filter((x) => x.type === "toolCall").length,
    2,
  );
  const history = [
    ...ctx.messages,
    first.result,
    ...first.result.content
      .filter((x) => x.type === "toolCall")
      .map((call) => ({
        role: "toolResult",
        toolCallId: call.id,
        toolName: call.name,
        content: [
          { type: "text", text: "result " + call.name },
          { type: "image", data: "AA==", mimeType: "image/png" },
        ],
        isError: false,
        timestamp: 2,
      })),
  ];
  const snapshot = structuredClone(history);
  await consume(
    api[method](selectedModel, { ...ctx, messages: history }, options),
  );
  assert.deepEqual(history, snapshot, "history must not mutate");
  assert.match(
    first.result.content.find((x) => x.type === "thinking").thinkingSignature,
    /encrypted-fixture/,
    "keep received history intact",
  );
  await consume(
    api[method](selectedModel, ctx, { ...options, sessionId: "session-B" }),
  );
  const bodies = capture.requests.map((x) => x.body);
  bodies.forEach(assertClean);
  const calls = bodies[1].input.filter((x) => x.type === "function_call");
  const results = bodies[1].input.filter(
    (x) => x.type === "function_call_output",
  );
  assert.equal(calls.length, 2);
  assert.equal(results.length, 2);
  assert.deepEqual(
    calls.map((x) => x.call_id),
    results.map((x) => x.call_id),
  );
  assert.equal(calls[0].call_id, longCall + "0");
  assert.match(JSON.stringify(bodies[1]), /data:image\/png;base64,AA==/);
  assert.match(JSON.stringify(bodies[1]), /result first/);
  assert.equal(bodies[0].prompt_cache_key, "session-A");
  assert.equal(bodies[2].prompt_cache_key, "session-B");
  for (const request of capture.requests)
    assert.equal(request.headers.get("x-local-fixture"), "kept");
  return { capture, history };
}
for (const method of ["stream", "streamSimple"])
  test(`real installed pi-ai ${method}: reasoning SSE, multiple tools, long IDs, image results, old encrypted history, separate sessions`, async () => {
    await twoTurns(
      process.env.MUSE_COMPAT_BASELINE
        ? openAIResponsesApi()
        : wrapOpenCodeGoMuseResponses(openAIResponsesApi()),
      method,
    );
  });
test("real pi-ai non-target payload and existing callback replacement, mutation, rejection", async () => {
  const api = wrapOpenCodeGoMuseResponses(openAIResponsesApi());
  for (const variant of ["replace", "mutate", "async"]) {
    const capture = recorder();
    const cb =
      variant === "replace"
        ? (p) => ({ ...p, metadata: { fixture: variant } })
        : variant === "async"
          ? async (p) => {
              await Promise.resolve();
              p.metadata = { fixture: variant };
            }
          : (p) => {
              p.metadata = { fixture: variant };
            };
    await consume(
      api.stream(model, context(), {
        apiKey: "fixture",
        fetch: capture.fetch,
        reasoningEffort: "xhigh",
        onPayload: cb,
      }),
    );
    assertClean(capture.requests[0].body);
    assert.equal(capture.requests[0].body.metadata.fixture, variant);
  }
  const capture = recorder();
  const failed = api.stream(model, context(), {
    apiKey: "fixture",
    fetch: capture.fetch,
    onPayload: async () => {
      throw Error("callback failed");
    },
  });
  const result = await failed.result();
  assert.equal(result.stopReason, "error");
  assert.match(result.errorMessage, /callback failed/);
  assert.equal(capture.requests.length, 0);
  for (const changes of [
    { provider: "openai" },
    { id: "muse-spark-1.4-contributor" },
  ]) {
    const nonTarget = { ...model, ...changes };
    const a = recorder(),
      b = recorder();
    const ctx = context();
    await consume(
      openAIResponsesApi().stream(nonTarget, ctx, {
        apiKey: "fixture",
        fetch: a.fetch,
        reasoningEffort: "xhigh",
      }),
    );
    await consume(
      api.stream(nonTarget, ctx, {
        apiKey: "fixture",
        fetch: b.fetch,
        reasoningEffort: "xhigh",
      }),
    );
    assert.deepEqual(a.requests[0].body, b.requests[0].body);
    assert.ok(
      b.requests[0].body.include.includes("reasoning.encrypted_content"),
    );
  }
});
test("offline acceptance through a patched copy of the actual plugin profile factory", async (t) => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "muse-factory-")),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const original = auditedOriginal(liveRoot);
  fs.cpSync(liveRoot, root, { recursive: true, dereference: true });
  fs.writeFileSync(path.join(root, "lib/index.js"), original);
  for (const name of fs.readdirSync(path.join(root, "lib")))
    if (
      name.startsWith(".muse-compat-") ||
      /^muse-compat-[a-f0-9]+\.mjs$/.test(name)
    )
      fs.unlinkSync(path.join(root, "lib", name));
  assert.equal(
    runCompatibility({ pluginRoot: root, mode: "apply" }).status,
    "applied",
  );
  const profileModules = path.dirname(liveRoot);
  for (const name of fs.readdirSync(profileModules)) {
    if (name.startsWith(".")) continue;
    const destination = path.join(root, "node_modules", name);
    if (!fs.existsSync(destination))
      fs.symlinkSync(path.join(profileModules, name), destination);
    else if (name.startsWith("@"))
      for (const child of fs.readdirSync(path.join(profileModules, name))) {
        const dest = path.join(destination, child);
        if (!fs.existsSync(dest))
          fs.symlinkSync(path.join(profileModules, name, child), dest);
      }
  }
  const plugin = await import(pathToFileURL(path.join(root, "lib/index.js")));
  const profile = plugin.createOpenCodeGoPiAiProfile({
    baseURL: "https://offline.invalid/v1",
    apiKeyEnv: "MUSE_OFFLINE_UNUSED",
    models: [
      {
        ...model,
        thinking: true,
        vision: true,
        family: "muse",
        defaultEffort: "xhigh",
      },
    ],
    defaultContextWindow: 200000,
    streamIdleTimeoutMs: 60000,
  });
  const models = profile.piProvider.getModels();
  assert.ok(models.length);
  const selected = models.find((x) => x.id === model.id);
  assert.equal(selected.reasoning, true);
  await twoTurns(profile.piProvider, "stream", selected);
});
