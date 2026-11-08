import { afterEach, expect, test, vi } from "vitest";
import {
  createBuiltInGoAdapter,
  GO_ROUTE,
} from "../src/host/opencode/index.js";
import {
  GO_KEY,
  GO_KEY_2,
  GO_PREFERENCE_REF,
} from "../src/host/opencode/catalog.js";
import { chat } from "./fixtures/opencode-wire.mjs";
afterEach(() => vi.unstubAllGlobals());
const options = (sessionId = "A") => ({
  provider: GO_ROUTE,
  model: "deepseek-v4.1-flash",
  messages: [],
  sessionId,
});
const failure = () =>
  new Response(JSON.stringify({ error: { message: "insufficient_quota" } }), {
    status: 429,
    headers: { "content-type": "application/json" },
  });
async function collect(stream: any) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}
function setup(second: string | undefined = "second") {
  const store = new Map([[GO_KEY, "primary"]]);
  if (second !== undefined) store.set(GO_KEY_2, second);
  const adapter = createBuiltInGoAdapter({
    credentials: {
      resolve: async (ref: any) =>
        store.has(String(ref)) ? { value: store.get(String(ref)) } : undefined,
    },
    get: () => undefined,
  } as any);
  const requests: { key: string; session: string }[] = [];
  const wire = (
    fn: (key: string, session: string) => Promise<Response> | Response,
  ) =>
    vi.stubGlobal("fetch", async (_url: any, init: any) => {
      const headers = new Headers(init.headers);
      const key = headers.get("authorization")!.replace("Bearer ", "");
      const session = headers.get("x-opencode-session")!;
      requests.push({ key, session });
      return fn(key, session);
    });
  return { store, adapter, requests, wire };
}
test("prepared call fails over through its captured stream", async () => {
  const f = setup();
  f.wire((key) => (key === "primary" ? failure() : chat()));
  const call = await f.adapter.prepareCall(GO_ROUTE, options().model);
  const chunks = await collect(call.stream(options()));
  expect(f.requests.map((r) => r.key)).toEqual(["primary", "second"]);
  expect(chunks.at(-1)).not.toMatchObject({ reason: { kind: "error" } });
});
test.each([undefined, "primary"])(
  "no distinct backup %s never repeats exhausted key",
  async (second) => {
    const f = setup(second);
    if (second === undefined) f.store.delete(GO_KEY_2);
    f.wire(() => failure());
    await collect(f.adapter.stream(options()));
    expect(f.requests.map((r) => r.key)).toEqual(["primary"]);
  },
);
test("credential replacement does not inherit exhausted health", async () => {
  const f = setup();
  f.wire((key) => (key === "primary" ? failure() : chat()));
  await collect(f.adapter.stream(options()));
  f.store.set(GO_KEY, "replacement");
  await collect(f.adapter.stream(options("B")));
  expect(f.requests.map((r) => r.key)).toEqual([
    "primary",
    "second",
    "replacement",
  ]);
});
test.each([false, true])(
  "concurrent streams prepared=%s retain attempt ownership across listModels",
  async (prepared) => {
    const f = setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let entered!: () => void;
    const started = new Promise<void>((r) => (entered = r));
    f.wire(async (key, session) => {
      if (session === "A" && key === "primary") {
        entered();
        await gate;
        return failure();
      }
      return chat();
    });
    const call = prepared
      ? await f.adapter.prepareCall(GO_ROUTE, options().model)
      : f.adapter;
    const a = collect(call.stream(options("A")));
    await started;
    f.store.set(GO_PREFERENCE_REF, "second");
    await collect(call.stream(options("B")));
    await f.adapter.listModels(GO_ROUTE);
    release();
    await a;
    expect(
      f.requests.filter((r) => r.session === "A").map((r) => r.key),
    ).toEqual(["primary", "second"]);
    expect(
      f.requests.filter((r) => r.session === "B").map((r) => r.key),
    ).toEqual(["second"]);
  },
);
test("abort after quota response never begins another request", async () => {
  const f = setup();
  const abort = new AbortController();
  f.wire(() => {
    abort.abort();
    return failure();
  });
  await collect(f.adapter.stream({ ...options(), signal: abort.signal }));
  expect(f.requests).toHaveLength(1);
});

