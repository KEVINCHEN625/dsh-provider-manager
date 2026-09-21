import {
  validateSnapshot,
  validateProvider,
  validateCredential,
  validateQuota,
} from "./validation.js";
import type { Provider, Snapshot, QuotaSnapshot } from "../shared/protocol.js";

export interface Transport {
  rpc(
    endpoint: string,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<unknown>;
  reveal(
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<{ value: string; source?: string; revealTTL: number }>;
}
export type Operation = {
  status: "idle" | "loading" | "success" | "error";
  error?: string;
};
export type QuotaView = {
  status: "loading" | QuotaSnapshot["status"] | "error";
  snapshot?: QuotaSnapshot;
  error?: string;
};
export interface State {
  status: "idle" | "loading" | "ready" | "error";
  snapshot?: Snapshot;
  error?: string;
  operations: Record<string, Operation>;
  quotas: Record<string, QuotaView>;
  revealed?: { providerId: string; value: string; source?: string };
  clearEpoch: number;
}
const codes = new Set([
  "INVALID_INPUT",
  "UNAUTHORIZED",
  "REF_NOT_ALLOWED",
  "BINDING_CHANGED",
  "CONFLICT",
  "READ_ONLY",
  "UNSUPPORTED",
  "UNAVAILABLE",
  "TIMEOUT",
  "INVALID_RESPONSE",
]);
export function errorCode(error: unknown): string {
  const code = (error as { code?: string })?.code;
  return code && codes.has(code) ? code : "UNAVAILABLE";
}
export class Controller {
  state: State = { status: "idle", operations: {}, quotas: {}, clearEpoch: 0 };
  drafts: Record<string, string> = {};
  draftRevision?: number;
  changeDraft(name: string, value: string) {
    this.draftRevision ??= this.state.snapshot?.customRevision;
    this.drafts[name] = value;
  }
  private listeners = new Set<() => void>();
  private requests = new Set<AbortController>();
  private loadGeneration = 0;
  private revealGeneration = 0;
  private quotaGeneration: Record<string, number> = {};
  private quotaAbort = new Map<string, AbortController>();
  private quotaPoll?: ReturnType<typeof setInterval>;
  private visible = true;
  private disposed = false;
  private timer?: ReturnType<typeof setTimeout>;
  private revealAbort?: AbortController;
  constructor(
    private transport: Transport,
    private timeout = 15000,
    private quotaPollMs = 300000,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  private update(patch: Partial<State>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  private operation(key: string, value: Operation) {
    this.update({ operations: { ...this.state.operations, [key]: value } });
  }
  private async request<T>(
    run: (signal: AbortSignal) => Promise<T>,
    abort = new AbortController(),
  ): Promise<T> {
    this.requests.add(abort);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        run(abort.signal),
        new Promise<never>((_, reject) => {
          const cancel = () => reject({ code: "UNAVAILABLE" });
          abort.signal.addEventListener("abort", cancel, { once: true });
          timer = setTimeout(() => {
            reject({ code: "TIMEOUT" });
            abort.abort();
          }, this.timeout);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      this.requests.delete(abort);
    }
  }
  async load() {
    const generation = ++this.loadGeneration;
    this.abortQuotas();
    this.update({ status: "loading", error: undefined });
    try {
      const snapshot = validateSnapshot(
        await this.request((signal) =>
          this.transport.rpc("snapshot", {}, signal),
        ),
      );
      if (generation === this.loadGeneration)
        this.update({ status: "ready", snapshot, quotas: {} });
      if (generation === this.loadGeneration) this.readVisibleQuotas();
    } catch (error) {
      if (generation === this.loadGeneration)
        this.update({ status: "error", error: errorCode(error) });
    }
  }
  async refresh(provider: Provider) {
    const generation = this.loadGeneration;
    const key = `models:${provider.id}`;
    if (this.state.operations[key]?.status === "loading") return;
    this.operation(key, { status: "loading" });
    try {
      const card = validateProvider(
        await this.request((signal) =>
          this.transport.rpc(
            "models/refresh",
            { providerId: provider.id },
            signal,
          ),
        ),
      );
      const snapshot = this.state.snapshot;
      if (snapshot && generation === this.loadGeneration)
        this.update({
          snapshot: {
            ...snapshot,
            providers: snapshot.providers.map((p) =>
              p.id === card.id ? card : p,
            ),
          },
        });
      this.operation(key, {
        status: card.catalogError ? "error" : "success",
        error: card.catalogError,
      });
    } catch (error) {
      this.operation(key, { status: "error", error: errorCode(error) });
    }
  }
  async saveConfig(payload: unknown) {
    this.operation("config", { status: "loading" });
    try {
      await this.request((signal) =>
        this.transport.rpc("provider/save", payload, signal),
      );
      this.operation("config", { status: "success" });
      await this.load();
      return true;
    } catch (error) {
      this.operation("config", { status: "error", error: errorCode(error) });
      return false;
    }
  }
  async saveKey(
    provider: Pick<Provider, "id" | "bindingToken">,
    value: string,
  ) {
    const key = `key:${provider.id}`;
    this.operation(key, { status: "loading" });
    try {
      const credential = validateCredential(
        await this.request((signal) =>
          this.transport.rpc(
            "credential/set",
            {
              providerId: provider.id,
              bindingToken: provider.bindingToken,
              value,
            },
            signal,
          ),
        ),
      );
      this.hide();
      const snapshot = this.state.snapshot;
      if (snapshot)
        this.update({
          snapshot: {
            ...snapshot,
            providers: snapshot.providers.map((p) =>
              p.id === provider.id ? { ...p, credential } : p,
            ),
          },
        });
      this.operation(key, { status: "success" });
      await this.refreshQuota(provider, true);
      return true;
    } catch (error) {
      this.operation(key, { status: "error", error: errorCode(error) });
      return false;
    }
  }
  async reveal(provider: Pick<Provider, "id" | "bindingToken">) {
    this.hide();
    const generation = this.revealGeneration;
    const key = `reveal:${provider.id}`;
    this.operation(key, { status: "loading" });
    this.revealAbort = new AbortController();
    try {
      const result = await this.request(
        (signal) =>
          this.transport.reveal(
            { providerId: provider.id, bindingToken: provider.bindingToken },
            signal,
          ),
        this.revealAbort,
      );
      if (generation !== this.revealGeneration || this.disposed) return;
      this.update({
        revealed: {
          providerId: provider.id,
          value: result.value,
          source: result.source,
        },
      });
      this.operation(key, { status: "success" });
      this.timer = setTimeout(
        () => this.hide(),
        Math.min(30000, Math.max(1, result.revealTTL || 30000)),
      );
    } catch (error) {
      if (generation === this.revealGeneration)
        this.operation(key, { status: "error", error: errorCode(error) });
    }
  }
  hide = () => {
    ++this.revealGeneration;
    this.revealAbort?.abort();
    clearTimeout(this.timer);
    const operations = { ...this.state.operations };
    for (const key of Object.keys(operations))
      if (key.startsWith("reveal:")) operations[key] = { status: "idle" };
    this.update({
      revealed: undefined,
      clearEpoch: this.state.clearEpoch + 1,
      operations,
    });
  };
  connectionChanged(connected: boolean) {
    this.hide();
    ++this.loadGeneration;
    this.abortQuotas();
    this.stopPoll();
    for (const request of this.requests) request.abort();
    if (connected) void this.load();
    else this.update({ status: "error", error: "UNAVAILABLE" });
  }
  visibilityChanged(visible: boolean) {
    this.visible = visible;
    if (!visible) {
      this.stopPoll();
      this.abortQuotas();
      return;
    }
    this.readExpiredQuotas();
    this.ensurePoll();
  }
  async refreshQuota(
    provider: Pick<Provider, "id" | "bindingToken">,
    refresh = false,
  ) {
    if (this.disposed) return;
    const id = provider.id;
    const generation = (this.quotaGeneration[id] ?? 0) + 1;
    this.quotaGeneration[id] = generation;
    this.quotaAbort.get(id)?.abort();
    const abort = new AbortController();
    this.quotaAbort.set(id, abort);
    this.update({
      quotas: { ...this.state.quotas, [id]: { status: "loading" } },
    });
    try {
      const snapshot = validateQuota(
        await this.request(
          (signal) =>
            this.transport.rpc(
              "quota/read",
              {
                providerId: id,
                ...(provider.bindingToken
                  ? { bindingToken: provider.bindingToken }
                  : {}),
                ...(refresh ? { refresh: true } : {}),
              },
              signal,
            ),
          abort,
        ),
        id,
      );
      if (generation !== this.quotaGeneration[id] || this.disposed) return;
      this.update({
        quotas: {
          ...this.state.quotas,
          [id]: { status: snapshot.status, snapshot },
        },
      });
    } catch (error) {
      if (generation !== this.quotaGeneration[id] || this.disposed) return;
      this.update({
        quotas: {
          ...this.state.quotas,
          [id]: { status: "error", error: errorCode(error) },
        },
      });
    }
  }
  private readVisibleQuotas() {
    if (!this.visible || this.state.status !== "ready") return;
    this.ensurePoll();
    for (const provider of this.state.snapshot?.providers ?? [])
      void this.refreshQuota(provider);
  }
  private readExpiredQuotas() {
    if (!this.visible || this.state.status !== "ready") return;
    const now = Date.now();
    for (const provider of this.state.snapshot?.providers ?? []) {
      const fetched = this.state.quotas[provider.id]?.snapshot?.fetchedAt;
      const age = fetched
        ? now - Date.parse(fetched)
        : Number.POSITIVE_INFINITY;
      if (!Number.isFinite(age) || age >= this.quotaPollMs)
        void this.refreshQuota(provider);
    }
  }
  private ensurePoll() {
    if (this.quotaPoll || this.disposed || !this.visible) return;
    this.quotaPoll = setInterval(
      () => this.readExpiredQuotas(),
      this.quotaPollMs,
    );
  }
  private stopPoll() {
    clearInterval(this.quotaPoll);
    this.quotaPoll = undefined;
  }
  private abortQuotas() {
    for (const id of Object.keys(this.quotaGeneration))
      this.quotaGeneration[id] += 1;
    for (const abort of this.quotaAbort.values()) abort.abort();
    this.quotaAbort.clear();
  }
  dispose() {
    this.hide();
    ++this.loadGeneration;
    this.abortQuotas();
    this.stopPoll();
    for (const request of this.requests) request.abort();
    this.disposed = true;
    this.listeners.clear();
  }
}
