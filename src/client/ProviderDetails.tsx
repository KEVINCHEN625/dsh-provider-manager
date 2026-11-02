import { useEffect, useId, useState } from "react";
import type { Provider } from "../shared/protocol.js";
import type { Controller, State } from "./controller.js";
import type { Translate, LocaleKey } from "./locales.js";
import { Result } from "./Result.js";
import { QuotaSummary } from "./QuotaSummary.js";
import { META_MODEL_API } from "../shared/meta-api.js";
import { formatContextWindow } from "../shared/api-presets.js";
import { CustomProviderForm } from "./CustomProviderForm.js";
import { ProviderIcon } from "./ProviderIcon.js";

function exactCount(value?: number) {
  return typeof value === "number" ? value.toLocaleString("en-US") : undefined;
}

function reasoningSummary(
  model: Provider["models"][number],
  t: Translate,
): string {
  if (model.disposition === "blocked-with-evidence")
    return [t("catalogBlocked"), ...(model.blockReasons ?? [])].join(" · ");
  const parts: string[] = [];
  if (model.toggle) parts.push(t("catalogToggle"));
  if (model.nativeEfforts?.length)
    parts.push(`effort: ${model.nativeEfforts.join(", ")}`);
  if (model.budgetTokensMax)
    parts.push(`budget_tokens max ${exactCount(model.budgetTokensMax)}`);
  else if (model.budgetTokensUnbounded) parts.push("budget_tokens");
  if (model.localBudgetPresets?.length)
    parts.push(
      `${t("catalogLocalBudget")}: ${model.localBudgetPresets
        .map((item) => `${item.id}=${exactCount(item.tokens)}`)
        .join(", ")}`,
    );
  if (model.toggleOnLevel === "high" && !model.nativeEfforts?.length)
    parts.push(t("catalogToggleOn"));
  if (
    model.reasoning &&
    !model.toggle &&
    !model.nativeEfforts?.length &&
    !model.localBudgetPresets?.length
  )
    parts.push(t("catalogAlwaysOn"));
  if (!model.reasoning && model.disposition === "supported")
    parts.push(t("catalogNone"));
  return parts.join(" · ") || t("catalogNone");
}

