import codexAvailability from "./oauth-catalogs/openai-codex.json" with { type: "json" };
import anthropicAvailability from "./oauth-catalogs/anthropic.json" with { type: "json" };
import copilotAvailability from "./oauth-catalogs/github-copilot.json" with { type: "json" };
import kimiAvailability from "./oauth-catalogs/kimi-coding.json" with { type: "json" };
import xaiAvailability from "./oauth-catalogs/xai.json" with { type: "json" };
import openrouterAvailability from "./oauth-catalogs/openrouter.json" with { type: "json" };
import openaiSpecs from "./oauth-catalogs/models-dev-openai.json" with { type: "json" };
import anthropicSpecs from "./oauth-catalogs/models-dev-anthropic.json" with { type: "json" };
import copilotSpecs from "./oauth-catalogs/models-dev-github-copilot.json" with { type: "json" };
import kimiSpecs from "./oauth-catalogs/models-dev-kimi.json" with { type: "json" };
import xaiSpecs from "./oauth-catalogs/models-dev-xai.json" with { type: "json" };
import openrouterSpecs from "./oauth-catalogs/models-dev-openrouter.json" with { type: "json" };
import type {
  CatalogAvailability,
  CatalogFactSource,
  OAuthCatalogModel,
  OAuthCatalogSource,
} from "../shared/protocol.js";

