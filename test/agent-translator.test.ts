import { describe, expect, test } from "bun:test";
import { translateAgentFile } from "../src/agent-translator";
import { createLogger } from "../src/logger";
import path from "path";

const logger = createLogger(undefined);
const fixture = path.join(import.meta.dir, "fixtures/sjawhar/agents/bug-finder.md");

describe("translateAgentFile", () => {
  test("translates bug-finder fixture correctly", async () => {
    const result = await translateAgentFile(fixture, { namespace: "sjawhar" }, logger);
    expect(result).toEqual({
      name: "sjawhar-bug-finder",
      config: {
        description: "Find subtle bugs and edge cases in recently written code.",
        mode: "subagent",
        model: "anthropic/claude-opus-4-6",
        tools: { read: true, edit: true, write: true, bash: true },
        prompt: "You are an elite bug hunter. Analyze recent code for boundary conditions.",
      },
    });
  });

  test("omits namespace prefix when unset", async () => {
    const result = await translateAgentFile(fixture, {}, logger);
    expect(result?.name).toBe("bug-finder");
  });

  test("drops invalid color without failing", async () => {
    const result = await translateAgentFile(fixture, {}, logger);
    expect(result?.config.color).toBeUndefined();
  });

  test("returns null for missing file", async () => {
    const result = await translateAgentFile("/nonexistent/path.md", {}, logger);
    expect(result).toBeNull();
  });
});
