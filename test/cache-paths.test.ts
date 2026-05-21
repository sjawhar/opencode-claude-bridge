import { afterEach, describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";
import { computeSourceKey, getCacheRoot } from "../src/cache-paths";

describe("getCacheRoot", () => {
  const origXdg = process.env.XDG_CACHE_HOME;
  afterEach(() => {
    if (origXdg === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = origXdg;
  });

  test("uses $XDG_CACHE_HOME when set", () => {
    process.env.XDG_CACHE_HOME = "/tmp/xdg-cache";
    expect(getCacheRoot()).toBe("/tmp/xdg-cache/opencode-claude-bridge/skills");
  });

  test("falls back to ~/.cache when $XDG_CACHE_HOME is unset", () => {
    delete process.env.XDG_CACHE_HOME;
    expect(getCacheRoot()).toBe(
      path.join(os.homedir(), ".cache/opencode-claude-bridge/skills"),
    );
  });
});

describe("computeSourceKey", () => {
  test("returns safe namespace verbatim when provided", () => {
    expect(computeSourceKey("/whatever/path", "sjawhar")).toBe("sjawhar");
  });

  test("returns a stable 12-char hex hash of the absolute path when no namespace", () => {
    const k1 = computeSourceKey("/abs/path/one");
    const k2 = computeSourceKey("/abs/path/one");
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^[0-9a-f]{12}$/);
  });

  test("different paths yield different keys", () => {
    expect(computeSourceKey("/abs/a")).not.toBe(computeSourceKey("/abs/b"));
  });

  test("namespace short-circuits even when path differs", () => {
    expect(computeSourceKey("/a", "shared")).toBe(
      computeSourceKey("/b", "shared"),
    );
  });

  test("falls back to hash when namespace contains path-traversal segments", () => {
    expect(computeSourceKey("/abs/a", "../../etc")).toMatch(/^[0-9a-f]{12}$/);
  });

  test("falls back to hash when namespace contains a slash", () => {
    expect(computeSourceKey("/abs/a", "foo/bar")).toMatch(/^[0-9a-f]{12}$/);
  });

  test("falls back to hash for empty namespace and falsy values", () => {
    expect(computeSourceKey("/abs/a", "")).toMatch(/^[0-9a-f]{12}$/);
  });

  test("accepts a safe namespace verbatim", () => {
    expect(computeSourceKey("/abs/a", "my-source")).toBe("my-source");
    expect(computeSourceKey("/abs/a", "namespace.v2")).toBe("namespace.v2");
  });
});
