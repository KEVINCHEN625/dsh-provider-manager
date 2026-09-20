import { test, expect } from "vitest";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import { createRevealHandler, loopback } from "../src/host/http.js";
async function request(overrides: any = {}, reject: any = () => undefined) {
  const req: any = Readable.from([overrides.body ?? "{}"]);
  Object.assign(
    req,
    {
      method: "POST",
      url: "/provider-manager/reveal",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      socket: { remoteAddress: "127.0.0.1", localPort: 3000 },
    },
    overrides,
  );
  const res: any = new EventEmitter();
  res.headers = {};
  res.setHeader = (k: string, v: string) => (res.headers[k] = v);
  res.end = (body: string) => {
    res.body = body;
    res.writableEnded = true;
  };
  await createRevealHandler(
    { reveal: async () => ({ value: "SYNTHETIC" }) } as any,
    reject,
    new AbortController().signal,
  )(req, res);
  expect(res.headers["Cache-Control"]).toBe("no-store");
  return res;
}
test.each(["127.0.0.1", "127.3.2.1", "::1", "::ffff:127.0.0.1"])(
  "accepts real loopback %s",
  async (address) => {
    expect(loopback(address)).toBe(true);
    expect(
      (await request({ socket: { remoteAddress: address, localPort: 3000 } }))
        .statusCode,
    ).toBe(200);
  },
);
test.each([
  {},
  { origin: "null" },
  { origin: "https://evil.example" },
  { origin: "http://localhost:3000", "content-type": "text/plain" },
])("origin/content validation no-store %j", async (headers) => {
  const r = await request({ headers: { host: "localhost:3000", ...headers } });
  expect([403, 415]).toContain(r.statusCode);
});
test("auth/socket/forwarded/query/method/body all rejected no-store", async () => {
  expect((await request({}, () => 401)).statusCode).toBe(401);
  for (const socket of [{ remoteAddress: "10.0.0.1", localPort: 3000 }, {}])
    expect(
      (
        await request({
          socket,
          headers: {
            host: "localhost:3000",
            origin: "http://localhost:3000",
            "x-forwarded-for": "127.0.0.1",
          },
        })
      ).statusCode,
    ).toBe(403);
  expect((await request({ method: "GET" })).statusCode).toBe(405);
  expect(
    (await request({ url: "/provider-manager/reveal?token=x" })).statusCode,
  ).toBe(400);
  expect((await request({ body: "x".repeat(4097) })).statusCode).toBe(413);
});
test("missing socket returns forbidden, safe fixed error", async () => {
  const r = await request({ socket: undefined });
  expect(r.statusCode).toBe(403);
  expect(r.body).not.toContain("TypeError");
});
test("plugin disposal prevents pending resolve writing response", async () => {
  let resolve: any;
  const req: any = Readable.from(["{}"]);
  Object.assign(req, {
    method: "POST",
    url: "/provider-manager/reveal",
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    socket: { remoteAddress: "127.0.0.1", localPort: 3000 },
  });
  const res: any = new EventEmitter();
  res.setHeader = () => {};
  res.destroy = () => {
    res.destroyed = true;
  };
  res.end = () => {
    res.writableEnded = true;
  };
  const lifetime = new AbortController();
  const task = createRevealHandler(
    { reveal: () => new Promise((r) => (resolve = r)) } as any,
    () => undefined,
    lifetime.signal,
  )(req, res);
  while (!resolve) await new Promise((r) => setImmediate(r));
  lifetime.abort();
  resolve({ value: "SYNTHETIC" });
  await task;
  expect(res.writableEnded).not.toBe(true);
});
test("timeout settles handler even when credential resolution never settles", async () => {
  const req: any = Readable.from(["{}"]);
  Object.assign(req, {
    method: "POST",
    url: "/provider-manager/reveal",
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    socket: { remoteAddress: "127.0.0.1", localPort: 3000 },
  });
  const res: any = new EventEmitter();
  res.setHeader = () => {};
  res.end = () => {
    res.writableEnded = true;
    res.emit("finish");
  };
  let rejectResolve: any;
  const lifetime = new AbortController();
  const task = createRevealHandler(
    {
      reveal: () => new Promise((_, reject) => (rejectResolve = reject)),
    } as any,
    () => undefined,
    lifetime.signal,
    10,
  )(req, res);
  const result = await Promise.race([
    task.then(() => true),
    new Promise((r) => setTimeout(() => r(false), 80)),
  ]);
  expect(result).toBe(true);
  expect(req.listenerCount("aborted")).toBe(0);
  expect(res.listenerCount("close")).toBe(0);
  rejectResolve(Error("late synthetic rejection"));
  await new Promise((r) => setImmediate(r));
});
test.each(["dispose", "disconnect"])(
  "%s releases a handler whose resolver never settles",
  async (mode) => {
    const req: any = Readable.from(["{}"]);
    Object.assign(req, {
      method: "POST",
      url: "/provider-manager/reveal",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      socket: { remoteAddress: "127.0.0.1", localPort: 3000 },
    });
    const res: any = new EventEmitter();
    res.setHeader = () => {};
    res.end = () => {
      throw Error("must not write after cancellation");
    };
    res.destroy = () => {
      res.destroyed = true;
      res.emit("close");
    };
    const lifetime = new AbortController();
    let rejectResolve: any;
    const task = createRevealHandler(
      {
        reveal: () => new Promise((_, reject) => (rejectResolve = reject)),
      } as any,
      () => undefined,
      lifetime.signal,
    )(req, res);
    while (!rejectResolve) await new Promise((r) => setImmediate(r));
    if (mode === "dispose") lifetime.abort();
    else res.destroy();
    expect(
      await Promise.race([
        task.then(() => true),
        new Promise((r) => setTimeout(() => r(false), 80)),
      ]),
    ).toBe(true);
    expect(res.listenerCount("close")).toBe(0);
    expect(req.listenerCount("aborted")).toBe(0);
    rejectResolve(Error("late synthetic"));
    await new Promise((r) => setImmediate(r));
  },
);
