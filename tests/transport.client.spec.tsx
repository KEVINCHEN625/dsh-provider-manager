import { test, expect, vi } from "vitest";
import { createTransport } from "../src/client/transport.js";
test("reveal POST is same-origin no-store and RPC unwraps safe failures", async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          value: "SYNTHETIC",
          source: "file",
          revealTTL: 30000,
        }),
      ),
  );
  const call = vi.fn(async () => ({
    ok: false as const,
    error: { code: "CONFLICT", message: "private", details: {} },
  }));
  const transport = createTransport({ call }, fetcher);
  const abort = new AbortController();
  expect(
    await transport.reveal(
      { providerId: "x", bindingToken: "t" },
      abort.signal,
    ),
  ).toEqual({ value: "SYNTHETIC", source: "file", revealTTL: 30000 });
  expect(fetcher.mock.calls[0]).toEqual([
    "/provider-manager/reveal",
    expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal: abort.signal,
    }),
  ]);
  await expect(transport.rpc("snapshot", {})).rejects.toEqual({
    code: "CONFLICT",
  });
});
