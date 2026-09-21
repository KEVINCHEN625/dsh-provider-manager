/** Official Meta Model API values for a DSH custom Responses provider. */
import { API_PRESETS, presetDraft } from "./api-presets.js";

const meta = API_PRESETS.find((preset) => preset.id === "meta");
if (!meta) throw new Error("meta preset missing");

export const META_MODEL_API = {
  ...presetDraft(meta),
  codingAgents: "https://dev.meta.ai/docs/guides/coding-agents",
  museAuth: "https://dev.meta.ai/docs/muse-code/auth",
} as const;
