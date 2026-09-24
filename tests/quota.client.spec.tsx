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

function quota(windows: unknown[], extra: Record<string, unknown> = {}) {
  return {
    providerId: "opencode-go",
    status: "ready",
    stale: false,
    source: "opencode-official",
    fetchedAt: "2026-09-21T00:00:00.000Z",
    windows,
    ...extra,
  };
}

function setup(
  dict = en,
  rpc: any = async (endpoint: string) =>
    endpoint === "quota/read"
      ? quota([{ id: "five-hour", usedPercent: 0, remainingPercent: 100 }])
      : snapshot,
) {
  const c = new Controller({
    rpc,
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

async function openDetails(name = "OpenCode Go") {
  fireEvent.click(
    await screen.findByRole("button", { name: `${en.details}: ${name}` }),
  );
}

test("overview is compact and shows remaining quota without expanding models", async () => {
  setup();
  await screen.findByRole("progressbar", {
    name: /5-hour window remaining 100%/,
  });
  expect(screen.queryByText("fixture-model")).toBeNull();
  expect(screen.queryByLabelText("New key")).toBeNull();
  expect(screen.getByText(/1 models/)).toBeTruthy();
  expect(screen.getByText(new RegExp(en.configured))).toBeTruthy();
  expect(screen.queryByText(en.available)).toBeNull();
  expect(screen.getByText(en.columnQuota)).toBeTruthy();
  await openDetails();
  expect(
    screen.queryByRole("button", { name: `${en.details}: Muse Code` }),
  ).toBeNull();
  expect((await screen.findAllByText("fixture-model")).length).toBeGreaterThan(0);
  expect(screen.getByLabelText("New key")).toBeTruthy();
  expect(screen.getByLabelText(en.apiUrl)).toBeTruthy();
});

test("zero remaining, unknown, zero-cap and missing reset do not invent a 5h bar", async () => {
  setup(en, async (endpoint: string) =>
    endpoint === "quota/read"
      ? quota([
          { id: "weekly", usedPercent: 100, remainingPercent: 0 },
          { id: "monthly" },
        ])
      : snapshot,
  );
  await screen.findByRole("progressbar", {
    name: /Weekly window remaining 0%/,
  });
  expect(screen.queryByText(en.quotaCapUnknown)).toBeNull();
  expect(
    screen.queryByRole("progressbar", { name: /5-hour window remaining/ }),
  ).toBeNull();
  expect(screen.getAllByRole("progressbar")).toHaveLength(1);
  await openDetails();
  expect(screen.getByText(new RegExp(en.quotaCapUnknown))).toBeTruthy();
  expect(screen.getAllByRole("progressbar")).toHaveLength(1);
});

test("expired reset shows waiting without restoring 100%", async () => {
  setup(en, async (endpoint: string) =>
    endpoint === "quota/read"
      ? quota([
          {
            id: "five-hour",
            usedPercent: 40,
            remainingPercent: 60,
            resetsAt: "2020-01-01T00:00:00.000Z",
          },
        ])
      : snapshot,
  );
  await screen.findByRole("progressbar", {
    name: /5-hour window remaining 60%/,
  });
  expect(screen.getByText(en.quotaWaiting)).toBeTruthy();
  expect(
    screen.queryByRole("progressbar", { name: /5-hour window remaining 100%/ }),
  ).toBeNull();
});

test("stale host windows are labeled and unknown quota has no progressbar", async () => {
  const first = setup(en, async (endpoint: string) =>
    endpoint === "quota/read"
      ? quota([{ id: "five-hour", usedPercent: 20, remainingPercent: 80 }], {
          stale: true,
          status: "error",
          error: "UNAVAILABLE",
        })
      : snapshot,
  );
  await screen.findByRole("progressbar", {
    name: /5-hour window remaining 80%/,
  });
  expect(screen.getByText(en.quotaStale)).toBeTruthy();
  first.unmount();
  const { unmount } = setup(en, async (endpoint: string) =>
    endpoint === "quota/read"
      ? {
          providerId: "opencode-go",
          status: "unsupported",
          windows: [],
          stale: false,
        }
      : snapshot,
  );
  await screen.findByText(en.quotaUnsupported);
  expect(screen.queryByRole("progressbar", { name: /remaining/i })).toBeNull();
  unmount();
});

test("closing details clears revealed key and add form keeps drafts", async () => {
  setup();
  await screen.findByRole("progressbar", {
    name: /5-hour window remaining 100%/,
  });
  await openDetails();
  fireEvent.click(screen.getByRole("button", { name: "Show key" }));
  await screen.findByDisplayValue("SYNTHETIC");
  expect(screen.getByRole("button", { name: en.back })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: en.back }));
  expect(screen.queryByDisplayValue("SYNTHETIC")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: en.addProvider }));
  expect(screen.queryByText("OpenCode Go")).toBeNull();
  fireEvent.change(screen.getByLabelText("Route"), {
    target: { value: "kept-draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: en.closeForm }));
  expect(screen.queryByLabelText("Route")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: en.addProvider }));
  expect((screen.getByLabelText("Route") as HTMLInputElement).value).toBe(
    "kept-draft",
  );
});

