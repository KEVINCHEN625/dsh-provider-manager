#!/usr/bin/env node
// Compare the Codex client catalog with this plugin's channel snapshot.
// Changed ids still need scripts/probe-codex.mjs before they are published.
import { readFileSync } from "node:fs";

const remoteUrl =
  "https://raw.githubusercontent.com/router-for-me/models/main/codex_client_models.json";
const snapshot = JSON.parse(
  readFileSync(new URL("../src/host/oauth-catalogs/openai-codex.json", import.meta.url), "utf8"),
);
const response = await fetch(remoteUrl);
if (!response.ok) throw new Error(`catalog diff failed: ${response.status}`);
const body = await response.json();
const remote = new Set((body.models || []).map((model) => model.slug).filter(Boolean));
const local = new Set(snapshot.models.map((model) => model.id));
const added = [...remote].filter((id) => !local.has(id));
const removed = [...local].filter((id) => !remote.has(id));
console.log(
  JSON.stringify(
    {
      remote: remoteUrl,
      remoteCount: remote.size,
      added,
      removed,
    },
    null,
    2,
  ),
);
