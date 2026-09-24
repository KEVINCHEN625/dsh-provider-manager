#!/usr/bin/env node
/**
 * Dry-run a channel catalog. Live requests stay behind --confirm and a typed
 * yes because they can spend quota.
 *
 * Auth differs by provider and is not guessed here:
 * - anthropic: OAuth token against the console.anthropic.com family
 * - github-copilot: GitHub token, rate_limit endpoint
 * - openrouter: the OAuth result is an API key, credits endpoint
 * - kimi-coding, xai, radius, openrouter-images: same confirm gate
 *
 * Without --confirm this prints the bundled candidate ids and exits 0.
 */
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

const providerId = process.argv
  .slice(2)
  .find((arg) => !arg.startsWith("-"));
const confirm = process.argv.includes("--confirm");
const known = new Set([
  "anthropic",
  "kimi-coding",
  "github-copilot",
  "xai",
  "openrouter",
  "radius",
  "openrouter-images",
]);
if (!providerId || !known.has(providerId)) {
  console.error(
    "usage: node scripts/probe-oauth.mjs <providerId> [--confirm]",
  );
  process.exit(2);
}
let models = [];
try {
  const doc = JSON.parse(
    readFileSync(
      new URL(`../src/host/oauth-catalogs/${providerId}.json`, import.meta.url),
      "utf8",
    ),
  );
  models = Array.isArray(doc.models) ? doc.models.map((model) => model.id) : [];
} catch {
  models = [];
}
console.log(
  JSON.stringify({
    providerId,
    candidates: models,
    live: false,
  }),
);
if (!confirm) process.exit(0);
const line = await new Promise((resolve) => {
  const rl = createInterface({ input: process.stdin });
  rl.once("line", (value) => {
    rl.close();
    resolve(value.trim());
  });
});
if (line !== "yes") {
  console.error("confirmation was not yes");
  process.exit(2);
}
console.error(
  `${providerId}: live probe is not sent from this script until that provider's auth request is reviewed`,
);
process.exit(3);
