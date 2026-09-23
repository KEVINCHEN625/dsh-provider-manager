#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const LOCAL_BUDGET = ["minimal", "low", "medium", "high"];
const LOCAL_BUDGET_TOKENS = {
  minimal: 1024,
  low: 2048,
  medium: 8192,
  high: 16384,
};
const FREEZE = resolve(
  "docs/opencode-all-models-2026-09-23/execution-2026-09-23",
);
const TARGET = resolve("src/host/opencode/models.json");
function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
function protocolOf(url) {
  if (url.endsWith("/responses")) return "openai-responses";
  if (url.endsWith("/chat/completions")) return "openai-completions";
  if (url.endsWith("/messages")) return "anthropic-messages";
  return null;
}
function parseDocs(html) {
  const ids = {};
  const re =
    /<tr><td>[^<]+<\/td><td>([^<]+)<\/td><td><code[^>]*>([^<]+)<\/code><\/td>/g;
  for (const match of html.matchAll(re)) {
    const id = match[1].trim();
    const url = match[2];
    if (!url.includes("/zen/go/v1/")) continue;
    const api = protocolOf(url);
    if (!api) throw new Error(`Unknown Go endpoint ${url}`);
    ids[id] = api;
  }
  return ids;
}
// models.dev leaves these reasoning models with an empty options list.
// OpenCode Go still accepts a control, but the wire value is family-specific:
// MiMo takes reasoning_effort low|medium|high (minimal/xhigh/max are rejected).
// Kimi rejects a request that sends thinking and reasoning_effort together, so
// it only gets the existing on/off thinking switch. GLM-5.1 follows the
// declared GLM-5.3 levels. MiniMax M2 follows the M3 thinking switch.
function undeclaredEffort(id) {
  if (id.startsWith("mimo-"))
    return { nativeEfforts: ["low", "medium", "high"], toggle: true };
  if (id === "kimi-k2.6" || id === "kimi-k2.7-code")
    return { nativeEfforts: [], toggle: true };
  if (id === "glm-5.1")
    return { nativeEfforts: ["low", "high", "max"], toggle: false };
  if (id === "minimax-m2.7" || id === "minimax-m2.5")
    return {
      nativeEfforts: [],
      toggle: true,
      compatPolicy: "anthropic-toggle",
    };
  return null;
}
function thinkingMap(nativeEfforts, hasToggle, localPresets) {
  const map = Object.fromEntries(LEVELS.map((level) => [level, null]));
  if (nativeEfforts.includes("none")) map.off = "none";
  else if (hasToggle) map.off = "off";
  for (const effort of nativeEfforts) {
    if (effort !== "none" && effort in map) map[effort] = effort;
  }
  for (const effort of localPresets)
    if (map[effort] === null) map[effort] = effort;
  if (hasToggle && nativeEfforts.length === 0 && localPresets.length === 0)
    map.high = "high";
  return map;
}
function policyFor(api, id, interleaved, nativeEfforts, hasToggle, hasBudget) {
  if (api === "openai-responses")
    return id.startsWith("muse-spark-") ? "muse-responses" : "openai-responses";
  if (api === "openai-completions")
    return interleaved?.field === "reasoning_content"
      ? "deepseek-reasoning-content"
      : "openai-completions";
  if (nativeEfforts.length) return "anthropic-adaptive";
  if (hasBudget) return "anthropic-budget";
  if (hasToggle) return "anthropic-toggle";
  return "anthropic-default";
}
function buildCatalog() {
  const officialPath = resolve(FREEZE, "official-models.json");
  const docsPath = resolve(FREEZE, "goDocs.mdx");
  const metaPath = resolve(FREEZE, "opencode-go.models.dev.json");
  for (const path of [officialPath, docsPath, metaPath])
    if (!existsSync(path)) throw new Error(`Missing freeze file ${path}`);
  const official = JSON.parse(readFileSync(officialPath, "utf8"));
  const go = JSON.parse(readFileSync(metaPath, "utf8")).models;
  const protocols = parseDocs(readFileSync(docsPath, "utf8"));
  const models = official.data.map((row) => {
    const id = row.id;
    const meta = go[id];
    const api = protocols[id] ?? null;
    const disposition = api ? "supported" : "blocked-with-evidence";
    const blockReasons = [];
    if (!api)
      blockReasons.push(
        "protocol-unverified: absent from live Go endpoint table 2026-09-23",
      );
    if (!meta) {
      blockReasons.push("metadata-missing: not in models.dev opencode-go");
      if (id === "deepseek-flash" || id === "hy3-preview")
        blockReasons.push(
          "alias-forbidden: must not reuse deepseek-v4.1-flash/hy3 limits",
        );
    } else if (meta.status === "deprecated" && !api)
      blockReasons.push("models.dev-deprecated-is-not-official-retirement");
    const options = meta?.reasoning_options ?? [];
    let nativeEfforts = [];
    let hasToggle = false;
    let budget = null;
    let budgetUnbounded = false;
    for (const option of options) {
      if (option.type === "effort") nativeEfforts = option.values ?? [];
      else if (option.type === "toggle") hasToggle = true;
      else if (option.type === "budget_tokens") {
        if ("max" in option) budget = option.max;
        else budgetUnbounded = true;
      }
    }
    const advertised = meta?.modalities?.input ?? ["text"];
    const localPresets =
      api === "anthropic-messages" &&
      nativeEfforts.length === 0 &&
      (budget !== null || budgetUnbounded) &&
      hasToggle
        ? LOCAL_BUDGET
        : [];
    const fallback =
      disposition === "supported" &&
      nativeEfforts.length === 0 &&
      !hasToggle &&
      localPresets.length === 0
        ? undeclaredEffort(id)
        : null;
    if (fallback) {
      nativeEfforts = fallback.nativeEfforts;
      hasToggle = fallback.toggle;
    }
    const compatPolicy = api
      ? (fallback?.compatPolicy ??
        policyFor(
          api,
          id,
          meta?.interleaved,
          nativeEfforts,
          hasToggle,
          budget !== null || budgetUnbounded,
        ))
      : null;
    return {
      id,
      name: meta?.name ?? id,
      disposition,
      api,
      contextWindow: meta?.limit?.context ?? null,
      inputLimit: meta?.limit?.input ?? null,
      maxOutputTokens: meta?.limit?.output ?? null,
      reasoning: meta ? Boolean(meta.reasoning) : null,
      nativeEfforts,
      toggle: hasToggle,
      budgetTokensMax: budget,
      budgetTokensUnbounded: budgetUnbounded,
      localBudgetPresets: localPresets.map((item) => ({
        id: item,
        tokens: LOCAL_BUDGET_TOKENS[item],
      })),
      toggleOnLevel:
        hasToggle &&
        nativeEfforts.length === 0 &&
        localPresets.length === 0 &&
        disposition === "supported"
          ? "high"
          : null,
      thinkingLevelMap:
        disposition === "supported"
          ? thinkingMap(nativeEfforts, hasToggle, localPresets)
          : Object.fromEntries(LEVELS.map((level) => [level, null])),
      input: advertised.filter((item) => item === "text" || item === "image")
        .length
        ? advertised.filter((item) => item === "text" || item === "image")
        : ["text"],
      advertisedInput: advertised,
      replayField: meta?.interleaved?.field ?? null,
      compatPolicy,
      forceAdaptiveThinking: Boolean(
        api === "anthropic-messages" && nativeEfforts.length,
      ),
      blockReasons,
      metadataStatus: meta?.status ?? null,
      sources: {
        protocol: api ? "official-endpoint-table" : null,
        metadata: meta ? "models.dev-opencode-go" : null,
      },
    };
  });
// Formal Muse Spark 1.3 is a different Meta SKU from the Contributor model.
// Live GET /zen/go/v1/models does not list it. Live GET /zen/v1/models does.
// Meta models.dev and pi-ai opencode.json both advertise effort max; the
// Contributor SKU stays on the five-step ladder without max.
const formalEfforts = ["minimal", "low", "medium", "high", "xhigh", "max"];
const formal = {
  id: "muse-spark-1.3",
  name: "Muse Spark 1.3",
  disposition: "supported",
  api: "openai-responses",
  baseUrl: "https://opencode.ai/zen/v1",
  contextWindow: 1048576,
  inputLimit: null,
  maxOutputTokens: 131072,
  reasoning: true,
  nativeEfforts: formalEfforts,
  toggle: false,
  budgetTokensMax: null,
  budgetTokensUnbounded: false,
  localBudgetPresets: [],
  toggleOnLevel: null,
  thinkingLevelMap: thinkingMap(formalEfforts, false, []),
  input: ["text", "image"],
  advertisedInput: ["text", "image", "video", "pdf", "audio"],
  replayField: null,
  compatPolicy: "muse-responses",
  forceAdaptiveThinking: false,
  blockReasons: [],
  metadataStatus: null,
  sources: {
    protocol: "official-zen-models-list",
    metadata: "models.dev-meta",
  },
};
const contributorAt = models.findIndex(
  (model) => model.id === "muse-spark-1.3-contributor",
);
models.splice(contributorAt < 0 ? models.length : contributorAt, 0, formal);
return {
    checkedAt: "2026-09-23T06:15:22.000Z",
    origin: "https://opencode.ai/zen/go/v1",
    excluded: [
      {
        id: "ox-alpha-free",
        reason: "metadata-only; not in official GET /zen/go/v1/models",
      },
    ],
    sources: {
      officialModels: {
        url: "https://opencode.ai/zen/go/v1/models",
        sha256: sha256(officialPath),
        path: "docs/opencode-all-models-2026-09-23/execution-2026-09-23/official-models.json",
      },
      goDocs: {
        url: "https://opencode.ai/docs/go/",
        sha256: sha256(docsPath),
        path: "docs/opencode-all-models-2026-09-23/execution-2026-09-23/goDocs.mdx",
      },
      modelsDev: {
        url: "https://models.dev/api.json#opencode-go",
        sha256: sha256(metaPath),
        path: "docs/opencode-all-models-2026-09-23/execution-2026-09-23/opencode-go.models.dev.json",
      },
    },
    models,
  };
}
const apply = process.argv.includes("--apply");
const catalog = buildCatalog();
const generated = `${JSON.stringify(catalog, null, 2)}\n`;
const current = existsSync(TARGET) ? readFileSync(TARGET, "utf8") : "";
const same =
  current !== "" &&
  JSON.stringify(JSON.parse(current)) === JSON.stringify(catalog);
if (same) {
  console.log("OpenCode Go catalog is current");
  process.exit(0);
}
if (!apply) {
  console.log(
    "Catalog candidate differs from src/host/opencode/models.json; rerun with --apply to write.",
  );
  process.exit(1);
}
writeFileSync(TARGET, generated);
console.log(`Wrote ${TARGET}`);
