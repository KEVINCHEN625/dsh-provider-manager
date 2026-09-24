// @vitest-environment jsdom
import { expect, test } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import {
  apply as providerManagerApply,
  inject as providerManagerInject,
} from "../src/client/index.js";

/**
 * Same projection the web boot page uses. Cordis `FiberState` is a const enum,
 * so the labels are the numeric values from the host's loader-status mirror.
 */
const STATE_LABELS = [
  "pending",
  "loading",
  "active",
  "failed",
  "disposed",
  "unloading",
] as const;

const PET = "@linxin666/dsh-pet";
const SKIN = "@linxin666/dsh-client-ui-skin-center";

interface BootFiber {
  state: number;
  inject: Record<string, unknown>;
  dispose(): Promise<void> | void;
}

/** The web boot failure string, copied from the host's entry audit. */
function bootFailure(
  ctx: Context,
  entries: readonly { name: string; fiber: BootFiber }[],
): string | undefined {
  const failures: string[] = [];
  for (const entry of entries) {
    const state = STATE_LABELS[entry.fiber.state];
    if (state === "active") continue;
    if (state === "pending") {
      const missing = Object.keys(entry.fiber.inject).filter(
        (service) => ctx.get(service) === undefined,
      );
      failures.push(
        `${entry.name}: pending (waiting for service${missing.length === 1 ? "" : "s"}: ${missing.join(", ") || "unknown"})`,
      );
    } else {
      failures.push(`${entry.name}: ${state}`);
    }
  }
  if (failures.length === 0) return undefined;
  return `web boot: ${String(failures.length)} entr${failures.length === 1 ? "y" : "ies"} did not activate\n${failures.join("\n")}`;
}

function settingsScope() {
  return {
    describe: () => ({
      getSnapshot: () => ({
        view: { namespaces: [{ ns: "pet" }, { ns: "skin-background" }] },
      }),
      subscribe: () => () => {},
    }),
    bind: ({ namespace }: { namespace: string }) => ({
      getSnapshot: () => ({
        status: "ready",
        value: { namespace },
        writable: true,
      }),
      subscribe: () => () => {},
      mutate: async () => undefined,
    }),
  };
}

function hostWithoutConfigForms() {
  const ctx = new Context();
  ctx.provide("slots", {
    inject: (_name: string, setup: () => () => void) => {
      const dispose = setup();
      return () => dispose();
    },
    register: () => () => {},
  });
  ctx.provide("locale", {
    register: () => () => {},
    bind: () => () => "Providers",
  });
  ctx.provide("connection", {
    generation: {
      subscribe: () => () => {},
      getSnapshot: () => 1,
    },
    rpc: async () => {
      throw new Error("unused");
    },
  });
  ctx.provide("remote", {});
  ctx.provide("sessions", {});
  ctx.provide("uiWorkspace", {});
  ctx.provide("theme", {});
  ctx.provide("settingsScope", settingsScope());
  return ctx;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

test("a 0.1.5 host leaves pet and skin-center pending until configForms is installed", async () => {
  const ctx = hostWithoutConfigForms();
  const opened: string[] = [];
  const pet = ctx.plugin({
    inject: [
      "slots",
      "locale",
      "connection",
      "configForms",
      "remote",
      "sessions",
      "uiWorkspace",
    ],
    apply(scope: Context) {
      const forms = scope.get("configForms") as {
        get(id: string): {
          getSnapshot(): { status: string; value?: { namespace?: string } };
        };
      };
      opened.push(`${PET}:${forms.get("pet").getSnapshot().value?.namespace}`);
    },
  }) as unknown as BootFiber;
  const skin = ctx.plugin({
    inject: ["slots", "locale", "theme", "configForms", "connection", "remote"],
    apply(scope: Context) {
      const forms = scope.get("configForms") as {
        get(id: string): { getSnapshot(): { value?: { namespace?: string } } };
      };
      opened.push(
        `${SKIN}:${forms.get("skin-background").getSnapshot().value?.namespace}`,
      );
    },
  }) as unknown as BootFiber;
  await tick();
  const before = bootFailure(ctx, [
    { name: PET, fiber: pet },
    { name: SKIN, fiber: skin },
  ]);
  expect(before).toBe(
    [
      "web boot: 2 entries did not activate",
      `${PET}: pending (waiting for service: configForms)`,
      `${SKIN}: pending (waiting for service: configForms)`,
    ].join("\n"),
  );
  expect(opened).toEqual([]);

  const manager = ctx.plugin({
    inject: providerManagerInject,
    apply: providerManagerApply,
  }) as unknown as BootFiber;
  await tick();
  expect(
    bootFailure(ctx, [
      { name: PET, fiber: pet },
      { name: SKIN, fiber: skin },
      { name: "dsh-provider-manager", fiber: manager },
    ]),
  ).toBeUndefined();
  expect(opened).toEqual([`${PET}:pet`, `${SKIN}:skin-background`]);
  expect(ctx.get("configForms")).toBeDefined();

  await pet.dispose();
  await skin.dispose();
  await manager.dispose();
});
