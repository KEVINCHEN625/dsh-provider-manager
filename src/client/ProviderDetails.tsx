import { useEffect, useId, useState } from "react";
import type { Provider } from "../shared/protocol.js";
import type { Controller, State } from "./controller.js";
import type { Translate, LocaleKey } from "./locales.js";
import { Result } from "./Result.js";
import { QuotaSummary } from "./QuotaSummary.js";
import { META_MODEL_API } from "../shared/meta-api.js";
import { CustomProviderForm } from "./CustomProviderForm.js";
import { ProviderIcon } from "./ProviderIcon.js";

const OPENCODE_ENDPOINT = "https://opencode.ai/zen/go/v1";
const COMMAND_ENDPOINT = "https://api.commandcode.ai";

function endpoint(provider: Provider) {
  if (provider.id === "opencode-go") return OPENCODE_ENDPOINT;
  if (provider.id === "commandcode") return COMMAND_ENDPOINT;
  return provider.baseURL;
}

export function ProviderDetails({
  provider,
  controller,
  state,
  t,
  edit,
  onClose,
}: {
  provider: Provider;
  controller: Controller;
  state: State;
  t: Translate;
  edit: (p: Provider) => void;
  onClose: () => void;
}) {
  const [key, setKey] = useState("");
  const id = useId();
  useEffect(() => {
    setKey("");
  }, [state.clearEpoch]);
  const revealed =
    state.revealed?.providerId === provider.id ? state.revealed : undefined;
  const url = endpoint(provider);
  const keyLabel = !provider.credential
    ? "unknown"
    : provider.credential.configured
      ? "configured"
      : "missing";
  return (
    <div className="pm-page">
      <button type="button" className="pm-back" onClick={onClose}>
        {t("back")}
      </button>
      <header className="pm-page-head">
        <ProviderIcon id={provider.id} name={provider.name} />
        <div className="pm-identity">
          <div className="pm-title">
            <h2>{provider.name}</h2>
            <span className="pm-badge">{t("llmBadge")}</span>
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
      </header>
      {provider.id === "commandcode" && <p>{t("commandHelp")}</p>}
      {provider.id === "opencode-go" && <p>{t("opencodeHelp")}</p>}
      <section className="pm-card">
        <h3>{t("accountHeading")}</h3>
        <p>
          <span
            className={
              provider.credential?.configured ? "pm-dot pm-dot-on" : "pm-dot"
            }
          />
          {t(keyLabel)}
        </p>
        <p>
          {t("source")}:{" "}
          <span>{provider.credential?.source || t("unknown")}</span>
        </p>
        {provider.error && <p role="alert">{t(provider.error as LocaleKey)}</p>}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void controller.saveKey(provider, key);
          }}
        >
          <label htmlFor={`${id}-key`}>{t("newKey")}</label>
          <input
            id={`${id}-key`}
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            disabled={!provider.bindingToken || !provider.credential?.writable}
          />
          <button
            type="submit"
            disabled={
              !key.trim() ||
              !provider.bindingToken ||
              !provider.credential?.writable ||
              state.operations[`key:${provider.id}`]?.status === "loading"
            }
          >
            {t("saveKey")}
          </button>
        </form>
        <Result
          operation={state.operations[`key:${provider.id}`]}
          success={t("keySaved")}
          t={t}
        />
        <button
          type="button"
          disabled={
            !provider.bindingToken ||
            !provider.credential?.configured ||
            state.operations[`reveal:${provider.id}`]?.status === "loading"
          }
          onClick={() => void controller.reveal(provider)}
        >
          {t("show")}
        </button>
        <button type="button" onClick={controller.hide}>
          {t("hide")}
        </button>
        {revealed && (
          <div>
            <label htmlFor={`${id}-shown`}>{t("shown")}</label>
            <textarea
              id={`${id}-shown`}
              readOnly
              value={revealed.value}
              autoComplete="off"
            />
            <p>
              {t("source")}: {revealed.source || t("unknown")}
            </p>
          </div>
        )}
        <Result operation={state.operations[`reveal:${provider.id}`]} t={t} />
      </section>
      {url && !provider.id.startsWith("custom:") && (
        <section className="pm-card">
          <label htmlFor={`${id}-url`}>{t("apiUrl")}</label>
          <input
            id={`${id}-url`}
            value={url}
            readOnly
            disabled={!provider.id.startsWith("custom:")}
          />
          {!provider.id.startsWith("custom:") && (
            <p className="pm-meter-detail">{t("officialEndpoint")}</p>
          )}
        </section>
      )}
      <QuotaSummary
        view={state.quotas[provider.id]}
        t={t}
        name={provider.name}
        variant="all"
        onRefresh={() => void controller.refreshQuota(provider, true)}
      />
      {provider.id.startsWith("custom:") && (
        <CustomProviderForm
          controller={controller}
          state={state}
          t={t}
          editing={provider}
        />
      )}
      <section className="pm-card">
        <h4>{t("catalog")}</h4>
        {provider.catalogError ? (
          <p>{t("catalogError")}</p>
        ) : (
          <p>
            {provider.models.length} {t("count")}
          </p>
        )}
        <ul>
          {provider.models.map((model) => (
            <li key={model.id}>
              {model.id}
              {model.api ? ` · ${model.api}` : ""}
            </li>
          ))}
        </ul>
        {!provider.catalogError && !provider.models.length && (
          <p>{t("noModels")}</p>
        )}
        <button
          type="button"
          onClick={() => void controller.refresh(provider)}
          disabled={
            state.operations[`models:${provider.id}`]?.status === "loading"
          }
        >
          {t("refresh")}
        </button>
        <Result operation={state.operations[`models:${provider.id}`]} t={t} />
        {provider.id.startsWith("custom:") && (
          <button
            type="button"
            disabled={!provider.bindingToken}
            onClick={() => edit(provider)}
          >
            {t("edit")}
          </button>
        )}
      </section>
    </div>
  );
}

export function MuseDetails({
  t,
  docs,
  onClose,
  onAddMeta,
}: {
  t: Translate;
  docs: string;
  onClose: () => void;
  onAddMeta: () => void;
}) {
  return (
    <div className="pm-page">
      <button type="button" className="pm-back" onClick={onClose}>
        {t("back")}
      </button>
      <h2>{t("muse")}</h2>
      <p>{t("museBoundary")}</p>
      <p className="pm-help">{t("museHelp")}</p>
      <button type="button" onClick={onAddMeta}>
        {t("addMetaApi")}
      </button>
      <div className="pm-links">
        <a href={META_MODEL_API.codingAgents} target="_blank" rel="noreferrer">
          {t("docsApi")}
        </a>
        <a href={docs} target="_blank" rel="noreferrer">
          {t("docs")}
        </a>
      </div>
    </div>
  );
}
