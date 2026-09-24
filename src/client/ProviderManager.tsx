import { useEffect, useState, useSyncExternalStore } from "react";
import type { OAuthEntry, Provider } from "../shared/protocol.js";
import type { Controller } from "./controller.js";
import type { Translate, LocaleKey } from "./locales.js";
import { modelHas1m, serializeModelDraft } from "../shared/api-presets.js";
import { CustomProviderForm, applyPresetId } from "./CustomProviderForm.js";
import { FilterTabs, type FilterId } from "./FilterTabs.js";
import { MuseCard, ProviderCard } from "./ProviderCard.js";
import { MuseDetails, ProviderDetails } from "./ProviderDetails.js";
import { OAuthCard } from "./OAuthCard.js";
import { OAuthDetails } from "./OAuthDetails.js";

export interface ManagerProps {
  createController: () => Controller;
  t: Translate;
  subscribeConnection?: (listener: (connected: boolean) => void) => () => void;
}

type View =
  | { kind: "list" }
  | { kind: "add" }
  | { kind: "detail"; id: string }
  | { kind: "oauth"; id: string };

export function ProviderManager({
  createController,
  t,
  subscribeConnection,
}: ManagerProps) {
  const [controller] = useState(createController);
  const [view, setView] = useState<View>({ kind: "list" });
  const [filter, setFilter] = useState<FilterId>("all");
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
      ...serializeModelDraft(
        provider.models.map((m) => ({
          id: m.id,
          context1m: modelHas1m(m, provider.defaultContextWindow),
        })),
      ),
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
    controller.drafts = applyPresetId("meta");
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
  const signedIn =
    state.snapshot?.oauth.filter((item) => item.configured).length ?? 0;
  const statusLine =
    filter === "oauth"
      ? `${signedIn} ${t("signedInCount")}`
      : filter === "llm"
        ? `${connected} ${t("connected")}`
        : `${connected} ${t("connected")} · ${signedIn} ${t("signedInCount")}`;
  const openProvider =
    view.kind === "detail"
      ? state.snapshot?.providers.find((item) => item.id === view.id)
      : undefined;
  const oauthEntry: OAuthEntry | undefined =
    view.kind === "oauth"
      ? state.snapshot?.oauth.find((item) => item.providerId === view.id)
      : undefined;
  const providers =
    filter === "oauth" ? [] : (state.snapshot?.providers ?? []);
  const oauthCards = filter === "llm" ? [] : (state.snapshot?.oauth ?? []);
  const showMuse = filter !== "oauth";
  const showAdd = filter !== "oauth";
  return (
    <section className="provider-manager">
      {view.kind === "list" && (
        <>
          <div className="pm-header">
            <div>
              <h2>{t("title")}</h2>
              <p>{t("intro")}</p>
            </div>
            {showAdd && (
              <button type="button" onClick={() => edit()}>
                {t("addProvider")}
              </button>
            )}
          </div>
          <div className="pm-controls">
            <FilterTabs value={filter} onChange={setFilter} t={t} />
            <p className="pm-status">
              {statusLine}
              <span>{t("noMerge")}</span>
            </p>
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
            <span>
              {filter === "oauth" ? t("loginMethod") : t("columnQuota")}
            </span>
            <span>{t("columnSetup")}</span>
          </div>
          <div className="pm-list">
            {providers.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                state={state}
                t={t}
                onOpen={() => selectDetail(provider.id)}
              />
            ))}
            {showMuse && state.snapshot && (
              <MuseCard
                installed={state.snapshot.muse.installed}
                t={t}
                onOpen={() => selectDetail("muse")}
              />
            )}
            {oauthCards.map((entry) => (
              <OAuthCard
                key={entry.providerId}
                entry={entry}
                login={state.login}
                t={t}
                onOpen={() => {
                  controller.hide();
                  setView({ kind: "oauth", id: entry.providerId });
                }}
              />
            ))}
          </div>
          {filter === "oauth" && state.snapshot && (
            <p>
              {state.snapshot.oauthUnavailable
                ? t("oauthUnavailable")
                : state.snapshot.oauth.length === 0
                  ? t("oauthEmpty")
                  : null}
            </p>
          )}
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
      {view.kind === "oauth" && oauthEntry && (
        <OAuthDetails
          entry={oauthEntry}
          controller={controller}
          state={state}
          t={t}
          onClose={() => selectDetail()}
        />
      )}
      {view.kind === "oauth" && !oauthEntry && (
        <div className="pm-page">
          <button type="button" className="pm-back" onClick={() => selectDetail()}>
            {t("back")}
          </button>
          <p>{t("oauthEmpty")}</p>
        </div>
      )}
    </section>
  );
}
