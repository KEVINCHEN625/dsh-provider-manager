import type { OAuthEntry } from "../shared/protocol.js";
import type { LoginState, QuotaView } from "./controller.js";
import type { Translate } from "./locales.js";
import { QuotaSummary } from "./QuotaSummary.js";
import { BrandMark, RoleBadge, brandMark } from "./ProviderIcon.js";

const BRANDS: Record<string, string> = {
  anthropic: "#d97757",
  claude: "#d97757",
  "openai-codex": "#10a37f",
  codex: "#10a37f",
  "kimi-coding": "#5b6cff",
  kimi: "#5b6cff",
  xai: "#111111",
  "github-copilot": "#2f81f7",
  copilot: "#2f81f7",
  openrouter: "#6467f2",
};

export function oauthBrandColor(providerId: string): string | undefined {
  const id = providerId.toLowerCase();
  if (BRANDS[id]) return BRANDS[id];
  for (const [name, color] of Object.entries(BRANDS))
    if (id.includes(name)) return color;
  return undefined;
}

export function oauthQuotaView(entry: OAuthEntry): QuotaView | undefined {
  const quota = entry.quota;
  if (!quota || quota.status === "unsupported") return undefined;
  if (quota.status === "expired")
    return { status: "error", error: "oauthExpired" };
  if (quota.status === "missing-credential")
    return { status: "missing-credential" };
  if (quota.status === "error")
    return { status: "error", error: quota.error || "UNAVAILABLE" };
  return {
    status: "ready",
    snapshot: {
      providerId: entry.providerId,
      status: "ready",
      windows: [...quota.windows],
      stale: false,
      ...(entry.quotaFetchedAt ? { fetchedAt: entry.quotaFetchedAt } : {}),
    },
  };
}

export type OAuthBadge = "oauthInFlight" | "oauthSignedIn" | "oauthSignedOut";

export function oauthStatus(
  entry: OAuthEntry,
  login?: LoginState,
): OAuthBadge {
  const local =
    login?.providerId === entry.providerId &&
    login.phase !== "idle" &&
    login.phase !== "done";
  if (local || entry.inFlight) return "oauthInFlight";
  if (entry.configured) return "oauthSignedIn";
  return "oauthSignedOut";
}

export function OAuthCard({
  entry,
  login,
  t,
  onOpen,
}: {
  entry: OAuthEntry;
  login?: LoginState;
  t: Translate;
  onOpen: () => void;
}) {
  const status = oauthStatus(entry, login);
  const letter = [...entry.label][0]?.toUpperCase() || "?";
  const mark = brandMark(entry.providerId, entry.label);
  const brand = mark?.hex || oauthBrandColor(entry.providerId);
  const signedIn =
    status === "oauthSignedIn" && entry.account
      ? `${t("oauthSignedIn")} · ${entry.account}`
      : t(status);
  return (
    <article className="pm-row">
      <div className="pm-identity">
        <span
          className="pm-oauth-mark"
          aria-hidden="true"
          style={brand ? { background: brand, color: "#fff" } : undefined}
        >
          {mark ? (
            <BrandMark id={entry.providerId} name={entry.label} />
          ) : (
            letter
          )}
        </span>
        <div>
          <div className="pm-title">
            <h3>{entry.label}</h3>
            <RoleBadge role="llm" label={t("llmBadge")} />
            {entry.builtin && (
              <span className="pm-badge">{t("builtinAdapter")}</span>
            )}
          </div>
          <p>
            <span
              className={
                status === "oauthSignedOut" ? "pm-dot" : "pm-dot pm-dot-on"
              }
            />
            {signedIn}
          </p>
        </div>
      </div>
      <div className="pm-quota">
        {entry.quota?.status === "unsupported" ? (
          <p>{t("oauthQuotaUnsupported")}</p>
        ) : entry.quota ? (
          <QuotaSummary
            view={oauthQuotaView(entry)}
            t={t}
            name={entry.label}
          />
        ) : (
          <p>{t("loginMethod")}</p>
        )}
      </div>
      <button
        type="button"
        className="pm-setup"
        aria-label={`${t("details")}: ${entry.label}`}
        onClick={onOpen}
      >
        {t("details")}
      </button>
    </article>
  );
}
