import { describe, expect, test } from "bun:test";
import { rewriteClaudePaths } from "../src/rewrite-paths";

describe("rewriteClaudePaths", () => {
  test("rewrites ~/.claude/ to ~/.config/opencode/", () => {
    const input = "See ~/.claude/settings.json for config";
    const expected = "See ~/.config/opencode/settings.json for config";
    expect(rewriteClaudePaths(input)).toBe(expected);
  });

  test("rewrites .claude/ to .opencode/", () => {
    const input = "Check .claude/agents/foo.md for details";
    const expected = "Check .opencode/agents/foo.md for details";
    expect(rewriteClaudePaths(input)).toBe(expected);
  });

  test("passes through string without .claude/ unchanged", () => {
    const input = "This is a normal string with no paths";
    expect(rewriteClaudePaths(input)).toBe(input);
  });

  test("rewrites multiple occurrences in one string", () => {
    const input = "Use ~/.claude/config and .claude/agents/foo.md";
    const expected =
      "Use ~/.config/opencode/config and .opencode/agents/foo.md";
    expect(rewriteClaudePaths(input)).toBe(expected);
  });

  test("rewrites .claude/ inside longer paths", () => {
    const input = "Path: /path/to/.claude/foo/bar.md";
    const expected = "Path: /path/to/.opencode/foo/bar.md";
    expect(rewriteClaudePaths(input)).toBe(expected);
  });

  test("does not rewrite backslash paths", () => {
    const input = "Windows path: \\.claude\\settings.json";
    expect(rewriteClaudePaths(input)).toBe(input);
  });

  test("does not rewrite .claude without trailing slash", () => {
    const input = "The .claude dir is deprecated";
    expect(rewriteClaudePaths(input)).toBe(input);
  });
});
