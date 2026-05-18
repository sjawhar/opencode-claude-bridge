import { describe, expect, test } from "bun:test";
import { expandPluginRoot } from "../src/expand-plugin-root";

const ROOT = "/abs/plugin/root";
const TOKEN = "$" + "{CLAUDE_PLUGIN_ROOT}";

describe("expandPluginRoot", () => {
  test("replaces token in plain string", () => {
    expect(expandPluginRoot(`${TOKEN}/bin/x`, ROOT)).toBe(
      "/abs/plugin/root/bin/x",
    );
  });

  test("returns string unchanged when token absent", () => {
    expect(expandPluginRoot("no token here", ROOT)).toBe("no token here");
  });

  test("replaces all occurrences in a single string", () => {
    expect(expandPluginRoot(`${TOKEN}/a:${TOKEN}/b`, ROOT)).toBe(
      "/abs/plugin/root/a:/abs/plugin/root/b",
    );
  });

  test("recurses into arrays", () => {
    expect(expandPluginRoot(["a", `${TOKEN}/x`, "b"], ROOT)).toEqual([
      "a",
      "/abs/plugin/root/x",
      "b",
    ]);
  });

  test("recurses into plain objects", () => {
    expect(
      expandPluginRoot({ cmd: `${TOKEN}/bin`, env: { P: TOKEN } }, ROOT),
    ).toEqual({ cmd: "/abs/plugin/root/bin", env: { P: "/abs/plugin/root" } });
  });

  test("leaves non-string primitives untouched", () => {
    expect(expandPluginRoot(42, ROOT)).toBe(42);
    expect(expandPluginRoot(true, ROOT)).toBe(true);
    expect(expandPluginRoot(null, ROOT)).toBe(null);
    expect(expandPluginRoot(undefined, ROOT)).toBe(undefined);
  });

  test("does not mutate input objects", () => {
    const input = { cmd: `${TOKEN}/x` };
    const out = expandPluginRoot(input, ROOT);
    expect(input.cmd).toBe(`${TOKEN}/x`);
    expect(out).not.toBe(input);
  });
});
