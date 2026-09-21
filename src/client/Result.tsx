import type { Operation } from "./controller.js";
import type { LocaleKey, Translate } from "./locales.js";

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
