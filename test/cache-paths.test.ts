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
  test("returns namespace verbatim when provided", () => {
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
});
