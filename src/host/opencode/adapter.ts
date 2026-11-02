import type { Context } from "@deepseek-ai/cordis";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import {
  LlmError,
  QUOTA_EXCEEDED_CODE,
  assertUsableApiKey,
  resolveImageAttachmentAccess,
} from "@deepseek-ai/dsh-llm";

import { GO_ROUTE, GO_KEY, GO_KEY_2 } from "./catalog.js";
import {
  GO_EXHAUST_TTL_MS,
  goSlotOrder,
  isQuotaExhaustion,
  otherSlot,
  readGoPreferred,
  type GoSlot,
} from "./pool.js";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { createBuiltInGoProfile } from "./profile.js";
export function createBuiltInGoAdapter(ctx: Context): PiAiAdapter {
  const profiles = new Map([[GO_ROUTE, createBuiltInGoProfile()]]);
    // Quota failover: 429/402/403 during the first chunk of a stream marks the
  // slot exhausted for a TTL and retries once against the other slot.
  const exhaustedUntil = new Map<string, number>();
  let forcedSlot: GoSlot | undefined;
  let lastSlotRef: string | undefined;

  /**
   * pi-ai never throws: quota failures arrive as the FIRST chunk, already
   * classified by the host as QUOTA_EXCEEDED (insufficient_quota) or
   * RATE_LIMIT (429). Failover triggers only when zero content was streamed
   * — a mid-stream failure is a different problem and is not retried.
   */
  const quotaFailureChunk = (chunk: unknown): boolean => {
    const shaped = chunk as {
      type?: string;
      reason?: {
        kind?: string;
        failure?: { code?: string; message?: string };
      };
    };
    if (shaped?.type !== "finish" || shaped.reason?.kind !== "error")
      return false;
    const code = shaped.reason.failure?.code;
    if (code === QUOTA_EXCEEDED_CODE || code === "RATE_LIMIT") return true;
    // The host classifier falls back to PI_AI_ERROR for unrecognized text;
    // fall back to the raw message patterns.
    if (code === "PI_AI_ERROR")
      return isQuotaExhaustion(shaped.reason.failure?.message);
    return false;
  };

  async function* withFailover(
    perform: () => AsyncIterable<unknown>,
  ): AsyncGenerator<unknown, void, undefined> {
    let iterator = perform()[Symbol.asyncIterator]();
    // Consumer close (return()) must reach the upstream stream, so every
    // hand-driven loop forwards it in a finally.
    let closed = false;
    const closeInner = () => {
      if (closed) return Promise.resolve();
      closed = true;
      return Promise.resolve(iterator.return?.()).then(() => undefined);
    };
    // Buffer the opening run of the stream: usage-only chunks carry no
    // content, so holding them costs nothing and lets the quota finish
    // chunk (which may follow several of them) trigger the failover.
    const buffered: unknown[] = [];
    let done = false;
    try {
      for (;;) {
        const probe = await iterator.next();
        if (probe.done) {
          done = true;
          break;
        }
        buffered.push(probe.value);
        if ((probe.value as { type?: string }).type !== "usage") break;
      }
    } catch (error) {
      await closeInner();
      if (!isQuotaExhaustion(error) || lastSlotRef === undefined) throw error;
      exhaustedUntil.set(lastSlotRef, Date.now() + GO_EXHAUST_TTL_MS);
      yield* retryOnOtherSlot(perform);
      return;
    }
    const last = buffered[buffered.length - 1];
    if (!done && quotaFailureChunk(last) && lastSlotRef) {
      await closeInner();
      exhaustedUntil.set(lastSlotRef, Date.now() + GO_EXHAUST_TTL_MS);
      yield* retryOnOtherSlot(perform);
      return;
    }
    try {
      for (const chunk of buffered) yield chunk;
      if (done) return;
      for (;;) {
        const next = await iterator.next();
        if (next.done) return;
        yield next.value;
      }
    } finally {
      await closeInner();
    }
  }

  async function* retryOnOtherSlot(
    perform: () => AsyncIterable<unknown>,
  ): AsyncGenerator<unknown, void, undefined> {
    forcedSlot = otherSlot(lastSlotRef === GO_KEY ? "primary" : "second");
    try {
      const iterator = perform()[Symbol.asyncIterator]();
      try {
        for (;;) {
          const next = await iterator.next();
          if (next.done) return;
          yield next.value;
        }
      } finally {
        await iterator.return?.();
      }
    } finally {
      forcedSlot = undefined;
    }
  }

const adapter = new PiAiAdapter({
    profiles: () => profiles,
    // This closed API-key-only lane never performs ambient discovery or OAuth.
    auth: {
      credentials: {
        read: async () => undefined,
        list: async () => [],
        modify: async () => {
          throw new Error("OpenCode Go uses the DSH API key service");
        },
        delete: async () => {
          throw new Error("OpenCode Go uses the DSH API key service");
        },
      },
      authContext: {
        env: async () => undefined,
        fileExists: async () => false,
      },
    },
    resolveApiKey: async (_provider, _profile) => {
      // Key pool: the preferred slot (persisted via readGoPreferred, default
      // primary = the earliest-configured ref) is tried first. A slot marked
      // exhausted (429/402/403 during a stream) drops to the back until its
      // TTL lapses, so live traffic fails over automatically; the forced
      // slot from an in-flight failover retry wins outright.
      const preference: GoSlot =
        forcedSlot ?? (await readGoPreferred((ref) => ctx.credentials.resolve(ref)));
      const now = Date.now();
      const [head, tail] = goSlotOrder(preference);
      const order =
        (exhaustedUntil.get(head) ?? 0) > now &&
        (exhaustedUntil.get(tail) ?? 0) <= now
          ? [tail, head]
          : [head, tail];
      for (const ref of order) {
        const hit = await ctx.credentials.resolve(credentialRef(ref));
        if (hit?.value) {
          lastSlotRef = ref;
          return assertUsableApiKey(hit.value, GO_ROUTE, ref);
        }
      }
      throw new LlmError(
        `Provider Manager: store ${GO_KEY} (and optionally ${GO_KEY_2}) before using OpenCode Go`,
        "MISSING_CREDENTIAL",
      );
    },
    resolveAttachments: () => ctx.get("attachments"),
    resolveImageAccess: (attachments, ref) =>
      resolveImageAttachmentAccess(
        attachments,
        (hostPath) => ctx.get("fs")?.processPathFromHostPath(hostPath),
        ref,
      ),
  });
  const bindStream = (name: "stream" | "streamSimple") => {
    const original = (adapter as unknown as Record<string, Function>)[name];
    if (typeof original !== "function") return;
    (adapter as unknown as Record<string, unknown>)[name] = (...args: unknown[]) =>
      withFailover(() => original.apply(adapter, args));
  };
  bindStream("stream");
  bindStream("streamSimple");

  const resolveModel = adapter.resolveModel.bind(adapter);
  const prepareCall = adapter.prepareCall.bind(adapter);
  const hideEmptyReasoning = <
    T extends { reasoning?: { efforts: readonly unknown[] } },
  >(
    info: T,
  ): T => {
    if (info.reasoning && info.reasoning.efforts.length === 0) {
      const { reasoning: _unused, ...rest } = info;
      return rest as T;
    }
    return info;
  };
  adapter.resolveModel = (provider, model, signal) =>
    Promise.resolve(resolveModel(provider, model, signal)).then(
      hideEmptyReasoning,
    );
  adapter.prepareCall = (provider, model, signal) =>
    Promise.resolve(prepareCall(provider, model, signal)).then((call) => ({
      ...call,
      model: hideEmptyReasoning(call.model),
    }));
  return adapter;
}
