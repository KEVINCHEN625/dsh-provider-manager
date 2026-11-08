import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
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
  readGoPreferred,
} from "./pool.js";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { createBuiltInGoProfile } from "./profile.js";
import { untilAborted } from "../quota.js";
export function createBuiltInGoAdapter(ctx: Context): PiAiAdapter {
  const profiles = new Map([[GO_ROUTE, createBuiltInGoProfile()]]);
  type Identity = { ref: string; digest: string };
  type Candidate = Identity & { value: string };
  type Attempt = { selected?: Identity; forced?: Candidate };
  // Only irreversible identities live beyond an invocation. Replacing a key
  // immediately escapes the health state of the previous credential.
  const exhausted = new Map<string, number>();
  const identity = (candidate: Identity) =>
    `${candidate.ref}:${candidate.digest}`;
  const attempts = new AsyncLocalStorage<Attempt>();
  const digest = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  const readCandidate = async (ref: string): Promise<Candidate | undefined> => {
    const hit = await ctx.credentials.resolve(credentialRef(ref));
    if (!hit?.value) return undefined;
    const value = assertUsableApiKey(hit.value, GO_ROUTE, ref);
    return { ref, digest: digest(value), value };
  };
  const isExhausted = (candidate: Identity) => {
    return (exhausted.get(identity(candidate)) ?? 0) > Date.now();
  };
  const markExhausted = (selected: Identity | undefined) => {
    if (!selected) return;
    for (const [key, until] of exhausted)
      if (until <= Date.now()) exhausted.delete(key);
    exhausted.set(identity(selected), Date.now() + GO_EXHAUST_TTL_MS);
  };
  const retryCandidate = async (attempt: Attempt, signal?: AbortSignal) => {
    const selected = attempt.selected;
    if (!selected || signal?.aborted) return undefined;
    // An unusable backup cannot replace the original quota failure.
    const pending = readCandidate(selected.ref === GO_KEY ? GO_KEY_2 : GO_KEY);
    const candidate = await (
      signal ? untilAborted(pending, signal) : pending
    ).catch(() => undefined);
    if (
      signal?.aborted ||
      !candidate ||
      candidate.digest === selected.digest ||
      isExhausted(candidate)
    )
      return undefined;
    return candidate;
  };

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

  // Async generators execute on next(), not construction. Bind all iterator
  // entry points so overlapping calls (including one prepared call) stay local.
  function scopedIterator(
    perform: () => AsyncIterable<unknown>,
    attempt: Attempt,
  ) {
    const inner = attempts.run(attempt, () =>
      perform()[Symbol.asyncIterator](),
    );
    return {
      next: () => attempts.run(attempt, () => inner.next()),
      return: () => attempts.run(attempt, () => inner.return?.()),
      throw: (error: unknown) =>
        attempts.run(attempt, () => inner.throw?.(error)),
    };
  }
  async function* withFailover(
    perform: () => AsyncIterable<unknown>,
    signal?: AbortSignal,
  ): AsyncGenerator<unknown, void, undefined> {
    const attempt: Attempt = {};
    for (let index = 0; index < 2; index++) {
      const iterator = scopedIterator(perform, attempt);
      let closed = false;
      const close = async () => {
        if (closed) return;
        closed = true;
        await iterator.return();
      };
      try {
        const buffered: unknown[] = [];
        let done = false;
        try {
          for (;;) {
            const next = await iterator.next();
            if (next.done) {
              done = true;
              break;
            }
            buffered.push(next.value);
            if ((next.value as { type?: string }).type !== "usage") break;
          }
        } catch (error) {
          if (
            !signal?.aborted &&
            (error as { name?: string })?.name !== "AbortError" &&
            isQuotaExhaustion(error)
          ) {
            markExhausted(attempt.selected);
            await close();
            if (index === 0) {
              const candidate = await retryCandidate(attempt, signal);
              if (candidate) {
                attempt.forced = candidate;
                continue;
              }
            }
          }
          throw error;
        }
        if (!done && quotaFailureChunk(buffered.at(-1)) && !signal?.aborted) {
          markExhausted(attempt.selected);
          await close();
          done = true;
          if (index === 0) {
            const candidate = await retryCandidate(attempt, signal);
            if (candidate) {
              attempt.forced = candidate;
              continue;
            }
          }
        }
        for (const chunk of buffered) yield chunk;
        if (done) return;
        for (;;) {
          const next = await iterator.next();
          if (next.done) return;
          yield next.value;
        }
      } finally {
        await close();
      }
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
      const attempt = attempts.getStore();
      let candidate = attempt?.forced;
      if (attempt) attempt.forced = undefined;
      if (!candidate) {
        const preference = await readGoPreferred((ref) =>
          ctx.credentials.resolve(ref),
        );
        const [head, tail] = goSlotOrder(preference);
        candidate = await readCandidate(head);
        if (!candidate) candidate = await readCandidate(tail);
        else if (isExhausted(candidate)) {
          const backup = await readCandidate(tail).catch(() => undefined);
          if (backup && !isExhausted(backup)) candidate = backup;
        }
      }
      if (candidate) {
        if (attempt)
          attempt.selected = { ref: candidate.ref, digest: candidate.digest };
        return candidate.value;
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
    (adapter as unknown as Record<string, unknown>)[name] = (
      ...args: unknown[]
    ) =>
      withFailover(
        () => original.apply(adapter, args),
        (args[0] as { signal?: AbortSignal })?.signal,
      );
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
      stream: (options) =>
        withFailover(() => call.stream(options), options.signal) as ReturnType<
          typeof call.stream
        >,
    }));
  return adapter;
}
