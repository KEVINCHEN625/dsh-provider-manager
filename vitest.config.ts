import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    maxWorkers: 2,
    minWorkers: 1,
    exclude: ["**/node_modules/**", "**/dist/**", "**/artifacts/**"],
  },
});
