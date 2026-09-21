/** Official Meta Model API values for a DSH custom Responses provider. */
export const META_MODEL_API = {
  name: "Meta Model API",
  route: "meta",
  baseURL: "https://api.meta.ai/v1",
  api: "openai-responses",
  models: "muse-spark-1.3\nmuse-spark-1.3-contributor",
  defaultContextWindow: "1048576",
  defaultMaxTokens: "131072",
  codingAgents: "https://dev.meta.ai/docs/guides/coding-agents",
  museAuth: "https://dev.meta.ai/docs/muse-code/auth",
} as const;
