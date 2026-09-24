import { expect, test } from "vitest";
import { MUSE_MODELS } from "../src/host/muse/catalog.js";

test("muse spark lists five models and only 1.3 offers max", () => {
  expect(MUSE_MODELS.map((model) => model.id)).toEqual([
    "muse-spark-1.3",
    "muse-spark-1.2",
    "muse-spark-1.1",
    "muse-spark-1.3-contributor",
    "muse-spark-1.2-contributor",
  ]);
  for (const model of MUSE_MODELS) {
    expect(model.contextWindow).toBe(1_048_576);
    expect(model.maxTokens).toBe(131_072);
    expect(model.thinkingLevelMap?.off).toBeNull();
    expect(model.thinkingLevelMap?.minimal).toBe("minimal");
    expect(model.thinkingLevelMap?.xhigh).toBe("xhigh");
  }
  expect(MUSE_MODELS[0]?.thinkingLevelMap?.max).toBe("max");
  for (const model of MUSE_MODELS.slice(1)) {
    expect(model.thinkingLevelMap?.max).toBeNull();
  }
});
