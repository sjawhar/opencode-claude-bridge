import { describe, expect, test } from "bun:test";
import path from "node:path";
import { createLogger } from "../src/logger";
import { translateSkillFile } from "../src/skill-translator";

const logger = createLogger(undefined);

describe("translateSkillFile", () => {
  test("translates a plain skill: name, description, body, defaults for flags", async () => {
    const fixture = path.join(
      import.meta.dir,
      "fixtures/sjawhar/skills/public-thing/SKILL.md",
    );
    const result = await translateSkillFile(fixture, logger);
    expect(result?.name).toBe("public-thing");
    expect(result?.description).toBe("A plain skill that should be visible.");
    expect(result?.body).toContain("Body for public-thing.");
    expect(result?.body).not.toContain("<command-instruction>");
    expect(result?.disableModelInvocation).toBe(false);
    expect(result?.userInvocable).toBe(true);
  });

  test("disable-model-invocation: true (boolean) sets the flag", async () => {
    const fixture = path.join(
      import.meta.dir,
      "fixtures/sjawhar/skills/hidden-thing/SKILL.md",
    );
    const result = await translateSkillFile(fixture, logger);
    expect(result?.name).toBe("hidden-thing");
    expect(result?.disableModelInvocation).toBe(true);
    expect(result?.userInvocable).toBe(true);
  });

  test("synthesizes name from parent directory when frontmatter omits it", async () => {
    const fixture = path.join(
      import.meta.dir,
      "fixtures/sjawhar/skills/derived-name/SKILL.md",
    );
    const result = await translateSkillFile(fixture, logger);
    expect(result?.name).toBe("derived-name");
    expect(result?.disableModelInvocation).toBe(true);
  });

  test("user-invocable: false (boolean) sets the flag", async () => {
    const fixture = path.join(
      import.meta.dir,
      "fixtures/sjawhar/skills/user-only/SKILL.md",
    );
    const result = await translateSkillFile(fixture, logger);
    expect(result?.name).toBe("user-only");
    expect(result?.userInvocable).toBe(false);
    expect(result?.disableModelInvocation).toBe(false);
  });

  test("preserves command-side fields agent/model/subtask on the result", async () => {
    const fixture = path.join(
      import.meta.dir,
      "fixtures/sjawhar/skills/public-thing/SKILL.md",
    );
    const result = await translateSkillFile(fixture, logger);
    expect(result?.commandFields).toEqual({});
  });

  test("returns null for missing file", async () => {
    const result = await translateSkillFile("/nope/SKILL.md", logger);
    expect(result).toBeNull();
  });

  test("skill without an mcp block has no mcp key in extraFrontmatter", async () => {
    const fixture = path.join(
      import.meta.dir,
      "fixtures/sjawhar/skills/public-thing/SKILL.md",
    );
    const result = await translateSkillFile(fixture, logger);
    expect(result?.extraFrontmatter).not.toHaveProperty("mcp");
  });

  test("frontmatter is stripped of bridge-handled fields in the passthrough", async () => {
    const fixture = path.join(
      import.meta.dir,
      "fixtures/sjawhar/skills/hidden-thing/SKILL.md",
    );
    const result = await translateSkillFile(fixture, logger);
    expect(result?.extraFrontmatter).not.toHaveProperty("name");
    expect(result?.extraFrontmatter).not.toHaveProperty("description");
    expect(result?.extraFrontmatter).not.toHaveProperty(
      "disable-model-invocation",
    );
    expect(result?.extraFrontmatter).not.toHaveProperty("user-invocable");
  });

  test("skill-embedded mcp: round-trips raw into extraFrontmatter (not stripped)", async () => {
    const fixture = path.join(
      import.meta.dir,
      "fixtures/sjawhar/skills/slack-bot-like/SKILL.md",
    );
    const result = await translateSkillFile(fixture, logger);
    // Preserved verbatim in Claude Code MCP shape (command/args/env) so the host
    // can read the skill-embedded MCP from the materialized frontmatter.
    expect(result?.extraFrontmatter.mcp).toEqual({
      slack: {
        command: "secrets",
        args: ["SLACK_MCP_XOXP_TOKEN", "--", "slack-mcp-server"],
        env: {
          SLACK_MCP_ADD_MESSAGE_TOOL: "true",
          // biome-ignore lint/suspicious/noTemplateCurlyInString: literal placeholder preserved verbatim for MCP host interpolation
          SOPS_AGE_KEY: "${SOPS_AGE_KEY}",
        },
      },
    });
  });
});
