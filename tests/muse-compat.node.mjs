import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

const helperUrl = new URL("../compat/opencode-go-muse.mjs", import.meta.url);
const model = {
  provider: "opencode-go",
  api: "openai-responses",
  id: "muse-spark-1.3-contributor",
};
const payload = () => ({
  include: ["reasoning.encrypted_content", "other"],
  reasoning: { effort: "xhigh" },
  input: [
    { type: "reasoning", encrypted_content: "old" },
    {
      type: "function_call",
      id: "fc_123",
      call_id: "call_123",
      name: "tool",
      arguments: "{}",
    },
    {
      type: "message",
      content: [
        { type: "input_image", image_url: "data:image/png;base64,AA==" },
      ],
    },
  ],
});

test("helper exists and sanitizes only the exact known Muse wire fields without mutation", async () => {
  assert.ok(
    existsSync(helperUrl),
    "Muse compatibility helper is not implemented",
  );
  const { sanitizeMusePayload } = await import(helperUrl);
  const original = payload();
  const snapshot = structuredClone(original);
  const clean = sanitizeMusePayload(original, model);
  assert.deepEqual(clean, {
    ...original,
    include: ["other"],
    input: [
      {
        type: "function_call",
        call_id: "call_123",
        name: "tool",
        arguments: "{}",
      },
      original.input[2],
    ],
  });
  assert.deepEqual(original, snapshot);
  for (const changes of [
    { provider: "openai" },
    { api: "openai-completions" },
    { id: "muse-spark-1.4-contributor" },
    { id: "muse-spark-1.3" },
  ])
    assert.equal(
      sanitizeMusePayload(original, { ...model, ...changes }),
      original,
    );
  assert.deepEqual(
    sanitizeMusePayload(original, {
      ...model,
      id: "muse-spark-1.2-contributor",
    }),
    clean,
  );
});

test("both stream wrappers preserve synchronous stream identity, receiver, callbacks and options", async () => {
  assert.ok(
    existsSync(helperUrl),
    "Muse compatibility helper is not implemented",
  );
  const { wrapOpenCodeGoMuseResponses } = await import(helperUrl);
  for (const method of ["stream", "streamSimple"]) {
    for (const variant of ["absent", "mutate", "replace", "async"]) {
      const sentinel = { result() {} };
      let seen;
      const api = {
        [method](m, c, o) {
          assert.equal(this, api);
          seen = o;
          return sentinel;
        },
      };
      const callback =
        variant === "absent"
          ? undefined
          : variant === "replace"
            ? (p) => ({ ...p, tag: "replacement" })
            : variant === "async"
              ? async (p) => {
                  await Promise.resolve();
                  p.tag = "async";
                }
              : (p) => {
                  p.tag = "mutation";
                };
      const options = {
        sessionId: "session",
        headers: { extra: "header" },
        reasoning: "xhigh",
        onPayload: callback,
      };
      const wrapped = wrapOpenCodeGoMuseResponses(api);
      assert.equal(wrapped[method](model, {}, options), sentinel);
      assert.equal(seen.sessionId, options.sessionId);
      assert.equal(seen.headers, options.headers);
      const result = await seen.onPayload(payload(), model);
      assert.equal(result.reasoning.effort, "xhigh");
      assert.ok(!result.input.some((x) => x.type === "reasoning"));
      if (callback)
        assert.equal(
          result.tag,
          { mutate: "mutation", replace: "replacement", async: "async" }[
            variant
          ],
        );
      wrapped[method]({ ...model, provider: "openai" }, {}, options);
      assert.equal(seen, options);
    }
  }
});