export const OAUTH_CATALOG_TTL_MS = 86_400_000;
export const CATALOG_BYTE_LIMIT = 8 * 1024 * 1024;
const EFFORTS = [
  "none",
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
const EFFORT_ORDER = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;
const BRANDS: Record<string, string> = {
  gpt: "GPT",
  codex: "Codex",
  glm: "GLM",
  kimi: "Kimi",
  grok: "Grok",
  gemini: "Gemini",
  qwen: "Qwen",
  muse: "Muse",
  minimax: "MiniMax",
  mimo: "MiMo",
  omen: "Omen",
  deepseek: "DeepSeek",
  claude: "Claude",
  openai: "OpenAI",
};
const SECRET_KEY = /^(access_token|refresh_token|access|refresh|apiKey|secret|token)$/i;
const SECRET_VALUE = /^(sk-|eyJ)/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MODELS_DEV_PROVIDER: Record<string, string> = {
  "openai-codex": "openai",
  anthropic: "anthropic",
  "github-copilot": "github-copilot",
  "kimi-coding": "kimi-coding",
  xai: "xai",
  openrouter: "openrouter",
};
export const OPENROUTER_LIMIT = 50;
export const OPENROUTER_ALLOWLIST = [
  "anthropic/claude-sonnet-4.6",
  "anthropic/claude-opus-4.7",
  "openai/gpt-5.5",
  "google/gemini-2.5-pro",
  "deepseek/deepseek-v4.1-flash",
] as const;

export interface SpecModel {
  id: string;
  name: string;
  contextWindow: number;
  maxTokens: number;
  efforts: string[];
  input: Array<"text" | "image">;
  cost?: { input: number; output: number };
  releaseDate?: string;
}

export interface AvailabilityModel {
  id: string;
  available: boolean;
  verifiedAt: string;
  name?: string;
  efforts?: string[];
  noneEnabled?: boolean;
  pendingProbe?: boolean;
  servedModel?: string;
  contextWindow?: number;
  status?: CatalogAvailability;
  source?: CatalogFactSource;
}

export interface CatalogDocument {
  providerId: string;
  models: AvailabilityModel[];
}

export interface CatalogHit {
  source: OAuthCatalogSource;
  specSource: OAuthCatalogSource;
  models: OAuthCatalogModel[];
  fetchedAt?: string;
  specFetchedAt?: string;
}

const AVAILABILITY: Record<string, unknown> = {
  "openai-codex": codexAvailability,
  anthropic: anthropicAvailability,
  "github-copilot": copilotAvailability,
  "kimi-coding": kimiAvailability,
  xai: xaiAvailability,
  openrouter: openrouterAvailability,
};
const SPECS: Record<string, unknown> = {
  openai: openaiSpecs,
  anthropic: anthropicSpecs,
  "github-copilot": copilotSpecs,
  "kimi-coding": kimiSpecs,
  xai: xaiSpecs,
  openrouter: openrouterSpecs,
};

export function catalogMirrors(providerId: string): string[] {
  return [
    `https://raw.githubusercontent.com/KEVINCHEN625/dsh-provider-models/main/${providerId}.json`,
    `https://cdn.jsdelivr.net/gh/KEVINCHEN625/dsh-provider-models@main/${providerId}.json`,
  ];
}

export function modelsDevMirrors(): string[] {
  return [
    "https://models.dev/api.json",
    "https://cdn.jsdelivr.net/npm/@opencode-ai/models@0.0.66/dist/snapshot.js",
  ];
}

export function rejectSecretCatalog(text: string) {
  if (text.length > CATALOG_BYTE_LIMIT) throw new Error("catalog");
  if (/"access_token"|"refresh_token"|\bsk-[A-Za-z0-9]|\beyJ[A-Za-z0-9_-]{8}/.test(text))
    throw new Error("catalog");
}

export function parseCatalogDocument(
  value: unknown,
  providerId: string,
): CatalogDocument {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("catalog");
  const body = value as Record<string, unknown>;
  if (body.providerId !== providerId || !Array.isArray(body.models))
    throw new Error("catalog");
  if (body.models.length > 200) throw new Error("catalog");
  return {
    providerId,
    models: body.models.map((item) => parseAvailability(item)),
  };
}

export function parseModelsDevDocument(
  value: unknown,
  modelsDevProvider: string,
): SpecModel[] {
  const models = providerModels(value, modelsDevProvider);
  return Object.entries(models).flatMap(([id, item]) => {
    try {
      const parsed = specFromModelsDev(id, item);
      return parsed ? [parsed] : [];
    } catch {
      return [];
    }
  });
}

export function unwrapModelsDev(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const marker = 'JSON.parse("';
  const start = trimmed.indexOf(marker);
  const end = trimmed.lastIndexOf('")');
  if (start < 0 || end <= start) throw new Error("catalog");
  const encoded = trimmed.slice(start + marker.length, end);
  const json = JSON.parse(`"${encoded}"`);
  if (typeof json !== "string") throw new Error("catalog");
  return JSON.parse(json);
}

export function joinCatalog(
  specs: readonly SpecModel[],
  availability: readonly AvailabilityModel[],
): OAuthCatalogModel[] {
  const byId = new Map(specs.map((model) => [model.id, model]));
  return availability.map((entry) => {
    const spec = byId.get(entry.id);
    const channelWindow = entry.contextWindow;
    const specWindow = spec?.contextWindow;
    const contextWindow = channelWindow ?? specWindow;
    const noneEnabled = entry.noneEnabled === true;
    // Names and effort sets come from models.dev. A channel row only contributes
    // efforts when that id has no spec. pendingProbe is computed here; it is
    // not a registry field.
    const listed = spec?.efforts.length
      ? [...spec.efforts]
      : entry.efforts?.length
        ? entry.efforts
        : [];
    const pendingProbe = !spec && listed.length === 0;
    const status = catalogStatus(entry);
    return {
      id: entry.id,
      name: spec?.name ?? entry.name ?? displayModelName(entry.id),
      available: status === "available",
      status,
      efforts: pendingProbe
        ? []
        : fullestConsistentEfforts(listed.length ? [listed] : [], noneEnabled),
      input: spec ? [...spec.input] : [],
      ...(pendingProbe ? { pendingProbe: true } : {}),
      ...(noneEnabled ? { noneEnabled: true } : {}),
      ...(contextWindow !== undefined ? { contextWindow } : {}),
      ...(specWindow !== undefined && specWindow !== contextWindow
        ? { specContextWindow: specWindow }
        : {}),
      ...(spec ? { maxTokens: spec.maxTokens } : {}),
      ...(spec?.cost ? { cost: { ...spec.cost } } : {}),
      verifiedAt: entry.verifiedAt,
      ...(entry.servedModel ? { servedModel: entry.servedModel } : {}),
      ...(entry.source ? { source: entry.source } : {}),
    };
  });
}

export function catalogStatus(entry: {
  status?: string;
  available: boolean;
}): CatalogAvailability {
  if (
    entry.status === "available" ||
    entry.status === "unavailable" ||
    entry.status === "unverified"
  )
    return entry.status;
  return entry.available ? "available" : "unverified";
}

/** Remote rows first. A local row with the same id replaces the remote one. */
export function applyLocal(
  remote: readonly AvailabilityModel[],
  local: readonly AvailabilityModel[],
): AvailabilityModel[] {
  const byId = new Map(remote.map((model) => [model.id, { ...model }]));
  const extra: AvailabilityModel[] = [];
  for (const row of local) {
    const previous = byId.get(row.id);
    if (!previous) {
      byId.set(row.id, { ...row });
      extra.push(row);
      continue;
    }
    byId.set(row.id, {
      ...previous,
      ...row,
      id: row.id,
      verifiedAt: row.verifiedAt || previous.verifiedAt,
    });
  }
  return [
    ...remote.map((model) => byId.get(model.id) ?? model),
    ...extra.map((model) => byId.get(model.id) ?? model),
  ];
}

export interface RankedModel {
  id: string;
  releaseDate?: string;
  cost?: { input: number };
}

/** Picks, then the free group, the 20 newest release dates, and the allowlist. */
export function selectOpenRouterIds(
  models: readonly RankedModel[],
  picks: readonly string[] = [],
): string[] {
  const known = new Set(models.map((model) => model.id));
  const byDate = (left: RankedModel, right: RankedModel) =>
    String(right.releaseDate ?? "").localeCompare(String(left.releaseDate ?? "")) ||
    left.id.localeCompare(right.id);
  const free = models
    .filter((model) => model.cost?.input === 0)
    .sort(byDate)
    .map((model) => model.id);
  const newest = models
    .filter((model) => typeof model.releaseDate === "string" && model.releaseDate.length > 0)
    .sort(byDate)
    .slice(0, 20)
    .map((model) => model.id);
  const allow = OPENROUTER_ALLOWLIST.filter((id) => known.has(id));
  const chosen = picks.filter((id) => known.has(id));
  return [...new Set([...chosen, ...free, ...newest, ...allow])].slice(0, OPENROUTER_LIMIT);
}

/** Majority levels across models.dev providers. `none` stays out until a probe sets noneEnabled. */
export function fullestConsistentEfforts(
  sets: readonly (readonly string[])[],
  noneEnabled = false,
): string[] {
  const known = new Set<string>(["none", ...EFFORT_ORDER]);
  const cleaned = sets
    .map((set) => [
      ...new Set(
        set.filter(
          (effort) =>
            known.has(effort) && (effort !== "none" || noneEnabled),
        ),
      ),
    ])
    .filter((set) => set.length > 0);
  if (cleaned.length === 0) return [];
  const threshold = Math.ceil(cleaned.length / 2);
  const counts = new Map<string, number>();
  for (const set of cleaned) {
    for (const effort of set) counts.set(effort, (counts.get(effort) ?? 0) + 1);
  }
  const order = noneEnabled ? ["none", ...EFFORT_ORDER] : [...EFFORT_ORDER];
  return order.filter((effort) => (counts.get(effort) ?? 0) >= threshold);
}

export function displayModelName(id: string): string {
  return id
    .split("-")
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      const brand = BRANDS[segment.toLowerCase()];
      if (brand) return brand;
      if (/^\d+(?:\.\d+)*$/.test(segment)) return segment;
      return segment.charAt(0).toUpperCase() + segment.slice(1);
    })
    .join(" ");
}

