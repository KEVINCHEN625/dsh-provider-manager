import { useId, useState } from "react";
import type { Provider } from "../shared/protocol.js";
import { protocols } from "../shared/protocol.js";
import {
  API_PRESETS,
  matchPreset,
  matchRegion,
  presetDraft,
  regionBaseURL,
  type RegionId,
} from "../shared/api-presets.js";
import type { Controller, State } from "./controller.js";
import type { Translate, LocaleKey } from "./locales.js";
import { Result } from "./Result.js";

export function CustomProviderForm({
  controller,
  state,
  t,
  editing,
  onClose,
  onSaved,
}: {
  controller: Controller;
  state: State;
  t: Translate;
  editing?: Provider;
  onClose?: () => void;
  onSaved?: (route: string) => void;
}) {
  const id = useId();
  const [, render] = useState(0);
  const draft = controller.drafts;
  const preset = matchPreset({
    route: draft.route || editing?.id,
    baseURL: draft.baseURL,
  });
  const region = matchRegion(preset, draft.baseURL);
  const apply = (fields: Record<string, string>) => {
    for (const [name, value] of Object.entries(fields))
      controller.changeDraft(name, value);
    render((n) => n + 1);
  };
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
        void controller.saveConfig(payload).then((saved) => {
          if (saved) onSaved?.(draft.route);
        });
      }}
    >
      <h3>{t(editing ? "edit" : "custom")}</h3>
      <p>{t("configHelp")}</p>
      <label htmlFor={`${id}-preset`}>{t("apiPreset")}</label>
      <select
        id={`${id}-preset`}
        value={preset?.id || ""}
        disabled={!!editing}
        onChange={(e) => {
          const next = API_PRESETS.find((item) => item.id === e.target.value);
          if (next) apply(presetDraft(next));
        }}
      >
        <option value="">{t("presetCustom")}</option>
        {API_PRESETS.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <p className="pm-help">{t("presetHelp")}</p>
      {preset?.regions && (
        <fieldset className="pm-regions">
          <legend>{t("endpointRegion")}</legend>
          {preset.regions.map((item) => (
            <label
              key={item.id}
              className="pm-region-option"
              data-on={region?.id === item.id ? "true" : undefined}
            >
              <input
                type="radio"
                name={`${id}-region`}
                checked={region?.id === item.id}
                onChange={() =>
                  apply({
                    baseURL: regionBaseURL(item, draft.api),
                  })
                }
              />
              <span>{t(item.labelKey)}</span>
              <small>{regionBaseURL(item, draft.api)}</small>
            </label>
          ))}
          <p className="pm-help">{t("regionHelp")}</p>
        </fieldset>
      )}
      {field("name", "name")}
      {field("route", "route")}
      {field("baseURL", "baseURL", "url")}
      <label htmlFor={`${id}-api`}>{t("protocol")}</label>
      <select
        id={`${id}-api`}
        value={draft.api || protocols[0]}
        onChange={(e) => {
          const api = e.target.value;
          apply(
            region ? { api, baseURL: regionBaseURL(region, api) } : { api },
          );
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
      {onClose && (
        <button type="button" onClick={onClose}>
          {t("closeForm")}
        </button>
      )}
      <Result
        operation={state.operations.config}
        success={t("configSaved")}
        t={t}
      />
    </form>
  );
}

export function applyPresetId(id: string, regionId?: RegionId) {
  const preset = API_PRESETS.find((item) => item.id === id);
  return preset ? presetDraft(preset, regionId) : {};
}
