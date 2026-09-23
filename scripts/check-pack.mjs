import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const source = JSON.parse(readFileSync("package.json", "utf8"));
const target = resolve(`artifacts/${source.name}-${source.version}.tgz`);
const directory = mkdtempSync(resolve("artifacts/pack-check-"));
execFileSync("tar", ["-xzf", target, "-C", directory]);
const root = resolve(directory, "package");
const manifest = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
);
for (const file of [
  "lib/index.js",
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