export function reasoningEfforts(
  efforts: readonly string[],
  options?: { noneEnabled?: boolean },
): Record<string, string> {
  const selected = fullestConsistentEfforts(
    [efforts],
    options?.noneEnabled === true,
  );
  // The channel spelling stays "none". The host schema only accepts `off`.
  return Object.fromEntries(
    selected.map((effort) =>
      effort === "none" ? ["off", "none"] : [effort, effort],
    ),
  );
}

export function effortProbeRequest(modelId: string, effort: "none" | "high") {
  return {
    model: modelId,
    store: false,
    stream: true,
    instructions: "Reply with exactly the word ok.",
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: "Reply with exactly the word ok." }],
      },
    ],
    text: { verbosity: "low" },
    reasoning: { effort },
  };
}

export class CatalogStore {
  private shared?: { at: number; document?: unknown };
  private checked = new Map<
    string,
    {
      at: number;
      availability?: AvailabilityModel[];
      specs?: SpecModel[];
      availabilityRemote: boolean;
      specsRemote: boolean;
    }
  >();
  constructor(
    private options: {
      fetch?: typeof fetch;
      now?: () => number;
      ttlMs?: number;
      availability?: Record<string, unknown>;
      specs?: Record<string, unknown>;
    } = {},
  ) {}
  async current(
    providerId: string,
    signal?: AbortSignal,
    overlay?: { local?: readonly AvailabilityModel[]; picks?: readonly string[] },
  ): Promise<CatalogHit> {
    const now = this.now();
    const cached = this.checked.get(providerId);
    const fresh = cached && now - cached.at < this.ttl() ? cached : undefined;
    const availabilityRemote = fresh
      ? fresh.availability
      : await this.pullAvailability(providerId, signal);
    const specsRemote = fresh
      ? fresh.specs
      : await this.pullSpecs(providerId, signal);
    if (!fresh) {
      this.checked.set(providerId, {
        at: now,
        ...(availabilityRemote ? { availability: availabilityRemote } : {}),
        ...(specsRemote ? { specs: specsRemote } : {}),
        availabilityRemote: !!availabilityRemote,
        specsRemote: !!specsRemote,
      });
    }
    const availability = availabilityRemote ?? this.availabilitySnapshot(providerId);
    const specs = specsRemote ?? this.specSnapshot(providerId);
    const rows = this.withOverlay(providerId, availability ?? [], specs ?? [], overlay, now);
    const source: OAuthCatalogSource = availabilityRemote
      ? "remote"
      : availability
        ? "snapshot"
        : "official";
    const specSource: OAuthCatalogSource = specsRemote
      ? "remote"
      : specs
        ? "snapshot"
        : "official";
    return {
      source,
      specSource,
      models: joinCatalog(specs ?? [], rows),
      ...(availabilityRemote ? { fetchedAt: new Date(fresh?.at ?? now).toISOString() } : {}),
      ...(specsRemote ? { specFetchedAt: new Date(fresh?.at ?? now).toISOString() } : {}),
    };
  }
  private availabilitySnapshot(providerId: string): AvailabilityModel[] | undefined {
    const table = this.options.availability ?? AVAILABILITY;
    if (!Object.hasOwn(table, providerId)) return undefined;
    try {
      return parseCatalogDocument(table[providerId], providerId).models;
    } catch {
      return undefined;
    }
  }
  private specSnapshot(providerId: string): SpecModel[] | undefined {
    const modelsDevProvider = MODELS_DEV_PROVIDER[providerId];
    if (!modelsDevProvider) return undefined;
    const table = this.options.specs ?? SPECS;
    if (!Object.hasOwn(table, modelsDevProvider)) return undefined;
    try {
      return parseModelsDevDocument(table[modelsDevProvider], modelsDevProvider);
    } catch {
      return undefined;
    }
  }
  private async pullAvailability(
    providerId: string,
    signal?: AbortSignal,
  ): Promise<AvailabilityModel[] | undefined> {
    if (!/^[a-z0-9-]{1,64}$/.test(providerId)) return undefined;
    for (const url of catalogMirrors(providerId)) {
      const text = await this.read(url, signal);
      if (!text) continue;
      try {
        return parseCatalogDocument(JSON.parse(text), providerId).models;
      } catch {
        continue;
      }
    }
    return undefined;
  }
  hasModel(providerId: string, modelId: string): boolean {
    const specs = this.specSnapshot(providerId) ?? [];
    if (specs.some((model) => model.id === modelId)) return true;
    const availability = this.availabilitySnapshot(providerId) ?? [];
    if (availability.some((model) => model.id === modelId)) return true;
    const modelsDevProvider = MODELS_DEV_PROVIDER[providerId];
    const document = this.shared?.document;
    if (!modelsDevProvider || !document) return false;
    try {
      return Object.hasOwn(providerModels(document, modelsDevProvider), modelId);
    } catch {
      return false;
    }
  }
  private withOverlay(
    providerId: string,
    availability: AvailabilityModel[],
    specs: readonly SpecModel[],
    overlay: { local?: readonly AvailabilityModel[]; picks?: readonly string[] } | undefined,
    now: number,
  ): AvailabilityModel[] {
    let rows = overlay?.local?.length ? applyLocal(availability, overlay.local) : [...availability];
    if (providerId !== "openrouter" || !overlay?.picks?.length) return rows;
    const known = new Set(specs.map((model) => model.id));
    for (const id of overlay.picks) {
      if (rows.some((model) => model.id === id)) continue;
      if (!known.has(id) && !this.hasModel(providerId, id)) continue;
      rows.push({
        id,
        available: false,
        status: "unverified",
        source: "models.dev",
        verifiedAt: new Date(now).toISOString().slice(0, 10),
      });
    }
    const picked = new Set(overlay.picks);
    return [
      ...rows.filter((model) => picked.has(model.id)),
      ...rows.filter((model) => !picked.has(model.id)),
    ].slice(0, OPENROUTER_LIMIT);
  }
  private async sharedDocument(signal?: AbortSignal): Promise<unknown | undefined> {
    const now = this.now();
    if (this.shared && now - this.shared.at < this.ttl()) return this.shared.document;
    let document: unknown;
    for (const url of modelsDevMirrors()) {
      const text = await this.read(url, signal);
      if (!text) continue;
      try {
        document = unwrapModelsDev(text);
        break;
      } catch {
        continue;
      }
    }
    this.shared = { at: now, ...(document !== undefined ? { document } : {}) };
    return document;
  }
  private async pullSpecs(
    providerId: string,
    signal?: AbortSignal,
  ): Promise<SpecModel[] | undefined> {
    const modelsDevProvider = MODELS_DEV_PROVIDER[providerId];
    if (!modelsDevProvider) return undefined;
    const document = await this.sharedDocument(signal);
    if (!document) return undefined;
    try {
      return parseModelsDevDocument(document, modelsDevProvider);
    } catch {
      return undefined;
    }
  }
  private async read(url: string, signal?: AbortSignal): Promise<string | undefined> {
    try {
      const response = await (this.options.fetch ?? fetch)(url, {
        signal,
        headers: { accept: "application/json" },
      });
      if (!response.ok) return undefined;
      const text = await response.text();
      rejectSecretCatalog(text);
      return text;
    } catch {
      return undefined;
    }
  }
  private now() {
    return this.options.now ? this.options.now() : Date.now();
  }
  private ttl() {
    const value = this.options.ttlMs;
    return typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : OAUTH_CATALOG_TTL_MS;
  }
}

