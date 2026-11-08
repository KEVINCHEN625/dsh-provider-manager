import type { OAuthEntry, QuotaWindow } from "../../shared/protocol.js";

/** Login-time observation only: no device token or raw mint response is retained. */
export interface MuseUsage {
  fetchedAt: string;
  windows: QuotaWindow[];
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function percent(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
  );
}
function iso(milliseconds: number): string | undefined {
  if (!Number.isFinite(milliseconds)) return undefined;
  const date = new Date(milliseconds);
  return date.getUTCFullYear() >= 2000 && date.getUTCFullYear() <= 2100
    ? date.toISOString()
    : undefined;
}
function storedDate(value: unknown): string | undefined {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)
    ? iso(Date.parse(value))
    : undefined;
}
function window(
  id: QuotaWindow["id"],
  used: unknown,
  resetsAt?: string,
): QuotaWindow | undefined {
  return percent(used)
    ? {
        id,
        usedPercent: used,
        remainingPercent: 100 - used,
        ...(resetsAt ? { resetsAt } : {}),
      }
    : undefined;
}
/** Meta mint resets_at is Unix seconds, not milliseconds or an ISO string. */
export function parseMuseUsage(
  value: unknown,
  now: number,
): MuseUsage | undefined {
  const usage = object(value);
  const fetchedAt = iso(now);
  if (!fetchedAt) return undefined;
  const windows: QuotaWindow[] = [];
  for (const [field, id, minutes] of [
    ["window", "five-hour", 300],
    ["weekly", "weekly", 10080],
  ] as const) {
    const row = object(usage[field]);
    // Do not mislabel a differently sized window as five hours or seven days.
    if (
      row.window_duration_mins !== undefined &&
      row.window_duration_mins !== minutes
    )
      continue;
    const reset =
      typeof row.resets_at === "number" ? iso(row.resets_at * 1000) : undefined;
    const parsed = window(id, row.used_percent, reset);
    if (parsed) windows.push(parsed);
  }
  return windows.length ? { fetchedAt, windows } : undefined;
}
/** Revalidate stored data and project only public quota fields on every read. */
export function museQuotaFromRecord(
  record: unknown,
): Pick<OAuthEntry, "quota" | "quotaFetchedAt"> {
  const grant = object(record);
  const usage = object(
    grant.kind === "grant" ? object(grant.payload).museUsage : undefined,
  );
  const fetchedAt = storedDate(usage.fetchedAt);
  const windows: QuotaWindow[] = [];
  if (fetchedAt && Array.isArray(usage.windows)) {
    for (const id of ["five-hour", "weekly"] as const) {
      const row = usage.windows.map(object).find((item) => item.id === id);
      if (!row) continue;
      const parsed = window(id, row.usedPercent, storedDate(row.resetsAt));
      if (parsed) windows.push(parsed);
    }
  }
  return windows.length && fetchedAt
    ? { quota: { status: "ready", windows }, quotaFetchedAt: fetchedAt }
    : { quota: { status: "unsupported", windows: [] } };
}
