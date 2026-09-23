#!/usr/bin/env node
import * as fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";

const supportedHashes = new Set([
  "de7e75e4e78d4ab21354967507125787f0a3816ee6b54b9af5b4c81b174c8915", // web, including its RPC shim
  "08fa9d021bb07de5847ce5541ab652babef33d442886ddea1c00118530a6be42", // headless, including its RPC shim
]);
const anchor = '"openai-responses": openAIResponsesApi(),';
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fail(message) {
  throw new Error(message);
}
function safePath(filename, allowMissing = false) {
  const absolute = path.resolve(filename);
  let current = path.parse(absolute).root;
  for (const part of absolute
    .slice(current.length)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (allowMissing && error.code === "ENOENT") return;
      throw error;
    }
    if (stat.isSymbolicLink()) fail(`Refusing symlink: ${current}`);
  }
}
function read(filename) {
  safePath(filename);
  if (!fs.statSync(filename).isFile()) fail(`Not a regular file: ${filename}`);
  return fs.readFileSync(filename);
}
function json(filename) {
  return JSON.parse(read(filename).toString("utf8"));
}
function atomicWrite(filename, bytes, mode) {
  safePath(filename, true);
  const temporary = filename + ".tmp-" + randomUUID();
  let fd;
  try {
    fd = fs.openSync(temporary, "wx", mode);
    fs.writeFileSync(fd, bytes);
    fs.fchmodSync(fd, mode);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    safePath(filename, true);
    fs.renameSync(temporary, filename);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
function patchedBytes(original, helperName) {
  const source = original.toString("utf8");
  if (source.split(anchor).length !== 2)
    fail("Expected exactly one audited Responses factory anchor");
  return Buffer.from(
    `import { wrapOpenCodeGoMuseResponses } from "./${helperName}";\n` +
      source.replace(
        anchor,
        '"openai-responses": wrapOpenCodeGoMuseResponses(openAIResponsesApi()),',
      ),
  );
}
function versionChecks(root) {
  const plugin = json(path.join(root, "package.json"));
  const pi = json(
    path.join(root, "node_modules/@earendil-works/pi-ai/package.json"),
  );
  if (plugin.name !== "dsh-llm-opencode-go" || plugin.version !== "0.1.28")
    fail("Unsupported plugin version (requires dsh-llm-opencode-go 0.1.28)");
  if (pi.name !== "@earendil-works/pi-ai" || pi.version !== "0.85.1")
    fail("Unsupported nested pi-ai version (requires 0.85.1)");
}

export function runCompatibility({ pluginRoot, mode = "check" }) {
  if (!["check", "dry-run", "apply", "rollback"].includes(mode))
    fail("Unknown mode");
  const root = path.resolve(pluginRoot);
  safePath(root);
  versionChecks(root);
  const lib = path.join(root, "lib");
  const target = path.join(lib, "index.js");
  const manifestFile = path.join(lib, ".muse-compat-manifest.json");
  const backupFile = path.join(lib, ".muse-compat-original.js");
  const helper = read(
    fileURLToPath(new URL("../compat/opencode-go-muse.mjs", import.meta.url)),
  );
  const helperHash = hash(helper);
  const helperName = `muse-compat-${helperHash}.mjs`;
  const helperFile = path.join(lib, helperName);
  safePath(target);
  safePath(manifestFile, true);
  safePath(backupFile, true);
  safePath(helperFile, true);
  const lockFile = path.join(lib, ".muse-compat.lock");
  let lock;
  try {
    if (mode === "apply" || mode === "rollback") {
      safePath(lockFile, true);
      lock = fs.openSync(lockFile, "wx", 0o600);
    }
    const current = read(target);
    const currentHash = hash(current);
    let original = current;
    let originalMode = fs.statSync(target).mode & 0o777;
    if (fs.existsSync(manifestFile)) {
      const manifest = json(manifestFile);
      original = read(backupFile);
      originalMode = manifest.originalMode;
      if (
        manifest.schema !== 1 ||
        manifest.pluginVersion !== "0.1.28" ||
        manifest.piAiVersion !== "0.85.1" ||
        !supportedHashes.has(manifest.originalHash) ||
        hash(original) !== manifest.originalHash ||
        !/^muse-compat-[a-f0-9]{64}\.mjs$/.test(manifest.helperName) ||
        manifest.helperName !== `muse-compat-${manifest.helperHash}.mjs` ||
        !Number.isInteger(originalMode) ||
        originalMode < 0 ||
        originalMode > 0o777
      )
        fail("Invalid or incompatible compatibility manifest/backup");
      if ((fs.statSync(backupFile).mode & 0o777) !== originalMode)
        fail("Backup permissions changed");
      if (
        hash(read(path.join(lib, manifest.helperName))) !== manifest.helperHash
      )
        fail("Helper snapshot was modified");
      const patched = patchedBytes(original, manifest.helperName);
      if (hash(patched) !== manifest.patchedHash)
        fail("Manifest patched hash mismatch");
      if (
        currentHash !== manifest.originalHash &&
        currentHash !== manifest.patchedHash
      )
        fail(
          "Plugin changed after compatibility install; refusing to overwrite",
        );
      if ((fs.statSync(target).mode & 0o777) !== originalMode)
        fail("Plugin permissions changed after compatibility install");
      if (mode === "apply" && manifest.helperHash !== helperHash)
        fail(
          "A different helper is installed; rollback first and archive the old manifest/backup before a separately reviewed reinstallation",
        );
      if (currentHash === manifest.patchedHash) {
        if (mode === "rollback") {
          atomicWrite(target, original, originalMode);
          return {
            status: "rolled-back",
            root,
            originalHash: manifest.originalHash,
          };
        }
        return {
          status: "patched",
          root,
          patchedHash: manifest.patchedHash,
          helperHash: manifest.helperHash,
        };
      }
      if (mode === "rollback") return { status: "original", root };
    } else {
      if (!supportedHashes.has(currentHash))
        fail(
          "Unsupported plugin input hash; review the upgraded/modified plugin before patching",
        );
      if (fs.existsSync(backupFile) || fs.existsSync(helperFile))
        fail("Orphan compatibility artifacts; inspect before retrying");
      if (mode === "rollback") return { status: "original", root };
    }
    const patched = patchedBytes(original, helperName);
    if (mode !== "apply")
      return {
        status: "applicable",
        root,
        originalHash: hash(original),
        patchedHash: hash(patched),
        helperHash,
      };
    if (!fs.existsSync(manifestFile)) {
      atomicWrite(backupFile, original, originalMode);
      atomicWrite(helperFile, helper, 0o444);
      const manifest = {
        schema: 1,
        pluginVersion: "0.1.28",
        piAiVersion: "0.85.1",
        originalHash: hash(original),
        originalMode,
        patchedHash: hash(patched),
        helperHash,
        helperName,
      };
      atomicWrite(
        manifestFile,
        JSON.stringify(manifest, null, 2) + "\n",
        0o600,
      );
    }
    if (
      hash(read(target)) !== hash(original) ||
      hash(read(helperFile)) !== helperHash
    )
      fail("Files changed during preparation; refusing to patch");
    atomicWrite(target, patched, originalMode);
    if (hash(read(target)) !== hash(patched))
      fail("Post-write plugin verification failed");
    return { status: "applied", root, patchedHash: hash(patched), helperHash };
  } finally {
    if (lock !== undefined) {
      fs.closeSync(lock);
      fs.unlinkSync(lockFile);
    }
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    let pluginRoot;
    let mode = "check";
    let hasMode = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--plugin-root" && !pluginRoot) {
        pluginRoot = args[++i];
        if (!pluginRoot || pluginRoot.startsWith("--"))
          fail("--plugin-root requires a directory");
      } else if (
        ["--check", "--dry-run", "--apply", "--rollback"].includes(args[i]) &&
        !hasMode
      ) {
        mode = args[i].slice(2);
        hasMode = true;
      } else fail(`Unknown or duplicate argument: ${args[i]}`);
    }
    if (!pluginRoot)
      fail(
        "Usage: node scripts/apply-opencode-go-muse-compat.mjs --plugin-root /absolute/plugin/directory [--check|--dry-run|--apply|--rollback]",
      );
    console.log(
      JSON.stringify(runCompatibility({ pluginRoot, mode }), null, 2),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
