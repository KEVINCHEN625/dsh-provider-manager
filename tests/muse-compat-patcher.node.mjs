import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { auditedOriginal } from "./muse-compat-fixture.mjs";
const script = new URL(
  "../scripts/apply-opencode-go-muse-compat.mjs",
  import.meta.url,
);
const liveRoot = path.join(
  os.homedir(),
  ".dsh/profiles/web/node_modules/dsh-llm-opencode-go",
);
function fixture(t, profile = "web") {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "muse-patch-")),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = liveRoot.replace("/web/", "/" + profile + "/");
  for (const file of [
    "package.json",
    "lib/index.js",
    "node_modules/@earendil-works/pi-ai/package.json",
  ]) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(path.join(source, file), path.join(root, file));
  }
  fs.writeFileSync(path.join(root, "lib/index.js"), auditedOriginal(source));
  return root;
}
function run(root, mode) {
  assert.ok(
    fs.existsSync(script),
    "Compatibility patch script is not implemented",
  );
  const result = spawnSync(
    process.execPath,
    [script.pathname, "--plugin-root", root, ...(mode ? ["--" + mode] : [])],
    { encoding: "utf8" },
  );
  return { status: result.status, output: result.stdout + result.stderr };
}
function ok(root, mode) {
  const r = run(root, mode);
  assert.equal(r.status, 0, r.output);
  return r.output;
}

test("default dry run; apply/check/rollback are idempotent and preserve original bytes, permissions and hard links", (t) => {
  const root = fixture(t);
  const file = path.join(root, "lib/index.js");
  fs.chmodSync(file, 0o640);
  const original = fs.readFileSync(file);
  const linked = path.join(root, "original-hardlink");
  fs.linkSync(file, linked);
  assert.match(ok(root), /applicable/);
  assert.deepEqual(fs.readFileSync(file), original);
  assert.match(ok(root, "apply"), /applied/);
  assert.deepEqual(fs.readFileSync(linked), original);
  assert.equal(fs.statSync(file).mode & 0o777, 0o640);
  assert.match(ok(root, "check"), /patched/);
  assert.match(ok(root, "apply"), /patched/);
  const patched = fs.readFileSync(file, "utf8");
  assert.ok(patched.includes("mount-connection-rpc.mjs"));
  assert.match(
    patched,
    /wrapOpenCodeGoMuseResponses\(openAIResponsesApi\(\)\)/,
  );
  assert.match(ok(root, "rollback"), /rolled-back/);
  assert.deepEqual(fs.readFileSync(file), original);
  assert.equal(fs.statSync(file).mode & 0o777, 0o640);
  assert.match(ok(root, "rollback"), /original/);
  ok(root, "apply");
  ok(root, "check");
});
test("both audited profile hashes are accepted", (t) => {
  ok(fixture(t, "headless"), "apply");
});
test("unknown plugin/pi-ai version or input hash fails closed", (t) => {
  for (const kind of ["plugin", "pi", "hash"]) {
    const root = fixture(t);
    if (kind === "hash")
      fs.appendFileSync(path.join(root, "lib/index.js"), "\n//changed");
    else {
      const file = path.join(
        root,
        kind === "plugin"
          ? "package.json"
          : "node_modules/@earendil-works/pi-ai/package.json",
      );
      const pkg = JSON.parse(fs.readFileSync(file));
      pkg.version = "999.0.0";
      fs.writeFileSync(file, JSON.stringify(pkg));
    }
    assert.notEqual(run(root, "apply").status, 0);
  }
});
test("check and rollback refuse edited plugin/helper/backup/manifest without overwriting", (t) => {
  for (const kind of ["plugin", "helper", "backup", "manifest"]) {
    const root = fixture(t);
    ok(root, "apply");
    const lib = path.join(root, "lib");
    const filename =
      kind === "plugin"
        ? "index.js"
        : kind === "helper"
          ? fs
              .readdirSync(lib)
              .find((n) => /^muse-compat-[a-f0-9]+\.mjs$/.test(n))
          : kind === "backup"
            ? ".muse-compat-original.js"
            : ".muse-compat-manifest.json";
    if (kind === "helper") fs.chmodSync(path.join(lib, filename), 0o644);
    fs.appendFileSync(path.join(lib, filename), "\n//external edit");
    const before = fs.readFileSync(path.join(lib, "index.js"));
    assert.notEqual(run(root, "check").status, 0);
    assert.notEqual(run(root, "rollback").status, 0);
    assert.deepEqual(fs.readFileSync(path.join(lib, "index.js")), before);
  }
});
test("symlink plugin files and symlink roots are rejected", (t) => {
  const root = fixture(t);
  const file = path.join(root, "lib/index.js");
  fs.renameSync(file, file + ".real");
  fs.symlinkSync(file + ".real", file);
  assert.notEqual(run(root, "apply").status, 0);
  const alias = root + "-alias";
  fs.symlinkSync(root, alias);
  t.after(() => fs.unlinkSync(alias));
  assert.notEqual(run(alias, "apply").status, 0);
});
test("deployed snapshots remain checkable and rollbackable after the manager helper changes", (t) => {
  const root = fixture(t);
  const original = fs.readFileSync(path.join(root, "lib/index.js"));
  ok(root, "apply");
  const toolkit = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "muse-toolkit-")),
  );
  t.after(() => fs.rmSync(toolkit, { recursive: true, force: true }));
  fs.mkdirSync(path.join(toolkit, "scripts"));
  fs.mkdirSync(path.join(toolkit, "compat"));
  fs.copyFileSync(
    script,
    path.join(toolkit, "scripts", path.basename(script.pathname)),
  );
  fs.copyFileSync(
    new URL("../compat/opencode-go-muse.mjs", import.meta.url),
    path.join(toolkit, "compat/opencode-go-muse.mjs"),
  );
  fs.appendFileSync(
    path.join(toolkit, "compat/opencode-go-muse.mjs"),
    "\n// updated manager helper\n",
  );
  for (const mode of ["check", "rollback"]) {
    const result = spawnSync(
      process.execPath,
      [
        path.join(toolkit, "scripts", path.basename(script.pathname)),
        "--plugin-root",
        root,
        "--" + mode,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
  }
  assert.deepEqual(fs.readFileSync(path.join(root, "lib/index.js")), original);
});
