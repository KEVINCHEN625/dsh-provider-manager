import { test, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
test("host and closure factory export plugins without embedded runtime or local source paths", () => {
  expect(existsSync("lib/index.js")).toBe(true);
  const code = readFileSync("lib/client.js", "utf8");
  let plugin: any;
  vm.runInNewContext(code, {
    window: {
      __ModuleLoader__: {
        load: (entry: any) => {
          plugin = entry.factory((name: string) => {
            expect(["react", "react/jsx-runtime"]).toContain(name);
            return {};
          });
        },
      },
    },
  });
  expect(plugin.apply).toBeTypeOf("function");
  expect(code).not.toMatch(
    /node:|\/Users\/|deepseek-harness|react\.production/,
  );
  expect(existsSync("lib/types/host/index.d.ts")).toBe(true);
});
