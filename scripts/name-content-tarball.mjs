import { createHash } from "node:crypto";
import { readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const source = JSON.parse(readFileSync("package.json", "utf8"));
const plain = resolve(`artifacts/${source.name}-${source.version}.tgz`);
const bytes = readFileSync(plain);
const short = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
const named = resolve(
  `artifacts/${source.name}-${source.version}-${short}.tgz`,
);
renameSync(plain, named);
for (const name of readdirSync("artifacts")) {
  if (
    name.startsWith(`${source.name}-${source.version}-`) &&
    name.endsWith(".tgz") &&
    name !== basename(named)
  )
    unlinkSync(resolve("artifacts", name));
}
writeFileSync(
  resolve("artifacts/tarball-name.txt"),
  `${named}\n${createHash("sha256").update(bytes).digest("hex")}\n`,
);
console.log(named);
