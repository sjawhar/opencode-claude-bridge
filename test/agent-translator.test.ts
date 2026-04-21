import { describe, expect, test } from "bun:test";
import path from "node:path";
import { translateAgentFile } from "../src/agent-translator";
import { createLogger } from "../src/logger";

const logger = createLogger(undefined);
const fixture = path.join(
  import.meta.dir,
  "fixtures/sjawhar/agents/bug-finder.md",
);

describe("translateAgentFile", () => {
  test("translates bug-finder fixture correctly", async () => {
    const result = await translateAgentFile(fixture, logger);
    expect(result).toEqual({
      baseName: "bug-finder",
      config: {
        description:
          "Find subtle bugs and edge cases in recently written code.",
        mode: "subagent",
        tools: { read: true, edit: true, write: true, bash: true },
        prompt:
          "You are an elite bug hunter. Analyze recent code for boundary conditions.",
      },
    });
  });

  test("drops invalid color without failing", async () => {
    const result = await translateAgentFile(fixture, logger);
    expect(result?.config.color).toBeUndefined();
  });

  test("returns null for missing file", async () => {
    const result = await translateAgentFile("/nonexistent/path.md", logger);
    expect(result).toBeNull();
  });

  test("keeps model when mode is primary", async () => {
    const primaryFixture = path.join(
      import.meta.dir,
      "fixtures/sjawhar/agents/primary-agent.md",
    );
    const result = await translateAgentFile(primaryFixture, logger);
    expect(result).toEqual({
      baseName: "primary-agent",
      config: {
        description: "A primary agent that keeps its model.",
        mode: "primary",
        model: "anthropic/claude-opus-4-6",
        tools: { read: true, edit: true },
        prompt: "You are a primary agent with explicit model configuration.",
      },
    });
  });
});