test("details page replaces the list and Back returns to overview", async () => {
  setup();
  await openDetails();
  expect(document.querySelector(".pm-page")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: `${en.details}: Muse Code` }),
  ).toBeNull();
  expect(screen.getByRole("button", { name: en.back }).textContent).toBe(
    en.back,
  );
  fireEvent.click(screen.getByRole("button", { name: en.back }));
  expect(screen.getByRole("button", { name: en.addProvider })).toBeTruthy();
});

test("details summary is keyboard operable and Muse states facts without a quota bar", async () => {
  setup();
  await screen.findByText("Muse Code");
  expect(screen.getByText("CLI not detected")).toBeTruthy();
  const details = await screen.findByRole("button", {
    name: `${en.details}: OpenCode Go`,
  });
  details.focus();
  fireEvent.click(details);
  expect((await screen.findAllByText("fixture-model")).length).toBeGreaterThan(0);
  expect(
    screen.getByRole("progressbar", { name: /5-hour window remaining 100%/ }),
  ).toBeTruthy();
});

const command = {
  id: "commandcode",
  name: "Command Code GOAT",
  available: true,
  revision: 1,
  bindingToken: "command-token",
  credential: { configured: true, writable: true, source: "file" },
  models: [{ id: "command-model" }],
};

function dualSetup(
  reveal: () => Promise<{ value: string; source: string; revealTTL: number }>,
) {
  const c = new Controller({
    rpc: async (endpoint: string, payload: any) =>
      endpoint === "quota/read"
        ? {
            providerId: payload?.providerId,
            status: "unsupported",
            windows: [],
            stale: false,
          }
        : {
            ...snapshot,
            providers: [provider, command],
          },
    reveal,
  });
  const ui = render(
    <ProviderManager createController={() => c} t={(key) => en[key]} />,
  );
  return { c, ...ui };
}

