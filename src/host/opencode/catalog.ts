import type { Api, Model } from "@earendil-works/pi-ai";
import catalogJson from "./models.json" with { type: "json" };
import {
  validateGoCatalog,
  selectableThinkingLevels,
  type GoCatalogEntry,
} from "./catalog-schema.js";
export {
  THINKING_LEVELS,
  validateGoCatalog,
  selectableThinkingLevels,
} from "./catalog-schema.js";
export type {
  GoCatalog,
  GoCatalogEntry,
  CatalogDisposition,
  CompatPolicy,
  ThinkingLevel,
} from "./catalog-schema.js";
export const GO_ROUTE = "provider-manager-opencode-go";
export const GO_NAME = "OpenCode Go (Provider Manager)";
export const GO_ENDPOINT = "https://opencode.ai/zen/go/v1";
export const GO_ANTHROPIC_BASE = "https://opencode.ai/zen/go";
/** Formal Muse Spark lives on OpenCode Zen, not the Go catalog. */
export const ZEN_ENDPOINT = "https://opencode.ai/zen/v1";
export const GO_KEY = "OPENCODE_API_KEY";
export const GO_MANAGER_VERSION = "0.2.9";
export const GO_CATALOG = validateGoCatalog(catalogJson);
const byId = new Map(GO_CATALOG.models.map((entry) => [entry.id, entry]));
export function goEntry(id: string): GoCatalogEntry | undefined {
  return byId.get(id);
}
export function requireGoEntry(id: string): GoCatalogEntry {
  const entry = byId.get(id);
  if (!entry) throw new Error(`Unknown OpenCode Go model ${id}`);
  return entry;
}
function completionsCompat(entry: GoCatalogEntry) {
  const deepseek = entry.compatPolicy === "deepseek-reasoning-content";
  return {
    supportsStore: false,
    supportsDeveloperRole: false,
    supportsUsageInStreaming: true,
    maxTokensField: "max_tokens" as const,
    thinkingFormat: (deepseek ? "deepseek" : "openai") as "deepseek" | "openai",
    supportsReasoningEffort: entry.nativeEfforts.length > 0,
    requiresReasoningContentOnAssistantMessages: deepseek,
    requiresThinkingAsText: false,
  };
}
function responsesCompat() {
  return {
    supportsDeveloperRole: false,
    supportsLongCacheRetention: false,
    supportsStrictMode: false,
    supportsOpenAIGrammarTools: false,
    supportsToolSearch: false,
    supportsExplicitPromptCacheMode: false,
  };
}
export function toPiModel(entry: GoCatalogEntry): Model<Api> {
  if (
    entry.disposition !== "supported" ||
    !entry.api ||
    entry.contextWindow === null ||
    entry.maxOutputTokens === null ||
    !entry.compatPolicy
  )
    throw new Error(`Cannot materialize blocked OpenCode Go model ${entry.id}`);
  const base = {
    id: entry.id,
    name: entry.name,
    provider: GO_ROUTE,
    baseUrl:
      entry.baseUrl ??
      (entry.api === "anthropic-messages" ? GO_ANTHROPIC_BASE : GO_ENDPOINT),
    reasoning: entry.reasoning !== false,
    thinkingLevelMap: entry.thinkingLevelMap,
    input: entry.input,
    contextWindow: entry.contextWindow,
    maxTokens: entry.maxOutputTokens,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
  if (entry.api === "openai-responses")
    return {
      ...base,
      api: "openai-responses",
      compat: responsesCompat(),
    };
  if (entry.api === "openai-completions")
    return {
      ...base,
      api: "openai-completions",
      compat: completionsCompat(entry),
    };
  return {
    ...base,
    api: "anthropic-messages",
    compat: { forceAdaptiveThinking: entry.forceAdaptiveThinking },
  };
}
export const GO_MODELS: readonly Model<Api>[] = GO_CATALOG.models
  .filter((entry) => entry.disposition === "supported")
  .map(toPiModel);
export function requireGoModel(id: string): Model<Api> {
  const model = GO_MODELS.find((item) => item.id === id);
  if (!model) throw new Error(`Unknown enabled OpenCode Go model ${id}`);
  return model;
}
export function catalogModelDto(entry: GoCatalogEntry) {
  return {
    id: entry.id,
    name: entry.name,
    ...(entry.api ? { api: entry.api } : {}),
    ...(entry.contextWindow !== null
      ? { contextWindow: entry.contextWindow }
      : {}),
    ...(entry.inputLimit !== null ? { inputLimit: entry.inputLimit } : {}),
    ...(entry.maxOutputTokens !== null
      ? { maxOutputTokens: entry.maxOutputTokens }
      : {}),
    ...(entry.reasoning !== null ? { reasoning: entry.reasoning } : {}),
    nativeEfforts: entry.nativeEfforts,
    toggle: entry.toggle,
    ...(entry.budgetTokensMax !== null
      ? { budgetTokensMax: entry.budgetTokensMax }
      : {}),
    budgetTokensUnbounded: entry.budgetTokensUnbounded,
    localBudgetPresets: entry.localBudgetPresets,
    ...(entry.toggleOnLevel ? { toggleOnLevel: entry.toggleOnLevel } : {}),
    input: entry.input,
    advertisedInput: entry.advertisedInput,
    disposition: entry.disposition,
    blockReasons: entry.blockReasons,
    checkedAt: GO_CATALOG.checkedAt,
    ...(entry.compatPolicy ? { compatPolicy: entry.compatPolicy } : {}),
    selectableEfforts: selectableThinkingLevels(entry),
    inputLimitEnforced: false,
  };
}
