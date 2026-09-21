import { useEffect, useState, useSyncExternalStore } from "react";
import type { Provider } from "../shared/protocol.js";
import type { Controller } from "./controller.js";
import type { Translate, LocaleKey } from "./locales.js";
import { MuseCard, ProviderCard } from "./ProviderCard.js";
import { CustomProviderForm } from "./CustomProviderForm.js";
export interface ManagerProps {
  createController: () => Controller;
  t: Translate;
  subscribeConnection?: (listener: (connected: boolean) => void) => () => void;
}
export function ProviderManager({
  createController,
  t,
  subscribeConnection,
}: ManagerProps) {
  const [controller] = useState(createController);
  const [editing, setEditing] = useState<Provider>();
  const [formOpen, setFormOpen] = useState(false);
  const [openId, setOpenId] = useState<string>();
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
  const edit = (provider?: Provider) => {
    controller.hide();
    if (provider) {
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
      setEditing(provider);
      setFormOpen(true);
      return;
    }
    if (!formOpen && !Object.keys(controller.drafts).length)
      controller.draftRevision = state.snapshot?.customRevision;
    setEditing(undefined);
    setFormOpen(true);
  };
  const fetched = Object.values(state.quotas)
    .map((quota) => quota.snapshot?.fetchedAt)
    .filter((value): value is string => Boolean(value))
    .sort();
  return (
    <section className="provider-manager">
      <div className="pm-header">
        <h2>{t("nav")}</h2>
        <button type="button" onClick={() => edit()}>
          {t("addProvider")}
        </button>
      </div>
      <p>{t("intro")}</p>
      <p>{t("metadata")}</p>
      {fetched.length > 0 && (
        <p>
          {t("lastUpdated")} {fetched.at(-1)}
        </p>
      )}
      {state.status === "loading" && <p role="status">{t("loading")}</p>}
      {state.status === "error" && (
        <p role="alert">{t((state.error || "UNAVAILABLE") as LocaleKey)}</p>
      )}
      <button
        type="button"
        disabled={state.status === "loading"}
        onClick={() => void controller.load()}
      >
        {t(state.status === "error" ? "retry" : "reload")}
      </button>
      <div className="pm-list">
        {state.snapshot?.providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            controller={controller}
            state={state}
            t={t}
            edit={edit}
            open={openId === provider.id}
            onToggle={(next) => setOpenId(next ? provider.id : undefined)}
          />
        ))}
        {state.snapshot && (
          <MuseCard
            installed={state.snapshot.muse.installed}
            t={t}
            open={openId === "muse"}
            onToggle={(next) => setOpenId(next ? "muse" : undefined)}
          />
        )}
      </div>
      {formOpen && (
        <CustomProviderForm
          key={editing?.id || "new"}
          controller={controller}
          state={state}
          t={t}
          editing={editing}
          onClose={() => setFormOpen(false)}
          onSaved={(route) => {
            setFormOpen(false);
            setEditing(undefined);
            if (!editing) setOpenId("custom:" + route);
          }}
        />
      )}
    </section>
  );
}
