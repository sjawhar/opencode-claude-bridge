import { describe, expect, test } from "bun:test";
import type { Logger } from "../src/logger";
import { parseToolsList } from "../src/tools-parser";

describe("parseToolsList", () => {
  test("parses comma-separated string", () => {
    expect(parseToolsList("Read, Edit, Write")).toEqual({
      read: true,
      edit: true,
      write: true,
    });
  });

  test("parses array of strings", () => {
    expect(parseToolsList(["Read", "Edit"])).toEqual({
      read: true,
      edit: true,
    });
  });

  test("lowercases tool names", () => {
    expect(parseToolsList("WebFetch, TodoWrite")).toEqual({
      webfetch: true,
      todowrite: true,
    });
  });

  test("trims whitespace", () => {
    expect(parseToolsList("  Read  ,   Edit  ")).toEqual({
      read: true,
      edit: true,
    });
  });

  test("returns undefined for falsy", () => {
    expect(parseToolsList(undefined)).toBeUndefined();
    expect(parseToolsList("")).toBeUndefined();
    expect(parseToolsList([])).toBeUndefined();
  });

  test("ignores non-string array entries", () => {
    expect(parseToolsList(["Read", 42, null, "Edit"] as unknown[])).toEqual({
      read: true,
      edit: true,
    });
  });
  test("drops unknown tool names", () => {
    expect(parseToolsList("Read, Foo, Bar")).toEqual({
      read: true,
    });
  });

  test("calls logger.debug for dropped tools", async () => {
    const debugCalls: string[] = [];
    const mockLogger: Logger = {
      debug: async (message: string) => {
        debugCalls.push(message);
      },
      info: async () => {},
      warn: async () => {},
      error: async () => {},
    };
    parseToolsList("Read, UnknownTool, AnotherBad", mockLogger);
    expect(debugCalls).toContain('Dropped unknown tool "UnknownTool"');
    expect(debugCalls).toContain('Dropped unknown tool "AnotherBad"');
  });

  test("works with no logger", () => {
    expect(parseToolsList("Read, Foo, Edit")).toEqual({
      read: true,
      edit: true,
    });
  });
});
