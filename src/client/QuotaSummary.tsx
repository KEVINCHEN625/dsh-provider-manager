import type { QuotaSnapshot, QuotaWindow } from "../shared/protocol.js";
import type { QuotaView } from "./controller.js";
import type { LocaleKey, Translate } from "./locales.js";

const labels: Record<QuotaWindow["id"], LocaleKey> = {
  "five-hour": "quotaFiveHour",
  weekly: "quotaWeekly",
  monthly: "quotaMonthly",
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

function WindowMeter({
  window,
  primary,
  t,
}: {
  window: QuotaWindow;
  primary: boolean;
  t: Translate;
}) {
  const label = windowLabel(window.id, t);
  const reset = resetState(window.resetsAt);
  const text =
    window.remainingPercent === undefined
      ? `${label} · ${t("quotaCapUnknown")}`
      : `${label} ${t("quotaRemaining")} ${window.remainingPercent}%`;
  return (
    <div className={primary ? "pm-window pm-window-main" : "pm-window"}>
      <p>{text}</p>
      {window.remainingPercent !== undefined && (
        <progress
          className="pm-bar"
          max={100}
          value={barValue(window.remainingPercent)}
          aria-label={text}
          aria-valuenow={barValue(window.remainingPercent)}
          aria-valuetext={text}
        />
      )}
      {reset === "waiting" && <p>{t("quotaWaiting")}</p>}
      {typeof reset === "number" && (
        <p>
          {t("quotaReset")} {new Date(reset).toLocaleString()}
        </p>
      )}
    </div>
  );
}

export function QuotaSummary({
  view,
  t,
  name,
  onRefresh,
}: {
  view?: QuotaView;
  t: Translate;
  name: string;
  onRefresh: () => void;
}) {
  const snapshot: QuotaSnapshot | undefined = view?.snapshot;
  const status = view?.status ?? "loading";
  const windows = snapshot?.windows ?? [];
  const primary =
    windows.find((window) => window.id === "five-hour") ?? windows[0];
  const rest = windows.filter((window) => window !== primary);
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
    <div className="pm-quota">
      {message && <p>{message}</p>}
      {primary && <WindowMeter window={primary} primary t={t} />}
      {rest.map((window) => (
        <WindowMeter key={window.id} window={window} primary={false} t={t} />
      ))}
      {snapshot?.stale && <p>{t("quotaStale")}</p>}
      {snapshot?.fetchedAt && (
        <p>
          {t("lastUpdated")} {snapshot.fetchedAt}
        </p>
      )}
      {snapshot?.source === "command-default-reference" && (
        <p>{t("quotaUnverified")}</p>
      )}
      <button
        type="button"
        aria-label={`${t("quotaRefresh")}: ${name}`}
        onClick={onRefresh}
        disabled={status === "loading"}
      >
        {status === "error" ? t("quotaRetry") : t("quotaRefresh")}
      </button>
    </div>
  );
}
