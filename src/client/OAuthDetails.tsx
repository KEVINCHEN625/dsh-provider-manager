import { useEffect, useId, useState } from "react";
import {
  PROMPT_WITHDRAWN,
  type OAuthCatalogView,
  type OAuthEntry,
} from "../shared/protocol.js";
import { formatContextWindow } from "../shared/api-presets.js";
import type { Controller, State } from "./controller.js";
import type { Translate, LocaleKey } from "./locales.js";
import { errorCode } from "./controller.js";
import { oauthBrandColor, oauthQuotaView, oauthStatus } from "./OAuthCard.js";
import { QuotaSummary } from "./QuotaSummary.js";
import { Result } from "./Result.js";
import { BrandMark, RoleBadge, brandMark } from "./ProviderIcon.js";

function formatTokens(value: number | undefined) {
  if (value === undefined) return "—";
  if (value === 1_050_000) return "1.05M";
  return formatContextWindow(value);
}

function canActivate(model: OAuthCatalogView["models"][number]) {
  return (
    model.available &&
    model.contextWindow !== undefined &&
    model.maxTokens !== undefined &&
    model.efforts.length > 0 &&
    model.input.length > 0
  );
}

export function OAuthDetails({
  entry,
  controller,
  state,
  t,
  onClose,
}: {
  entry: OAuthEntry;
  controller: Controller;
  state: State;
  t: Translate;
  onClose: () => void;
}) {
  const id = useId();
  const login = state.login;
  const active = login?.providerId === entry.providerId;
  const [method, setMethod] = useState(entry.methods[0]?.id || "");
  const [answer, setAnswer] = useState("");
  const [copied, setCopied] = useState(false);
  const [catalog, setCatalog] = useState<OAuthCatalogView>();
  const [catalogError, setCatalogError] = useState<string>();
  useEffect(() => {
    let dead = false;
    setCatalog(undefined);
    setCatalogError(undefined);
    void controller
      .loadCatalog(entry.providerId)
      .then((view) => {
        if (!dead) setCatalog(view);
      })
      .catch((error: unknown) => {
        if (!dead) setCatalogError(errorCode(error));
      });
    return () => {
      dead = true;
    };
  }, [controller, entry.providerId]);
  useEffect(() => {
    setAnswer("");
  }, [login?.pendingPrompt?.seq, state.clearEpoch]);
  const letter = [...entry.label][0]?.toUpperCase() || "?";
  const mark = brandMark(entry.providerId, entry.label);
  const brand = mark?.hex || oauthBrandColor(entry.providerId);
  const status = oauthStatus(entry, login);
  const signedIn =
    status === "oauthSignedIn" && entry.account
      ? `${t("oauthSignedIn")} · ${entry.account}`
      : t(status);
  const quotaBusy =
    state.operations[`oauth-quota:${entry.providerId}`]?.status === "loading";
  const pending = active ? login?.pendingPrompt : undefined;
  const events = active ? login?.events ?? [] : [];
  const phase = active ? login?.phase : "idle";
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="pm-page">
      <button type="button" className="pm-back" onClick={onClose}>
        {t("back")}
      </button>
      <header className="pm-page-head">
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
        <div className="pm-identity">
          <div className="pm-title">
            <h2>{entry.label}</h2>
            <RoleBadge role="llm" label={t("llmBadge")} />
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
      </header>
      <p>{t("oauthHelp")}</p>
      <section className="pm-card">
        <h3>{t("loginMethod")}</h3>
        {entry.methods.length > 1 && (
          <>
            <label htmlFor={`${id}-method`}>{t("loginMethod")}</label>
            <select
              id={`${id}-method`}
              value={method}
              onChange={(event) => setMethod(event.target.value)}
            >
              {entry.methods.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </>
        )}
        <button
          type="button"
          disabled={
            phase === "starting" ||
            phase === "running" ||
            phase === "awaiting-prompt"
          }
          onClick={() => void controller.loginStart(entry.providerId, method)}
        >
          {t("loginStart")}
        </button>
        {entry.configured && <p>{t("loginOverwrite")}</p>}
        {entry.configured && (
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(t("loginLogoutConfirm"))) return;
              void controller.logout(entry.providerId);
            }}
          >
            {t("loginLogout")}
          </button>
        )}
        {(phase === "running" || phase === "awaiting-prompt") && (
          <button
            type="button"
            onClick={() => void controller.loginCancel()}
          >
            {t("loginCancel")}
          </button>
        )}
      </section>
      {events.length > 0 && (
        <section className="pm-card">
          <ol className="pm-timeline">
            {events.map((event) => (
              <li key={event.index}>
                {event.kind === "notice" ? (
                  <>
                    <p>
                      {event.message === PROMPT_WITHDRAWN
                        ? t("promptWithdrawn")
                        : event.message}
                    </p>
                    {event.url && (
                      <p>
                        <a
                          href={event.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {event.url}
                        </a>
                      </p>
                    )}
                    {event.code && (
                      <p>
                        <code>{event.code}</code>{" "}
                        <button
                          type="button"
                          className="pm-quiet"
                          onClick={() => void copy(event.code!)}
                        >
                          {copied ? t("loginCopied") : t("loginCopy")}
                        </button>
                      </p>
                    )}
                  </>
                ) : (
                  <p>
                    {event.message || t("loginMethod")}
                    {event.promptKind === "select" && event.options
                      ? ` · ${event.options.map((item) => item.label).join(", ")}`
                      : ""}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
      {pending && (
        <section className="pm-card">
          <p>{pending.message}</p>
          {pending.promptKind === "select" && pending.options ? (
            <div>
              {pending.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() =>
                    void controller.loginAnswer(pending.seq, option.id)
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const value = answer;
                setAnswer("");
                void controller.loginAnswer(pending.seq, value);
              }}
            >
              <label htmlFor={`${id}-answer`}>{pending.message}</label>
              <input
                id={`${id}-answer`}
                type={pending.promptKind === "secret" ? "password" : "text"}
                autoComplete="off"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                required
              />
              <button type="submit">{t("loginSubmit")}</button>
            </form>
          )}
          <button
            type="button"
            onClick={() => void controller.loginDecline(pending.seq)}
          >
            {t("loginDecline")}
          </button>
        </section>
      )}
      {phase === "done" && (
        <p role="status">
          {t(
            login?.result === "ok"
              ? "loginSuccess"
              : login?.result === "declined"
                ? "loginDeclined"
                : login?.result === "cancelled"
                  ? "loginCancelled"
                  : ((login?.error || "loginFailed") as LocaleKey),
          )}
        </p>
      )}
      {phase === "done" && login?.result !== "ok" && (
        <button
          type="button"
          onClick={() => void controller.loginStart(entry.providerId, method)}
        >
          {t("loginRetry")}
        </button>
      )}
      <section className="pm-card">
        <h3>{t("models")}</h3>
        {catalog ? (
          <>
            <p className="pm-meter-detail">
              <span>{t("catalogSpec")}</span>
              <span>{" · "}</span>
              <span>
                {t(
                  catalog.specSource === "remote"
                    ? "catalogSourceRemote"
                    : catalog.specSource === "snapshot"
                      ? "catalogSourceSnapshot"
                      : "catalogSourceOfficial",
                )}
              </span>
              {catalog.specFetchedAt ? (
                <span>
                  {" · "}
                  {t("catalogFetched")} {catalog.specFetchedAt}
                </span>
              ) : null}
            </p>
            <p className="pm-meter-detail">
              <span>{t("catalogChannel")}</span>
              <span>{" · "}</span>
              <span>
                {t(
                  catalog.source === "remote"
                    ? "catalogSourceRemote"
                    : catalog.source === "snapshot"
                      ? "catalogSourceSnapshot"
                      : "catalogSourceOfficial",
                )}
              </span>
              {catalog.fetchedAt ? (
                <span>
                  {" · "}
                  {t("catalogFetched")} {catalog.fetchedAt}
                </span>
              ) : null}
              <span>
                {" · "}
                {t(
                  catalog.route === "pinned"
                    ? "catalogRoutePinned"
                    : catalog.route === "custom"
                      ? "catalogRouteCustom"
                      : catalog.route === "missing"
                        ? "catalogRouteMissing"
                        : "catalogRouteEmpty",
                )}
              </span>
            </p>
            {catalog.models.length > 0 ? (
              <div className="pm-catalog-wrap">
                <table className="pm-catalog">
                  <thead>
                    <tr>
                      <th>{t("modelColumn")}</th>
                      <th>{t("catalogContext")}</th>
                      <th>{t("catalogMaxOutput")}</th>
                      <th>{t("catalogReasoning")}</th>
                      <th>{t("catalogInput")}</th>
                      <th>{t("catalogStatus")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.models.map((model) => (
                      <tr key={model.id}>
                        <td>
                          <div>{model.name}</div>
                          <code>{model.id}</code>
                          {model.servedModel ? (
                            <div>
                              {t("catalogServed")} {model.servedModel}
                              {t("catalogServedSuffix")}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <span>{formatTokens(model.contextWindow)}</span>
                          {model.specContextWindow !== undefined &&
                          model.specContextWindow !== model.contextWindow ? (
                            <div>
                              {t("catalogSpec")} {formatTokens(model.specContextWindow)}
                            </div>
                          ) : null}
                        </td>
                        <td>{formatTokens(model.maxTokens)}</td>
                        <td>
                          {model.efforts.map((effort) => (
                            <span key={effort} className="pm-effort">
                              {effort}
                            </span>
                          ))}
                        </td>
                        <td>{model.input.join(", ") || "—"}</td>
                        <td>
                          {model.available
                            ? t("catalogAvailable")
                            : t("catalogUnavailable")}
                          {model.verifiedAt ? <div>{model.verifiedAt}</div> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>{t("catalogEmpty")}</p>
            )}
            {catalog.route === "pinned" && (
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm(t("catalogResetConfirm"))) return;
                  void controller
                    .resetCatalog(entry.providerId)
                    .then(setCatalog)
                    .catch((error: unknown) =>
                      setCatalogError(errorCode(error)),
                    );
                }}
              >
                {t("catalogReset")}
              </button>
            )}
            {(catalog.route === "missing" || catalog.route === "empty") &&
              catalog.models.some(canActivate) && (
                <button
                  type="button"
                  onClick={() => {
                    void controller
                      .activateCatalog(entry.providerId)
                      .then(setCatalog)
                      .catch((error: unknown) =>
                        setCatalogError(errorCode(error)),
                      );
                  }}
                >
                  {t("catalogActivate")}
                </button>
              )}
          </>
        ) : (
          <p>{catalogError ? t(catalogError as LocaleKey) : t("loading")}</p>
        )}
      </section>
      {entry.quota?.status === "unsupported" ? (
        <p>{t("oauthQuotaUnsupported")}</p>
      ) : (
        entry.quota && (
          <QuotaSummary
            view={quotaBusy ? { status: "loading" } : oauthQuotaView(entry)}
            t={t}
            name={entry.label}
            variant="all"
            onRefresh={() =>
              void controller.refreshOAuthQuota(entry.providerId)
            }
          />
        )
      )}
      <Result operation={state.operations.login} t={t} />
      <Result operation={state.operations.logout} t={t} />
    </div>
  );
}
