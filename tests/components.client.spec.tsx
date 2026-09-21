// @vitest-environment jsdom
import React from "react";
import { afterEach, test, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { Controller } from "../src/client/controller.js";
import { ProviderManager } from "../src/client/ProviderManager.js";
import { en, zh } from "../src/client/locales.js";
afterEach(cleanup);
const provider = {
  id: "opencode-go",
  name: "OpenCode Go",
  available: true,
  revision: 1,
  bindingToken: "test",
  credential: { configured: true, writable: true, source: "env" },
  models: [{ id: "fixture-model" }],
};
const snapshot = {
  providers: [provider],
  customRevision: 1,
  settingsWritable: true,
  muse: {
    installed: false,
    status: "CLI_ONLY",
    docs: "https://dev.meta.ai/docs/muse-code/subscriptions",
  },
};
function setup(dict = en, rpc: any = async () => snapshot) {
  const c = new Controller({
    rpc: async (endpoint: string, payload: any) => {
      if (endpoint === "quota/read")
        return {
          providerId: payload?.providerId || provider.id,
          status: "unsupported",
          windows: [],
          stale: false,
        };
      return rpc(endpoint, payload);
    },
    reveal: async () => ({
      value: "SYNTHETIC",
      source: "env",
      revealTTL: 30000,
    }),
  });
  const ui = render(
    <ProviderManager createController={() => c} t={(key) => dict[key]} />,
  );
  return { c, ...ui };
}
async function openAdd(dict = en) {
  fireEvent.click(
    await screen.findByRole("button", { name: dict.addProvider }),
  );
}
async function openDetails(name = "OpenCode Go", dict = en) {
  fireEvent.click(
    await screen.findByRole("button", {
      name: `${dict.details}: ${name}`,
    }),
  );
}
test("read failure has retry, then catalog and source; custom draft survives reload", async () => {
  let fail = true;
  const { c } = setup(en, async () => {
    if (fail) throw Error("private");
    return snapshot;
  });
  await screen.findByRole("button", { name: "Retry" });
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText("OpenCode Go");
  await openDetails();
  await screen.findByText("fixture-model");
  expect(screen.getByText("env")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: en.back }));
  await openAdd();
  fireEvent.change(screen.getByLabelText("Route"), {
    target: { value: "draft-route" },
  });
  await c.load();
  expect((screen.getByLabelText("Route") as HTMLInputElement).value).toBe(
    "draft-route",
  );
  fireEvent.click(screen.getByRole("button", { name: en.closeForm }));
  expect(screen.getByText("CLI not detected")).toBeTruthy();
});
test("reveal and replacement input clear on blur, visibility and unmount", async () => {
  const { c, unmount } = setup();
  await openDetails();
  fireEvent.click(screen.getByRole("button", { name: "Show key" }));
  await screen.findByDisplayValue("SYNTHETIC");
  fireEvent(window, new Event("blur"));
  expect(screen.queryByDisplayValue("SYNTHETIC")).toBeNull();
  const input = screen.getByLabelText("New key");
  fireEvent.change(input, { target: { value: "NEW-SYNTHETIC" } });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "hidden",
  });
  fireEvent(document, new Event("visibilitychange"));
  expect((input as HTMLInputElement).value).toBe("");
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  fireEvent.click(screen.getByRole("button", { name: "Show key" }));
  await screen.findByDisplayValue("SYNTHETIC");
  unmount();
  expect(c.state.revealed).toBeUndefined();
});
test("Chinese labels readable and failure does not claim zero models", async () => {
  setup(zh, async () => ({
    ...snapshot,
    providers: [{ ...provider, models: [], catalogError: "UNAVAILABLE" }],
  }));
  await screen.findByText("OpenCode Go");
  await openAdd(zh);
  expect(screen.getByRole("group", { name: "模型" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: zh.closeForm }));
  await openDetails("OpenCode Go", zh);
  expect(screen.getByText("模型目录暂不可用")).toBeTruthy();
  expect(screen.queryByText("0 models")).toBeNull();
});
test("config conflict and key success remain independent; inputs are labeled", async () => {
  const calls: any[] = [];
  setup(en, async (endpoint: any, payload: any) => {
    calls.push([endpoint, payload]);
    if (endpoint === "provider/save") throw { code: "CONFLICT" };
    if (endpoint === "credential/set") return provider.credential;
    return snapshot;
  });
  await openDetails();
  fireEvent.change(screen.getByLabelText("New key"), {
    target: { value: "NEW-SYNTHETIC" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save key" }));
  await screen.findByText("Key saved");
  fireEvent.click(screen.getByRole("button", { name: en.back }));
  await openAdd();
  for (const [label, value] of [
    ["Name", "Demo"],
    ["Route", "demo"],
    ["Base URL", "https://example.test/v1"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.change(screen.getByLabelText("Model ID 1"), {
    target: { value: "alpha" },
  });
  fireEvent.click(screen.getByRole("button", { name: en.addModel }));
  fireEvent.change(screen.getByLabelText("Model ID 2"), {
    target: { value: "beta" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));
  await screen.findByText(en.CONFLICT);
  expect((screen.getByLabelText("Route") as HTMLInputElement).value).toBe(
    "demo",
  );
  expect(calls.find((x) => x[0] === "provider/save")[1].models).toEqual([
    { id: "alpha", contextWindow: 262144 },
    { id: "beta", contextWindow: 262144 },
  ]);
});
test("credential permission failure does not hide a successfully read model count", async () => {
  setup(en, async () => ({
    ...snapshot,
    providers: [{ ...provider, error: "REF_NOT_ALLOWED" }],
  }));
  await openDetails();
  await screen.findByText("fixture-model");
  expect(screen.getByText("1 models")).toBeTruthy();
  expect(screen.queryByText("Model catalog unavailable")).toBeNull();
});
test("new provider resets an existing unsaved new form visibly", async () => {
  setup();
  await screen.findByText("OpenCode Go");
  await openAdd();
  fireEvent.change(screen.getByLabelText("Route"), {
    target: { value: "old-draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: en.closeForm }));
  fireEvent.click(screen.getByRole("button", { name: en.addProvider }));
  expect((screen.getByLabelText("Route") as HTMLInputElement).value).toBe(
    "old-draft",
  );
});
test("unreadable credential status is unknown rather than reported absent", async () => {
  setup(en, async () => ({
    ...snapshot,
    providers: [
      { ...provider, credential: undefined, error: "REF_NOT_ALLOWED" },
    ],
  }));
  await screen.findByText("OpenCode Go");
  expect(screen.queryByText(/No key configured/)).toBeNull();
});
test("dirty edit uses its original revision across metadata reload, explicit re-edit rebases", async () => {
  let revision = 1;
  const writes: any[] = [];
  const custom = {
    ...provider,
    id: "custom:demo",
    name: "Demo",
    baseURL: "https://example.test/v1",
    api: "openai-completions",
  };
  const { c } = setup(en, async (endpoint: any, payload: any) => {
    if (endpoint === "provider/save") {
      writes.push(payload);
      throw { code: "CONFLICT" };
    }
    return {
      ...snapshot,
      customRevision: revision,
      providers: [{ ...custom, revision }],
    };
  });
  await screen.findByText("Demo");
  await openDetails("Demo");
  fireEvent.click(screen.getByRole("button", { name: "Edit configuration" }));
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Draft" },
  });
  revision = 2;
  await c.load();
  fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));
  await waitFor(() => expect(writes.length).toBe(1));
  expect(writes[0].revision).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Edit configuration" }));
  fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));
  await waitFor(() => expect(writes.length).toBe(2));
  expect(writes[1].revision).toBe(2);
});
test("new dirty draft retains first change revision on reconnect", async () => {
  let revision = 1;
  const writes: any[] = [];
  const { c } = setup(en, async (endpoint: any, payload: any) => {
    if (endpoint === "provider/save") {
      writes.push(payload);
      throw { code: "CONFLICT" };
    }
    return { ...snapshot, customRevision: revision };
  });
  await screen.findByText("OpenCode Go");
  await openAdd();
  for (const [label, value] of [
    ["Name", "Demo"],
    ["Route", "demo"],
    ["Base URL", "https://example.test/v1"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.change(screen.getByLabelText("Model ID 1"), {
    target: { value: "alpha" },
  });
  revision = 2;
  c.connectionChanged(true);
  await waitFor(() => expect(c.state.snapshot?.customRevision).toBe(2));
  fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));
  await waitFor(() => expect(writes.length).toBe(1));
  expect(writes[0].revision).toBe(1);
});
test("malformed snapshot displays retry and never renders incomplete cards", async () => {
  let malformed = true;
  setup(en, async () => (malformed ? { providers: [] } : snapshot));
  await screen.findByRole("button", { name: "Retry" });
  expect(screen.queryByText("Muse Code")).toBeNull();
  malformed = false;
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText("OpenCode Go");
  expect(screen.queryByText("fixture-model")).toBeNull();
});
test("OpenCode mark and Meta Model API draft from Muse details", async () => {
  setup();
  await screen.findByText("OpenCode Go");
  expect(
    document.querySelector('.pm-icon[data-mark="opencode"]')?.innerHTML,
  ).toContain("M384 416H128V96H384V416");
  expect(screen.queryByText(en.museBoundary)).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: `${en.details}: Muse Code` }),
  );
  expect(screen.getByText(en.museBoundary)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: en.addMetaApi }));
  expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
    "Meta Model API",
  );
  expect((screen.getByLabelText("Route") as HTMLInputElement).value).toBe(
    "meta",
  );
  expect((screen.getByLabelText("Base URL") as HTMLInputElement).value).toBe(
    "https://api.meta.ai/v1",
  );
  expect((screen.getByLabelText("Protocol") as HTMLSelectElement).value).toBe(
    "openai-responses",
  );
  expect((screen.getByLabelText("Model ID 1") as HTMLInputElement).value).toBe(
    "muse-spark-1.3",
  );
  expect(
    (
      screen.getByRole("checkbox", {
        name: /muse-spark-1.3$/,
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
});
test("ZCode preset keeps one route and switches China / Overseas URLs", async () => {
  setup();
  fireEvent.click(await screen.findByRole("button", { name: en.addProvider }));
  fireEvent.change(screen.getByLabelText(en.apiPreset), {
    target: { value: "zcode" },
  });
  expect((screen.getByLabelText("Route") as HTMLInputElement).value).toBe(
    "zcode",
  );
  expect((screen.getByLabelText("Base URL") as HTMLInputElement).value).toBe(
    "https://open.bigmodel.cn/api/coding/paas/v4",
  );
  expect((screen.getByLabelText("Model ID 1") as HTMLInputElement).value).toBe(
    "glm-5.3-flash",
  );
  expect(
    (
      screen.getByRole("checkbox", {
        name: /glm-5.3-flash/,
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  expect(
    (screen.getByRole("checkbox", { name: /glm-5-turbo/ }) as HTMLInputElement)
      .checked,
  ).toBe(false);
  expect(
    (
      screen.getByRole("radio", {
        name: new RegExp(en.regionChina),
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  fireEvent.click(
    screen.getByRole("radio", { name: new RegExp(en.regionOverseas) }),
  );
  expect((screen.getByLabelText("Route") as HTMLInputElement).value).toBe(
    "zcode",
  );
  expect((screen.getByLabelText("Base URL") as HTMLInputElement).value).toBe(
    "https://api.z.ai/api/coding/paas/v4",
  );
  fireEvent.change(screen.getByLabelText("Protocol"), {
    target: { value: "anthropic-messages" },
  });
  expect((screen.getByLabelText("Base URL") as HTMLInputElement).value).toBe(
    "https://api.z.ai/api/anthropic",
  );
  fireEvent.change(screen.getByLabelText(en.apiPreset), {
    target: { value: "openrouter" },
  });
  expect((screen.getByLabelText("Route") as HTMLInputElement).value).toBe(
    "openrouter",
  );
  expect((screen.getByLabelText("Base URL") as HTMLInputElement).value).toBe(
    "https://openrouter.ai/api/v1",
  );
  expect(
    screen.queryByRole("radio", { name: new RegExp(en.regionChina) }),
  ).toBeNull();
});
test("ZCode list card shows an Overseas badge", async () => {
  setup(en, async () => ({
    ...snapshot,
    providers: [
      provider,
      {
        id: "custom:zcode",
        name: "ZCode",
        available: true,
        revision: 1,
        credential: { configured: true, writable: true, source: "env" },
        models: [{ id: "glm-5.2" }],
        baseURL: "https://api.z.ai/api/coding/paas/v4",
        api: "openai-completions",
      },
    ],
  }));
  await screen.findByText("ZCode");
  expect(screen.getByText(en.regionOverseas)).toBeTruthy();
  expect(document.querySelector('.pm-icon[data-mark="zcode"]')).toBeTruthy();
});
test("MiMo and MiniMax presets keep one route and switch China / Overseas URLs", async () => {
  setup();
  fireEvent.click(await screen.findByRole("button", { name: en.addProvider }));
  fireEvent.change(screen.getByLabelText(en.apiPreset), {
    target: { value: "mimo" },
  });
  expect((screen.getByLabelText("Route") as HTMLInputElement).value).toBe(
    "mimo",
  );
  expect((screen.getByLabelText("Base URL") as HTMLInputElement).value).toBe(
    "https://token-plan-cn.xiaomimimo.com/v1",
  );
  fireEvent.click(
    screen.getByRole("radio", { name: new RegExp(en.regionOverseas) }),
  );
  expect((screen.getByLabelText("Base URL") as HTMLInputElement).value).toBe(
    "https://token-plan-sgp.xiaomimimo.com/v1",
  );
  fireEvent.change(screen.getByLabelText(en.apiPreset), {
    target: { value: "minimax" },
  });
  expect((screen.getByLabelText("Route") as HTMLInputElement).value).toBe(
    "minimax",
  );
  expect((screen.getByLabelText("Base URL") as HTMLInputElement).value).toBe(
    "https://api.minimax.cn/v1",
  );
  fireEvent.click(
    screen.getByRole("radio", { name: new RegExp(en.regionOverseas) }),
  );
  expect((screen.getByLabelText("Base URL") as HTMLInputElement).value).toBe(
    "https://api.minimax.io/v1",
  );
  expect(
    (screen.getByRole("checkbox", { name: /MiniMax-M3$/ }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  expect(
    (
      screen.getByRole("checkbox", {
        name: /MiniMax-M2\.7$/,
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
});

test("ZCode save writes per-model context windows and honors the 1M tick", async () => {
  const writes: any[] = [];
  setup(en, async (endpoint: any, payload: any) => {
    if (endpoint === "provider/save") {
      writes.push(payload);
      return { saved: true };
    }
    return snapshot;
  });
  fireEvent.click(await screen.findByRole("button", { name: en.addProvider }));
  fireEvent.change(screen.getByLabelText(en.apiPreset), {
    target: { value: "zcode" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: /glm-5-turbo/ }));
  fireEvent.click(screen.getByRole("button", { name: en.save }));
  await waitFor(() => expect(writes.length).toBe(1));
  expect(writes[0].models).toEqual([
    { id: "glm-5.3-flash", contextWindow: 1_048_576 },
    { id: "glm-5.3", contextWindow: 1_048_576 },
    { id: "glm-5.2", contextWindow: 1_048_576 },
    { id: "glm-5-turbo", contextWindow: 1_048_576 },
  ]);
});

const oauthEntry = {
  providerId: "openai-codex",
  label: "ChatGPT Codex",
  methods: [
    { id: "oauth", label: "OAuth" },
    { id: "api-key", label: "API key" },
  ],
  configured: false,
  inFlight: false,
};

test("FilterTabs show ALL LLM OAuth and hide the other groups", async () => {
  setup(en, async () => ({ ...snapshot, oauth: [oauthEntry] }));
  await screen.findByRole("tab", { name: "ALL" });
  expect(screen.getByRole("tab", { name: "LLM" }).getAttribute("aria-selected")).toBe(
    "false",
  );
  expect(screen.getByText("OpenCode Go")).toBeTruthy();
  expect(screen.getByText("ChatGPT Codex")).toBeTruthy();
  expect(screen.getByText("Muse Code")).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "LLM" }));
  expect(screen.getByText("OpenCode Go")).toBeTruthy();
  expect(screen.getByText("Muse Code")).toBeTruthy();
  expect(screen.queryByText("ChatGPT Codex")).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "OAuth" }));
  expect(screen.queryByText("OpenCode Go")).toBeNull();
  expect(screen.queryByText("Muse Code")).toBeNull();
  expect(screen.getByText("ChatGPT Codex")).toBeTruthy();
  expect(screen.getByText(en.oauthSignedOut)).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: en.addProvider }),
  ).toBeNull();
});

test("oauthUnavailable empty state does not crash", async () => {
  setup(en, async () => ({
    ...snapshot,
    oauth: [],
    oauthUnavailable: true,
  }));
  fireEvent.click(await screen.findByRole("tab", { name: "OAuth" }));
  expect(screen.getByText(en.oauthUnavailable)).toBeTruthy();
  expect(screen.queryByText("OpenCode Go")).toBeNull();
});

test("OAuth details render notice, text, secret, select, decline, withdraw and success", async () => {
  let events: any = {
    events: [
      {
        kind: "notice",
        index: 0,
        message: "Open this page",
        url: "https://example.test/device",
        code: "WXYZ",
      },
      {
        kind: "prompt",
        index: 1,
        seq: 1,
        promptKind: "text",
        message: "Paste the code",
      },
    ],
    nextIndex: 2,
    status: "awaiting-prompt",
    pendingPrompt: {
      kind: "prompt",
      seq: 1,
      promptKind: "text",
      message: "Paste the code",
    },
  };
  const answers: any[] = [];
  setup(en, async (endpoint: any, payload: any) => {
    if (endpoint === "login/start") return { sessionId: "s1" };
    if (endpoint === "login/events") return events;
    if (endpoint === "login/answer") {
      answers.push(payload);
      return { answered: true };
    }
    return { ...snapshot, oauth: [oauthEntry] };
  });
  await screen.findByText("ChatGPT Codex");
  fireEvent.click(screen.getByRole("tab", { name: "OAuth" }));
  fireEvent.click(
    screen.getByRole("button", { name: `${en.details}: ChatGPT Codex` }),
  );
  fireEvent.click(screen.getByRole("button", { name: en.loginStart }));
  expect(await screen.findByText("Open this page")).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "https://example.test/device" })
      .getAttribute("rel"),
  ).toBe("noopener noreferrer");
  expect(screen.getByText("WXYZ")).toBeTruthy();
  const text = screen.getByLabelText("Paste the code") as HTMLInputElement;
  expect(text.type).toBe("text");
  fireEvent.change(text, { target: { value: "user-code" } });
  events = {
    events: [
      {
        kind: "prompt",
        index: 2,
        seq: 2,
        promptKind: "secret",
        message: "API key",
      },
    ],
    nextIndex: 3,
    status: "awaiting-prompt",
    pendingPrompt: {
      kind: "prompt",
      seq: 2,
      promptKind: "secret",
      message: "API key",
    },
  };
  fireEvent.click(screen.getByRole("button", { name: en.loginSubmit }));
  await waitFor(() =>
    expect(answers.at(-1)).toMatchObject({ seq: 1, value: "user-code" }),
  );
  const secret = (await screen.findByLabelText("API key")) as HTMLInputElement;
  expect(secret.type).toBe("password");
  events = {
    events: [
      {
        kind: "prompt",
        index: 3,
        seq: 3,
        promptKind: "select",
        message: "Choose",
        options: [
          { id: "oauth", label: "OAuth" },
          { id: "api-key", label: "API key" },
        ],
      },
    ],
    nextIndex: 4,
    status: "awaiting-prompt",
    pendingPrompt: {
      kind: "prompt",
      seq: 3,
      promptKind: "select",
      message: "Choose",
      options: [
        { id: "oauth", label: "OAuth" },
        { id: "api-key", label: "API key" },
      ],
    },
  };
  fireEvent.change(secret, { target: { value: "SYNTHETIC-SECRET" } });
  fireEvent.click(screen.getByRole("button", { name: en.loginSubmit }));
  fireEvent.click(await screen.findByRole("button", { name: "OAuth" }));
  await waitFor(() =>
    expect(answers.at(-1)).toMatchObject({ seq: 3, value: "oauth" }),
  );
  events = {
    events: [{ kind: "notice", index: 4, message: "Prompt withdrawn" }],
    nextIndex: 5,
    status: "running",
  };
  fireEvent.click(screen.getByRole("button", { name: en.loginDecline }));
  expect(await screen.findByText(en.promptWithdrawn)).toBeTruthy();
  events = {
    events: [{ kind: "notice", index: 4, message: "Prompt withdrawn" }],
    nextIndex: 5,
    status: "done",
    result: "ok",
  };
  fireEvent.click(screen.getByRole("button", { name: en.loginCancel }));
  expect(await screen.findByText(en.loginSuccess)).toBeTruthy();
});

test("list card shows Signing in from local login before snapshot inFlight", async () => {
  const { c } = setup(en, async (endpoint: any) => {
    if (endpoint === "login/start") return { sessionId: "s-local" };
    if (endpoint === "login/events")
      return { events: [], nextIndex: 0, status: "running" };
    return { ...snapshot, oauth: [oauthEntry] };
  });
  fireEvent.click(await screen.findByRole("tab", { name: "OAuth" }));
  expect(await screen.findByText(en.oauthSignedOut)).toBeTruthy();
  await c.loginStart("openai-codex");
  expect(c.state.snapshot?.oauth[0]?.inFlight).toBe(false);
  expect(await screen.findByText(en.oauthInFlight)).toBeTruthy();
  expect(screen.queryByText(en.oauthSignedOut)).toBeNull();
});
