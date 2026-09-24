import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { brandMark } from "../src/client/ProviderIcon.js";

test("brand marks are embedded and do not point at a remote asset", () => {
  const source = readFileSync(
    new URL("../src/client/brand-icons.ts", import.meta.url),
    "utf8",
  );
  expect(source).not.toMatch(/https?:\/\//);
  expect(brandMark("anthropic")?.path.length).toBeGreaterThan(20);
  expect(brandMark("github-copilot")?.title).toBe("GitHub Copilot");
  expect(brandMark("kimi-coding")?.title).toBe("Kimi");
  expect(brandMark("baseten")).toBeUndefined();
  expect(brandMark("xai")?.hex).toBe("");
});
