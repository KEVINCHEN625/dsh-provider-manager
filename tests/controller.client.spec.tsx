import { test, expect, vi } from "vitest";
import { Controller } from "../src/client/controller.js";
const fixtureCard = (id: string, model = id) => ({
  id,
  name: id,
  available: true,
  revision: 1,
  models: [{ id: model }],
});
const fixtureSnapshot = (providers: unknown[] = []) => ({
  settingsWritable: true,
  customRevision: 1,
  providers,
  muse: { installed: false, status: "CLI_ONLY", docs: "https://example.test" },
});
test("initial rejection leaves loading, retry succeeds, drafts preserved", async () => {
  let fail = true;
  const c: any = new Controller({
    rpc: async () => {
      if (fail) throw Error("secret");
      return fixtureSnapshot();
    },
    reveal: async () => ({}),
  });
  c.drafts.route = "draft";
  await c.load();
  expect(c.state.status).toBe("error");
  expect(JSON.stringify(c.state)).not.toContain("secret");
  fail = false;
  await c.load();
  expect(c.state.status).toBe("ready");
  expect(c.drafts.route).toBe("draft");
});
test("hide and disposal invalidate late reveal", async () => {
  let resolve: any;
  const c: any = new Controller({
    rpc: async () => fixtureSnapshot(),
    reveal: () => new Promise((r) => (resolve = r)),
  });
  const p = c.reveal({ id: "x", bindingToken: "t" });
  c.hide();
  resolve({ value: "SYNTHETIC", source: "file", revealTTL: 30000 });
  await p;
  expect(c.state.revealed).toBeUndefined();
  c.dispose();
  expect(c.state.revealed).toBeUndefined();
});
test("old load cannot override new load and read timeout leaves loading", async () => {
  let resolve: any;
  let n = 0;
  const c: any = new Controller(
    {
      rpc: () =>
        ++n === 1
          ? new Promise((r) => (resolve = r))
          : Promise.resolve(fixtureSnapshot([fixtureCard("new")])),
      reveal: async () => ({}),
    },
    10,
  );
  const first = c.load();
  await c.load();
  resolve(fixtureSnapshot([fixtureCard("old")]));
  await first;
  expect(c.state.snapshot.providers.map((p: any) => p.id)).toEqual(["new"]);
  const timeout: any = new Controller(
    { rpc: () => new Promise(() => {}), reveal: async () => ({}) },
    5,
  );
  await timeout.load();
  expect(timeout.state.status).toBe("error");
});
test("expiry and connection loss clear revealed value and reconnect preserves draft", async () => {
  vi.useFakeTimers();
  const c = new Controller({
    rpc: async () => fixtureSnapshot(),
    reveal: async () => ({ value: "SYNTHETIC", revealTTL: 30000 }),
  });
  c.drafts.route = "kept";
  await c.reveal({ id: "x", bindingToken: "t" });
  expect(c.state.revealed?.value).toBe("SYNTHETIC");
  await vi.advanceTimersByTimeAsync(30000);
  expect(c.state.revealed).toBeUndefined();
  await c.reveal({ id: "x", bindingToken: "t" });
  c.connectionChanged(false);
  expect(c.state.status).toBe("error");
  expect(c.state.revealed).toBeUndefined();
  c.connectionChanged(true);
  await vi.advanceTimersByTimeAsync(1);
  expect(c.state.status).toBe("ready");
  expect(c.drafts.route).toBe("kept");
  c.dispose();
  vi.useRealTimers();
});
test("catalog refresh cannot overwrite a newer full snapshot", async () => {
  let resolve: any;
  const c = new Controller({
    rpc: async (endpoint) =>
      endpoint === "models/refresh"
        ? new Promise((r) => (resolve = r))
        : fixtureSnapshot([fixtureCard("x", "new")]),
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  const refresh = c.refresh({ id: "x" } as any);
  await c.load();
  resolve(fixtureCard("x", "old"));
  await refresh;
  expect(c.state.snapshot?.providers[0].models[0].id).toBe("new");
  c.dispose();
});
test.each([
  { providers: [] },
  { providers: {}, muse: {} },
  {
    providers: [{ id: "x", models: {} }],
    muse: {
      installed: false,
      status: "CLI_ONLY",
      docs: "https://example.test",
    },
  },
])("malformed snapshot becomes retryable error: %j", async (invalid) => {
  let response: unknown = invalid;
  const c = new Controller({
    rpc: async () => response,
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  expect(c.state.status).toBe("error");
  expect(c.state.snapshot).toBeUndefined();
  response = {
    settingsWritable: true,
    customRevision: 1,
    providers: [],
    muse: {
      installed: false,
      status: "CLI_ONLY",
      docs: "https://example.test",
    },
  };
  await c.load();
  expect(c.state.status).toBe("ready");
  c.dispose();
});
test("malformed refreshed card is rejected without corrupting loaded catalog", async () => {
  const card = {
    id: "x",
    name: "X",
    available: true,
    revision: 1,
    models: [{ id: "kept" }],
  };
  const c = new Controller({
    rpc: async (endpoint) =>
      endpoint === "snapshot"
        ? {
            settingsWritable: true,
            customRevision: 1,
            providers: [card],
            muse: {
              installed: false,
              status: "CLI_ONLY",
              docs: "https://example.test",
            },
          }
        : { ...card, models: {} },
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  await c.refresh(card);
  expect(c.state.operations["models:x"].status).toBe("error");
  expect(c.state.snapshot?.providers[0].models).toEqual([{ id: "kept" }]);
  c.dispose();
});

const quotaFixture = (
  providerId: string,
  windows: unknown[],
  extra: Record<string, unknown> = {},
) => ({
  providerId,
  status: "ready",
  stale: false,
  source: "opencode-official",
  fetchedAt: "2026-09-21T00:00:00.000Z",
  windows,
  ...extra,
});

test("quota reads are per card and a slow card cannot block another", async () => {
  let release: (value: unknown) => void = () => {};
  const c = new Controller({
    rpc: async (endpoint, payload: any) => {
      if (endpoint === "snapshot")
        return fixtureSnapshot([
          fixtureCard("opencode-go"),
          fixtureCard("commandcode"),
        ]);
      if (payload?.providerId === "opencode-go")
        return new Promise((resolve) => (release = resolve));
      return quotaFixture("commandcode", [
        { id: "five-hour", usedPercent: 10, remainingPercent: 90 },
      ]);
    },
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  await vi.waitFor(() =>
    expect(c.state.quotas.commandcode?.status).toBe("ready"),
  );
  expect(c.state.quotas["opencode-go"]?.status).toBe("loading");
  expect(c.state.quotas.commandcode.snapshot?.windows[0].remainingPercent).toBe(
    90,
  );
  release(
    quotaFixture("opencode-go", [
      { id: "five-hour", usedPercent: 0, remainingPercent: 100 },
    ]),
  );
  await vi.waitFor(() =>
    expect(c.state.quotas["opencode-go"]?.status).toBe("ready"),
  );
  c.dispose();
});

test("quota RPC or validation failure does not keep previous windows", async () => {
  let fail = false;
  const c = new Controller({
    rpc: async (endpoint) => {
      if (endpoint === "snapshot")
        return fixtureSnapshot([
          { ...fixtureCard("opencode-go"), bindingToken: "t" },
        ]);
      if (fail) throw { code: "UNAUTHORIZED" };
      return quotaFixture("opencode-go", [
        { id: "five-hour", usedPercent: 0, remainingPercent: 100 },
      ]);
    },
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  await vi.waitFor(() =>
    expect(
      c.state.quotas["opencode-go"]?.snapshot?.windows[0].remainingPercent,
    ).toBe(100),
  );
  fail = true;
  await c.refreshQuota({ id: "opencode-go", bindingToken: "t" }, true);
  expect(c.state.quotas["opencode-go"]?.snapshot).toBeUndefined();
  expect(c.state.quotas["opencode-go"]?.status).toBe("error");
  c.dispose();
});

test("saving a new key with the same token drops the previous account quota", async () => {
  let key = "old";
  const provider = {
    ...fixtureCard("opencode-go"),
    bindingToken: "same-token",
    credential: { configured: true, writable: true, source: "file" },
  };
  const c = new Controller({
    rpc: async (endpoint) => {
      if (endpoint === "snapshot") return fixtureSnapshot([provider]);
      if (endpoint === "credential/set")
        return { configured: true, writable: true, source: "file" };
      if (key === "old")
        return quotaFixture("opencode-go", [
          { id: "five-hour", usedPercent: 5, remainingPercent: 95 },
        ]);
      throw { code: "UNAUTHORIZED" };
    },
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  await vi.waitFor(() =>
    expect(
      c.state.quotas["opencode-go"]?.snapshot?.windows[0].remainingPercent,
    ).toBe(95),
  );
  key = "new";
  await expect(c.saveKey(provider, "SYNTHETIC-NEW")).resolves.toBe(true);
  expect(c.state.operations["key:opencode-go"].status).toBe("success");
  expect(c.state.quotas["opencode-go"]?.snapshot).toBeUndefined();
  c.dispose();
});

test("late quota results after hide, disconnect or a newer snapshot are ignored", async () => {
  let release: (value: unknown) => void = () => {};
  const c = new Controller({
    rpc: async (endpoint) => {
      if (endpoint === "snapshot")
        return fixtureSnapshot([fixtureCard("opencode-go")]);
      return new Promise((resolve) => (release = resolve));
    },
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  c.visibilityChanged(false);
  release(
    quotaFixture("opencode-go", [
      { id: "five-hour", usedPercent: 0, remainingPercent: 100 },
    ]),
  );
  await Promise.resolve();
  expect(c.state.quotas["opencode-go"]?.snapshot).toBeUndefined();
  c.dispose();
});

test("quota poll stops while hidden and only rereads expired cards when visible", async () => {
  vi.useFakeTimers();
  let reads = 0;
  const c = new Controller(
    {
      rpc: async (endpoint) => {
        if (endpoint === "snapshot")
          return fixtureSnapshot([fixtureCard("opencode-go")]);
        reads += 1;
        return quotaFixture(
          "opencode-go",
          [
            {
              id: "five-hour",
              usedPercent: reads,
              remainingPercent: Math.max(0, 100 - reads),
            },
          ],
          { fetchedAt: new Date().toISOString() },
        );
      },
      reveal: async () => ({ value: "", revealTTL: 1 }),
    },
    15000,
    60_000,
  );
  await c.load();
  await vi.advanceTimersByTimeAsync(1);
  expect(reads).toBe(1);
  c.visibilityChanged(false);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(reads).toBe(1);
  c.visibilityChanged(true);
  await vi.advanceTimersByTimeAsync(1);
  expect(reads).toBe(2);
  c.dispose();
  vi.useRealTimers();
});

test("malformed quota payloads never enter client state", async () => {
  const c = new Controller({
    rpc: async (endpoint) => {
      if (endpoint === "snapshot")
        return fixtureSnapshot([fixtureCard("opencode-go")]);
      return { status: "ready", windows: [{ id: "nope", usedPercent: 1 }] };
    },
    reveal: async () => ({ value: "", revealTTL: 1 }),
  });
  await c.load();
  await vi.waitFor(() =>
    expect(c.state.quotas["opencode-go"]?.status).toBe("error"),
  );
  expect(c.state.quotas["opencode-go"]?.snapshot).toBeUndefined();
  c.dispose();
});