function parseAvailability(value: unknown): AvailabilityModel {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("catalog");
  const item = value as Record<string, unknown>;
  const allowed = [
    "id",
    "available",
    "verifiedAt",
    "name",
    "efforts",
    "noneEnabled",
    "pendingProbe",
    "servedModel",
    "contextWindow",
    "status",
    "source",
  ];
  if (Object.keys(item).some((key) => !allowed.includes(key)))
    throw new Error("catalog");
  const id = token(item.id, 128);
  if (typeof item.available !== "boolean") throw new Error("catalog");
  if (typeof item.verifiedAt !== "string" || !DATE.test(item.verifiedAt))
    throw new Error("catalog");
  const parsed: AvailabilityModel = {
    id,
    available: item.available,
    verifiedAt: item.verifiedAt,
  };
  if (item.name !== undefined) parsed.name = token(item.name, 128);
  if (item.efforts !== undefined) parsed.efforts = effortList(item.efforts);
  if (item.noneEnabled !== undefined) {
    if (typeof item.noneEnabled !== "boolean") throw new Error("catalog");
    parsed.noneEnabled = item.noneEnabled;
  }
  if (item.pendingProbe !== undefined) {
    if (typeof item.pendingProbe !== "boolean") throw new Error("catalog");
    parsed.pendingProbe = item.pendingProbe;
  }
  if (item.servedModel !== undefined) parsed.servedModel = token(item.servedModel, 128);
  if (item.contextWindow !== undefined) parsed.contextWindow = positive(item.contextWindow);
  if (item.status !== undefined) {
    if (
      item.status !== "available" &&
      item.status !== "unavailable" &&
      item.status !== "unverified"
    )
      throw new Error("catalog");
    parsed.status = item.status;
  }
  if (item.source !== undefined) {
    if (item.source !== "probe" && item.source !== "models.dev") throw new Error("catalog");
    parsed.source = item.source;
  }
  return parsed;
}

