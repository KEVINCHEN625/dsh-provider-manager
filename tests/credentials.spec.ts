import { test, expect } from "vitest";
import { Manager } from "../src/host/providers.js";
import { fixture } from "./fixtures/services.js";
test("arbitrary refs and forged canonical prefixes denied", async () => {
  const f = fixture();
  f.sections[0].value.apiKeyEnv = "SSH_AUTH_SOCK";
  f.sections[2].value.providers.evil = {
    api: "openai-completions",
    apiKeyEnv: "DSH_PROVIDER_MANAGER_FAKE_API_KEY",
  };
  const m: any = new Manager(f.services);
  for (const id of ["opencode-go", "custom:evil"])
    await expect(
      m.reveal({ providerId: id, bindingToken: "x" }),
    ).rejects.toMatchObject({ code: "REF_NOT_ALLOWED" });
});
test("ref or revision movement invalidates old set and reveal", async () => {
  const f = fixture();
  const m: any = new Manager(f.services);
  const p = (await m.snapshot()).providers[0];
  f.sections[0].revision++;
  for (const fn of ["set", "reveal"])
    await expect(
      m[fn]({
        providerId: p.id,
        bindingToken: p.bindingToken,
        ...(fn === "set" ? { value: "x" } : {}),
      }),
    ).rejects.toMatchObject({ code: "BINDING_CHANGED" });
});
test("read-only source refuses write and reveal pairs source/value", async () => {
  const f = fixture();
  const m: any = new Manager(f.services);
  const p = (await m.snapshot()).providers[0];
  f.readonly();
  await expect(
    m.set({ providerId: p.id, bindingToken: p.bindingToken, value: "x" }),
  ).rejects.toMatchObject({ code: "READ_ONLY" });
  expect(
    await m.reveal({ providerId: p.id, bindingToken: p.bindingToken }),
  ).toMatchObject({ value: "SYNTHETIC", source: "env" });
});
test("non-custom identities and builtin catalog cannot claim canonical manager ref", async () => {
  const f = fixture();
  f.sections[2].value.providers.evil = {
    api: "openai-completions",
    apiKeyEnv: "DSH_PROVIDER_MANAGER_6576696c_API_KEY",
  };
  f.services.llm.listConfigurableProviders = () => [
    { provider: "evil", settingsNs: "llm-pi-ai", declared: false },
  ];
  const m: any = new Manager(f.services, {
    authorizedExistingRefs: {
      "custom:evil": "DSH_PROVIDER_MANAGER_6576696c_API_KEY",
    },
  });
  for (const id of ["evil", "custom:evil"])
    await expect(
      m.reveal({ providerId: id, bindingToken: "x" }),
    ).rejects.toMatchObject({ code: "REF_NOT_ALLOWED" });
});
test("cancellation during metadata describe cannot begin persistent key write", async () => {
  const f = fixture();
  const m: any = new Manager(f.services);
  const p = (await m.snapshot()).providers[0];
  let release: any;
  let reads = 0;
  f.services.credentials.describe = () =>
    ++reads === 1
      ? new Promise((r) => (release = r))
      : Promise.resolve({ configured: true, writable: true, source: "file" });
  const abort = new AbortController();
  const task = m.set(
    { providerId: p.id, bindingToken: p.bindingToken, value: "DO_NOT_WRITE" },
    abort.signal,
  );
  abort.abort();
  release({ configured: true, writable: true, source: "file" });
  await expect(task).rejects.toBeDefined();
  expect(f.values.get("OPENCODE_API_KEY")).toBe("SYNTHETIC");
});
