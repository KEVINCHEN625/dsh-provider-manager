/**
 * Dual-host compatibility: dsh 0.1.5 registers settings sections imperatively
 * (`SettingsForms.installSection`); 0.1.7 removed that method and collects
 * each Loader entry's exported `Config` schema declaratively. Both hosts keep
 * the same `describe`/`mutate` surface, so only section registration differs.
 *
 * The strategy: plugins export their full Config schema (0.1.7 reads it on
 * its own), and `ensureSection` additionally performs the imperative install
 * when the host still offers it (0.1.5). Neither path swallows errors — an
 * unknown settings surface is reported, never silently degraded.
 */
import type z from "@deepseek-ai/schemastery";

export interface SectionInstallTarget {
  installSection?(
    owner: unknown,
    ns: string,
    schema: unknown,
    entry: unknown,
    hooks: { setSource: () => void; onChange: () => void },
  ): void;
}

/** Whether the running host still supports imperative section installs. */
export function hostInstallsSections(settings: unknown): settings is SectionInstallTarget {
  return (
    typeof settings === "object" &&
    settings !== null &&
    typeof (settings as SectionInstallTarget).installSection === "function"
  );
}

/**
 * Register one settings section on hosts that need it. On 0.1.7 the exported
 * Config schema already provides the section; calling this is a no-op there.
 */
export function ensureSection(
  settings: unknown,
  owner: unknown,
  ns: string,
  schema: z,
  entry: unknown,
): void {
  if (hostInstallsSections(settings)) {
    (settings as SectionInstallTarget).installSection!(owner, ns, schema, entry, {
      setSource: () => {},
      onChange: () => {},
    });
  }
  // 0.1.7: declarative — the Loader collected the exported Config. Verify it
  // actually listed the section instead of assuming: a schema without volatile
  // fields, or a wrong ns, must fail loudly here rather than degrade silently.
  const forms = (settings as { describe?: () => { ns: string }[] })?.describe?.() ?? [];
  if (!forms.some((form) => form?.ns === ns)) {
    throw new Error(
      `compat: settings section "${ns}" is not visible on this host; ` +
        "on dsh 0.1.7 the exported Config needs volatile fields for the section to appear",
    );
  }
}