test("both exhausted slots stop after one failover and a replacement gets a fresh attempt", async () => {
  const f = setup();
  f.wire(() => failure());
  await collect(f.adapter.stream(options()));
  expect(f.requests.map((r) => r.key)).toEqual(["primary", "second"]);
  f.store.set(GO_KEY_2, "replacement");
  f.wire(() => chat());
  await collect(f.adapter.stream(options("B")));
  expect(f.requests.at(-1)?.key).toBe("replacement");
});
test.each([false, true])(
  "consumer close and content-before-error close upstream once prepared=%s",
  async (prepared) => {
    const { PiAiAdapter } = await import("@deepseek-ai/dsh-llm-pi-ai");
    const closed = vi.fn(async () => ({ done: true, value: undefined }));
    let position = 0;
    const stream = () => ({
      [Symbol.asyncIterator]: () => ({
        next: async () =>
          position++ === 0
            ? { done: false, value: { type: "text", text: "visible" } }
            : {
                done: false,
                value: {
                  type: "finish",
                  reason: { kind: "error", failure: { code: "RATE_LIMIT" } },
                },
              },
        return: closed,
      }),
    });
    const original = prepared
      ? vi
          .spyOn(PiAiAdapter.prototype, "prepareCall")
          .mockImplementation(
            () => ({ model: { id: "captured" }, stream }) as any,
          )
      : vi
          .spyOn(PiAiAdapter.prototype, "stream")
          .mockImplementation(stream as any);
    try {
      const f = setup();
      const call = prepared
        ? await f.adapter.prepareCall(GO_ROUTE, options().model)
        : f.adapter;
      const iterator = call.stream(options())[Symbol.asyncIterator]();
      expect((await iterator.next()).done).toBe(false);
      await iterator.return!();
      expect(closed).toHaveBeenCalledTimes(1);
      position = 0;
      closed.mockClear();
      const second = call.stream(options())[Symbol.asyncIterator]();
      await second.next();
      expect((await second.next()).value).toMatchObject({
        reason: { kind: "error" },
      });
      await second.return!();
      expect(closed).toHaveBeenCalledTimes(1);
    } finally {
      original.mockRestore();
    }
  },
);
test("prepared wrapper invokes captured public stream without re-preparing", async () => {
  const { PiAiAdapter } = await import("@deepseek-ai/dsh-llm-pi-ai");
  let version = 1;
  const prepare = vi
    .spyOn(PiAiAdapter.prototype, "prepareCall")
    .mockImplementation(() => {
      const captured = version;
      return {
        model: { id: "model", reasoning: { efforts: [] } },
        stream: async function* () {
          yield { type: "text", text: String(captured) };
        },
      } as any;
    });
  try {
    const f = setup();
    const call = await f.adapter.prepareCall(GO_ROUTE, options().model);
    version = 2;
    expect(await collect(call.stream(options()))).toEqual([
      { type: "text", text: "1" },
    ]);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(call.model.reasoning).toBeUndefined();
  } finally {
    prepare.mockRestore();
  }
});

test("late exhaustion for replaced key cannot erase current key exhaustion", async () => {
  const f = setup();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let entered!: () => void;
  const started = new Promise<void>((r) => (entered = r));
  f.wire(async (key, session) => {
    if (session === "A" && key === "primary") {
      entered();
      await gate;
    }
    return key === "second" ? chat() : failure();
  });
  const a = collect(f.adapter.stream(options("A")));
  await started;
  f.store.set(GO_KEY, "replacement");
  await collect(f.adapter.stream(options("B")));
  release();
  await a;
  await collect(f.adapter.stream(options("C")));
  expect(f.requests.filter((r) => r.session === "C").map((r) => r.key)).toEqual(
    ["second"],
  );
});

test.each(["invalid", "throws"])(
  "healthy primary is independent of %s backup",
  async (mode) => {
    const requests: string[] = [];
    const adapter = createBuiltInGoAdapter({
      credentials: {
        resolve: async (ref: any) => {
          if (String(ref) === GO_KEY) return { value: "primary" };
          if (String(ref) === GO_KEY_2) {
            if (mode === "throws") throw Error("unrelated store failure");
            return { value: "bad\nkey" };
          }
          return undefined;
        },
      },
      get: () => undefined,
    } as any);
    vi.stubGlobal("fetch", async (_url: any, init: any) => {
      requests.push(new Headers(init.headers).get("authorization")!);
      return chat();
    });
    expect((await adapter.listModels(GO_ROUTE)).length).toBeGreaterThan(0);
    await collect(adapter.stream(options()));
    expect(requests).toEqual(["Bearer primary"]);
  },
);
test("same normalized key in both slots is not a backup", async () => {
  const f = setup(" primary ");
  f.wire(() => failure());
  await collect(f.adapter.stream(options()));
  expect(f.requests.map((r) => r.key)).toEqual(["primary"]);
});

