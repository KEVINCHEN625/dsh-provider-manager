import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  displayModelName,
  effortProbeRequest,
  fullestConsistentEfforts,
  joinCatalog,
  parseCatalogDocument,
  reasoningEfforts,
} from "../src/host/oauth-catalog.js";
import { selectorModels } from "../src/host/oauth-routes.js";
import type { OAuthCatalogModel } from "../src/shared/protocol.js";

test("effort cross keeps the fullest majority set and leaves none out", () => {
  expect(
    fullestConsistentEfforts([
      ["low", "medium", "high", "xhigh", "max"],
      ["none", "low", "medium", "high", "max"],
      ["none", "low", "medium", "high", "xhigh", "max"],
      ["low", "medium", "high"],
    ]),
  ).toEqual(["low", "medium", "high", "xhigh", "max"]);
  expect(
    fullestConsistentEfforts([
      ["none", "low", "medium", "high", "xhigh"],
      ["low", "medium", "high", "xhigh", "max"],
      ["minimal", "low", "medium", "high"],
      ["low", "medium", "high"],
    ]),
  ).toEqual(["low", "medium", "high", "xhigh"]);
  expect(
    reasoningEfforts(["none", "low", "medium", "high", "xhigh", "max"]),
  ).toEqual({
    low: "low",
    medium: "medium",
    high: "high",
    xhigh: "xhigh",
    max: "max",
  });
  expect(reasoningEfforts(["none", "low"], { noneEnabled: true })).toEqual({
    off: "none",
    low: "low",
  });
});

test("fallback names keep brand casing and version segments", () => {
  expect(displayModelName("gpt-reserve")).toBe("GPT Reserve");
  expect(displayModelName("codex-auto-review")).toBe("Codex Auto Review");
  expect(displayModelName("gpt-5.6-luna")).toBe("GPT 5.6 Luna");
  expect(displayModelName("muse-spark-1.3")).toBe("Muse Spark 1.3");
  expect(displayModelName("deepseek-v4-flash")).toBe("DeepSeek V4 Flash");
  expect(displayModelName("minimax-m2.5")).toBe("MiniMax M2.5");
});

test("a model with no models.dev entry is pending and injects only id and name", () => {
  const model: OAuthCatalogModel = {
    id: "gpt-reserve",
    name: "gpt-reserve",
    available: true,
    efforts: [],
    input: [],
    pendingProbe: true,
    verifiedAt: "2026-09-24",
  };
  expect(selectorModels([model])).toEqual([
    { id: "gpt-reserve", name: "GPT Reserve" },
  ]);
});

test("registry rows accept name, efforts, and probe flags, and old rows still parse", () => {
  const legacy = parseCatalogDocument(
    {
      providerId: "openai-codex",
      models: [
        { id: "gpt-5.5", available: true, verifiedAt: "2026-09-23" },
      ],
    },
    "openai-codex",
  );
  expect(legacy.models[0]).toEqual({
    id: "gpt-5.5",
    available: true,
    verifiedAt: "2026-09-23",
  });
  const upgraded = parseCatalogDocument(
    {
      providerId: "openai-codex",
      models: [
        {
          id: "gpt-5.5",
          available: true,
          verifiedAt: "2026-09-24",
          name: "Not From The Registry",
          efforts: ["low"],
          noneEnabled: false,
        },
        {
          id: "gpt-reserve",
          available: true,
          verifiedAt: "2026-09-24",
          name: "GPT Reserve",
          pendingProbe: true,
        },
      ],
    },
    "openai-codex",
  );
  const joined = joinCatalog(
    [
      {
        id: "gpt-5.5",
        name: "GPT-5.5",
        contextWindow: 1_050_000,
        maxTokens: 128_000,
        efforts: ["none", "low", "medium", "high", "xhigh"],
        input: ["text", "image"],
      },
    ],
    upgraded.models,
  );
  expect(selectorModels(joined)).toEqual([
    {
      id: "gpt-5.5",
      name: "GPT-5.5",
      contextWindow: 1_050_000,
      maxTokens: 128_000,
      reasoningEfforts: {
        low: "low",
        medium: "medium",
        high: "high",
        xhigh: "xhigh",
      },
    },
    { id: "gpt-reserve", name: "GPT Reserve" },
  ]);
  const probe = effortProbeRequest("gpt-5.5", "none");
  expect(probe.reasoning).toEqual({ effort: "none" });
  expect(probe).not.toHaveProperty("max_output_tokens");
  expect(JSON.stringify(probe)).not.toMatch(/sk-|eyJ/);
});

test("the Codex selector matches the hand-fixed route", () => {
  const availability = parseCatalogDocument(
    JSON.parse(
      readFileSync(
        new URL("../src/host/oauth-catalogs/openai-codex.json", import.meta.url),
        "utf8",
      ),
    ),
    "openai-codex",
  );
  const specs = JSON.parse(
    readFileSync(
      new URL("../src/host/oauth-catalogs/models-dev-openai.json", import.meta.url),
      "utf8",
    ),
  ).models;
  const injected = selectorModels(joinCatalog(specs, availability.models));
  expect(injected.map((model) => model.id)).toEqual([
    "gpt-6-astra",
    "gpt-6-sol",
    "gpt-6-luna",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.5",
    "gpt-reserve",
    "codex-auto-review",
  ]);
  expect(injected.find((model) => model.id === "gpt-6-sol")).toMatchObject({
    name: "GPT-6 Sol",
    reasoningEfforts: { off: "none", low: "low", high: "high", max: "max" },
  });
  expect(injected.find((model) => model.id === "gpt-6-astra")).toEqual({
    id: "gpt-6-astra",
    name: "GPT-6 Astra",
    contextWindow: 1_050_000,
    maxTokens: 128_000,
    reasoningEfforts: {
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
      max: "max",
    },
  });
  expect(injected.find((model) => model.id === "gpt-5.5")).toMatchObject({
    name: "GPT-5.5",
    reasoningEfforts: {
      off: "none",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
    },
  });
  expect(
    injected.find((model) => model.id === "gpt-5.5")?.reasoningEfforts,
  ).not.toHaveProperty("max");
  expect(injected.find((model) => model.id === "gpt-reserve")).toEqual({
    id: "gpt-reserve",
    name: "GPT Reserve",
  });
  expect(injected.find((model) => model.id === "codex-auto-review")).toEqual({
    id: "codex-auto-review",
    name: "Codex Auto Review",
  });
  expect(JSON.stringify(injected)).not.toMatch(/"none":|spark|gpt-5\.4/);
  expect(
    injected.filter((model) => model.reasoningEfforts?.off === "none").map((model) => model.id),
  ).toEqual([
    "gpt-6-sol",
    "gpt-6-luna",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.5",
  ]);
});
