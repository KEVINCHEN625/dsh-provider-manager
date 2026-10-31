import { describe, expect, test, vi } from "vitest";
import { Manager } from "../src/host/providers.js";
import { fixture } from "./fixtures/services.js";

const SECOND = "OPENCODE_API_KEY_2";

function managerWithStore() {
  const store = new Map<string, string>();
  const f = fixture();
  const credentials = {
    resolve: vi.fn(async (ref: { toString(): string }) => {
      const name = ref.toString();
      if (store.has(name)) return { value: store.get(name), source: "test" };
      return undefined;
    }),
    describe: vi.fn(async (ref: { toString(): string }) => ({
      configured: store.has(ref.toString()),
      writable: true,
    })),
    set: vi.fn(async (ref: { toString(): string }, value: string) => {
      store.set(ref.toString(), value);
    }),
    unset: vi.fn(async (ref: { toString(): string }) => {
      store.delete(ref.toString());
    }),
  };
  const manager = new Manager({
    ...f.services,
    credentials: { ...f.services.credentials, ...credentials },
  } as never);
  return { manager, store, credentials };
}

describe("OpenCode Go key-pool slot 2", () => {
  test("setSecondGoKey stores under the dedicated ref", async () => {
    const { manager, credentials, store } = managerWithStore();
    await manager.setSecondGoKey({ value: "second-key-value" });
    expect(credentials.set).toHaveBeenCalled();
    expect(store.get(SECOND)).toBe("second-key-value");
  });

  test("revealSecondGoKey returns the stored value with a TTL", async () => {
    const { manager } = managerWithStore();
    await manager.setSecondGoKey({ value: "second-key-value" });
    const revealed = await manager.revealSecondGoKey();
    expect(revealed.value).toBe("second-key-value");
    expect(revealed.revealTTL).toBeLessThanOrEqual(30000);
  });

  test("clearSecondGoKey empties the slot", async () => {
    const { manager, store } = managerWithStore();
    await manager.setSecondGoKey({ value: "x" });
    await manager.clearSecondGoKey();
    expect(store.has(SECOND)).toBe(false);
  });

  test("oversized values are refused", async () => {
    const { manager } = managerWithStore();
    await expect(manager.setSecondGoKey({ value: "a".repeat(16385) })).rejects.toThrow();
  });
});
