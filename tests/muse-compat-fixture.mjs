// Read only. A live installation may already be patched: verify all evidence
// before using its preserved original as an offline test baseline.
import * as fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function auditedOriginal(root) {
  const lib = path.join(root, "lib");
  const current = fs.readFileSync(path.join(lib, "index.js"));
  const manifestFile = path.join(lib, ".muse-compat-manifest.json");
  if (!fs.existsSync(manifestFile)) return current;
  const m = JSON.parse(fs.readFileSync(manifestFile));
  assert.match(m.helperName, /^muse-compat-[a-f0-9]{64}\.mjs$/);
  assert.equal(m.helperName, `muse-compat-${m.helperHash}.mjs`);
  assert.equal(
    hash(fs.readFileSync(path.join(lib, m.helperName))),
    m.helperHash,
  );
  const original = fs.readFileSync(path.join(lib, ".muse-compat-original.js"));
  assert.equal(hash(original), m.originalHash);
  assert.ok([m.originalHash, m.patchedHash].includes(hash(current)));
  return original;
}
