import { useId, useState } from "react";
import type { Provider } from "../shared/protocol.js";
import { protocols } from "../shared/protocol.js";
import type { Controller, State } from "./controller.js";
import type { Translate, LocaleKey } from "./locales.js";
import { Result } from "./ProviderCard.js";
export function CustomProviderForm({
  controller,
  state,
  t,
  editing,
}: {
  controller: Controller;
  state: State;
  t: Translate;
  editing?: Provider;
}) {
  const id = useId();
  const [, render] = useState(0);
  const draft = controller.drafts;
  const field = (name: string, label: LocaleKey, type = "text") => (
    <div>
      <label htmlFor={`${id}-${name}`}>{t(label)}</label>
      <input
        id={`${id}-${name}`}
        type={type}
        min={type === "number" ? 1 : undefined}
        value={draft[name] || ""}
        disabled={name === "route" && !!editing}
        required={type !== "number"}
        onChange={(e) => {
          controller.changeDraft(name, e.target.value);
          render((n) => n + 1);
        }}
      />
    </div>
  );
  return (
    <form
      className="pm-card"
      onSubmit={(event) => {
        event.preventDefault();
        const payload = {
          route: draft.route,
          name: draft.name,
          baseURL: draft.baseURL,
          api: draft.api || protocols[0],
          models: (draft.models || "")
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          revision: controller.draftRevision,
          editing: !!editing,
          ...(draft.defaultContextWindow
            ? { defaultContextWindow: Number(draft.defaultContextWindow) }
            : {}),
          ...(draft.defaultMaxTokens
            ? { defaultMaxTokens: Number(draft.defaultMaxTokens) }
            : {}),
        };
        void controller.saveConfig(payload);
      }}
    >
      <h3>{t(editing ? "edit" : "custom")}</h3>
      <p>{t("configHelp")}</p>
      {field("name", "name")}
      {field("route", "route")}
      {field("baseURL", "baseURL", "url")}
      <label htmlFor={`${id}-api`}>{t("protocol")}</label>
      <select
        id={`${id}-api`}
        value={draft.api || protocols[0]}
        onChange={(e) => {
          controller.changeDraft("api", e.target.value);
          render((n) => n + 1);
        }}
      >
        {protocols.map((api) => (
          <option key={api}>{api}</option>
        ))}
      </select>
      <label htmlFor={`${id}-models`}>{t("models")}</label>
      <textarea
        id={`${id}-models`}
        required
        value={draft.models || ""}
        onChange={(e) => {
          controller.changeDraft("models", e.target.value);
          render((n) => n + 1);
        }}
      />
      {field("defaultContextWindow", "contextWindow", "number")}
      {field("defaultMaxTokens", "maxTokens", "number")}
      <button
        disabled={
          !state.snapshot ||
          state.snapshot.settingsWritable === false ||
          state.operations.config?.status === "loading"
        }
      >
        {t("save")}
      </button>
      <Result
        operation={state.operations.config}
        success={t("configSaved")}
        t={t}
      />
    </form>
  );
}
