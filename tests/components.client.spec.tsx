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
  expect(screen.getByLabelText("模型 ID（每行一个）")).toBeTruthy();
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
    ["Model IDs (one per line)", "alpha\nbeta"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));
  await screen.findByText(en.CONFLICT);
  expect((screen.getByLabelText("Route") as HTMLInputElement).value).toBe(
    "demo",
  );
  expect(calls.find((x) => x[0] === "provider/save")[1].models).toEqual([
    "alpha",
    "beta",
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
    ["Model IDs (one per line)", "alpha"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
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
  expect(
    (screen.getByLabelText("Model IDs (one per line)") as HTMLTextAreaElement)
      .value,
  ).toContain("muse-spark-1.3");
});