function GoCatalogTable({ provider, t }: { provider: Provider; t: Translate }) {
  const showInputLimitNote = provider.models.some((model) => model.inputLimit);
  return (
    <>
      {provider.catalogCheckedAt && (
        <p className="pm-meter-detail">
          {t("catalogChecked")}: {provider.catalogCheckedAt}
        </p>
      )}
      <div className="pm-catalog-wrap">
        <table className="pm-catalog">
          <thead>
            <tr>
              <th>{t("modelColumn")}</th>
              <th>{t("catalogProtocol")}</th>
              <th>{t("catalogContext")}</th>
              <th>{t("catalogInputLimit")}</th>
              <th>{t("catalogMaxOutput")}</th>
              <th>{t("catalogReasoning")}</th>
              <th>{t("catalogInput")}</th>
            </tr>
          </thead>
          <tbody>
            {provider.models.map((model) => (
              <tr
                key={model.id}
                className={
                  model.disposition === "blocked-with-evidence"
                    ? "pm-catalog-blocked"
                    : undefined
                }
              >
                <td>
                  <div>{model.name || model.id}</div>
                  <code title={model.id}>{model.id}</code>
                </td>
                <td>{model.api || "—"}</td>
                <td title={exactCount(model.contextWindow)}>
                  {exactCount(model.contextWindow) || "—"}
                </td>
                <td title={exactCount(model.inputLimit)}>
                  {exactCount(model.inputLimit) || "—"}
                </td>
                <td title={exactCount(model.maxOutputTokens)}>
                  {exactCount(model.maxOutputTokens) || "—"}
                </td>
                <td>{reasoningSummary(model, t)}</td>
                <td>
                  {t("catalogSupported")}:{" "}
                  {(model.input ?? []).join(", ") || t("catalogNone")}
                  {model.advertisedInput?.length
                    ? ` · ${t("catalogAdvertised")}: ${model.advertisedInput.join(", ")}`
                    : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showInputLimitNote && (
        <p className="pm-meter-detail">{t("catalogInputLimitNote")}</p>
      )}
    </>
  );
}
const OPENCODE_ENDPOINT = "https://opencode.ai/zen/go/v1";
const COMMAND_ENDPOINT = "https://api.commandcode.ai";

function endpoint(provider: Provider) {
  if (
    provider.id === "opencode-go" ||
    provider.id === "provider-manager-opencode-go"
  )
    return OPENCODE_ENDPOINT;
  if (provider.id === "commandcode") return COMMAND_ENDPOINT;
  return provider.baseURL;
}

/**
 * OpenCode Go key pool: per-slot credential state, per-slot quota, and the
 * preference toggle. Chat reads the preferred slot first and falls back to
 * the other when it has no usable key.
 */
function GoKeyPoolCard({
  provider,
  controller,
  state,
  t,
  id,
}: {
  provider: Provider;
  controller: Controller;
  state: State;
  t: Translate;
  id: string;
}) {
  const [editing, setEditing] = useState<"primary" | "second" | null>(null);
  const [primary, setPrimary] = useState("");
  const [second, setSecond] = useState("");
  useEffect(() => {
    setPrimary("");
    setSecond("");
  }, [state.clearEpoch]);
  const snapshot = state.snapshot;
  const preferred = snapshot?.goPreferredSlot ?? "primary";
  const slots = snapshot?.goKeySlots ?? [];
  const secondSlot = slots.find((slot) => slot.slot === "second");
  const secondQuota = state.quotas[`${provider.id}:second`];
  const revealedPrimary =
    state.revealed?.providerId === provider.id ? state.revealed : undefined;
  useEffect(() => {
    // Nothing in the global quota loop reads the second slot; fetch it once
    // when the details page opens so the row never sits in loading forever.
    void controller.refreshQuota(provider, false, "second");
    // The details page is mounted per provider; id is the only needed dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.id]);
  const editingSlot = editing === null ? undefined : slots.find((slot) => slot.slot === editing);
  const save = async () => {
    if (editing === null) return false;
    const ok =
      editing === "second"
        ? await controller.saveSecondGoKey(second)
        : await controller.saveKey(provider, primary);
    if (ok) setEditing(null);
    return ok;
  };
  return (
    <section className="pm-card">
      <h3>{t("goPoolHeading")}</h3>
      <p className="pm-meter-detail">{t("goPoolHelp")}</p>
      {slots.map((slot) => {
        const isPreferred = slot.slot === preferred;
        return (
          <div key={slot.slot} className="pm-keyrow">
            <p>
              <span
                className={slot.configured ? "pm-dot pm-dot-on" : "pm-dot"}
              />
              <strong>{t(`goSlot_${slot.slot}` as LocaleKey)}</strong>{" "}
              <code>{slot.ref}</code>
              {isPreferred && (
                <span className="pm-badge">{t("goPreferredBadge")}</span>
              )}
            </p>
            <p>
              {slot.configured ? t("configured") : t("missing")}
              {slot.source ? ` · ${t("source")}: ${slot.source}` : ""}
            </p>
            <button
              type="button"
              disabled={
                isPreferred ||
                state.operations["go-preference"]?.status === "loading"
              }
              onClick={() => void controller.setGoPreferred(slot.slot)}
            >
              {isPreferred ? t("goPreferredNow") : t("goPreferThis")}
            </button>
            <button type="button" onClick={() => setEditing(slot.slot)}>
              {t("goEdit")}
            </button>
            {/* The page-level Remaining quota block shows the preferred key;
                the non-preferred row carries its own full window breakdown. */}
            {!isPreferred && (
              <QuotaSummary
                view={
                  slot.slot === "second"
                    ? secondQuota
                    : state.quotas[provider.id]
                }
                t={t}
                name={`${provider.name} · ${t(
                  `goSlot_${slot.slot}` as LocaleKey,
                )}`}
                heading={`${t(
                  `goSlot_${slot.slot}` as LocaleKey,
                )} · ${t("quotaHeading")}`}
                variant="all"
                onRefresh={() =>
                  void controller.refreshQuota(
                    provider,
                    true,
                    slot.slot === "second" ? "second" : undefined,
                  )
                }
              />
            )}
          </div>
        );
      })}
      <Result operation={state.operations["go-preference"]} t={t} />
      {editing !== null && (
        <div className="pm-modal" role="dialog" aria-modal="true">
          <div className="pm-modal-card">
            <h4>
              {t(
                (editing === "second"
                  ? "goSecondNew"
                  : "goPrimaryNew") as LocaleKey,
              )}
            </h4>
            <p className="pm-meter-detail">
              <code>{editingSlot?.ref}</code>
            </p>
            <label htmlFor={`${id}-edit-input`}>{t("newKey")}</label>
            <input
              id={`${id}-edit-input`}
              type="password"
              autoComplete="off"
              value={editing === "second" ? second : primary}
              onChange={(e) =>
                editing === "second"
                  ? setSecond(e.target.value)
                  : setPrimary(e.target.value)
              }
              disabled={
                editing === "second" ? !snapshot?.settingsWritable : !provider.bindingToken || !provider.credential?.writable
              }
            />
            <div>
              <button
                type="button"
                disabled={
                  (editing === "second" ? !second.trim() : !primary.trim()) ||
                  state.operations[
                    editing === "second" ? "go-second:save" : `key:${provider.id}`
                  ]?.status === "loading"
                }
                onClick={() => void save()}
              >
                {t("saveKey")}
              </button>
              <button
                type="button"
                onClick={() => void controller.reveal(provider)}
              >
                {t("show")}
              </button>
              <button type="button" onClick={controller.hide}>
                {t("hide")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  controller.hide();
                  controller.hideSecond();
                }}
              >
                {t("goEditClose")}
              </button>
            </div>
            {editing === "second" ? (
              <Result
                operation={state.operations["go-second:save"]}
                success={t("keySaved")}
                t={t}
              />
            ) : (
              <Result
                operation={state.operations[`key:${provider.id}`]}
                success={t("keySaved")}
                t={t}
              />
            )}
            {editing === "second"
              ? state.revealedSecond && (
                  <div>
                    <label htmlFor={`${id}-edit-shown`}>{t("shown")}</label>
                    <textarea
                      id={`${id}-edit-shown`}
                      readOnly
                      value={state.revealedSecond.value}
                      autoComplete="off"
                    />
                    <p>
                      {t("source")}:{" "}
                      {state.revealedSecond.source || t("unknown")}
                    </p>
                  </div>
                )
              : revealedPrimary && (
                  <div>
                    <label htmlFor={`${id}-edit-shown`}>{t("shown")}</label>
                    <textarea
                      id={`${id}-edit-shown`}
                      readOnly
                      value={revealedPrimary.value}
                      autoComplete="off"
                    />
                    <p>
                      {t("source")}: {revealedPrimary.source || t("unknown")}
                    </p>
                  </div>
                )}
            <Result
              operation={
                editing === "second"
                  ? state.operations["go-second:reveal"]
                  : state.operations[`reveal:${provider.id}`]
              }
              t={t}
            />
            {editing === "second" && (
              <>
                <button
                  type="button"
                  disabled={
                    !secondSlot?.configured || !snapshot?.settingsWritable
                  }
                  onClick={async () => {
                    if (await controller.clearSecondGo()) setEditing(null);
                  }}
                >
                  {t("goSecondClear")}
                </button>
                <Result
                  operation={state.operations["go-second:clear"]}
                  success={t("goSecondCleared")}
                  t={t}
                />
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
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
  // On the Go details page the headline quota follows the key chat is
  // actually using: the preferred slot when it has a key, otherwise the
  // fallback slot the adapter reaches.
  const isGo = provider.id === "provider-manager-opencode-go";
  const poolSlots = state.snapshot?.goKeySlots;
  const preferredSlot = state.snapshot?.goPreferredSlot ?? "primary";
  const preferredConfigured =
    poolSlots?.find((slot) => slot.slot === preferredSlot)?.configured ?? true;
  const headlineSlot: "primary" | "second" = preferredConfigured
    ? preferredSlot
    : preferredSlot === "primary"
      ? "second"
      : "primary";
  const headlineRef = poolSlots?.find((slot) => slot.slot === headlineSlot)?.ref;
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
      {provider.id === "provider-manager-opencode-go" && (
        <p>{t("opencodeHelp")}</p>
      )}
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
        view={
          isGo
            ? state.quotas[
                headlineSlot === "second"
                  ? `${provider.id}:second`
                  : provider.id
              ]
            : state.quotas[provider.id]
        }
        t={t}
        name={provider.name}
        variant="all"
        onRefresh={() =>
          void controller.refreshQuota(
            provider,
            true,
            isGo && headlineSlot === "second" ? "second" : undefined,
          )
        }
      />
      {isGo && headlineRef && (
        <p className="pm-meter-detail">
          {t("quotaShownFor")}: <code>{headlineRef}</code>
        </p>
      )}
      {provider.id === "provider-manager-opencode-go" && (
        <GoKeyPoolCard
          provider={provider}
          controller={controller}
          state={state}
          t={t}
          id={id}
        />
      )}
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
          <>
            <p>
              {provider.models.length} {t("count")}
            </p>
            {provider.id === "provider-manager-opencode-go" ? (
              <GoCatalogTable provider={provider} t={t} />
            ) : (
              <ul>
                {provider.models.map((model) => (
                  <li key={model.id}>
                    <div>{model.name || model.id}</div>
                    <code title={model.id}>{model.id}</code>
                    {model.api ? ` · ${model.api}` : ""}
                    {model.contextWindow
                      ? ` · ${formatContextWindow(model.contextWindow)}`
                      : ""}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
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
