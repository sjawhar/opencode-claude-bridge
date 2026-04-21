import { describe, expect, test } from "bun:test";
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
});