function providerModels(value: unknown, providerId: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("catalog");
  const body = value as Record<string, unknown>;
  if (Array.isArray(body.models) && body.providerId === providerId) {
    const models: Record<string, unknown> = {};
    for (const item of body.models) {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("catalog");
      const id = (item as { id?: unknown }).id;
      if (typeof id !== "string") throw new Error("catalog");
      models[id] = item;
    }
    return models;
  }
  const root =
    body.providers && typeof body.providers === "object" && !Array.isArray(body.providers)
      ? (body.providers as Record<string, unknown>)
      : body;
  const provider = root[providerId];
  if (!provider || typeof provider !== "object" || Array.isArray(provider))
    throw new Error("catalog");
  const models = (provider as { models?: unknown }).models;
  if (!models || typeof models !== "object" || Array.isArray(models))
    throw new Error("catalog");
  return models as Record<string, unknown>;
}

function specFromModelsDev(fallbackId: string, value: unknown): SpecModel | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (Array.isArray(item.efforts) && Array.isArray(item.input)) return specDocumentModel(item);
  const limit = record(item.limit);
  if (!limit) return undefined;
  const contextWindow = positive(limit.context);
  const maxTokens = positive(limit.output);
  const id = typeof item.id === "string" ? token(item.id, 128) : token(fallbackId, 128);
  const name = typeof item.name === "string" ? token(item.name, 128) : id;
  const efforts = effortValues(item.reasoning_options);
  const modalities = record(item.modalities);
  const input = modalityValues(modalities?.input);
  if (efforts.length < 1 || input.length < 1) return undefined;
  const cost = costOf(item.cost);
  const releaseDate =
    typeof item.release_date === "string" && item.release_date.length <= 32
      ? item.release_date
      : undefined;
  return {
    id,
    name,
    contextWindow,
    maxTokens,
    efforts,
    input,
    ...(cost ? { cost } : {}),
    ...(releaseDate ? { releaseDate } : {}),
  };
}

