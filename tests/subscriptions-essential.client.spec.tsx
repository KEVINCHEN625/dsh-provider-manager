import { expect, test, vi } from "vitest";
import { Controller } from "../src/client/controller.js";
const base = {
  settingsWritable: true,
  customRevision: 1,
  providers: [],
  muse: { installed: false, status: "CLI_ONLY", docs: "https://example.test" },
};
const entry = (bindingToken = "A", configured = true) => ({
  providerId: "openai-codex",
  label: "Codex",
  methods: [{ id: "oauth", label: "OAuth" }],
  configured,
  inFlight: false,
  bindingToken,
});
const tick = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
function deferred<T = any>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
test("slow OAuth does not hold the base list in loading", async () => {
  const pending = deferred();
  const c = new Controller({
    rpc: async (e) => (e === "snapshot" ? base : pending.promise),
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  const task = c.load();
  await tick();
  expect(c.state.status).toBe("ready");
  expect(c.state.snapshot?.providers).toEqual([]);
  pending.resolve({ oauth: [] });
  await task;
  c.dispose();
});
test.each(["B", "logout"])(
  "late quota A cannot replace %s metadata",
  async (next) => {
    let current = entry();
    const pending = deferred();
    const rpc = vi.fn(async (e: string) =>
      e === "snapshot"
        ? base
        : e === "oauth/snapshot"
          ? { oauth: [current] }
          : e === "oauth/quota"
            ? pending.promise
            : {},
    );
    const c = new Controller({
      rpc,
      reveal: async () => ({ value: "", revealTTL: 1 }),
    });
    await c.load();
    await tick();
    const q = c.refreshOAuthQuota("openai-codex");
    current = entry(next, next !== "logout");
    await (c as any).refreshOAuth();
    pending.resolve({ ...entry(), quota: { status: "ready", windows: [] } });
    await q;
    await tick();
    expect(c.state.snapshot?.oauth[0].bindingToken).toBe(next);
    expect(c.state.snapshot?.oauth[0].configured).toBe(next !== "logout");
    c.dispose();
  },
);
test("automatic quota is not forced and same identity metadata preserves it", async () => {
  const quota = {
    status: "ready",
    windows: [{ id: "weekly", remainingPercent: 72 }],
  };
  const rpc = vi.fn(async (e: string) =>
    e === "snapshot"
      ? base
      : e === "oauth/snapshot"
        ? { oauth: [entry()] }
        : { ...entry(), quota },
  );
  const c = new Controller({
    rpc,
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  await tick();
  expect(
    rpc.mock.calls.some(
      ([e, p]: any) => e === "oauth/quota" && p.refresh === false,
    ),
  ).toBe(true);
  await (c as any).refreshOAuth();
  await tick();
  expect(c.state.snapshot?.oauth[0].quota).toEqual(quota);
  await c.refreshOAuthQuota("openai-codex");
  expect(rpc.mock.calls.at(-1)).toEqual([
    "oauth/quota",
    expect.objectContaining({ refresh: true }),
    expect.any(AbortSignal),
  ]);
  c.dispose();
});
test.each(["hide", "hideSecond", "dispose", "disconnect"])(
  "second key uses HTTP and %s fences late response",
  async (mode) => {
    const pending = deferred();
    const reveal = vi.fn(() => pending.promise);
    const rpc = vi.fn(async () => ({ value: "unsafe", revealTTL: 30000 }));
    const c = new Controller({ rpc, reveal });
    const task = c.revealSecondGo();
    if (mode === "disconnect") c.connectionChanged(false);
    else (c as any)[mode]();
    pending.resolve({ value: "late-secret", revealTTL: 30000 });
    await task;
    expect(reveal).toHaveBeenCalledWith(
      { providerId: "provider-manager-opencode-go", keySlot: "second" },
      expect.any(AbortSignal),
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(c.state.revealedSecond).toBeUndefined();
    c.dispose();
  },
);

test("hide cancels OAuth busy and showing resumes non-forced quota", async () => {
  const pending = deferred();
  const rpc = vi.fn(async (e: string) =>
    e === "snapshot"
      ? base
      : e === "oauth/snapshot"
        ? { oauth: [entry()] }
        : pending.promise,
  );
  const c = new Controller({
    rpc,
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  await tick();
  expect(c.state.operations["oauth-quota:openai-codex"].status).toBe("loading");
  c.visibilityChanged(false);
  await tick();
  expect(c.state.operations["oauth-quota:openai-codex"].status).toBe("idle");
  c.visibilityChanged(true);
  await tick();
  expect(c.state.operations["oauth-quota:openai-codex"].status).toBe("loading");
  c.dispose();
});
test("successful logout clears local account even if metadata refresh fails", async () => {
  let loggedOut = false;
  const rpc = vi.fn(async (e: string) => {
    if (e === "snapshot") return base;
    if (e === "oauth/logout") {
      loggedOut = true;
      return { removed: true };
    }
    if (e === "oauth/snapshot") {
      if (loggedOut) throw Error("offline");
      return { oauth: [{ ...entry(), account: "old account" }] };
    }
    return { ...entry(), quota: { status: "ready", windows: [] } };
  });
  const c = new Controller({
    rpc,
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  await tick();
  await c.logout("openai-codex");
  await tick();
  expect(c.state.snapshot?.oauth[0]).toMatchObject({ configured: false });
  expect(c.state.snapshot?.oauth[0].bindingToken).toBeUndefined();
  expect(c.state.snapshot?.oauth[0].account).toBeUndefined();
  expect(c.state.snapshot?.oauth[0].quota).toBeUndefined();
  expect(c.state.operations["oauth-quota:openai-codex"].status).toBe("idle");
  c.dispose();
});

test.each(["saveSecondGoKey", "clearSecondGo"])(
  "%s hides pending reveal before mutation finishes",
  async (method) => {
    const reveal = deferred();
    const mutation = deferred();
    const c = new Controller({
      rpc: () => mutation.promise,
      reveal: () => reveal.promise,
    });
    const pending = c.revealSecondGo();
    const save = (c as any)[method]("new");
    reveal.resolve({ value: "old", revealTTL: 30000 });
    await pending;
    expect(c.state.revealedSecond).toBeUndefined();
    mutation.resolve({ configured: false, writable: true });
    await save;
    c.dispose();
  },
);
test("mismatched OAuth quota response settles current busy without copying identity", async () => {
  const c = new Controller({
    rpc: async (e) =>
      e === "snapshot"
        ? base
        : e === "oauth/snapshot"
          ? { oauth: [entry()] }
          : { ...entry("wrong"), quota: { status: "ready", windows: [] } },
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  await tick();
  expect(c.state.operations["oauth-quota:openai-codex"].status).toBe("error");
  expect(c.state.snapshot?.oauth[0].bindingToken).toBe("A");
  c.dispose();
});

test("automatic OAuth quota skips signed-out and unsupported entries", async () => {
  const rpc = vi.fn(async (e: string) =>
    e === "snapshot"
      ? base
      : e === "oauth/snapshot"
        ? {
            oauth: [
              entry("A", false),
              {
                ...entry("B"),
                providerId: "anthropic",
                quota: { status: "unsupported", windows: [] },
              },
            ],
          }
        : {},
  );
  const c = new Controller({
    rpc,
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  await tick();
  expect(rpc.mock.calls.some(([endpoint]) => endpoint === "oauth/quota")).toBe(
    false,
  );
  c.dispose();
});
test("second key mutation refreshes each slot only once", async () => {
  const go = {
    id: "provider-manager-opencode-go",
    name: "Go",
    available: true,
    revision: 1,
    models: [],
    bindingToken: "t",
  };
  const rpc = vi.fn(async (e: string, p: any) =>
    e === "snapshot"
      ? { ...base, providers: [go] }
      : e === "oauth/snapshot"
        ? { oauth: [] }
        : e === "credential/set-second-go"
          ? { configured: true, writable: true }
          : e === "quota/read"
            ? {
                providerId: p.providerId,
                status: "ready",
                windows: [],
                stale: false,
              }
            : {},
  );
  const c = new Controller({
    rpc,
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  await tick();
  rpc.mockClear();
  await c.saveSecondGoKey("new");
  await tick();
  expect(
    rpc.mock.calls
      .filter(([e]) => e === "quota/read")
      .map(([, p]) => p.keySlot ?? "primary"),
  ).toEqual(["primary", "second"]);
  c.dispose();
});
test("removed OAuth metadata clears the old quota operation", async () => {
  let entries = [entry()];
  const c = new Controller({
    rpc: async (e) =>
      e === "snapshot"
        ? base
        : e === "oauth/snapshot"
          ? { oauth: entries }
          : new Promise(() => {}),
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  await tick();
  entries = [];
  await (c as any).refreshOAuth();
  expect(c.state.operations["oauth-quota:openai-codex"].status).toBe("idle");
  c.dispose();
});
