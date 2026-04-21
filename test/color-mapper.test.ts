import { describe, expect, test } from "bun:test";
import { mapClaudeColor } from "../src/color-mapper";

describe("mapClaudeColor", () => {
  test("passes hex colors through", () => {
    expect(mapClaudeColor("#ff0000")).toBe("#ff0000");
    expect(mapClaudeColor("#FF0000")).toBe("#FF0000");
  });

  test("passes OpenCode theme colors through", () => {
    for (const c of ["primary", "secondary", "accent", "success", "warning", "error", "info"]) {
      expect(mapClaudeColor(c)).toBe(c);
    }
  });

  test("returns undefined for unrecognized names", () => {
    expect(mapClaudeColor("red")).toBeUndefined();
    expect(mapClaudeColor("blue")).toBeUndefined();
    expect(mapClaudeColor("taupe")).toBeUndefined();
  });

  test("returns undefined for missing", () => {
    expect(mapClaudeColor(undefined)).toBeUndefined();
    expect(mapClaudeColor("")).toBeUndefined();
  });
});
