import { test, expect } from "vitest";
import http from "node:http";
import { createRevealHandler } from "../src/host/http.js";
async function server(manager: any, timeout = 1000) {
  const lifetime = new AbortController();
  const s = http.createServer(
    createRevealHandler(
      manager,
      (req) => (req.headers.cookie === "synthetic-auth" ? undefined : 401),
      lifetime.signal,
      timeout,
    ),
  );
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as any).port;
  return {
    s,
    port,
    lifetime,
    close: () =>
      new Promise<void>((r) => {
        s.closeAllConnections();
        s.close(() => r());
      }),
  };
}
function req(port: number) {
  return {
    host: "127.0.0.1",
    port,
    path: "/provider-manager/reveal",
    method: "POST",
    headers: {
      Origin: `http://127.0.0.1:${port}`,
      "Content-Type": "application/json",
      Cookie: "synthetic-auth",
    },
  };
}
test("real node body close is not treated as disconnect before async resolution", async () => {
  const f = await server({
    reveal: async () => {
      await new Promise((r) => setTimeout(r, 10));
      return { value: "SYNTHETIC", source: "file" };
    },
  });
  try {
    const result = await new Promise<any>((resolve, reject) => {
      const r = http.request(req(f.port), (res) => {
        let body = "";
        res.on("data", (x) => (body += x));
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, body }),
        );
      });
      r.on("error", reject);
      r.end("{}");
    });
    expect(result.status).toBe(200);
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(JSON.parse(result.body).value).toBe("SYNTHETIC");
  } finally {
    await f.close();
  }
});
test("slow unfinished body times out and releases connection", async () => {
  const f = await server(
    {
      reveal: async () => {
        throw Error("should not resolve");
      },
    },
    20,
  );
  try {
    const result = await new Promise<number | undefined>((resolve, reject) => {
      const r = http.request(req(f.port), (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      });
      r.on("error", reject);
      r.write("{");
      setTimeout(() => {
        r.destroy();
        reject(Error("timeout did not terminate request"));
      }, 250).unref();
    });
    expect(result).toBe(503);
  } finally {
    await f.close();
  }
});

test("second Go key uses strict HTTP with fixed slot whitelist and no-store", async () => {
  const { Manager } = await import("../src/host/providers.js");
  const { fixture } = await import("./fixtures/services.js");
  const services = fixture();
  services.values.set("OPENCODE_API_KEY_2", "synthetic-second");
  const f = await server(new Manager(services.services));
  const send = async (payload: any, origin?: string) =>
    new Promise<any>((resolve, reject) => {
      const options = req(f.port);
      if (origin !== undefined) options.headers.Origin = origin;
      const r = http.request(options, (res) => {
        let body = "";
        res.on("data", (x) => (body += x));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            body: JSON.parse(body),
            headers: res.headers,
          }),
        );
      });
      r.on("error", reject);
      r.end(JSON.stringify(payload));
    });
  try {
    const allowed = {
      providerId: "provider-manager-opencode-go",
      keySlot: "second",
    };
    const result = await send(allowed);
    expect(result.status).toBe(200);
    expect(result.body.value).toBe("synthetic-second");
    expect(result.headers["cache-control"]).toBe("no-store");
    for (const invalid of [
      { ...allowed, ref: "ANY_SECRET" },
      { ...allowed, providerId: "commandcode" },
      { ...allowed, keySlot: "primary" },
    ])
      expect((await send(invalid)).status).toBe(400);
    expect((await send(allowed, "https://foreign.test")).status).toBe(403);
  } finally {
    await f.close();
  }
});
