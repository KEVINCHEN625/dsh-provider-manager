import { useEffect, useState, useSyncExternalStore } from "react";
import type { Provider } from "../shared/protocol.js";
import type { Controller } from "./controller.js";
import type { Translate, LocaleKey } from "./locales.js";
import { META_MODEL_API } from "../shared/meta-api.js";
import { MuseCard, ProviderCard } from "./ProviderCard.js";
import { CustomProviderForm } from "./CustomProviderForm.js";
import { MuseDetails, ProviderDetails } from "./ProviderDetails.js";

export interface ManagerProps {
  createController: () => Controller;
  t: Translate;
  subscribeConnection?: (listener: (connected: boolean) => void) => () => void;
}

type View = { kind: "list" } | { kind: "add" } | { kind: "detail"; id: string };

export function ProviderManager({
  createController,
  t,
  subscribeConnection,
}: ManagerProps) {
  const [controller] = useState(createController);
  const [view, setView] = useState<View>({ kind: "list" });
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  useEffect(() => {
    void controller.load();
    const visibility = () => {
      const visible = document.visibilityState === "visible";
      if (!visible) controller.hide();
      controller.visibilityChanged(visible);
    };
    window.addEventListener("blur", controller.hide);
    document.addEventListener("visibilitychange", visibility);
    const stop = subscribeConnection?.((connected) =>
      controller.connectionChanged(connected),
    );
    return () => {
      stop?.();
      window.removeEventListener("blur", controller.hide);
      document.removeEventListener("visibilitychange", visibility);
      controller.dispose();
    };
  }, [controller, subscribeConnection]);
  const loadCustomDraft = (provider: Provider) => {
    controller.draftRevision = provider.revision;
    controller.drafts = {
      route: provider.id.slice(7),
      name: provider.name,
      baseURL: provider.baseURL || "",
      api: provider.api || "",
      models: provider.models.map((m) => m.id).join("\n"),
      defaultContextWindow: provider.defaultContextWindow?.toString() || "",
      defaultMaxTokens: provider.defaultMaxTokens?.toString() || "",
    };
  };
  const edit = (provider?: Provider) => {
    controller.hide();
    if (provider) {
      loadCustomDraft(provider);
      setView({ kind: "detail", id: provider.id });
      return;
    }
    if (view.kind !== "add" && !Object.keys(controller.drafts).length)
      controller.draftRevision = state.snapshot?.customRevision;
    setView({ kind: "add" });
  };
  const addMetaApi = () => {
    controller.hide();
    controller.draftRevision = state.snapshot?.customRevision;
    controller.drafts = {
      name: META_MODEL_API.name,
      route: META_MODEL_API.route,
      baseURL: META_MODEL_API.baseURL,
      api: META_MODEL_API.api,
      models: META_MODEL_API.models,
      defaultContextWindow: META_MODEL_API.defaultContextWindow,
      defaultMaxTokens: META_MODEL_API.defaultMaxTokens,
    };
    setView({ kind: "add" });
  };
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const selectDetail = (id?: string) => {
    controller.hide();
    if (!id) {
      setView({ kind: "list" });
      return;
    }
    const provider = state.snapshot?.providers.find((item) => item.id === id);
    if (provider?.id.startsWith("custom:")) loadCustomDraft(provider);
    setView({ kind: "detail", id });
  };
  const connected =
    state.snapshot?.providers.filter((item) => item.credential?.configured)
      .length ?? 0;
  const openProvider =
    view.kind === "detail"
      ? state.snapshot?.providers.find((item) => item.id === view.id)
      : undefined;
  return (
    <section className="provider-manager">
      {view.kind === "list" && (
        <>
          <div className="pm-header">
            <div>
              <h2>{t("nav")}</h2>
              <p>{t("intro")}</p>
            </div>
            <button type="button" onClick={() => edit()}>
              {t("addProvider")}
            </button>
          </div>
          <div className="pm-banner">
            <strong className="pm-count">{connected}</strong>
            <div className="pm-copy">
              <strong>{t("connected")}</strong>
              <p>{t("noMerge")}</p>
            </div>
          </div>
          {state.status === "loading" && <p role="status">{t("loading")}</p>}
          {state.status === "error" && (
            <p role="alert">{t((state.error || "UNAVAILABLE") as LocaleKey)}</p>
          )}
          <div className="pm-toolbar">
            <button
              type="button"
              className="pm-quiet"
              disabled={state.status === "loading"}
              onClick={() => void controller.load()}
            >
              {t(state.status === "error" ? "retry" : "reload")}
            </button>
            <span className="pm-zone">
              {t("timezone")} · {timeZone}
            </span>
          </div>
          <div className="pm-columns" aria-hidden="true">
            <span>{t("columnProvider")}</span>
            <span>{t("columnQuota")}</span>
            <span>{t("columnSetup")}</span>
          </div>
          <div className="pm-list">
            {state.snapshot?.providers.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                state={state}
                t={t}
                onOpen={() => selectDetail(provider.id)}
              />
            ))}
            {state.snapshot && (
              <MuseCard
                installed={state.snapshot.muse.installed}
                t={t}
                onOpen={() => selectDetail("muse")}
              />
            )}
          </div>
        </>
      )}
      {view.kind === "add" && (
        <div className="pm-page">
          <button
            type="button"
            className="pm-back"
            onClick={() => {
              controller.hide();
              setView({ kind: "list" });
            }}
          >
            {t("closeForm")}
          </button>
          <h2>{t("addProvider")}</h2>
          <CustomProviderForm
            controller={controller}
            state={state}
            t={t}
            onSaved={(route) => selectDetail("custom:" + route)}
          />
        </div>
      )}
      {view.kind === "detail" && view.id === "muse" && state.snapshot && (
        <MuseDetails
          t={t}
          docs={state.snapshot.muse.docs}
          onClose={() => selectDetail()}
          onAddMeta={addMetaApi}
        />
      )}
      {openProvider && (
        <ProviderDetails
          provider={openProvider}
          controller={controller}
          state={state}
          t={t}
          edit={edit}
          onClose={() => selectDetail()}
        />
      )}
    </section>
  );
}
