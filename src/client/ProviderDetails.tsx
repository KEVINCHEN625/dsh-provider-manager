import { useEffect, useId, useState } from "react";
import type { Provider } from "../shared/protocol.js";
import type { Controller, State } from "./controller.js";
import type { Translate, LocaleKey } from "./locales.js";
import { Result } from "./Result.js";

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
  onClose?: () => void;
}) {
  const [key, setKey] = useState("");
  const id = useId();
  useEffect(() => {
    setKey("");
  }, [state.clearEpoch]);
  const revealed =
    state.revealed?.providerId === provider.id ? state.revealed : undefined;
  const quota = state.quotas[provider.id]?.snapshot;
  return (
    <div className="pm-details-body">
      {onClose && (
        <button type="button" onClick={onClose}>
          {t("back")}
        </button>
      )}
      {provider.id === "commandcode" && <p>{t("commandHelp")}</p>}
      {provider.id === "opencode-go" && <p>{t("opencodeHelp")}</p>}
      <p>
        {t("source")}:{" "}
        <span>{provider.credential?.source || t("unknown")}</span>
      </p>
      {quota?.fetchedAt && (
        <p>
          {t("lastUpdated")} {quota.fetchedAt}
        </p>
      )}
      {quota?.source === "command-default-reference" && (
        <p>{t("quotaUnverified")}</p>
      )}
      {quota?.windows.map((window) => (
        <p key={window.id}>
          {window.id}
          {window.usedPercent !== undefined
            ? ` · ${t("used")} ${window.usedPercent}%`
            : ""}
          {window.remainingPercent !== undefined
            ? ` · ${t("quotaRemaining")} ${window.remainingPercent}%`
            : ""}
          {window.resetsAt ? ` · ${window.resetsAt}` : ""}
        </p>
      ))}
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
    </div>
  );
}
