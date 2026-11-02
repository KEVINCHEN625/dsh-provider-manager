import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { GO_KEY, GO_KEY_2, GO_PREFERENCE_REF } from "./catalog.js";

/** One OpenCode Go key-pool slot. */
export type GoSlot = "primary" | "second";

/** Slot order for a preference; the preferred slot is tried first. */
export function goSlotOrder(preferred: GoSlot): [string, string] {
  return preferred === "second" ? [GO_KEY_2, GO_KEY] : [GO_KEY, GO_KEY_2];
}

/**
 * Read the preferred pool slot. Stored as a plain credential ref so the
 * choice persists and hot-reloads on every host version (settings sections
 * are not visible on 0.2.x describe(), so they cannot hold plugin state).
 * Anything absent or unrecognized falls back to the primary slot — the
 * earliest-configured key.
 */
export async function readGoPreferred(
  resolve: (ref: ReturnType<typeof credentialRef>) => Promise<{ value: string } | undefined>,
): Promise<GoSlot> {
  const hit = await resolve(credentialRef(GO_PREFERENCE_REF));
  return hit?.value === "second" ? "second" : "primary";
}
