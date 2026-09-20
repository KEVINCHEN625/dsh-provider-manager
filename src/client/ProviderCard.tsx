import { useEffect, useId, useState } from "react";
import type { Provider } from "../shared/protocol.js";
import type { Controller, Operation, State } from "./controller.js";
import type { Translate, LocaleKey } from "./locales.js";
export function Result({
  operation,
  success,
  t,
}: {
  operation?: Operation;
  success?: string;
  t: Translate;
}) {
  if (!operation || operation.status === "idle") return null;
  return (
    <p role={operation.status === "error" ? "alert" : "status"}>
      {operation.status === "loading"
        ? t("loading")
        : operation.status === "error"
          ? t((operation.error || "UNAVAILABLE") as LocaleKey)
          : success}
    </p>
  );
}
export function ProviderCard({
  provider,
  controller,
  state,
  t,
  edit,
}: {
  provider: Provider;
  controller: Controller;
  state: State;
  t: Translate;
  edit: (p: Provider) => void;
}) {
  const [key, setKey] = useState("");
  const id = useId();
  useEffect(() => {
    setKey("");
  }, [state.clearEpoch]);
  const revealed =
    state.revealed?.providerId === provider.id ? state.revealed : undefined;
  return (
    <article className="pm-card">
      <h3>{provider.name}</h3>
      <p>{t(provider.available ? "available" : "unavailable")}</p>
      {provider.id === "commandcode" && <p>{t("commandHelp")}</p>}
      {provider.id === "opencode-go" && <p>{t("opencodeHelp")}</p>}
      <p>
        {t(
          !provider.credential
            ? "unknown"
            : provider.credential.configured
              ? "configured"
              : "missing",
        )}{" "}
        · {t(provider.credential?.writable ? "writable" : "readonly")}
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
          disabled={!provider.bindingToken}
          onClick={() => edit(provider)}
        >
          {t("edit")}
        </button>
      )}
    </article>
  );
}
