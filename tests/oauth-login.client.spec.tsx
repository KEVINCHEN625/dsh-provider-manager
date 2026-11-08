// @vitest-environment jsdom
import React, { useSyncExternalStore } from "react";
import { afterEach, expect, test, vi } from "vitest";
import {
  render,
  fireEvent,
  screen,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import { Controller } from "../src/client/controller.js";
import { OAuthDetails } from "../src/client/OAuthDetails.js";
import { en } from "../src/client/locales.js";
const entry: any = {
  providerId: "openai-codex",
  label: "Codex",
  configured: false,
  inFlight: false,
  methods: [
    { id: "oauth", label: "OAuth" },
    { id: "api-key", label: "API key" },
  ],
};
const notice = (index = 0, url = "https://auth.example.test/login") => ({
  index,
  kind: "notice",
  message: "Authorize",
  url,
  code: "CODE",
});
const response = (events: any[] = [], status = "running", result?: string) => ({
  events,
  status,
  nextIndex: events.length,
  ...(result ? { result } : {}),
});
const controllers: Controller[] = [];
afterEach(() => {
  cleanup();
  for (const c of controllers) c.dispose();
  controllers.length = 0;
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function setup(current = entry) {
  let resolveStart!: (v: any) => void;
  let events: any = response([notice()]);
  const rpc = vi.fn(async (e: string) =>
    e === "login/start"
      ? new Promise((r) => (resolveStart = r))
      : e === "login/events"
        ? events
        : e === "oauth/catalog"
          ? {
              providerId: current.providerId,
              source: "snapshot",
              specSource: "snapshot",
              route: "missing",
              models: [],
            }
          : {},
  );
  const c = new Controller(
    { rpc, reveal: async () => ({ value: "", revealTTL: 1 }) },
    15000,
    300000,
    60000,
  );
  controllers.push(c);
  const popup = {
    opener: {},
    location: { href: "about:blank", replace: vi.fn() },
    close: vi.fn(),
    closed: false,
  };
  const open = vi.spyOn(window, "open").mockReturnValue(popup as any);
  function Page({ value = current }: { value?: any }) {
    const state = useSyncExternalStore(c.subscribe, c.getSnapshot);
    return (
      <OAuthDetails
        entry={value}
        controller={c}
        state={state}
        t={(key) => en[key]}
        onClose={() => {}}
      />
    );
  }
  const ui = render(<Page />);
  return {
    c,
    rpc,
    popup,
    open,
    Page,
    ...ui,
    start: () =>
      fireEvent.click(screen.getByRole("button", { name: en.loginStart })),
    resolve: () => resolveStart({ sessionId: "new" }),
    events: (value: any) => (events = value),
    poll: () =>
      act(async () => {
        await (c as any).pollLogin();
      }),
  };
}
test("preopens synchronously with isolated opener then navigates once for this session", async () => {
  const f = setup();
  f.start();
  expect(f.open).toHaveBeenCalledTimes(1);
  expect(f.popup.opener).toBeNull();
  expect(f.popup.location.replace).not.toHaveBeenCalled();
  await act(async () => f.resolve());
  await waitFor(() =>
    expect(f.popup.location.replace).toHaveBeenCalledWith(
      "https://auth.example.test/login",
    ),
  );
  f.events(
    response([notice(0), notice(1, "https://auth.example.test/another")]),
  );
  await f.poll();
  expect(f.popup.location.replace).toHaveBeenCalledTimes(1);
  f.unmount();
  expect(f.popup.close).not.toHaveBeenCalled();
});
test("API key never preopens, no-URL prompt closes only its reserved blank", async () => {
  const f = setup();
  fireEvent.change(screen.getByLabelText(en.loginMethod), {
    target: { value: "api-key" },
  });
  f.start();
  expect(f.open).not.toHaveBeenCalled();
  f.events({
    ...response([], "awaiting-prompt"),
    pendingPrompt: {
      kind: "prompt",
      promptKind: "secret",
      seq: 1,
      message: "Key",
    },
  });
  await act(async () => f.resolve());
});
test.each(["done", "prompt", "unmount", "switch"])(
  "%s closes an unused blank without consuming stale notices",
  async (mode) => {
    const f = setup();
    f.start();
    if (mode === "unmount") {
      f.unmount();
      expect(f.popup.close).toHaveBeenCalledTimes(1);
      return;
    }
    if (mode === "switch") {
      f.rerender(<f.Page value={{ ...entry, providerId: "other" }} />);
      expect(f.popup.close).toHaveBeenCalledTimes(1);
      return;
    }
    f.events(
      mode === "done"
        ? response([notice()], "done", "cancelled")
        : {
            ...response([], "awaiting-prompt"),
            pendingPrompt: {
              kind: "prompt",
              promptKind: "text",
              seq: 1,
              message: "Code",
            },
          },
    );
    await act(async () => f.resolve());
    await waitFor(() => expect(f.popup.close).toHaveBeenCalledTimes(1));
    expect(f.popup.location.replace).not.toHaveBeenCalled();
    expect(screen.queryByText("CODE")).toBeNull();
  },
);
test("blocked popup keeps independent URL/code copy controls; completion clears secrets", async () => {
  const f = setup();
  f.open.mockReturnValue(null);
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  f.start();
  await act(async () => f.resolve());
  await screen.findByText("CODE");
  fireEvent.click(screen.getByRole("button", { name: "Copy sign-in URL" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Sign-in URL copied" }),
    ).toBeTruthy(),
  );
  expect(screen.getByRole("button", { name: "Copy code" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith("CODE"));
  f.events(response([notice()], "done", "cancelled"));
  await f.poll();
  expect(screen.queryByText("CODE")).toBeNull();
  expect(
    screen.queryByRole("link", { name: "https://auth.example.test/login" }),
  ).toBeNull();
});
test("Muse quota is a sign-in snapshot before models without refresh", async () => {
  const f = setup({
    ...entry,
    providerId: "muse",
    builtin: true,
    configured: true,
    quota: {
      status: "ready",
      windows: [{ id: "weekly", remainingPercent: 60 }],
    },
    quotaFetchedAt: "2026-11-08T00:00:00.000Z",
  });
  const heading = await screen.findByRole("heading", {
    name: "Quota at sign-in",
  });
  const models = screen.getByRole("heading", { name: en.models });
  expect(
    heading.compareDocumentPosition(models) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Refresh quota/ })).toBeNull();
  expect(screen.getByText(/2026-11-08/)).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "View usage on Meta" })
      .getAttribute("href"),
  ).toBe("https://dev.meta.ai/usage");
  f.unmount();
});

test.each(["github-copilot", "muse"])(
  "shared opener consumes dynamic notice for %s",
  async (providerId) => {
    const f = setup({
      ...entry,
      providerId,
      methods: [{ id: "device", label: "Device" }],
    });
    f.events(response([notice(0, "http://localhost:12345/device")]));
    f.start();
    await act(async () => f.resolve());
    await waitFor(() =>
      expect(f.popup.location.replace).toHaveBeenCalledWith(
        "http://localhost:12345/device",
      ),
    );
  },
);
test("reservation expires without reopening on a later notice", async () => {
  vi.useFakeTimers();
  const f = setup();
  f.events(response());
  f.start();
  await act(async () => f.resolve());
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(f.popup.close).toHaveBeenCalledTimes(1);
  f.events(response([notice()]));
  await f.poll();
  expect(f.popup.location.replace).not.toHaveBeenCalled();
  expect(f.open).toHaveBeenCalledTimes(1);
});
test("copy failure is explicit and independent of successful code copy", async () => {
  const f = setup();
  f.open.mockReturnValue(null);
  const writeText = vi.fn(async (value: string) => {
    if (value.startsWith("http")) throw Error("denied");
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  f.start();
  await act(async () => f.resolve());
  await screen.findByText("CODE");
  fireEvent.click(screen.getByRole("button", { name: "Copy sign-in URL" }));
  await screen.findByText("Copy failed. Select and copy the text manually.");
  fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
  await screen.findByRole("button", { name: "Code copied" });
  expect(screen.getByRole("button", { name: "Copy sign-in URL" })).toBeTruthy();
});
test.each(["ok", "failed", "cancelled"])(
  "terminal %s removes code and URL while retaining status",
  async (result) => {
    const f = setup();
    f.start();
    await act(async () => f.resolve());
    await screen.findByText("CODE");
    f.events(response([notice()], "done", result));
    await f.poll();
    expect(screen.queryByText("CODE")).toBeNull();
    expect(screen.queryByRole("link", { name: /auth.example/ })).toBeNull();
    expect(
      screen.getByText(
        result === "ok"
          ? en.loginSuccess
          : result === "failed"
            ? en.loginFailed
            : en.loginCancelled,
      ),
    ).toBeTruthy();
    expect(f.popup.close).not.toHaveBeenCalled();
  },
);
test("old start completion must not bind a new same-provider session", async () => {
  const f = setup();
  f.start();
  const old = f.resolve;
  // External start invalidates the first request while its response is pending.
  let resolveNew!: (v: any) => void;
  f.rpc.mockImplementation(async (e: string) =>
    e === "login/start"
      ? new Promise((r) => (resolveNew = r))
      : e === "login/events"
        ? response([notice(0, "https://auth.example.test/new-session")])
        : {},
  );
  const next = f.c.loginStart(entry.providerId, "oauth");
  await act(async () => {
    resolveNew({ sessionId: "other-session" });
    await next;
  });
  await act(async () => old());
  expect(f.popup.location.replace).not.toHaveBeenCalled();
  expect(f.popup.close).toHaveBeenCalledTimes(1);
});
test("a different session closes an unused reservation without navigating its notices", async () => {
  const f = setup();
  f.events(response());
  f.start();
  await act(async () => f.resolve());
  await act(async () => {
    (f.c as any).update({
      login: {
        providerId: entry.providerId,
        sessionId: "foreign",
        phase: "running",
        events: [notice()],
        nextIndex: 1,
      },
    });
  });
  expect(f.popup.location.replace).not.toHaveBeenCalled();
  expect(f.popup.close).toHaveBeenCalledTimes(1);
});
test("Muse without quota has honest missing-data text and no refresh or invented percentage", async () => {
  setup({ ...entry, providerId: "muse", builtin: true, configured: true });
  await screen.findByRole("heading", { name: "Quota at sign-in" });
  expect(screen.getByText(/Meta did not return/)).toBeTruthy();
  expect(screen.queryByRole("progressbar")).toBeNull();
  expect(screen.queryByRole("button", { name: /Refresh quota/ })).toBeNull();
});

test("user-navigated or closed reserved tabs are not overwritten", async () => {
  const f = setup();
  f.start();
  f.popup.location.href = "https://user.example.test";
  await act(async () => f.resolve());
  expect(f.popup.location.replace).not.toHaveBeenCalled();
  expect(f.popup.close).not.toHaveBeenCalled();
});
test.each(["loading", "error"])(
  "OAuth quota %s renders even before an entry quota exists",
  async (status) => {
    const f = setup();
    await act(async () => {
      (f.c as any).update({
        operations: {
          ["oauth-quota:" + entry.providerId]: { status, error: "UNAVAILABLE" },
        },
      });
    });
    if (status === "loading")
      expect(screen.getByText(en.quotaLoading)).toBeTruthy();
    else
      expect(
        screen.getByRole("button", { name: `${en.quotaRefresh}: Codex` }),
      ).toBeTruthy();
  },
);

test("Muse compact card labels its quota as a sign-in snapshot", async () => {
  const { OAuthCard } = await import("../src/client/OAuthCard.js");
  render(
    <OAuthCard
      entry={{
        ...entry,
        providerId: "muse",
        builtin: true,
        configured: true,
        quota: {
          status: "ready",
          windows: [{ id: "weekly", remainingPercent: 70 }],
        },
      }}
      t={(key) => en[key]}
      onOpen={() => {}}
    />,
  );
  expect(screen.getByText("Quota at sign-in")).toBeTruthy();
});

test("Retry reserves a fresh tab and never reuses completed-session notices", async () => {
  const f = setup();
  f.start();
  await act(async () => f.resolve());
  await screen.findByText("CODE");
  f.events(response([notice()], "done", "failed"));
  await f.poll();
  const popup = {
    opener: {},
    closed: false,
    close: vi.fn(),
    location: { href: "about:blank", replace: vi.fn() },
  };
  f.open.mockReturnValue(popup as any);
  f.events(response());
  fireEvent.click(screen.getByRole("button", { name: en.loginRetry }));
  expect(f.open).toHaveBeenCalledTimes(2);
  expect(popup.opener).toBeNull();
  expect(popup.location.replace).not.toHaveBeenCalled();
  await act(async () => f.resolve());
  expect(popup.location.replace).not.toHaveBeenCalled();
});
test("closed reservation and invalid notice URLs never auto-navigate", async () => {
  const f = setup();
  f.start();
  f.popup.closed = true;
  f.events(response([notice(0, "https://user:secret@example.test")]));
  await act(async () => f.resolve());
  expect(f.popup.location.replace).not.toHaveBeenCalled();
  expect(screen.queryByRole("link", { name: /user:secret/ })).toBeNull();
  f.events(response([notice()]));
  await f.poll();
  expect(f.popup.location.replace).not.toHaveBeenCalled();
});
