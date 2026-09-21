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
  await screen.findByText("5h remaining 100%");
  expect(screen.queryByText("fixture-model")).toBeNull();
  expect(screen.queryByLabelText("New key")).toBeNull();
  expect(screen.getByText(/1 models/)).toBeTruthy();
  expect(screen.getByText(new RegExp(en.configured))).toBeTruthy();
  expect(screen.queryByText(en.available)).toBeNull();
  await openDetails();
  await screen.findByText("fixture-model");
  expect(screen.getByLabelText("New key")).toBeTruthy();
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
  await screen.findByText("Weekly remaining 0%");
  expect(screen.getByText(new RegExp(en.quotaCapUnknown))).toBeTruthy();
  expect(screen.queryByText(/5h remaining/)).toBeNull();
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
  await screen.findByText("5h remaining 60%");
  expect(screen.getByText(en.quotaWaiting)).toBeTruthy();
  expect(screen.queryByText("5h remaining 100%")).toBeNull();
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
  await screen.findByText("5h remaining 80%");
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
  await screen.findByText("5h remaining 100%");
  await openDetails();
  fireEvent.click(screen.getByRole("button", { name: "Show key" }));
  await screen.findByDisplayValue("SYNTHETIC");
  expect(screen.getByRole("button", { name: en.back })).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: `${en.details}: OpenCode Go` }),
  );
  expect(screen.queryByDisplayValue("SYNTHETIC")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: en.addProvider }));
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

test("details summary is keyboard operable and Muse states facts without a quota bar", async () => {
  setup();
  await screen.findByText("Muse Code");
  expect(screen.getByText(en.museBoundary)).toBeTruthy();
  const details = await screen.findByRole("button", {
    name: `${en.details}: OpenCode Go`,
  });
  details.focus();
  fireEvent.keyDown(details, { key: "Enter" });
  await screen.findByText("fixture-model");
  expect(screen.getByText("5h remaining 100%")).toBeTruthy();
});
