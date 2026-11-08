import { useEffect, useId, useRef, useState } from "react";
import {
  PROMPT_WITHDRAWN,
  httpUrl,
  type OAuthCatalogView,
  type OAuthEntry,
} from "../shared/protocol.js";
import { formatContextWindow } from "../shared/api-presets.js";
import type { Controller, State, LoginState } from "./controller.js";
import type { Translate, LocaleKey } from "./locales.js";
import { errorCode } from "./controller.js";
import { oauthBrandColor, oauthQuotaView, oauthStatus } from "./OAuthCard.js";
import { QuotaSummary } from "./QuotaSummary.js";
import { Result } from "./Result.js";
import { BrandMark, RoleBadge, brandMark } from "./ProviderIcon.js";

function safeLoginUrl(value: string | undefined) {
  return value === undefined ? undefined : httpUrl(value);
}

function formatTokens(value: number | undefined) {
  if (value === undefined) return "—";
  if (value === 1_050_000) return "1.05M";
  return formatContextWindow(value);
}

function canActivate(model: OAuthCatalogView["models"][number]) {
  // Host selectorModels accepts available rows even when only id/name are known.
  return model.available;
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
  const [copied, setCopied] = useState<Record<string, "ok" | "error">>({});
  const copyGeneration = useRef(0);
  const reservation = useRef<{
    providerId: string;
    sessionId?: string;
    popup: Window;
    navigated: boolean;
    timer?: ReturnType<typeof setTimeout>;
  }>();
  const closeBlank = () => {
    const reserved = reservation.current;
    reservation.current = undefined;
    if (!reserved) return;
    clearTimeout(reserved.timer);
    if (reserved.navigated) return;
    try {
      if (
        !reserved.popup.closed &&
        reserved.popup.location.href === "about:blank"
      )
        reserved.popup.close();
    } catch {
      /* A user-navigated page no longer belongs to this reservation. */
    }
  };
  const consumeNotice = (current: LoginState | undefined) => {
    const reserved = reservation.current;
    if (!reserved || !current) return;
    if (
      current.providerId !== reserved.providerId ||
      current.phase === "done"
    ) {
      closeBlank();
      return;
    }
    if (!reserved.sessionId) return;
    if (current.sessionId !== reserved.sessionId) {
      closeBlank();
      return;
    }
    if (reserved.navigated) return;
    const notice = current.events.find(
      (event) => event.kind === "notice" && safeLoginUrl(event.url),
    );
    if (notice?.kind === "notice" && notice.url) {
      try {
        if (
          reserved.popup.closed ||
          reserved.popup.location.href !== "about:blank"
        ) {
          closeBlank();
          return;
        }
        reserved.popup.location.replace(safeLoginUrl(notice.url)!);
        reserved.navigated = true;
        clearTimeout(reserved.timer);
      } catch {
        closeBlank();
      }
    } else if (current.phase === "awaiting-prompt") closeBlank();
  };
  const startLogin = () => {
    const live = controller.getSnapshot().login;
    if (
      live?.providerId === entry.providerId &&
      ["starting", "running", "awaiting-prompt"].includes(live.phase)
    )
      return;
    closeBlank();
    ++copyGeneration.current;
    setCopied({});
    // Open while user activation is live, then sever opener before any URL can arrive.
    if (!/^api[-_]?key$/i.test(method)) {
      try {
        const popup = window.open("about:blank", "_blank");
        if (popup) {
          reservation.current = {
            providerId: entry.providerId,
            popup,
            navigated: false,
          };
          popup.opener = null;
          reservation.current.timer = setTimeout(closeBlank, 60_000);
        }
      } catch {
        closeBlank();
      }
    }
    const reserved = reservation.current;
    void controller.loginStart(entry.providerId, method).then((sessionId) => {
      if (!reserved || reservation.current !== reserved) return;
      const current = controller.getSnapshot().login;
      if (
        !sessionId ||
        current?.providerId !== reserved.providerId ||
        current.sessionId !== sessionId
      ) {
        closeBlank();
        return;
      }
      reserved.sessionId = sessionId;
      consumeNotice(current);
    });
  };
  useEffect(() => {
    setMethod(entry.methods[0]?.id || "");
    return () => {
      ++copyGeneration.current;
      closeBlank();
    };
  }, [entry.providerId]);
  useEffect(() => {
    consumeNotice(login);
  }, [login]);
  useEffect(() => {
    ++copyGeneration.current;
    setCopied({});
  }, [login?.sessionId, login?.phase === "done", entry.providerId]);
  const [catalog, setCatalog] = useState<OAuthCatalogView>();
  const [catalogError, setCatalogError] = useState<string>();
  const [catalogPick, setCatalogPick] = useState("");
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
  const quotaOperation = state.operations[`oauth-quota:${entry.providerId}`];
  const quotaBusy = quotaOperation?.status === "loading";
  const pending = active ? login?.pendingPrompt : undefined;
  const events = active && login?.phase !== "done" ? (login?.events ?? []) : [];
  const phase = active ? login?.phase : "idle";
  const copy = async (key: string, value: string) => {
    const generation = copyGeneration.current;
    try {
      await navigator.clipboard.writeText(value);
      if (generation === copyGeneration.current)
        setCopied((current) => ({ ...current, [key]: "ok" }));
    } catch {
      if (generation === copyGeneration.current)
        setCopied((current) => ({ ...current, [key]: "error" }));
    }
  };
  const museSnapshot = entry.builtin === true && entry.providerId === "muse";
  const quotaSection = museSnapshot ? (
    <section className="pm-card">
      {entry.quota?.status === "ready" && entry.quota.windows.length > 0 ? (
        <QuotaSummary
          view={oauthQuotaView(entry)}
          t={t}
          name={entry.label}
          variant="all"
          heading={t("museQuotaSnapshot")}
        />
      ) : (
        <h3>{t("museQuotaSnapshot")}</h3>
      )}
      {(!entry.quota?.windows.some((window) => window.id === "five-hour") ||
        !entry.quota?.windows.some((window) => window.id === "weekly")) && (
        <p>{t("museQuotaMissing")}</p>
      )}
      <p>{t("museQuotaSnapshotHelp")}</p>
      <a
        href="https://dev.meta.ai/usage"
        target="_blank"
        rel="noopener noreferrer"
      >
        {t("museUsageLink")}
      </a>
    </section>
  ) : entry.quota?.status === "unsupported" ? (
    <p>{t("oauthQuotaUnsupported")}</p>
  ) : entry.quota || quotaBusy || quotaOperation?.status === "error" ? (
    <QuotaSummary
      view={
        quotaBusy
          ? { status: "loading" }
          : quotaOperation?.status === "error"
            ? { status: "error", error: quotaOperation.error }
            : oauthQuotaView(entry)
      }
      t={t}
      name={entry.label}
      variant="all"
      onRefresh={() => void controller.refreshOAuthQuota(entry.providerId)}
    />
  ) : null;
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
              onChange={(event) => {
                closeBlank();
                setMethod(event.target.value);
              }}
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
          onClick={startLogin}
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
            onClick={() => {
              closeBlank();
              void controller.loginCancel();
            }}
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
                    {safeLoginUrl(event.url) && (
                      <p>
                        <a
                          href={safeLoginUrl(event.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {event.url}
                        </a>{" "}
                        <button
                          type="button"
                          className="pm-quiet"
                          onClick={() =>
                            void copy(
                              `${event.index}:url`,
                              safeLoginUrl(event.url)!,
                            )
                          }
                        >
                          {copied[`${event.index}:url`] === "ok"
                            ? t("loginUrlCopied")
                            : t("loginCopyUrl")}
                        </button>
                        {copied[`${event.index}:url`] === "error" && (
                          <span role="status">{t("loginCopyFailed")}</span>
                        )}
                      </p>
                    )}
                    {event.code && (
                      <p>
                        <code>{event.code}</code>{" "}
                        <button
                          type="button"
                          className="pm-quiet"
                          onClick={() =>
                            void copy(`${event.index}:code`, event.code!)
                          }
                        >
                          {copied[`${event.index}:code`] === "ok"
                            ? t("loginCodeCopied")
                            : t("loginCopyCode")}
                        </button>
                        {copied[`${event.index}:code`] === "error" && (
                          <span role="status">{t("loginCopyFailed")}</span>
                        )}
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
        <button type="button" onClick={startLogin}>
          {t("loginRetry")}
        </button>
      )}
      {quotaSection}
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
                              {t("catalogSpec")}{" "}
                              {formatTokens(model.specContextWindow)}
                            </div>
                          ) : null}
                        </td>
                        <td>{formatTokens(model.maxTokens)}</td>
                        <td>
                          {model.efforts.map((effort) => (
                            <span key={effort} className="pm-effort">
                              {effort === "none" ? "off" : effort}
                            </span>
                          ))}
                        </td>
                        <td>{model.input.join(", ") || "—"}</td>
                        <td>
                          {model.status === "unverified"
                            ? t("catalogUnverified")
                            : model.status === "unavailable" || !model.available
                              ? t("catalogUnavailable")
                              : t("catalogAvailable")}
                          {model.verifiedAt ? (
                            <div>{model.verifiedAt}</div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>
                {entry.providerId === "radius"
                  ? t("catalogUnknown")
                  : t("catalogEmpty")}
              </p>
            )}
            {catalog.credential === "expired" ? (
              <p>{t("catalogCredential")}</p>
            ) : null}
            {entry.configured && (catalog.probeRemaining ?? 0) > 0 ? (
              <button
                type="button"
                onClick={() => {
                  void controller
                    .probeCatalog(entry.providerId)
                    .then(setCatalog)
                    .catch((error: unknown) =>
                      setCatalogError(errorCode(error)),
                    );
                }}
              >
                {t("catalogProbe")}
              </button>
            ) : null}
            {entry.providerId === "openrouter" ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const modelId = catalogPick.trim();
                  if (!modelId) return;
                  void controller
                    .selectCatalogModel(entry.providerId, modelId)
                    .then((next) => {
                      setCatalog(next);
                      setCatalogPick("");
                    })
                    .catch((error: unknown) =>
                      setCatalogError(errorCode(error)),
                    );
                }}
              >
                <input
                  value={catalogPick}
                  onChange={(event) => setCatalogPick(event.target.value)}
                  placeholder={t("catalogAddPlaceholder")}
                  aria-label={t("catalogAdd")}
                />
                <button type="submit">{t("catalogAdd")}</button>
                <p>{t("catalogSuggest")}</p>
              </form>
            ) : null}
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
      <Result operation={state.operations.login} t={t} />
      <Result operation={state.operations.logout} t={t} />
    </div>
  );
}
