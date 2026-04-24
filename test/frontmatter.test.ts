import { describe, expect, test } from "bun:test";
import { parseFrontmatter } from "../src/frontmatter";

describe("parseFrontmatter", () => {
  test("parses simple key-value frontmatter", () => {
    const input = "---\nname: bug-finder\nmodel: opus\n---\nBody text\n";
    expect(parseFrontmatter(input)).toEqual({
      data: { name: "bug-finder", model: "opus" },
      body: "Body text\n",
    });
  });

  test("strips surrounding quotes from values", () => {
    const input = `---\nname: "quoted"\ndescription: 'single'\n---\nBody\n`;
    expect(parseFrontmatter(input)).toEqual({
      data: { name: "quoted", description: "single" },
      body: "Body\n",
    });
  });

  test("returns empty data and full content when no frontmatter", () => {
    const input = "No frontmatter here\nJust body\n";
    expect(parseFrontmatter(input)).toEqual({
      data: {},
      body: "No frontmatter here\nJust body\n",
    });
  });

  test("handles multi-line description using block scalar (|)", () => {
    const input = "---\ndescription: |\n  Line one.\n  Line two.\n---\nBody\n";
    const result = parseFrontmatter(input);
    // Standard YAML: `|` (clip) preserves a single trailing newline.
    expect(result.data.description).toBe("Line one.\nLine two.\n");
    expect(result.body).toBe("Body\n");
  });

  test("handles array values with bracket syntax", () => {
    const input = "---\nhandoffs: []\ntools: [Read, Edit]\n---\nBody\n";
    const result = parseFrontmatter(input);
    expect(result.data.handoffs).toEqual([]);
    expect(result.data.tools).toEqual(["Read", "Edit"]);
    expect(result.data.handoffs).toEqual([]);
    expect(result.data.tools).toEqual(["Read", "Edit"]);
  });

  test("parses nested objects (mcp block)", () => {
    const input = [
      "---",
      "name: slack-bot",
      "mcp:",
      "  slack:",
      "    command: secrets",
      '    args: ["SLACK_MCP_XOXP_TOKEN", "--", "slack-mcp-server"]',
      "    env:",
      '      SLACK_MCP_ADD_MESSAGE_TOOL: "true"',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal placeholder preserved verbatim for MCP host interpolation
      '      SOPS_AGE_KEY: "${SOPS_AGE_KEY}"',
      "---",
      "Body",
      "",
    ].join("\n");
    const result = parseFrontmatter(input);
    expect(result.data.name).toBe("slack-bot");
    expect(result.data.mcp).toEqual({
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
    expect(result.body.trim()).toBe("Body");
  });
});
