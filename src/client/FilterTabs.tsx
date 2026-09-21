import type { Translate } from "./locales.js";

export type FilterId = "all" | "llm" | "oauth";

const tabs: { id: FilterId; label: "filterAll" | "filterLlm" | "filterOauth" }[] =
  [
    { id: "all", label: "filterAll" },
    { id: "llm", label: "filterLlm" },
    { id: "oauth", label: "filterOauth" },
  ];

export function FilterTabs({
  value,
  onChange,
  t,
}: {
  value: FilterId;
  onChange: (id: FilterId) => void;
  t: Translate;
}) {
  return (
    <div className="pm-filters" role="tablist" aria-label={t("filter")}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`pm-filter-${tab.id}`}
          aria-selected={value === tab.id}
          tabIndex={value === tab.id ? 0 : -1}
          className="pm-filter"
          data-on={value === tab.id ? "true" : undefined}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => {
            const delta =
              event.key === "ArrowRight" || event.key === "ArrowDown"
                ? 1
                : event.key === "ArrowLeft" || event.key === "ArrowUp"
                  ? -1
                  : event.key === "Home"
                    ? -index
                    : event.key === "End"
                      ? tabs.length - 1 - index
                      : 0;
            if (!delta && event.key !== "Home" && event.key !== "End") return;
            event.preventDefault();
            const next = tabs[(index + delta + tabs.length) % tabs.length];
            onChange(next.id);
            document.getElementById(`pm-filter-${next.id}`)?.focus();
          }}
        >
          {t(tab.label)}
        </button>
      ))}
    </div>
  );
}
