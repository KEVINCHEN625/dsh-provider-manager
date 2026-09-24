import { expect, test } from "vitest";
import { AuthorizationDeclinedError } from "@deepseek-ai/dsh-authorization";
import type { AuthorizationSession } from "@deepseek-ai/dsh-authorization";
import { sanitizeMuseWire } from "../src/host/opencode/policies/responses.js";
import { runMuseDeviceFlow } from "../src/host/muse/device.js";

test("device flow stops when the page cancels at the verification url", async () => {
  const attempt = new AbortController();
  const notices: { url?: string; code?: string }[] = [];
  const session = {
    signal: attempt.signal,
    method: "device",
    notify: (notice: { url?: string; code?: string }) => {
      notices.push(notice);
      attempt.abort();
    },
    prompt: async () => "",
  } as AuthorizationSession;
  await expect(
    runMuseDeviceFlow(session, {
      fetch: async () =>
        Response.json({
          device_code: "device-secret",
          user_code: "ABCD-EFGH",
          verification_uri_complete: "https://auth.meta.com/activate",
          expires_in: 900,
          interval: 5,
        }),
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(notices).toEqual([
    {
      message: "Open the Muse page and enter the code.",
      url: "https://auth.meta.com/activate",
      code: "ABCD-EFGH",
    },
  ]);
  expect(JSON.stringify(notices)).not.toContain("device-secret");
});

test("access denied ends the device flow as a decline", async () => {
  let calls = 0;
  const session = {
    signal: new AbortController().signal,
    method: "device",
    notify: () => {},
    prompt: async () => "",
  } as AuthorizationSession;
  await expect(
    runMuseDeviceFlow(session, {
      wait: async () => {},
      fetch: async () => {
        calls += 1;
        if (calls === 1)
          return Response.json({
            device_code: "device-secret",
            user_code: "ABCD",
            verification_uri_complete: "https://auth.meta.com/activate",
            interval: 5,
          });
        return Response.json({ error: "access_denied" });
      },
    }),
  ).rejects.toBeInstanceOf(AuthorizationDeclinedError);
});

test("muse responses wire drops encrypted reasoning", () => {
  expect(
    sanitizeMuseWire({
      include: ["reasoning.encrypted_content", "message"],
      input: [{ type: "reasoning" }, { type: "message", text: "hi" }],
    }),
  ).toEqual({
    include: ["message"],
    input: [{ type: "message", text: "hi" }],
  });
});
