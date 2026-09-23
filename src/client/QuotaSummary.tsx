import type { QuotaSnapshot, QuotaWindow } from "../shared/protocol.js";
import type { QuotaView } from "./controller.js";
import type { LocaleKey, Translate } from "./locales.js";

const labels: Record<QuotaWindow["id"], LocaleKey> = {
  "five-hour": "quotaFiveHour",
  weekly: "quotaWeekly",
  monthly: "quotaMonthly",
  credits: "quotaCredits",
};

export function windowLabel(id: QuotaWindow["id"], t: Translate) {
  return t(labels[id]);
}

export function resetState(resetsAt: string | undefined, now = Date.now()) {
  if (!resetsAt) return undefined;
  const at = Date.parse(resetsAt);
  if (!Number.isFinite(at)) return undefined;
  return at <= now ? "waiting" : at;
}

function barValue(remainingPercent: number) {
  return Math.min(100, Math.max(0, remainingPercent));
}

function resetCaption(resetsAt: string | undefined, t: Translate) {
  const reset = resetState(resetsAt);
  if (reset === "waiting") return t("quotaWaiting");
  if (typeof reset === "number")
    return `${t("quotaReset")} ${new Date(reset).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  return undefined;
}

export function primaryWindow(windows: QuotaWindow[]) {
  return windows.find((window) => window.id === "five-hour") ?? windows[0];
}

function WindowMeter({ window, t }: { window: QuotaWindow; t: Translate }) {
  const label = windowLabel(window.id, t);
  const remaining = window.remainingPercent;
  const caption = resetCaption(window.resetsAt, t);
  const text =
    remaining === undefined
      ? `${label} · ${t("quotaCapUnknown")}`
      : `${label} ${t("quotaRemaining")} ${remaining}%`;
  return (
    <div className="pm-window">
      <div className="pm-meter-top">
        <span className="pm-meter-label">{label}</span>
        {remaining !== undefined && (
          <span className="pm-meter-value">{remaining}%</span>
        )}
      </div>
      {remaining === undefined ? (
        <p className="pm-meter-missing">{t("quotaCapUnknown")}</p>
      ) : (
        <div
          className={remaining < 20 ? "pm-meter pm-meter-warn" : "pm-meter"}
          role="progressbar"
          aria-label={text}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={barValue(remaining)}
          aria-valuetext={text}
        >
          <span
            className="pm-meter-fill"
            style={{ width: `${barValue(remaining)}%` }}
          />
        </div>
      )}
      {caption && <p className="pm-meter-detail">{caption}</p>}
    </div>
  );
}

export function QuotaSummary({
  view,
  t,
  name,
  onRefresh,
  variant = "headline",
}: {
  view?: QuotaView;
  t: Translate;
  name: string;
  onRefresh?: () => void;
  variant?: "headline" | "all";
}) {
  const snapshot: QuotaSnapshot | undefined = view?.snapshot;
  const status = view?.status ?? "loading";
  const windows = snapshot?.windows ?? [];
  const primary = primaryWindow(windows);
  const shown = variant === "headline" ? (primary ? [primary] : []) : windows;
  let message: string | undefined;
  if (status === "loading") message = t("quotaLoading");
  else if (status === "unsupported" || snapshot?.status === "unsupported")
    message = t("quotaUnsupported");
  else if (
    status === "missing-credential" ||
    snapshot?.status === "missing-credential"
  )
    message = t("quotaMissing");
  else if (
    status === "source-unverified" ||
    snapshot?.status === "source-unverified"
  )
    message = t("quotaUnverified");
  else if (status === "error" && !windows.length)
    message = t((view?.error || snapshot?.error || "UNAVAILABLE") as LocaleKey);
  return (
    <div
      className={variant === "all" ? "pm-quota pm-quota-detail" : "pm-quota"}
    >
      {variant === "all" && (
        <div className="pm-quota-head">
          <h3>{t("quotaHeading")}</h3>
          {onRefresh && (
            <button
              type="button"
              aria-label={`${t("quotaRefresh")}: ${name}`}
              onClick={onRefresh}
              disabled={status === "loading"}
            >
              {status === "error" ? t("quotaRetry") : t("quotaRefresh")}
            </button>
          )}
        </div>
      )}
      {message && <p>{message}</p>}
      {shown.map((window) => (
        <WindowMeter key={window.id} window={window} t={t} />
      ))}
      {snapshot?.stale && <p>{t("quotaStale")}</p>}
      {variant === "all" && snapshot?.fetchedAt && (
        <p>
          {t("lastUpdated")} {snapshot.fetchedAt}
        </p>
      )}
      {variant === "all" &&
        snapshot?.source === "command-default-reference" &&
        snapshot.status === "ready" && <p>{t("quotaUnverified")}</p>}
      {variant === "all" && <p className="pm-meter-detail">{t("quotaMeta")}</p>}
    </div>
  );
}
