import { expect, test } from "vitest";
import { Manager } from "../src/host/providers.js";
import { fixture } from "./fixtures/services.js";
import { QuotaReader, OPENCODE_USAGE_URL } from "../src/host/quota.js";
const route = "provider-manager-opencode-go";
test("built-in card shares key but has independent binding and quota destination", async () => {
  const f = fixture();
  f.sections.push({
    ns: route,
    revision: 1,
    value: { apiKeyEnv: "OPENCODE_API_KEY" },
  });
  const calls: any[] = [];
  const reader = new QuotaReader({
    fetch: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ rolling: { usage: 0.2 } }), {
        status: 200,
      });
    },
  });
  const m = new Manager(f.services, {}, reader);
  const c = await m.card(route);
  const old = await m.card("opencode-go");
  expect(c.name).toBe("OpenCode Go (Provider Manager)");
  expect(c.bindingToken).not.toBe(old.bindingToken);
  expect(await m.quota({ providerId: route })).toMatchObject({
    status: "ready",
    source: "opencode-official",
    windows: [{ id: "five-hour", usedPercent: 20 }],
  });
  expect(await m.quota({ providerId: "opencode-go" })).toMatchObject({
    status: "ready",
  });
  await m.quota({ providerId: route });
  await m.quota({ providerId: "opencode-go" });
  expect(calls).toHaveLength(2);
  expect(calls.map((c) => c.url)).toEqual([
    OPENCODE_USAGE_URL,
    OPENCODE_USAGE_URL,
  ]);
  expect(calls.every((c) => c.init.redirect === "error")).toBe(true);
  // Saving the same shared value must invalidate the other card too; this
  // distinguishes invalidation from the reader's credential identity check.
  await m.set({
    providerId: route,
    bindingToken: c.bindingToken,
    value: "SYNTHETIC",
  });
  await m.quota({ providerId: "opencode-go" });
  expect(calls).toHaveLength(3);
  await m.set({
    providerId: route,
    bindingToken: c.bindingToken,
    value: "UPDATED",
  });
  await m.quota({ providerId: "opencode-go" });
  expect(calls).toHaveLength(4);
  expect(new Headers(calls[3].init.headers).get("authorization")).toBe(
    "Bearer UPDATED",
  );
  f.sections.find((s) => s.ns === route)!.revision++;
  await expect(
    m.quota({ providerId: route, bindingToken: c.bindingToken }),
  ).rejects.toMatchObject({ code: "BINDING_CHANGED" });
  expect(m.binding("opencode-go").token).toBe(old.bindingToken);
  expect(
    (
      await m.reveal({
        providerId: "opencode-go",
        bindingToken: old.bindingToken,
      })
    ).value,
  ).toBe("UPDATED");
  m.dispose();
});
test("built-in card DTO joins the audited catalog including blocked ids", async () => {
  const f = fixture();
  f.sections.push({
    ns: route,
    revision: 1,
    value: { apiKeyEnv: "OPENCODE_API_KEY" },
  });
  const originalList = f.services.llm.listModels;
  f.services.llm.listModels = async (id: string) =>
    id === route
      ? [
          {
            id: "muse-spark-1.3-contributor",
            name: "Muse Spark 1.3 Contributor",
          },
        ]
      : originalList(id);
  const m = new Manager(f.services);
  const card = await m.card(route);
  expect(card.models).toHaveLength(40);
  expect(card.catalogCheckedAt).toBeTruthy();
  const muse = card.models.find(
    (item) => item.id === "muse-spark-1.3-contributor",
  );
  expect(muse).toMatchObject({
    api: "openai-responses",
    contextWindow: 1048576,
    maxOutputTokens: 131072,
    disposition: "supported",
  });
  const blocked = card.models.find((item) => item.id === "deepseek-flash");
  expect(blocked?.disposition).toBe("blocked-with-evidence");
  expect(blocked?.blockReasons?.join(" ")).toMatch(/alias-forbidden/);
  expect(card.models.find((item) => item.id === "hy3")?.inputLimit).toBe(
    192000,
  );
  const legacy = await m.card("opencode-go");
  expect(legacy.models[0]?.id).toBe("example");
  m.dispose();
});
