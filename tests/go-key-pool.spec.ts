import { describe, expect, test, vi } from "vitest";
import { Manager } from "../src/host/providers.js";
import { createBuiltInGoAdapter, GO_ROUTE } from "../src/host/opencode/index.js";
import { GO_PREFERENCE_REF } from "../src/host/opencode/catalog.js";
import { readGoPreferred, goSlotOrder } from "../src/host/opencode/pool.js";
import { QuotaReader, OPENCODE_USAGE_URL } from "../src/host/quota.js";
import { fixture } from "./fixtures/services.js";

describe("Go key-pool preference", () => {
  test("readGoPreferred defaults to primary and ignores garbage", async () => {
    expect(await readGoPreferred(async () => undefined)).toBe("primary");
    expect(
      await readGoPreferred(async () => ({ value: "second" })),
    ).toBe("second");
    expect(
      await readGoPreferred(async () => ({ value: "PRIMARY" })),
    ).toBe("primary");
    expect(
      await readGoPreferred(async () => ({ value: "both" })),
    ).toBe("primary");
    expect(goSlotOrder("second")).toEqual([
      "OPENCODE_API_KEY_2",
      "OPENCODE_API_KEY",
    ]);
  });

  test("the wire request carries the preferred slot's key", async () => {
    const store = new Map<string, string>([
      [GO_PREFERENCE_REF, "second"],
      ["OPENCODE_API_KEY", "primary-value"],
      ["OPENCODE_API_KEY_2", "second-value"],
    ]);
    const resolve = async (ref: { toString(): string }) => {
      const name = ref.toString();
      if (store.has(name)) return { value: store.get(name) };
      return undefined;
    };
    const { chat } = await import("./fixtures/opencode-wire.mjs");
    const auths: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: any, init: any) => {
        auths.push(String(new Headers(init.headers).get("authorization")));
        return chat("reasoning");
      }),
    );
    const adapter = createBuiltInGoAdapter({
      credentials: { resolve },
      get: () => undefined,
    } as any);
    const streamOnce = async () => {
      const { BlockAssembler } = await import("@deepseek-ai/dsh-llm");
      const assembler = new BlockAssembler();
      for await (const chunk of adapter.stream({
        provider: GO_ROUTE,
        model: "deepseek-v4.1-flash",
        messages: [],
        sessionId: "session-pool",
      }))
        assembler.push(chunk);
    };
    await streamOnce();
    expect(auths.some((a) => a.includes("second-value"))).toBe(true);
    store.set(GO_PREFERENCE_REF, "primary");
    await streamOnce();
    expect(auths.some((a) => a.includes("primary-value"))).toBe(true);
    // Preferred slot empty → the wire falls back to the other key.
    store.delete("OPENCODE_API_KEY_2");
    await streamOnce();
    expect(auths[auths.length - 1]).toContain("primary-value");
  });
});

