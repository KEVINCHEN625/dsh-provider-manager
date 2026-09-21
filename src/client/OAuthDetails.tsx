import { useEffect, useId, useState } from "react";
import { PROMPT_WITHDRAWN, type OAuthEntry } from "../shared/protocol.js";
import type { Controller, State } from "./controller.js";
import type { Translate, LocaleKey } from "./locales.js";
import { oauthStatus } from "./OAuthCard.js";
import { Result } from "./Result.js";
import { RoleBadge } from "./ProviderIcon.js";

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
  useEffect(() => {
    setAnswer("");
  }, [login?.pendingPrompt?.seq, state.clearEpoch]);
  const letter = [...entry.label][0]?.toUpperCase() || "?";
  const status = oauthStatus(entry, login);
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
        <span className="pm-oauth-mark" aria-hidden="true">
          {letter}
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
            {t(status)}
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
      <Result operation={state.operations.login} t={t} />
    </div>
  );
}
