/** A narrow wire-only workaround for pi-ai 0.85.1 / OpenCode Go Muse. */
const knownMuseIds = new Set([
  "muse-spark-1.2-contributor",
  "muse-spark-1.3-contributor",
]);
function isTarget(model) {
  return (
    model?.provider === "opencode-go" &&
    model?.api === "openai-responses" &&
    knownMuseIds.has(model.id)
  );
}

/** Pure: never edits persisted messages or the caller's payload. */
export function sanitizeMusePayload(payload, model) {
  if (!isTarget(model) || !payload || typeof payload !== "object")
    return payload;
  const clean = { ...payload };
  if (Array.isArray(payload.include))
    clean.include = payload.include.filter(
      (value) => value !== "reasoning.encrypted_content",
    );
  if (Array.isArray(payload.input))
    clean.input = payload.input
      .filter((item) => item?.type !== "reasoning")
      .map((item) => {
        if (item?.type !== "function_call" || !Object.hasOwn(item, "id"))
          return item;
        const { id: _id, ...call } = item;
        return call;
      });
  return clean;
}

/** Return the underlying EventStream synchronously, including its .result(). */
export function wrapOpenCodeGoMuseResponses(api) {
  const wrapped = { ...api };
  for (const method of ["stream", "streamSimple"]) {
    if (typeof api[method] !== "function") continue;
    wrapped[method] = function (model, context, options) {
      if (!isTarget(model))
        return api[method].call(api, model, context, options);
      return api[method].call(api, model, context, {
        ...options,
        async onPayload(payload, callbackModel) {
          const replacement = await options?.onPayload?.(
            payload,
            callbackModel,
          );
          return sanitizeMusePayload(
            replacement === undefined ? payload : replacement,
            model,
          );
        },
      });
    };
  }
  return wrapped;
}
