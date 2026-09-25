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
  options?: { declarativeAlias?: string },
): void {
  if (hostInstallsSections(settings)) {
    (settings as SectionInstallTarget).installSection!(owner, ns, schema, entry, {
      setSource: () => {},
      onChange: () => {},
    });
  }
  // 0.1.7: declarative — the Loader collects the exported Config once this
  // very plugin's fiber activates. Verifying visibility from inside apply()
  // would deadlock on our own activation (describe only lists fibers whose
  // state is already active), so the runtime check lives on the read side:
  // section() resolves the host-shaped namespace and missing sections
  // surface as explicit not-found, never as a pretend write. The volatile
  // requirement itself is enforced statically by tests/compat.spec.ts.
}

/**
 * The settings namespace differs by host: 0.1.5 installSection used the
 * package name ("dsh-provider-manager"), while 0.1.7 derives it from the
 * profile entry id ("provider-manager" in our patch). Resolve which one the
 * running host actually lists, preferring the primary; undefined when the
 * host lists neither (callers treat that as a missing section).
 */
export function hostSectionNs(
  settings: unknown,
  primary: string,
  entryId: string,
): string | undefined {
  const forms = (settings as { describe?: () => { ns: string }[] })?.describe?.() ?? [];
  const listed = new Set(forms.map((form) => form?.ns));
  if (listed.has(primary)) return primary;
  if (listed.has(entryId)) return entryId;
  return undefined;
}