test("double quota failure reads each slot only once and delivers terminal failure", async () => {
  const reads: string[] = [];
  const adapter = createBuiltInGoAdapter({
    credentials: {
      resolve: async (ref: any) => {
        const key = String(ref);
        reads.push(key);
        if (key === GO_PREFERENCE_REF) return undefined;
        return { value: key === GO_KEY ? "primary" : "second" };
      },
    },
    get: () => undefined,
  } as any);
  vi.stubGlobal("fetch", async () => failure());
  const chunks = await collect(adapter.stream(options()));
  expect(chunks.at(-1)).toMatchObject({
    type: "finish",
    reason: { kind: "error" },
  });
  expect(reads.filter((key) => key === GO_KEY)).toHaveLength(1);
  expect(reads.filter((key) => key === GO_KEY_2)).toHaveLength(1);
});
test.each([false, true])(
  "closes first upstream before pending backup resolution, abort settles prepared=%s",
  async (prepared) => {
    let upstream: AbortSignal | undefined;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => (entered = resolve));
    let release!: (value: any) => void;
    const backup = new Promise<any>((resolve) => (release = resolve));
    let closedBeforeRead = false;
    const adapter = createBuiltInGoAdapter({
      credentials: {
        resolve: async (ref: any) => {
          if (String(ref) === GO_KEY) return { value: "primary" };
          if (String(ref) === GO_KEY_2) {
            closedBeforeRead = upstream?.aborted === true;
            entered();
            return backup;
          }
          return undefined;
        },
      },
      get: () => undefined,
    } as any);
    const fetcher = vi.fn(async (_url: any, init: any) => {
      upstream = init.signal;
      return failure();
    });
    vi.stubGlobal("fetch", fetcher);
    const call = prepared
      ? await adapter.prepareCall(GO_ROUTE, options().model)
      : adapter;
    const abort = new AbortController();
    const task = collect(call.stream({ ...options(), signal: abort.signal }));
    await started;
    abort.abort();
    const settled = await Promise.race([
      task.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 100)),
    ]);
    release({ value: "second" });
    await task;
    expect(closedBeforeRead).toBe(true);
    expect(settled).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

test("terminal quota delivery cannot wait on an unused hanging credential read", async () => {
  let primaryReads = 0;
  let release!: () => void;
  const hanging = new Promise<void>((resolve) => (release = resolve));
  const adapter = createBuiltInGoAdapter({
    credentials: {
      resolve: async (ref: any) => {
        if (String(ref) === GO_PREFERENCE_REF) return undefined;
        if (String(ref) === GO_KEY && ++primaryReads > 1) await hanging;
        return { value: String(ref) === GO_KEY ? "primary" : "second" };
      },
    },
    get: () => undefined,
  } as any);
  vi.stubGlobal("fetch", async () => failure());
  const task = collect(adapter.stream(options()));
  const result = await Promise.race([
    task.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 100)),
  ]);
  release();
  await task;
  expect(result).toBe(true);
  expect(primaryReads).toBe(1);
});

test("thrown opening quota failures also close each attempt once without a final backup read", async () => {
  const { PiAiAdapter } = await import("@deepseek-ai/dsh-llm-pi-ai");
  const original = PiAiAdapter.prototype.stream;
  const closes: number[] = [];
  let invocation = 0;
  const spy = vi
    .spyOn(PiAiAdapter.prototype, "stream")
    .mockImplementation(function (this: any, opts: any) {
      const index = invocation++;
      const inner = original.call(this, opts)[Symbol.asyncIterator]();
      return {
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            await inner.next();
            throw Object.assign(Error("quota exhausted"), { status: 429 });
          },
          return: async () => {
            closes[index] = (closes[index] ?? 0) + 1;
            return inner.return!();
          },
        }),
      } as any;
    });
  const reads: string[] = [];
  try {
    const adapter = createBuiltInGoAdapter({
      credentials: {
        resolve: async (ref: any) => {
          reads.push(String(ref));
          return String(ref) === GO_PREFERENCE_REF
            ? undefined
            : { value: String(ref) === GO_KEY ? "primary" : "second" };
        },
      },
      get: () => undefined,
    } as any);
    vi.stubGlobal("fetch", async () => failure());
    await expect(collect(adapter.stream(options()))).rejects.toMatchObject({
      status: 429,
    });
    expect(closes).toEqual([1, 1]);
    expect(reads.filter((ref) => ref === GO_KEY)).toHaveLength(1);
    expect(reads.filter((ref) => ref === GO_KEY_2)).toHaveLength(1);
  } finally {
    spy.mockRestore();
  }
});