test("switching details to Muse and back requires Show key again", async () => {
  const { c } = dualSetup(async () => ({
    value: "SYNTHETIC_REVIEW_KEY",
    source: "file",
    revealTTL: 30000,
  }));
  try {
    fireEvent.click(
      await screen.findByRole("button", { name: "Details: OpenCode Go" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Show key" }));
    await screen.findByDisplayValue("SYNTHETIC_REVIEW_KEY");
    fireEvent.change(screen.getByLabelText("New key"), {
      target: { value: "PENDING-SECRET" },
    });
    fireEvent.click(screen.getByRole("button", { name: en.back }));
    fireEvent.click(screen.getByRole("button", { name: "Details: Muse Code" }));
    expect(screen.queryByDisplayValue("SYNTHETIC_REVIEW_KEY")).toBeNull();
    expect(screen.queryByDisplayValue("PENDING-SECRET")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: en.back }));
    fireEvent.click(
      screen.getByRole("button", { name: "Details: OpenCode Go" }),
    );
    expect(screen.queryByDisplayValue("SYNTHETIC_REVIEW_KEY")).toBeNull();
    expect(screen.queryByDisplayValue("PENDING-SECRET")).toBeNull();
    expect((screen.getByLabelText("New key") as HTMLInputElement).value).toBe(
      "",
    );
  } finally {
    c.dispose();
  }
});

test("switching A to B, Back, collapse, and unmount all hide revealed keys", async () => {
  const { c, unmount } = dualSetup(async () => ({
    value: "SYNTHETIC_A",
    source: "file",
    revealTTL: 30000,
  }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Details: OpenCode Go" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Show key" }));
  await screen.findByDisplayValue("SYNTHETIC_A");
  fireEvent.click(screen.getByRole("button", { name: en.back }));
  fireEvent.click(
    screen.getByRole("button", { name: "Details: Command Code GOAT" }),
  );
  expect(screen.queryByDisplayValue("SYNTHETIC_A")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: en.back }));
  fireEvent.click(screen.getByRole("button", { name: "Details: OpenCode Go" }));
  expect(screen.queryByDisplayValue("SYNTHETIC_A")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Show key" }));
  await screen.findByDisplayValue("SYNTHETIC_A");
  fireEvent.click(screen.getByRole("button", { name: en.back }));
  expect(screen.queryByDisplayValue("SYNTHETIC_A")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Details: OpenCode Go" }));
  fireEvent.click(screen.getByRole("button", { name: "Show key" }));
  await screen.findByDisplayValue("SYNTHETIC_A");
  fireEvent.click(screen.getByRole("button", { name: en.back }));
  expect(screen.queryByDisplayValue("SYNTHETIC_A")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Details: OpenCode Go" }));
  fireEvent.click(screen.getByRole("button", { name: "Show key" }));
  await screen.findByDisplayValue("SYNTHETIC_A");
  unmount();
  expect(c.state.revealed).toBeUndefined();
});

test("late reveal after switching details cannot display the previous key", async () => {
  let release: ((value: unknown) => void) | undefined;
  const { c } = dualSetup(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  try {
    fireEvent.click(
      await screen.findByRole("button", { name: "Details: OpenCode Go" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Show key" }));
    await waitFor(() =>
      expect(c.state.operations["reveal:opencode-go"]?.status).toBe("loading"),
    );
    fireEvent.click(screen.getByRole("button", { name: en.back }));
    fireEvent.click(screen.getByRole("button", { name: "Details: Muse Code" }));
    release?.({
      value: "LATE_REVEAL_KEY",
      source: "file",
      revealTTL: 30000,
    });
    await waitFor(() =>
      expect(c.state.operations["reveal:opencode-go"]?.status).not.toBe(
        "loading",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: en.back }));
    fireEvent.click(
      screen.getByRole("button", { name: "Details: OpenCode Go" }),
    );
    expect(screen.queryByDisplayValue("LATE_REVEAL_KEY")).toBeNull();
    expect(c.state.revealed).toBeUndefined();
  } finally {
    c.dispose();
  }
});

test("command missing-credential does not also print unverified", async () => {
  setup(en, async (endpoint: string, payload: any) =>
    endpoint === "quota/read"
      ? {
          providerId: payload?.providerId ?? "commandcode",
          status: "missing-credential",
          source: "command-default-reference",
          windows: [],
          stale: false,
        }
      : { ...snapshot, providers: [command] },
  );
  await screen.findByText(en.quotaMissing);
  expect(screen.queryByText(en.quotaUnverified)).toBeNull();
});

test("command ready quota shows unverified caveat only in details", async () => {
  setup(en, async (endpoint: string, payload: any) =>
    endpoint === "quota/read"
      ? {
          providerId: payload?.providerId ?? "commandcode",
          status: "ready",
          source: "command-default-reference",
          stale: false,
          fetchedAt: "2026-09-21T00:00:00.000Z",
          windows: [{ id: "five-hour", usedPercent: 10, remainingPercent: 90 }],
        }
      : { ...snapshot, providers: [command] },
  );
  await screen.findByRole("progressbar", {
    name: /5-hour window remaining 90%/,
  });
  expect(screen.queryByText(en.quotaUnverified)).toBeNull();
  fireEvent.click(
    await screen.findByRole("button", {
      name: `${en.details}: Command Code GOAT`,
    }),
  );
  expect(screen.getByText(en.quotaUnverified)).toBeTruthy();
});