function specDocumentModel(item: Record<string, unknown>): SpecModel {
  const allowed = [
    "id",
    "name",
    "contextWindow",
    "maxTokens",
    "efforts",
    "input",
    "cost",
    "releaseDate",
  ];
  if (Object.keys(item).some((key) => !allowed.includes(key))) throw new Error("catalog");
  const efforts = stringList(item.efforts).map((effort) => {
    if (!EFFORTS.includes(effort as (typeof EFFORTS)[number])) throw new Error("catalog");
    return effort;
  });
  const input = modalityValues(item.input);
  const cost = item.cost === undefined ? undefined : costOf(item.cost);
  if (!cost && item.cost !== undefined) throw new Error("catalog");
  return {
    id: token(item.id, 128),
    name: token(item.name, 128),
    contextWindow: positive(item.contextWindow),
    maxTokens: positive(item.maxTokens),
    efforts,
    input,
    ...(cost ? { cost } : {}),
    ...(typeof item.releaseDate === "string" ? { releaseDate: token(item.releaseDate, 32) } : {}),
  };
}

function effortList(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("catalog");
  return value.map((effort) => {
    if (!EFFORTS.includes(effort as (typeof EFFORTS)[number]))
      throw new Error("catalog");
    return effort as string;
  });
}

function effortValues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const found = value.find(
    (item) =>
      !!item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      (item as { type?: unknown }).type === "effort",
  ) as { values?: unknown } | undefined;
  return stringList(found?.values).filter((effort) =>
    EFFORTS.includes(effort as (typeof EFFORTS)[number]),
  );
}

function modalityValues(value: unknown): Array<"text" | "image"> {
  const input: Array<"text" | "image"> = [];
  for (const item of stringList(value)) {
    if (item !== "text" && item !== "image") continue;
    if (!input.includes(item)) input.push(item);
  }
  return input;
}

function costOf(value: unknown): { input: number; output: number } | undefined {
  const body = record(value);
  if (!body) return undefined;
  const input = body.input;
  const output = body.output;
  if (typeof input !== "number" || typeof output !== "number") return undefined;
  if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0)
    return undefined;
  return { input, output };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function token(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error("catalog");
  if (SECRET_KEY.test(value) || SECRET_VALUE.test(value)) throw new Error("catalog");
  return value;
}

function positive(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 16_777_216)
    throw new Error("catalog");
  return value as number;
}
