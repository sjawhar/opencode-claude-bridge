import { describe, expect, test } from "bun:test";
import path from "node:path";
import { translateAgentFile } from "../src/agent-translator";
import { translateCommandFile } from "../src/command-translator";
import { createLogger } from "../src/logger";
import { translateSkillFile } from "../src/skill-translator";

const logger = createLogger(undefined);
const fixturesRoot = path.join(import.meta.dir, "fixtures/yaml-quirks");

// Regression tests for the parser swap from the hand-rolled (always-string)
// parser to the `yaml` package (native YAML scalar types). Translators must
// not crash when frontmatter scalars come back as numbers/booleans, and must
// coerce them to strings where they are passed into APIs that expect text.

describe("non-string scalar frontmatter values", () => {
  test("agent translator coerces numeric scalars instead of crashing", async () => {
    const fixture = path.join(fixturesRoot, "agents/numeric-fields.md");
    const result = await translateAgentFile(fixture, logger);
    expect(result?.baseName).toBe("1234");
    expect(result?.config.description).toBe("42");
    // model "1" doesn't match any alias, doesn't include "/", doesn't start
    // with "claude-", so it gets dropped. Important: no crash.
    expect(result?.config.model).toBeUndefined();
    // color "7" doesn't match hex or theme color, so it's dropped (debug-logged).
    expect(result?.config.color).toBeUndefined();
  });

  test("command translator coerces boolean scalars instead of crashing", async () => {
    const fixture = path.join(fixturesRoot, "commands/bool-fields.md");
    const result = await translateCommandFile(fixture, logger);
    expect(result?.config.description).toBe("true");
    expect(result?.config.agent).toBe("false");
    expect(result?.config.model).toBe("anthropic/claude-opus-4-6");
  });

  test("skill translator coerces numeric scalars instead of crashing", async () => {
    const fixture = path.join(fixturesRoot, "skills/numeric-fields/SKILL.md");
    const result = await translateSkillFile(fixture, logger);
    expect(result?.baseName).toBe("1234");
    expect(result?.config.description).toBe("42");
    expect(result?.config.agent).toBe("7");
    expect(result?.config.model).toBeUndefined();
    expect(result?.mcps).toEqual({});
  });
});