describe("Manager key-pool surface", () => {
  function poolManager() {
    const f = fixture();
    f.values.set("OPENCODE_API_KEY_2", "second-value");
    const m: any = new Manager(f.services);
    return { f, m };
  }

  test("snapshot carries both slots and the default preference", async () => {
    const { m } = poolManager();
    const snapshot = await m.snapshot();
    expect(snapshot.goPreferredSlot).toBe("primary");
    expect(snapshot.goKeySlots).toEqual([
      { slot: "primary", ref: "OPENCODE_API_KEY", configured: true, source: expect.any(String) },
      { slot: "second", ref: "OPENCODE_API_KEY_2", configured: true, source: expect.any(String) },
    ]);
  });

  test("setGoPreference persists and reports the flipped order", async () => {
    const { f, m } = poolManager();
    const pool = await m.setGoPreference({ slot: "second" });
    expect(pool.preferred).toBe("second");
    expect(pool.slots[0].slot).toBe("second");
    expect(pool.slots[0].ref).toBe("OPENCODE_API_KEY_2");
    expect(f.values.get(GO_PREFERENCE_REF)).toBe("second");
    await expect(m.setGoPreference({ slot: "both" })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    const snapshot = await m.snapshot();
    expect(snapshot.goPreferredSlot).toBe("second");
    expect(snapshot.goKeySlots?.[0]?.ref).toBe("OPENCODE_API_KEY_2");
  });

  test("quota with keySlot second fetches with the second key and keeps the provider id", async () => {
    const { f, m } = poolManager();
    const seen: string[] = [];
    const reader = new QuotaReader({
      fetch: (async (url: any, init: any) => {
        seen.push(new Headers(init.headers).get("authorization") ?? "");
        return new Response(
          JSON.stringify({ rolling: { percent: 10 } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as any,
    });
    const qm: any = new Manager(f.services, {}, reader);
    const result = await qm.quota({
      providerId: GO_ROUTE,
      keySlot: "second",
    });
    expect(seen).toEqual(["Bearer second-value"]);
    expect(seen[0]).not.toContain("SYNTHETIC");
    expect(result.providerId).toBe(GO_ROUTE);
    expect(result.status).toBe("ready");
    // Primary quota still uses the primary key.
    await qm.quota({ providerId: GO_ROUTE });
    expect(seen[1]).toBe("Bearer SYNTHETIC");
  });

  test("keySlot second is rejected outside the Go routes", async () => {
    const { m } = poolManager();
    await expect(
      m.quota({ providerId: "commandcode", keySlot: "second" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      m.quota({ providerId: GO_ROUTE, keySlot: "third" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

describe("quota-exhaustion auto failover", () => {
  test("isQuotaExhaustion recognizes status codes and message patterns", async () => {
    const { isQuotaExhaustion } = await import("../src/host/opencode/pool.js");
    expect(isQuotaExhaustion({ status: 429 })).toBe(true);
    expect(isQuotaExhaustion({ statusCode: 402 })).toBe(true);
    expect(isQuotaExhaustion({ status: 403 })).toBe(true);
    expect(isQuotaExhaustion(new Error("insufficient_quota: limit reached"))).toBe(true);
    expect(isQuotaExhaustion(new Error("billing hard limit"))).toBe(true);
    expect(isQuotaExhaustion({ status: 500 })).toBe(false);
    expect(isQuotaExhaustion(new Error("socket hang up"))).toBe(false);
    expect(isQuotaExhaustion({ status: 401 })).toBe(false);
  });

  test("a 429 on the preferred key retries the stream on the other slot and marks it", async () => {
    const store = new Map<string, string>([
      ["OPENCODE_API_KEY", "primary-value"],
      ["OPENCODE_API_KEY_2", "second-value"],
    ]);
    const resolve = async (ref: { toString(): string }) => {
      const name = ref.toString();
      if (store.has(name)) return { value: store.get(name) };
      return undefined;
    };
    const auths: string[] = [];
    const { chat } = await import("./fixtures/opencode-wire.mjs");
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: any, init: any) => {
        calls += 1;
        auths.push(String(new Headers(init.headers).get("authorization")));
        if (calls === 1)
          return new Response(
            JSON.stringify({
              error: { message: "insufficient_quota: you exceeded your quota" },
            }),
            { status: 429, headers: { "content-type": "application/json" } },
          );
        return chat("reasoning");
      }),
    );
    const adapter = createBuiltInGoAdapter({
      credentials: { resolve },
      get: () => undefined,
    } as any);
    const { BlockAssembler } = await import("@deepseek-ai/dsh-llm");
    const assembler = new BlockAssembler();
    for await (const chunk of adapter.stream({
      provider: GO_ROUTE,
      model: "deepseek-v4.1-flash",
      messages: [],
      sessionId: "session-failover",
    }))
      assembler.push(chunk);
    // First attempt on the preferred (primary) key, retry on the backup.
    expect(auths[0]).toContain("primary-value");
    expect(auths[1]).toContain("second-value");
    // The exhausted slot stays out of the preferred position for the next
    // request within the TTL — straight to the backup key, no retry storm.
    await (async () => {
      const assembler2 = new BlockAssembler();
      for await (const chunk of adapter.stream({
        provider: GO_ROUTE,
        model: "deepseek-v4.1-flash",
        messages: [],
        sessionId: "session-failover-2",
      }))
        assembler2.push(chunk);
    })();
    expect(auths[2]).toContain("second-value");
    expect(calls).toBe(3);
  });
});
