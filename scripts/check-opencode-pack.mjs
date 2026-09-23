import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  copyFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const tarball = resolve(
  process.argv[2] ?? `artifacts/${manifest.name}-${manifest.version}.tgz`,
);
const fixture = mkdtempSync(join(tmpdir(), "provider-manager-go-pack-"));
const dependencies = { "dsh-provider-manager": tarball };
for (const [name, range] of Object.entries(manifest.peerDependencies))
  dependencies[name] = manifest.devDependencies[name] ?? range;
for (const name of [
  "@deepseek-ai/dsh-fs",
  "@deepseek-ai/dsh-launch-environment",
  "@deepseek-ai/dsh-timeout",
  "@deepseek-ai/dsh-attachment",
])
  dependencies[name] = "0.1.5-rc.2";
writeFileSync(
  join(fixture, "package.json"),
  JSON.stringify({ private: true, type: "module", dependencies }, null, 2),
);
console.log(JSON.stringify({ fixture, tarball }));
execFileSync(
  "npm",
  [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--legacy-peer-deps",
  ],
  { cwd: fixture, stdio: "inherit" },
);
copyFileSync("scripts/opencode-pack-runner.mjs", join(fixture, "runner.mjs"));
copyFileSync(
  "tests/fixtures/opencode-wire.mjs",
  join(fixture, "opencode-wire.mjs"),
);
execFileSync(process.execPath, ["runner.mjs"], {
  cwd: fixture,
  stdio: "inherit",
});
