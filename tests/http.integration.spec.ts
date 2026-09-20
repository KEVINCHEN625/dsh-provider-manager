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
