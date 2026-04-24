import { describe, expect, test } from "bun:test";
import path from "node:path";
import { createLogger } from "../src/logger";
import { translateSkillFile } from "../src/skill-translator";

const logger = createLogger(undefined);

describe("translateSkillFile", () => {
  test("translates a plain skill correctly", async () => {
    const fixture = path.join(
      import.meta.dir,
      "fixtures/sjawhar/skills/public-thing/SKILL.md",
    );
    const result = await translateSkillFile(fixture, logger);
    expect(result?.baseName).toBe("public-thing");
    expect(result?.disabled).toBe(false);
    expect(result?.config.description).toBe(
      "A plain skill that should be visible.",
    );
    expect(result?.config.template).toContain("<command-instruction>");
    expect(result?.config.template).toContain("Body for public-thing.");
    expect(result?.config.template).toContain("</command-instruction>");
    expect(result?.config.template).toContain("<user-request>");
    expect(result?.config.template).toContain("$ARGUMENTS");
  });

  test("marks disabled when disable-model-invocation: true (boolean)", async () => {
    const fixture = path.join(
      import.meta.dir,
      "fixtures/sjawhar/skills/hidden-thing/SKILL.md",
    );
    const result = await translateSkillFile(fixture, logger);
    expect(result?.baseName).toBe("hidden-thing");
    expect(result?.disabled).toBe(true);
    expect(result?.config.description).toBe(
      "A skill that should be hidden from the model.",
    );
  });

  test("derives name from parent directory when name absent", async () => {
    const fixture = path.join(
      import.meta.dir,
      "fixtures/sjawhar/skills/derived-name/SKILL.md",
    );
    const result = await translateSkillFile(fixture, logger);
    expect(result?.baseName).toBe("derived-name");
    expect(result?.disabled).toBe(true);
    expect(result?.config.description).toBe(
      "A skill where name comes from dir.",
    );
  });

  test("does NOT apply rewriteClaudePaths to body", async () => {
    const fixture = path.join(
      import.meta.dir,
      "fixtures/sjawhar/skills/public-thing/SKILL.md",
    );
    const result = await translateSkillFile(fixture, logger);
    // The body should be wrapped in the template without path rewriting
    expect(result?.config.template).toContain("Body for public-thing.");
  });

  test("returns null for missing file", async () => {
    const result = await translateSkillFile("/nope/SKILL.md", logger);
    expect(result).toBeNull();
  });

  test("extracts no mcps when frontmatter has no mcp block", async () => {
    const fixture = path.join(
      import.meta.dir,
      "fixtures/sjawhar/skills/public-thing/SKILL.md",
    );
    const result = await translateSkillFile(fixture, logger);
    expect(result?.mcps).toEqual({});
  });

  test("translates Claude-shape local MCP (command+args+env) to OpenCode shape", async () => {
    const fixture = path.join(
      import.meta.dir,
      "fixtures/sjawhar/skills/slack-bot-like/SKILL.md",
    );
    const result = await translateSkillFile(fixture, logger);
    expect(result?.baseName).toBe("slack-bot-like");
    expect(result?.mcps).toEqual({
      slack: {
        type: "local",
        command: ["secrets", "SLACK_MCP_XOXP_TOKEN", "--", "slack-mcp-server"],
        environment: {
          SLACK_MCP_ADD_MESSAGE_TOOL: "true",
          // biome-ignore lint/suspicious/noTemplateCurlyInString: literal placeholder preserved verbatim for MCP host interpolation
          SOPS_AGE_KEY: "${SOPS_AGE_KEY}",
        },
      },
    });
  });

  test("passes array-shaped command through as-is with no args/env", async () => {
    const fixture = path.join(
      import.meta.dir,
      "fixtures/sjawhar/skills/playwright-like/SKILL.md",
    );
    const result = await translateSkillFile(fixture, logger);
    expect(result?.mcps).toEqual({
      playwright: {
        type: "local",
        command: ["npx", "-y", "@playwright/mcp@latest"],
      },
    });
  });

  test("passes remote-typed MCP through with url and headers", async () => {
    const fixture = path.join(
      import.meta.dir,
      "fixtures/sjawhar/skills/remote-mcp/SKILL.md",
    );
    const result = await translateSkillFile(fixture, logger);
    expect(result?.mcps).toEqual({
      upstream: {
        type: "remote",
        url: "https://mcp.example.com/mcp",
        headers: {
          // biome-ignore lint/suspicious/noTemplateCurlyInString: literal placeholder preserved verbatim for MCP host interpolation
          Authorization: "Bearer ${UPSTREAM_TOKEN}",
        },
      },
    });
  });
});
