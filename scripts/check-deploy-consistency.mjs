import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";

function walk(dir, base = dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...walk(path, base));
    else files.push(relative(base, path));
  }
  return files;
}

const source = JSON.parse(readFileSync("package.json", "utf8"));
const prefix = `${source.name}-${source.version}-`;
const names = readdirSync("artifacts").filter(
  (name) => name.startsWith(prefix) && name.endsWith(".tgz"),
);
if (names.length !== 1)
  throw Error(`Expected one content-hashed tarball, found ${names.join(", ")}`);
const tarball = resolve("artifacts", names[0]);
const packed = readFileSync(tarball);
const digest = createHash("sha256").update(packed).digest("hex");
const short = digest.slice(0, 12);
if (!names[0].endsWith(`-${short}.tgz`))
  throw Error("Tarball name does not match its content hash");

const directory = mkdtempSync(resolve("artifacts/deploy-check-"));
try {
  execFileSync("tar", ["-xzf", tarball, "-C", directory]);
  const root = join(directory, "package");
  const files = walk(root).filter(
    (file) => file.endsWith(".js") || file === "cordis.patch.yml",
  );
  const expected = Object.fromEntries(
    files.map((file) => [
      file,
      createHash("sha256").update(readFileSync(join(root, file))).digest("hex"),
    ]),
  );
  const profiles = ["web", "headless"];
  const installed = {};
  for (const profile of profiles) {
    const base = join(
      homedir(),
      ".dsh",
      "profiles",
      profile,
      "node_modules",
      source.name,
    );
    installed[profile] = Object.fromEntries(
      files.map((file) => [
        file,
        createHash("sha256").update(readFileSync(join(base, file))).digest("hex"),
      ]),
    );
    for (const file of files) {
      if (installed[profile][file] !== expected[file])
        throw Error(`${profile} ${file} does not match ${names[0]}`);
    }
  }
  if (installed.web["lib/oauth.js"] !== installed.headless["lib/oauth.js"])
    throw Error("Web and headless oauth bundles differ");
  console.log(
    JSON.stringify({
      tarball: names[0],
      sha256: digest,
      profiles,
      files,
      sameArtifact: true,
    }),
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
