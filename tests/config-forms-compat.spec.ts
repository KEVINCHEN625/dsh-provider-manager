import { expect, test } from "vitest";
import {
  createConfigForms,
  installConfigFormsCompat,
  type ConfigFormsContext,
} from "../src/client/config-forms-compat.js";

function harness(seed: Record<string, unknown> = {}) {
  const services = { ...seed };
  const ctx: ConfigFormsContext = {
    get: (name) => services[name],
    provide: (name, value) => {
      if (services[name] !== undefined) throw new Error(`duplicate ${name}`);
      services[name] = value;
    },
  };
  return { ctx, services };
}

test("install is a no-op when the host already provides configForms", () => {
  const existing = { marker: true };
  const { ctx, services } = harness({ configForms: existing });
  installConfigFormsCompat(ctx);
  expect(services.configForms).toBe(existing);
});

test("install exposes configForms and reads the 0.1.5 settings binder", async () => {
  const snapshot = {
    view: { namespaces: [{ ns: "pet" }, { ns: "skin-background" }] },
  };
  const listeners = new Set<() => void>();
  const bound: string[] = [];
  const { ctx, services } = harness({
    settingsScope: {
      describe: () => ({
        getSnapshot: () => snapshot,
        subscribe: (listener: () => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      }),
      bind: ({ namespace }: { namespace: string }) => {
        bound.push(namespace);
        return {
          getSnapshot: () => ({
            status: "ready",
            value: { enabled: true },
            writable: true,
          }),
          subscribe: () => () => {},
          mutate: async () => undefined,
          set: async () => undefined,
          unset: async () => false,
        };
      },
    },
  });
  installConfigFormsCompat(ctx);
  const forms = services.configForms as ReturnType<typeof createConfigForms>;
  expect(forms.describe().getSnapshot()).toBe(snapshot);
  const form = forms.get("pet");
  expect(bound).toEqual(["pet"]);
  expect(form.getSnapshot()).toMatchObject({ status: "ready", writable: true });
  await expect(form.mutate([])).resolves.toBe(true);
  await expect(form.unset("enabled")).resolves.toBe(false);
  const seen: unknown[] = [];
  forms.describe().subscribe(() => seen.push(forms.describe().getSnapshot()));
  for (const listener of listeners) listener();
  expect(seen).toEqual([snapshot]);
});

test("a missing settings binder leaves forms unavailable instead of throwing", async () => {
  const forms = createConfigForms(harness().ctx);
  expect(forms.describe().getSnapshot()).toEqual({ view: { namespaces: [] } });
  const form = forms.get("pet");
  expect(form.getSnapshot()).toMatchObject({
    status: "unavailable",
    writable: false,
  });
  await expect(form.mutate([])).resolves.toBe(false);
});
