import { access, constants } from "node:fs/promises";
import { delimiter, join } from "node:path";

export function museExecutableNames(platform = process.platform) {
  return platform === "win32"
    ? ["muse.exe", "muse.cmd", "muse.bat", "muse"]
    : ["muse"];
}

export async function detectMuse() {
  const names = museExecutableNames();
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      try {
        await access(join(dir, name), constants.X_OK);
        return true;
      } catch {}
    }
  }
  return false;
}
