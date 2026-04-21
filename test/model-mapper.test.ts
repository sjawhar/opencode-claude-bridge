import { describe, expect, test } from "bun:test";
import { mapClaudeModel } from "../src/model-mapper";

describe("mapClaudeModel", () => {
  test("maps opus alias", () => {
    expect(mapClaudeModel("opus")).toBe("anthropic/claude-opus-4-6");
  });

  test("maps sonnet alias", () => {
    expect(mapClaudeModel("sonnet")).toBe("anthropic/claude-sonnet-4-6");
  });

  test("maps haiku alias", () => {
    expect(mapClaudeModel("haiku")).toBe("anthropic/claude-haiku-4-5");
  });

  test("passes through provider/model format unchanged", () => {
    expect(mapClaudeModel("anthropic/claude-opus-4-7")).toBe("anthropic/claude-opus-4-7");
    expect(mapClaudeModel("openai/gpt-5")).toBe("openai/gpt-5");
  });

  test("returns undefined for inherit", () => {
    expect(mapClaudeModel("inherit")).toBeUndefined();
  });

  test("returns undefined for empty or missing input", () => {
    expect(mapClaudeModel(undefined)).toBeUndefined();
    expect(mapClaudeModel("")).toBeUndefined();
    expect(mapClaudeModel("   ")).toBeUndefined();
  });

  test("prefixes bare claude-* model IDs with anthropic/", () => {
    expect(mapClaudeModel("claude-opus-4-7")).toBe("anthropic/claude-opus-4-7");
  });

  test("returns undefined for unrecognized bare names", () => {
    expect(mapClaudeModel("gpt-4")).toBeUndefined();
    expect(mapClaudeModel("random-name")).toBeUndefined();
  });
});
