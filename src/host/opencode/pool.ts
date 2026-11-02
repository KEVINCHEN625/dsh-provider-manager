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

/** How long a quota-dead slot stays out of the preferred position. */
export const GO_EXHAUST_TTL_MS = 30 * 60 * 1000;

/**
 * Quota-exhaustion signal for failover: OpenAI SDK errors carry `.status`
 * (402/403/429 = billing, forbidden, rate-limited); message patterns cover
 * providers that only surface text.
 */
export function isQuotaExhaustion(error: unknown): boolean {
  const shaped = error as { status?: unknown; statusCode?: unknown };
  const status = shaped?.status ?? shaped?.statusCode;
  if (status === 429 || status === 402 || status === 403) return true;
  const message = String((error as Error)?.message ?? error);
  return /\b(429|402|403)\b/.test(message) || /insufficient|quota|billing/i.test(message);
}

export function otherSlot(slot: GoSlot): GoSlot {
  return slot === "primary" ? "second" : "primary";
}
