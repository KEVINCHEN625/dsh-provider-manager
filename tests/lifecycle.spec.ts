import { test, expect } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import * as plugin from "../src/host/index.js";
import { fixture } from "./fixtures/services.js";
const tick = () => new Promise((r) => setTimeout(r, 10));
test("real Cordis delayed DI and repeated mount dispose own one RPC and HTTP registration", async () => {
  const ctx = new Context();
  const f = fixture();
  for (const [name, value] of Object.entries(f.services))
    ctx.provide(name, value);
  const channels = new Map();
  const routes = new Map();
  const connection = {
    rpc: {
      handle: (name: string, handler: any) => {
        expect(channels.has(name)).toBe(false);
        channels.set(name, handler);
        return async () => {
          channels.delete(name);
        };
      },
    },
    requestRejection: () => undefined,
  };
  const webServer = {
    register: (route: any) => {
      expect(routes.has(route.path)).toBe(false);
      routes.set(route.path, route.handler);
      return () => routes.delete(route.path);
    },
  };
  const first = ctx.plugin(plugin);
  await tick();
  expect(channels.size).toBe(0);
  ctx.provide("connection", connection);
  ctx.provide("webServer", webServer);
  await tick();
  expect(channels.size).toBe(1);
  expect(routes.size).toBe(1);
  const handler = channels.get("/provider-manager");
  expect(
    await handler("reveal", {}, new AbortController().signal),
  ).toMatchObject({ ok: false, error: { code: "UNSUPPORTED" } });
  expect(
    await handler(
      "quota/read",
      { providerId: "commandcode" },
      new AbortController().signal,
    ),
  ).toMatchObject({
    ok: true,
    value: { status: "missing-credential", windows: [], stale: false },
  });
  expect(
    await handler(
      "login/start",
      { providerId: "openai-codex" },
      new AbortController().signal,
    ),
  ).toMatchObject({ ok: false, error: { code: "UNAVAILABLE" } });
  expect(plugin.inject).not.toContain("authorization");
  await first.dispose();
  expect(channels.size).toBe(0);
  expect(routes.size).toBe(0);
  expect(
    await handler("snapshot", {}, new AbortController().signal),
  ).toMatchObject({ ok: false });
  expect(
    await handler(
      "quota/read",
      { providerId: "commandcode" },
      new AbortController().signal,
    ),
  ).toMatchObject({ ok: false });
  const second = ctx.plugin(plugin);
  await tick();
  expect(channels.size).toBe(1);
  await second.dispose();
  expect(channels.size).toBe(0);
});
