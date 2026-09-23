import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, realpathSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const source = JSON.parse(readFileSync("package.json", "utf8"));
const prefix = `${source.name}-${source.version}-`;
const names = readdirSync("artifacts").filter(
  (name) => name.startsWith(prefix) && name.endsWith(".tgz"),
);
if (names.length !== 1)
  throw Error(`Expected one content-hashed tarball, found ${names.join(", ")}`);
const target = resolve("artifacts", names[0]);
const short = createHash("sha256").update(readFileSync(target)).digest("hex").slice(0, 12);
if (!names[0].endsWith(`-${short}.tgz`))
  throw Error("Tarball name does not match its content hash");
const directory = mkdtempSync(resolve("artifacts/pack-check-"));
execFileSync("tar", ["-xzf", target, "-C", directory]);
const root = resolve(directory, "package");
const manifest = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
);
for (const file of [
  "lib/index.js",
  "lib/oauth.js",
  "lib/client.js",
  "lib/types/host/index.d.ts",
  "lib/types/client/index.d.ts",
  "cordis.patch.yml",
])
  readFileSync(resolve(root, file));
if (
  manifest.name !== source.name ||
  manifest.version !== source.version ||
  manifest.dsh.bundle.patch !== "./cordis.patch.yml" ||
  manifest.dsh.client.platform !== "web"
)
  throw Error("Invalid bundle manifest");
const code = readFileSync(resolve(root, "lib/client.js"), "utf8");
if (/node:|\/Users\/|deepseek-harness|react\.production/.test(code))
  throw Error("Unsafe browser artifact");
const require = createRequire(import.meta.url);
let plugin;
vm.runInNewContext(code, {
  window: {
    __ModuleLoader__: {
      load: (entry) => {
        if (entry.id !== "dsh-provider-manager") throw Error("Wrong plugin id");
        plugin = entry.factory((name) => {
          if (!["react", "react/jsx-runtime"].includes(name))
            throw Error("Undeclared browser require " + name);
          return require(name);
        });
      },
    },
  },
  AbortController,
  setTimeout,
  clearTimeout,
  URL,
});
if (typeof plugin?.apply !== "function")
  throw Error("Browser closure factory not callable");
for (const [name, version] of Object.entries({
  ...manifest.dependencies,
  ...manifest.peerDependencies,
})) {
  if (/workspace:|file:|link:/.test(version))
    throw Error("Nonregistry dependency");
  if (
    realpathSync(fileURLToPath(import.meta.resolve(name))).includes(
      "/deepseek-harness/",
    )
  )
    throw Error("Mutable source dependency");
}
console.log(
  JSON.stringify({
    tarball: target,
    browserFactory: "evaluated",
    exports: Object.keys(plugin),
    packageVersion: manifest.version,
  }),
);
