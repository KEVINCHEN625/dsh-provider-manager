import { test, expect } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import { HostConnectionService } from "@deepseek-ai/dsh-client-connection";
import { WebServer } from "@deepseek-ai/dsh-host-webserver";
import * as manager from "../src/host/index.js";
import { fixture } from "./fixtures/services.js";

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
test("published scoped Connection registers and disposes prefix/exact routes", async () => {
  const ctx = new Context();
  for (const [name, value] of Object.entries(fixture().services))
    ctx.provide(name, value);
  const routes = new Map();
  ctx.provide("webServer", {
    register: (route: any) => {
      routes.set(route.path, route);
      return () => routes.delete(route.path);
    },
  });
  new HostConnectionService(ctx, [], { isAuthenticated: () => true } as any);
  const plugin = ctx.plugin(manager);
  await settle();
  expect([...routes.keys()]).toContain("/provider-manager");
  expect([...routes.keys()]).toContain("/provider-manager/reveal");
  await plugin.dispose();
  expect(routes.size).toBe(0);
});

test("real WebServer + Connection: authenticated snapshot, exact reveal, disposal and remount", async () => {
  const ctx = new Context();
  const f = fixture();
  for (const [name, value] of Object.entries(f.services))
    ctx.provide(name, value);
  let web = ctx.plugin(WebServer, { host: "127.0.0.1", port: 0 });
  await web;
  let authenticated = true;
  new HostConnectionService(ctx, [], {
    isAuthenticated: () => authenticated,
  } as any);
  let plugin = ctx.plugin(manager);
  await plugin;
  await settle();
  let origin = `http://127.0.0.1:${ctx.webServer.port}`;
  const request = (endpoint: string, payload: any, reveal = false) =>
    fetch(origin + "/provider-manager/" + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(
        reveal
          ? payload
          : {
              type: "client-request",
              rpcId: "test",
              method: endpoint,
              payload,
            },
      ),
    });
  try {
    const snapshot = await request("snapshot", {});
    expect(snapshot.status).toBe(200);
    const data = await snapshot.json();
    expect(data.result.ok).toBe(true);
    expect(JSON.stringify(data)).not.toContain("SENTINEL");
    const quota = await request("quota/read", { providerId: "commandcode" });
    expect(quota.status).toBe(200);
    const quotaBody = await quota.json();
    expect(quotaBody.result).toMatchObject({
      ok: true,
      value: {
        providerId: "commandcode",
        status: "missing-credential",
        windows: [],
        stale: false,
      },
    });
    expect(JSON.stringify(quotaBody)).not.toContain("SYNTHETIC");
    expect(data.result.value.providers.some((item: { id: string }) => item.id === "opencode-go")).toBe(false);
    const provider = data.result.value.providers.find(
      (item: { id: string }) => item.id === "provider-manager-opencode-go",
    );
    expect(provider?.bindingToken).toEqual(expect.any(String));
    const binding = {
      providerId: provider.id,
      bindingToken: provider.bindingToken,
    };
    const reveal = await request("reveal", binding, true);
    expect(reveal.status).toBe(200);
    expect(reveal.headers.get("cache-control")).toBe("no-store");
    expect(await reveal.json()).toMatchObject({
      value: "SYNTHETIC",
      source: "file",
    });
    const get = await fetch(origin + "/provider-manager/reveal", {
      headers: { Origin: origin },
    });
    expect(get.status).toBe(405);
    expect(get.headers.get("cache-control")).toBe("no-store");
    for (const endpoint of ["snapshot", "reveal"]) {
      const forbidden = await fetch(origin + "/provider-manager/" + endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.example",
        },
        body: "{}",
      });
      expect(forbidden.status).toBe(403);
      if (endpoint === "reveal")
        expect(forbidden.headers.get("cache-control")).toBe("no-store");
    }
    authenticated = false;
    expect((await request("snapshot", {})).status).toBe(401);
    const denied = await request("reveal", binding, true);
    expect(denied.status).toBe(401);
    expect(denied.headers.get("cache-control")).toBe("no-store");
    authenticated = true;
    await plugin.dispose();
    expect((await request("snapshot", {})).status).toBe(404);
    plugin = ctx.plugin(manager);
    await plugin;
    await settle();
    expect((await (await request("snapshot", {})).json()).result.ok).toBe(true);
    expect((await request("reveal", binding, true)).status).toBe(409);
    const oldServer = ctx.webServer;
    await web.dispose();
    await settle();
    // Duplicate registration would throw if the manager retained either old route.
    for (const route of [
      { kind: "prefix" as const, path: "/provider-manager" },
      { kind: "exact" as const, path: "/provider-manager/reveal" },
    ]) {
      const remove = oldServer.register({ ...route, handler: () => {} });
      remove();
    }
    web = ctx.plugin(WebServer, { host: "127.0.0.1", port: 0 });
    await web;
    await settle();
    origin = `http://127.0.0.1:${ctx.webServer.port}`;
    expect((await (await request("snapshot", {})).json()).result.ok).toBe(true);
  } finally {
    await plugin.dispose();
    await web.dispose();
  }
});
