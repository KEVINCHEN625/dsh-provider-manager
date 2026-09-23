import { test, expect } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import * as plugin from "../src/host/index.js";
import * as oauth from "../src/host/oauth-entry.js";
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
  ).toMatchObject({ ok: false, error: { code: "UNSUPPORTED" } });
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

test("oauth row stays unwired without authorization and the main plugin still mounts", async () => {
  expect(oauth.inject).toEqual(["credentials"]);
  expect(plugin.inject).not.toContain("authorization");
  const ctx = new Context();
  const f = fixture();
  f.services.credentials.describeRecord = async () => ({ configured: false });
  f.services.credentials.readRecord = async () => undefined;
  f.services.credentials.deleteRecord = async () => {};
  for (const [name, value] of Object.entries(f.services))
    ctx.provide(name, value);
  const channels = new Map();
  ctx.provide("connection", {
    rpc: {
      handle: (name: string, handler: any) => {
        channels.set(name, handler);
        return async () => {
          channels.delete(name);
        };
      },
    },
    requestRejection: () => undefined,
  });
  ctx.provide("webServer", { register: () => () => {} });
  const main = ctx.plugin(plugin);
  const side = ctx.plugin(oauth, { mountService: false });
  await tick();
  expect(channels.has("/provider-manager")).toBe(true);
  expect(channels.has("/provider-manager-oauth")).toBe(false);
  expect(
    await channels.get("/provider-manager")(
      "snapshot",
      {},
      new AbortController().signal,
    ),
  ).toMatchObject({ ok: true, value: { oauth: [] } });
  ctx.provide("authorization", {
    list: () => [],
    describe: () => undefined,
    begin: async () => ({ status: "cancelled" }),
    cancel: () => {},
  });
  await tick();
  expect(channels.has("/provider-manager-oauth")).toBe(true);
  await side.dispose();
  await main.dispose();
  expect(channels.size).toBe(0);
});

test("oauth channel stays unwired until webServer is present", async () => {
  const ctx = new Context();
  const f = fixture();
  f.services.credentials.describeRecord = async () => ({ configured: false });
  f.services.credentials.readRecord = async () => undefined;
  f.services.credentials.deleteRecord = async () => {};
  for (const [name, value] of Object.entries(f.services))
    ctx.provide(name, value);
  const channels = new Map();
  ctx.provide("connection", {
    rpc: {
      handle: (name: string, handler: any) => {
        channels.set(name, handler);
        return async () => {
          channels.delete(name);
        };
      },
    },
    requestRejection: () => undefined,
  });
  ctx.provide("authorization", {
    list: () => [],
    describe: () => undefined,
    begin: async () => ({ status: "cancelled" }),
    cancel: () => {},
  });
  const side = ctx.plugin(oauth, { mountService: false });
  await tick();
  expect(channels.has("/provider-manager-oauth")).toBe(false);
  ctx.provide("webServer", { register: () => () => {} });
  await tick();
  expect(channels.has("/provider-manager-oauth")).toBe(true);
  await side.dispose();
});
