/**
 * Build OAuth availability seeds and models.dev excerpts from a local
 * api.json snapshot. Does not contact the network. OpenRouter selection is
 * free models (cost.input === 0) plus the 20 newest release_date values plus
 * OPENROUTER_ALLOWLIST, capped at 50. models.dev has no usage field.
 */
import { readFileSync, writeFileSync } from "node:fs";

const source = process.argv[2] ?? "artifacts/models-dev-api.json";
const data = JSON.parse(readFileSync(source, "utf8"));
const DATE = "2026-09-24";
const ALLOWLIST = [
  "anthropic/claude-sonnet-4.6",
  "anthropic/claude-opus-4.7",
  "openai/gpt-5.5",
  "google/gemini-2.5-pro",
  "deepseek/deepseek-v4.1-flash",
];
const XAI_CHAT = new Set([
  "grok-4.3",
  "grok-4.5",
  "grok-4.6",
  "grok-4.7",
  "grok-4.20-multi-agent-0309",
]);

function effortsOf(model) {
  const option = (model.reasoning_options ?? []).find((item) => item.type === "effort");
  return Array.isArray(option?.values) ? option.values : [];
}

function spec(model) {
  const efforts = effortsOf(model);
  const input = (model.modalities?.input ?? []).filter(
    (item) => item === "text" || item === "image",
  );
  if (efforts.length < 1 || input.length < 1) return undefined;
  const context = model.limit?.context;
  const output = model.limit?.output;
  if (typeof context !== "number" || typeof output !== "number" || context < 1 || output < 1)
    return undefined;
  return {
    id: model.id,
    name: model.name,
    contextWindow: context,
    maxTokens: output,
    efforts,
    input,
    ...(model.cost && typeof model.cost.input === "number" && typeof model.cost.output === "number"
      ? { cost: { input: model.cost.input, output: model.cost.output } }
      : {}),
    ...(typeof model.release_date === "string" ? { releaseDate: model.release_date } : {}),
  };
}

function specsFor(providerId) {
  return Object.values(data[providerId]?.models ?? {})
    .map(spec)
    .filter(Boolean);
}

function availability(providerId, models) {
  return {
    providerId,
    models: models.map((model) => ({
      id: model.id,
      available: false,
      status: "unverified",
      source: "models.dev",
      verifiedAt: DATE,
      name: model.name,
    })),
  };
}

function write(name, value) {
  writeFileSync(
    new URL(`../src/host/oauth-catalogs/${name}`, import.meta.url),
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

const anthropic = Object.values(data.anthropic.models);
const copilot = Object.values(data["github-copilot"].models);
const xai = Object.values(data.xai.models).filter((model) => XAI_CHAT.has(model.id));
const kimiById = new Map();
for (const model of Object.values(data["kimi-code-plan-cn"].models)) kimiById.set(model.id, model);
for (const model of Object.values(data["kimi-code-plan-global"].models))
  kimiById.set(model.id, model);
const kimi = [...kimiById.values()];

write("anthropic.json", availability("anthropic", anthropic));
write("github-copilot.json", availability("github-copilot", copilot));
write("xai.json", availability("xai", xai));
write("kimi-coding.json", availability("kimi-coding", kimi));
write("models-dev-anthropic.json", { providerId: "anthropic", models: anthropic.map(spec).filter(Boolean) });
write("models-dev-github-copilot.json", {
  providerId: "github-copilot",
  models: copilot.map(spec).filter(Boolean),
});
write("models-dev-xai.json", { providerId: "xai", models: xai.map(spec).filter(Boolean) });
write("models-dev-kimi.json", { providerId: "kimi-coding", models: kimi.map(spec).filter(Boolean) });

const openrouter = Object.values(data.openrouter.models);
const ranked = openrouter.map((model) => ({
  id: model.id,
  releaseDate: model.release_date,
  input: model.cost?.input,
}));
const free = ranked
  .filter((model) => model.input === 0)
  .sort((a, b) => String(b.releaseDate).localeCompare(String(a.releaseDate)) || a.id.localeCompare(b.id))
  .map((model) => model.id);
const newest = ranked
  .filter((model) => typeof model.releaseDate === "string")
  .sort((a, b) => String(b.releaseDate).localeCompare(String(a.releaseDate)) || a.id.localeCompare(b.id))
  .slice(0, 20)
  .map((model) => model.id);
const present = new Set(ranked.map((model) => model.id));
const selected = [
  ...new Set([...free, ...newest, ...ALLOWLIST.filter((id) => present.has(id))]),
].slice(0, 50);
const byId = new Map(openrouter.map((model) => [model.id, model]));
write(
  "openrouter.json",
  availability(
    "openrouter",
    selected.map((id) => byId.get(id)),
  ),
);
write("models-dev-openrouter.json", {
  providerId: "openrouter",
  models: openrouter.map(spec).filter(Boolean),
});

console.log(
  JSON.stringify({
    anthropic: anthropic.length,
    copilot: copilot.length,
    xai: xai.map((model) => model.id),
    kimi: kimi.map((model) => model.id),
    openrouterSelected: selected.length,
    openrouterSpecs: openrouter.map(spec).filter(Boolean).length,
  }),
);
