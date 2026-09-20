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
