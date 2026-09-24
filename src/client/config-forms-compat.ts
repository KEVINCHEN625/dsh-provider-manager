/**
 * Host 0.1.5 serves settings through `settingsScope` and has no `configForms`.
 * `@linxin666/dsh-pet` and `@linxin666/dsh-client-ui-skin-center` inject
 * `configForms` and the web boot fails closed while they stay pending.
 * This registers that service only when the host has not already done so,
 * and reads and writes through the 0.1.5 settings binder.
 */

interface SettingsScopeLike {
  describe?: () => DescribeFace;
  bind?: (spec: { namespace: string }) => ScopeLike;
}

interface DescribeFace {
  getSnapshot(): unknown;
  subscribe(listener: () => void): () => void;
}

interface ScopeLike {
  getSnapshot(): unknown;
  subscribe(listener: () => void): () => void;
  mutate(ops: readonly unknown[], revision?: number): Promise<unknown>;
  set?: (field: string, value: unknown) => Promise<unknown>;
  unset?: (field: string) => Promise<unknown>;
}

export interface ConfigFormsContext {
  get(name: string): unknown;
  provide(name: string, value: unknown): void;
}

const EMPTY_VIEW = { view: { namespaces: [] as { ns: string }[] } };

function settingsOf(ctx: ConfigFormsContext): SettingsScopeLike | undefined {
  const value = ctx.get("settingsScope");
  if (typeof value !== "object" || value === null) return undefined;
  return value as SettingsScopeLike;
}

function readDescribe(ctx: ConfigFormsContext): DescribeFace | undefined {
  const described = settingsOf(ctx)?.describe?.();
  if (
    described &&
    typeof described.getSnapshot === "function" &&
    typeof described.subscribe === "function"
  ) {
    return described;
  }
  return undefined;
}

function unavailableForm() {
  return {
    getSnapshot: () => ({
      status: "unavailable" as const,
      value: undefined,
      writable: false,
      mode: "host" as const,
    }),
    subscribe: () => () => {},
    mutate: async () => false,
    set: async () => false,
    unset: async () => false,
  };
}

function wrapScope(scope: ScopeLike) {
  return {
    getSnapshot: () => scope.getSnapshot(),
    subscribe: (listener: () => void) => scope.subscribe(listener),
    async mutate(ops: readonly unknown[], revision?: number) {
      const answer = await scope.mutate(ops, revision);
      return answer !== false;
    },
    async set(field: string, value: unknown) {
      if (typeof scope.set !== "function") return false;
      const answer = await scope.set(field, value);
      return answer !== false;
    },
    async unset(field: string) {
      if (typeof scope.unset !== "function") return false;
      const answer = await scope.unset(field);
      return answer !== false;
    },
  };
}

export function createConfigForms(ctx: ConfigFormsContext) {
  const listeners = new Set<() => void>();
  let attached: DescribeFace | undefined;
  let unsubscribeLive = () => {};
  const attach = () => {
    if (attached) return;
    const live = readDescribe(ctx);
    if (!live) return;
    attached = live;
    unsubscribeLive = live.subscribe(() => {
      for (const listener of [...listeners]) listener();
    });
  };
  return {
    describe() {
      return {
        getSnapshot() {
          attach();
          return attached ? attached.getSnapshot() : EMPTY_VIEW;
        },
        subscribe(listener: () => void) {
          listeners.add(listener);
          attach();
          return () => {
            listeners.delete(listener);
          };
        },
      };
    },
    get(entryId: string) {
      const bind = settingsOf(ctx)?.bind;
      if (typeof bind !== "function") return unavailableForm();
      try {
        return wrapScope(bind({ namespace: entryId }));
      } catch {
        return unavailableForm();
      }
    },
  };
}

/** Register `configForms` when this host build does not provide it. */
export function installConfigFormsCompat(ctx: ConfigFormsContext): void {
  if (ctx.get("configForms") !== undefined) return;
  try {
    ctx.provide("configForms", createConfigForms(ctx));
  } catch {
    /* The host registered configForms between the check and this call. */
  }
}
