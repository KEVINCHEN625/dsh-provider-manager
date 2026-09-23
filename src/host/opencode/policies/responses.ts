import type { Api, Model } from "@earendil-works/pi-ai";
import { GO_ROUTE } from "../catalog.js";
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function isMuseResponses(model: Model<Api>) {
  return (
    model.provider === GO_ROUTE &&
    model.api === "openai-responses" &&
    (model.id === "muse-spark-1.2-contributor" ||
      model.id === "muse-spark-1.3-contributor")
  );
}
export function sanitizeMusePayload(
  payload: unknown,
  model: Model<Api>,
): unknown {
  if (!isMuseResponses(model) || !record(payload)) return payload;
  const clean = { ...payload };
  if (Array.isArray(payload.include))
    clean.include = payload.include.filter(
      (v) => v !== "reasoning.encrypted_content",
    );
  if (Array.isArray(payload.input))
    clean.input = payload.input
      .filter((v) => !record(v) || v.type !== "reasoning")
      .map((v) => {
        if (!record(v) || v.type !== "function_call" || !Object.hasOwn(v, "id"))
          return v;
        const { id: _id, ...call } = v;
        return call;
      });
  return clean;
}
