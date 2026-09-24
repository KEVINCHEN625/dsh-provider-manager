import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { brandMark } from "../src/client/ProviderIcon.js";

test("brand marks are embedded and do not point at a remote asset", () => {
  const source = readFileSync(
    new URL("../src/client/brand-icons.ts", import.meta.url),
    "utf8",
  );
  expect(source).not.toMatch(/https?:\/\//);
  expect(brandMark("anthropic")?.path.length).toBeGreaterThan(20);
  expect(brandMark("anthropic")?.title).toBe("Anthropic");
  expect(brandMark("github-copilot")?.title).toBe("GitHub Copilot");
  expect(brandMark("kimi-coding")?.title).toBe("Kimi");
  expect(brandMark("xai")?.hex).toBe("");
  expect(brandMark("openai-codex")?.title).toBe("OpenAI");
  expect(brandMark("openai")?.title).toBe("OpenAI");
  expect(brandMark("amazon-bedrock")?.title).toBe("Amazon Bedrock");
  expect(brandMark("azure-openai-responses")?.title).toBe("Azure");
  expect(brandMark("azure")?.paths?.map((part) => part.opacity)).toEqual([
    0.75,
    0.5,
    undefined,
  ]);
  expect(brandMark("groq")?.title).toBe("Groq");
  expect(brandMark("cerebras")?.title).toBe("Cerebras");
  expect(brandMark("fireworks")?.title).toBe("Fireworks");
  expect(brandMark("together")?.paths?.length).toBe(3);
  expect(brandMark("baseten")?.title).toBe("Baseten");
  expect(brandMark("zai-coding-cn")?.title).toBe("Z.ai");
  expect(brandMark("ant-ling")?.title).toBe("Ant Group");
  expect(brandMark("radius")?.title).toBe("Pi");
  expect(brandMark("radius")?.paths?.length).toBe(3);
  expect(brandMark("minimax-cn")?.title).toBe("MiniMax");
  expect(brandMark("opencode-go")?.title).toBe("OpenCode");
  expect(brandMark("vercel-ai-gateway")?.title).toBe("Vercel");
  expect(brandMark("xiaomi-token-plan-cn")?.title).toBe("Xiaomi");
});
