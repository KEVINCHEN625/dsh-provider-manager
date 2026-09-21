import type { Provider } from "../shared/protocol.js";
import type { Controller, State } from "./controller.js";
import type { Translate, LocaleKey } from "./locales.js";
import { ProviderIcon } from "./ProviderIcon.js";
import { QuotaSummary } from "./QuotaSummary.js";
import { ProviderDetails } from "./ProviderDetails.js";

function toggleDetails(
  event: { preventDefault(): void },
  open: boolean,
  onToggle: (open: boolean) => void,
  onClose?: () => void,
) {
  event.preventDefault();
  const next = !open;
  onToggle(next);
  if (!next) onClose?.();
}

export function ProviderCard({
  provider,
  controller,
  state,
  t,
  edit,
  open,
  onToggle,
}: {
  provider: Provider;
  controller: Controller;
  state: State;
  t: Translate;
  edit: (p: Provider) => void;
  open: boolean;
  onToggle: (open: boolean) => void;
}) {
  const keyLabel = !provider.credential
    ? "unknown"
    : provider.credential.configured
      ? "configured"
      : "missing";
  return (
    <article className="pm-row">
      <ProviderIcon id={provider.id} name={provider.name} />
      <div className="pm-identity">
        <h3>{provider.name}</h3>
        <p>
          {t(keyLabel)}
          {provider.catalogError
            ? ""
            : ` · ${provider.models.length} ${t("count")}`}
        </p>
        <p>{t("connectionUnverified")}</p>
      </div>
      <QuotaSummary
        view={state.quotas[provider.id]}
        t={t}
        name={provider.name}
        onRefresh={() => void controller.refreshQuota(provider, true)}
      />
      <details className="pm-details" open={open}>
        <summary
          role="button"
          aria-expanded={open}
          aria-label={`${t("details")}: ${provider.name}`}
          onClick={(event) =>
            toggleDetails(event, open, onToggle, controller.hide)
          }
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ")
              toggleDetails(event, open, onToggle, controller.hide);
          }}
        >
          {t("details")}
        </summary>
      </details>
      {open && (
        <ProviderDetails
          provider={provider}
          controller={controller}
          state={state}
          t={t}
          edit={edit}
          onClose={() => {
            controller.hide();
            onToggle(false);
          }}
        />
      )}
    </article>
  );
}

export function MuseCard({
  installed,
  t,
  open,
  onToggle,
}: {
  installed: boolean;
  t: Translate;
  open: boolean;
  onToggle: (open: boolean) => void;
}) {
  return (
    <article className="pm-row">
      <ProviderIcon id="muse" name={t("muse")} />
      <div className="pm-identity">
        <h3>{t("muse")}</h3>
        <p>{t(installed ? "installed" : "notInstalled")}</p>
        <p>{t("museBoundary")}</p>
      </div>
      <div className="pm-quota">
        <p>{t("quotaUnsupported")}</p>
      </div>
      <details className="pm-details" open={open}>
        <summary
          role="button"
          aria-expanded={open}
          aria-label={`${t("details")}: ${t("muse")}`}
          onClick={(event) => toggleDetails(event, open, onToggle)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ")
              toggleDetails(event, open, onToggle);
          }}
        >
          {t("details")}
        </summary>
      </details>
      {open && (
        <div className="pm-details-body">
          <p>{t("museHelp")}</p>
          <a
            href="https://dev.meta.ai/docs/muse-code/subscriptions"
            target="_blank"
            rel="noreferrer"
          >
            {t("docs")}
          </a>
        </div>
      )}
    </article>
  );
}

export type { LocaleKey };
