import { access, constants } from "node:fs/promises";
import { delimiter, join } from "node:path";
export async function detectMuse() {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    try {
      await access(join(dir, "muse"), constants.X_OK);
      return true;
    } catch {}
  }
  return false;
}
