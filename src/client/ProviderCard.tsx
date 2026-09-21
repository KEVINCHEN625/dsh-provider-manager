import type { Provider } from "../shared/protocol.js";
import type { State } from "./controller.js";
import type { Translate, LocaleKey } from "./locales.js";
import { ProviderIcon, RoleBadge } from "./ProviderIcon.js";
import { QuotaSummary } from "./QuotaSummary.js";

export function ProviderCard({
  provider,
  state,
  t,
  onOpen,
}: {
  provider: Provider;
  state: State;
  t: Translate;
  onOpen: () => void;
}) {
  const keyLabel = !provider.credential
    ? "unknown"
    : provider.credential.configured
      ? "configured"
      : "missing";
  return (
    <article className="pm-row">
      <div className="pm-identity">
        <ProviderIcon id={provider.id} name={provider.name} />
        <div>
          <div className="pm-title">
            <h3>{provider.name}</h3>
            <RoleBadge role="llm" label={t("llmBadge")} />
          </div>
          <p>
            <span
              className={
                provider.credential?.configured ? "pm-dot pm-dot-on" : "pm-dot"
              }
            />
            {t(keyLabel)}
            {provider.catalogError
              ? ""
              : ` · ${provider.models.length} ${t("count")}`}
          </p>
        </div>
      </div>
      <QuotaSummary
        view={state.quotas[provider.id]}
        t={t}
        name={provider.name}
        variant="headline"
      />
      <button
        type="button"
        className="pm-setup"
        aria-label={`${t("details")}: ${provider.name}`}
        onClick={onOpen}
      >
        {t("details")}
      </button>
    </article>
  );
}

export function MuseCard({
  installed,
  t,
  onOpen,
}: {
  installed: boolean;
  t: Translate;
  onOpen: () => void;
}) {
  return (
    <article className="pm-row">
      <div className="pm-identity">
        <ProviderIcon id="muse" name={t("muse")} />
        <div>
          <div className="pm-title">
            <h3>{t("muse")}</h3>
            <RoleBadge role="agent" label={t("agentBadge")} />
          </div>
          <p>{t(installed ? "installed" : "notInstalled")}</p>
        </div>
      </div>
      <div className="pm-quota">
        <p>{t("quotaUnsupported")}</p>
      </div>
      <button
        type="button"
        className="pm-setup"
        aria-label={`${t("details")}: ${t("muse")}`}
        onClick={onOpen}
      >
        {t("details")}
      </button>
    </article>
  );
}

export type { LocaleKey };
