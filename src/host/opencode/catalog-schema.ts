export const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];
export const APIS = [
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
] as const;
export type GoApi = (typeof APIS)[number];
export const DISPOSITIONS = [
  "supported",
  "confirmed-alias",
  "officially-retired",
  "blocked-with-evidence",
] as const;
export type CatalogDisposition = (typeof DISPOSITIONS)[number];
export const COMPAT_POLICIES = [
  "muse-responses",
  "openai-responses",
  "deepseek-reasoning-content",
  "openai-completions",
  "anthropic-adaptive",
  "anthropic-budget",
  "anthropic-toggle",
  "anthropic-default",
] as const;
export type CompatPolicy = (typeof COMPAT_POLICIES)[number];
export type ThinkingLevelMap = Record<ThinkingLevel, string | null>;
export interface LocalBudgetPreset {
  id: ThinkingLevel;
  tokens: number;
}
export interface GoCatalogEntry {
  id: string;
  name: string;
  disposition: CatalogDisposition;
  api: GoApi | null;
  contextWindow: number | null;
  inputLimit: number | null;
  maxOutputTokens: number | null;
  reasoning: boolean | null;
  nativeEfforts: string[];
  toggle: boolean;
  budgetTokensMax: number | null;
  budgetTokensUnbounded: boolean;
  localBudgetPresets: LocalBudgetPreset[];
  toggleOnLevel: ThinkingLevel | null;
  thinkingLevelMap: ThinkingLevelMap;
  input: ("text" | "image")[];
  advertisedInput: string[];
  replayField: string | null;
  compatPolicy: CompatPolicy | null;
  forceAdaptiveThinking: boolean;
  blockReasons: string[];
  metadataStatus: string | null;
  /** Official base URL when it is not the Go default for this api. */
  baseUrl?: string;
  sources: {
    protocol: string | null;
    metadata: string | null;
  };
}
export interface GoCatalog {
  checkedAt: string;
  origin: string;
  excluded: { id: string; reason: string }[];
  sources: Record<string, { url: string; sha256: string; path: string }>;
  models: GoCatalogEntry[];
}
function fail(message: string): never {
  throw new Error(`OpenCode Go catalog: ${message}`);
}
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) fail(`${label} must be a string`);
  return value;
}
function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") fail(`${label} must be a boolean`);
  return value;
}
function nullableInt(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 16_777_216
  )
    fail(`${label} must be a positive integer or null`);
  return value;
}
function stringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    fail(`${label} must be a string array`);
  return value as string[];
}
export function validateGoCatalog(value: unknown): GoCatalog {
  const data = record(value, "catalog");
  const modelsValue = data.models;
  if (!Array.isArray(modelsValue) || modelsValue.length < 1)
    fail("models must be a non-empty array");
  const models = modelsValue.map((item, index) =>
    validateEntry(item, `models[${index}]`),
  );
  const ids = models.map((model) => model.id);
  if (new Set(ids).size !== ids.length) fail("duplicate model id");
  const sources = record(data.sources, "sources");
  const parsedSources: GoCatalog["sources"] = {};
  for (const [key, source] of Object.entries(sources)) {
    const row = record(source, `sources.${key}`);
    parsedSources[key] = {
      url: text(row.url, `sources.${key}.url`),
      sha256: text(row.sha256, `sources.${key}.sha256`),
      path: text(row.path, `sources.${key}.path`),
    };
  }
  const excludedValue = data.excluded;
  if (!Array.isArray(excludedValue)) fail("excluded must be an array");
  return {
    checkedAt: text(data.checkedAt, "checkedAt"),
    origin: text(data.origin, "origin"),
    excluded: excludedValue.map((item, index) => {
      const row = record(item, `excluded[${index}]`);
      return {
        id: text(row.id, `excluded[${index}].id`),
        reason: text(row.reason, `excluded[${index}].reason`),
      };
    }),
    sources: parsedSources,
    models,
  };
}
function validateEntry(value: unknown, label: string): GoCatalogEntry {
  const data = record(value, label);
  const disposition = text(
    data.disposition,
    `${label}.disposition`,
  ) as CatalogDisposition;
  if (!DISPOSITIONS.includes(disposition))
    fail(`${label}.disposition is unknown`);
  const api =
    data.api === null ? null : (text(data.api, `${label}.api`) as GoApi);
  if (api && !APIS.includes(api)) fail(`${label}.api is unknown`);
  const mapValue = record(data.thinkingLevelMap, `${label}.thinkingLevelMap`);
  const thinkingLevelMap = {} as ThinkingLevelMap;
  for (const level of THINKING_LEVELS) {
    if (!Object.hasOwn(mapValue, level))
      fail(`${label}.thinkingLevelMap missing ${level}`);
    const mapped = mapValue[level];
    if (mapped !== null && (typeof mapped !== "string" || !mapped))
      fail(`${label}.thinkingLevelMap.${level} must be a string or null`);
    thinkingLevelMap[level] = mapped as string | null;
  }
  const input = stringList(data.input, `${label}.input`);
  if (input.some((item) => item !== "text" && item !== "image"))
    fail(`${label}.input may only contain text or image`);
  const presets = data.localBudgetPresets;
  if (!Array.isArray(presets)) fail(`${label}.localBudgetPresets`);
  const localBudgetPresets = presets.map((item, index) => {
    const row = record(item, `${label}.localBudgetPresets[${index}]`);
    const id = text(row.id, `${label}.localBudgetPresets[${index}].id`);
    if (!THINKING_LEVELS.includes(id as ThinkingLevel))
      fail(`${label}.localBudgetPresets[${index}].id is unknown`);
    const tokens = nullableInt(
      row.tokens,
      `${label}.localBudgetPresets[${index}].tokens`,
    );
    if (tokens === null) fail(`${label}.localBudgetPresets[${index}].tokens`);
    return { id: id as ThinkingLevel, tokens };
  });
  const policy =
    data.compatPolicy === null
      ? null
      : (text(data.compatPolicy, `${label}.compatPolicy`) as CompatPolicy);
  if (policy && !COMPAT_POLICIES.includes(policy))
    fail(`${label}.compatPolicy is unknown`);
  const toggleOn =
    data.toggleOnLevel === null
      ? null
      : (text(data.toggleOnLevel, `${label}.toggleOnLevel`) as ThinkingLevel);
  if (toggleOn && !THINKING_LEVELS.includes(toggleOn))
    fail(`${label}.toggleOnLevel is unknown`);
  const sources = record(data.sources, `${label}.sources`);
  let baseUrl: string | undefined;
  if (data.baseUrl !== undefined && data.baseUrl !== null) {
    baseUrl = text(data.baseUrl, `${label}.baseUrl`);
    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch {
      fail(`${label}.baseUrl must be an https URL`);
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password)
      fail(`${label}.baseUrl must be an https URL`);
  }
  if (disposition === "supported") {
    if (!api) fail(`${label} supported model needs api`);
    if (data.contextWindow === null || data.maxOutputTokens === null)
      fail(`${label} supported model needs contextWindow and maxOutputTokens`);
    if (!policy) fail(`${label} supported model needs compatPolicy`);
  } else if (!Array.isArray(data.blockReasons) || data.blockReasons.length < 1)
    fail(`${label} blocked model needs blockReasons`);
  const reasoning =
    data.reasoning === null ? null : bool(data.reasoning, `${label}.reasoning`);
  return {
    id: text(data.id, `${label}.id`),
    name: text(data.name, `${label}.name`),
    disposition,
    api,
    contextWindow: nullableInt(data.contextWindow, `${label}.contextWindow`),
    inputLimit: nullableInt(data.inputLimit, `${label}.inputLimit`),
    maxOutputTokens: nullableInt(
      data.maxOutputTokens,
      `${label}.maxOutputTokens`,
    ),
    reasoning,
    nativeEfforts: stringList(data.nativeEfforts, `${label}.nativeEfforts`),
    toggle: bool(data.toggle, `${label}.toggle`),
    budgetTokensMax: nullableInt(
      data.budgetTokensMax,
      `${label}.budgetTokensMax`,
    ),
    budgetTokensUnbounded: bool(
      data.budgetTokensUnbounded,
      `${label}.budgetTokensUnbounded`,
    ),
    localBudgetPresets,
    toggleOnLevel: toggleOn,
    thinkingLevelMap,
    input: input as ("text" | "image")[],
    advertisedInput: stringList(
      data.advertisedInput,
      `${label}.advertisedInput`,
    ),
    replayField:
      data.replayField === null
        ? null
        : text(data.replayField, `${label}.replayField`),
    compatPolicy: policy,
    forceAdaptiveThinking: bool(
      data.forceAdaptiveThinking,
      `${label}.forceAdaptiveThinking`,
    ),
    blockReasons: stringList(data.blockReasons, `${label}.blockReasons`),
    metadataStatus:
      data.metadataStatus === null
        ? null
        : text(data.metadataStatus, `${label}.metadataStatus`),
    ...(baseUrl ? { baseUrl } : {}),
    sources: {
      protocol:
        sources.protocol === null
          ? null
          : text(sources.protocol, `${label}.sources.protocol`),
      metadata:
        sources.metadata === null
          ? null
          : text(sources.metadata, `${label}.sources.metadata`),
    },
  };
}
export function selectableThinkingLevels(
  entry: GoCatalogEntry,
): ThinkingLevel[] {
  return THINKING_LEVELS.filter(
    (level) => entry.thinkingLevelMap[level] !== null,
  );
}
