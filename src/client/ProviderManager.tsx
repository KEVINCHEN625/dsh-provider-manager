import { useEffect, useState, useSyncExternalStore } from "react";
import type { Provider } from "../shared/protocol.js";
import type { Controller } from "./controller.js";
import type { Translate, LocaleKey } from "./locales.js";
import { ProviderCard } from "./ProviderCard.js";
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
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  useEffect(() => {
    void controller.load();
    const visibility = () => {
      if (document.visibilityState !== "visible") controller.hide();
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
    controller.draftRevision = provider ? provider.revision : undefined;
    controller.drafts = provider
      ? {
          route: provider.id.slice(7),
          name: provider.name,
          baseURL: provider.baseURL || "",
          api: provider.api || "",
          models: provider.models.map((m) => m.id).join("\n"),
          defaultContextWindow: provider.defaultContextWindow?.toString() || "",
          defaultMaxTokens: provider.defaultMaxTokens?.toString() || "",
        }
      : {};
    setEditing(provider);
  };
  return (
    <section className="provider-manager">
      <h2>{t("nav")}</h2>
      <p>{t("intro")}</p>
      <p>{t("metadata")}</p>
      {state.status === "loading" && <p role="status">{t("loading")}</p>}
      {state.status === "error" && (
        <p role="alert">{t((state.error || "UNAVAILABLE") as LocaleKey)}</p>
      )}
      <button
        disabled={state.status === "loading"}
        onClick={() => void controller.load()}
      >
        {t(state.status === "error" ? "retry" : "reload")}
      </button>
      <div className="pm-grid">
        {state.snapshot?.providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            controller={controller}
            state={state}
            t={t}
            edit={edit}
          />
        ))}
        {state.snapshot && (
          <article className="pm-card">
            <h3>{t("muse")}</h3>
            <p>
              {t(state.snapshot.muse.installed ? "installed" : "notInstalled")}
            </p>
            <p>{t("museBoundary")}</p>
            <p>{t("museHelp")}</p>
            <a
              href="https://dev.meta.ai/docs/muse-code/subscriptions"
              target="_blank"
              rel="noreferrer"
            >
              {t("docs")}
            </a>
          </article>
        )}
      </div>
      <button onClick={() => edit()}>{t("newProvider")}</button>
      <CustomProviderForm
        key={editing?.id || "new"}
        controller={controller}
        state={state}
        t={t}
        editing={editing}
      />
    </section>
  );
}
