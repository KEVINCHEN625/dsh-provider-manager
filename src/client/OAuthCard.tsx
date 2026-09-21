import type { OAuthEntry } from "../shared/protocol.js";
import type { LoginState } from "./controller.js";
import type { Translate } from "./locales.js";
import { RoleBadge } from "./ProviderIcon.js";

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
  return (
    <article className="pm-row">
      <div className="pm-identity">
        <span className="pm-oauth-mark" aria-hidden="true">
          {letter}
        </span>
        <div>
          <div className="pm-title">
            <h3>{entry.label}</h3>
            <RoleBadge role="llm" label={t("llmBadge")} />
          </div>
          <p>
            <span
              className={
                status === "oauthSignedOut" ? "pm-dot" : "pm-dot pm-dot-on"
              }
            />
            {t(status)}
          </p>
        </div>
      </div>
      <div className="pm-quota">
        <p>{t("loginMethod")}</p>
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
