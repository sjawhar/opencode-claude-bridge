import { describe, expect, mock, test } from "bun:test";
import { utimesSync } from "node:fs";
import path from "node:path";
import {
  discoverClaudePlugins,
  readInstalledRegistry,
  readSettings,
  scanCache,
} from "../src/plugin-discovery";
import { copyClaudeHomeFixtureWithRealPaths } from "./helpers/claude-fixtures";

function makeLogger() {
  const warn = mock(async () => {});
  return {
    logger: {
      debug: mock(async () => {}),
      info: mock(async () => {}),
      warn,
      error: mock(async () => {}),
    },
    warn,
  };
}

const F = path.join(import.meta.dir, "fixtures/claude-plugins/settings");
const REG = path.join(import.meta.dir, "fixtures/claude-plugins/registry");
const CACHE = path.join(import.meta.dir, "fixtures/claude-plugins/cache");
const DISC = path.join(import.meta.dir, "fixtures/claude-plugins/discover");

describe("readSettings", () => {
  test("reads enabledPlugins from user-only settings", async () => {
    const { logger } = makeLogger();
    const out = await readSettings({
      claudeConfigDir: path.join(F, "user-only"),
      cwd: path.join(F, "user-only"),
      logger,
    });
    expect(out.enabled).toEqual({ "a@m1": true, "b@m1": false });
    expect(out.marketplaces).toEqual({});
  });

  test("reads enabledPlugins from project-only settings", async () => {
    const { logger } = makeLogger();
    const out = await readSettings({
      claudeConfigDir: path.join(F, "project-only"),
      cwd: path.join(F, "project-only/project-cwd"),
      logger,
    });
    expect(out.enabled).toEqual({ "c@m2": true });
    expect(out.marketplaces).toEqual({});
  });

  test("merges enabledPlugins with project overriding user", async () => {
    const { logger } = makeLogger();
    const out = await readSettings({
      claudeConfigDir: path.join(F, "both"),
      cwd: path.join(F, "both/project-cwd"),
      logger,
    });
    expect(out.enabled).toEqual({
      "a@m1": true,
      "shared@m1": true,
      "b@m2": true,
    });
  });

  test("returns empty when neither settings file exists", async () => {
    const { logger, warn } = makeLogger();
    const out = await readSettings({
      claudeConfigDir: path.join(F, "empty"),
      cwd: path.join(F, "empty"),
      logger,
    });
    expect(out).toEqual({ enabled: {}, marketplaces: {} });
    expect(warn).not.toHaveBeenCalled();
  });

  test("warns and skips when settings.json is malformed", async () => {
    const { logger, warn } = makeLogger();
    const out = await readSettings({
      claudeConfigDir: path.join(F, "malformed"),
      cwd: path.join(F, "malformed"),
      logger,
    });
    expect(out).toEqual({ enabled: {}, marketplaces: {} });
    expect(warn).toHaveBeenCalled();
  });

  test("reads extraKnownMarketplaces from user-level settings", async () => {
    const { logger } = makeLogger();
    const out = await readSettings({
      claudeConfigDir: path.join(F, "both"),
      cwd: path.join(F, "both"),
      logger,
    });
    expect(out.marketplaces["user-only-market"]).toEqual({
      source: { source: "github", repo: "user/only" },
    });
  });

  test("reads extraKnownMarketplaces from project-level settings", async () => {
    const { logger } = makeLogger();
    const out = await readSettings({
      claudeConfigDir: path.join(F, "both"),
      cwd: path.join(F, "both/project-cwd"),
      logger,
    });
    expect(out.marketplaces.m2).toEqual({
      source: { source: "github", repo: "user/m2" },
    });
  });

  test("merges extraKnownMarketplaces with project overriding user", async () => {
    const { logger } = makeLogger();
    const out = await readSettings({
      claudeConfigDir: path.join(F, "both"),
      cwd: path.join(F, "both/project-cwd"),
      logger,
    });
    // Project's m1 wins over user's m1
    expect(out.marketplaces.m1).toEqual({
      source: { source: "github", repo: "user/m1-project-version" },
    });
    // user-only-market survives (no project conflict)
    expect(out.marketplaces["user-only-market"]).toBeDefined();
  });

  test("returns empty marketplaces when settings file omits extraKnownMarketplaces", async () => {
    const { logger } = makeLogger();
    const out = await readSettings({
      claudeConfigDir: path.join(F, "user-only"),
      cwd: path.join(F, "user-only"),
      logger,
    });
    expect(out.marketplaces).toEqual({});
  });

  test("drops malformed marketplace entries but keeps valid ones", async () => {
    const { logger } = makeLogger();
    const out = await readSettings({
      claudeConfigDir: path.join(F, "malformed-markets"),
      cwd: path.join(F, "malformed-markets"),
      logger,
    });
    // Only the well-formed entry survives
    expect(Object.keys(out.marketplaces)).toEqual(["good"]);
    expect(out.marketplaces.good).toEqual({
      source: { source: "github", repo: "good/repo" },
    });
  });
});

describe("readInstalledRegistry", () => {
  test("parses v2 format and yields name@marketplace keys", async () => {
    const { logger } = makeLogger();
    const out = await readInstalledRegistry(path.join(REG, "v2"), logger);
    expect(out).toEqual({
      "alpha@market-a": {
        installPath: "/fake/path/to/alpha",
        version: "1.2.3",
      },
      "beta@market-b": { installPath: "/fake/path/to/beta", version: "0.1.0" },
    });
  });

  test("parses v3 flat-array format", async () => {
    const { logger } = makeLogger();
    const out = await readInstalledRegistry(path.join(REG, "v3"), logger);
    expect(out).toEqual({
      "gamma@market-c": {
        installPath: "/fake/path/to/gamma",
        version: "2.0.0",
      },
    });
  });

  test("ignores v1 format and logs info", async () => {
    const info = mock(async () => {});
    const logger = {
      debug: mock(async () => {}),
      info,
      warn: mock(async () => {}),
      error: mock(async () => {}),
    };
    const out = await readInstalledRegistry(path.join(REG, "v1"), logger);
    expect(out).toEqual({});
    expect(info).toHaveBeenCalled();
  });

  test("returns empty map when file is missing", async () => {
    const { logger } = makeLogger();
    const out = await readInstalledRegistry(path.join(REG, "missing"), logger);
    expect(out).toEqual({});
  });

  test("returns empty map and warns when file is malformed", async () => {
    const { logger, warn } = makeLogger();
    const out = await readInstalledRegistry(
      path.join(REG, "malformed"),
      logger,
    );
    expect(out).toEqual({});
    expect(warn).toHaveBeenCalled();
  });
});

describe("scanCache", () => {
  test("enumerates every <marketplace>/<plugin>/<version> triple", async () => {
    const out = await scanCache(path.join(CACHE, "populated"));
    expect(Object.keys(out).sort()).toEqual([
      "plugin-x@market-a",
      "plugin-y@market-a",
      "plugin-z@market-b",
    ]);
    expect(
      out["plugin-x@market-a"].installPath.endsWith("/market-a/plugin-x/1.0.0"),
    ).toBe(true);
  });

  test("returns empty map when cache dir absent", async () => {
    const out = await scanCache(path.join(CACHE, "empty"));
    // "empty" has plugins/cache/ but no subdirs
    expect(out).toEqual({});
  });

  test("picks the most recent mtime when multiple versions exist", async () => {
    // Force a specific newest-mtime order: bump 1.0.0 to be newer than 2.0.0
    const target = path.join(
      CACHE,
      "multi/plugins/cache/market-m/plugin-multi/1.0.0",
    );
    const future = new Date(Date.now() + 60_000);
    utimesSync(target, future, future);

    const out = await scanCache(path.join(CACHE, "multi"));
    expect(
      out["plugin-multi@market-m"].installPath.endsWith("/plugin-multi/1.0.0"),
    ).toBe(true);
    expect(out["plugin-multi@market-m"].version).toBe("1.0.0");
  });
});

describe("discoverClaudePlugins", () => {
  test("emits sources for every enabled plugin with a resolvable path", async () => {
    const claudeHome = copyClaudeHomeFixtureWithRealPaths(
      path.join(DISC, "claude-home"),
    );

    // Force plugin-multi/2.0.0 to be newer than 1.0.0 so cache-scan would also prefer it.
    const newer = path.join(
      claudeHome,
      "plugins/cache/market-d/plugin-multi/2.0.0",
    );
    const t = new Date(Date.now() + 60_000);
    utimesSync(newer, t, t);

    const { logger, warn } = makeLogger();
    const sources = await discoverClaudePlugins({
      claudeConfigDir: claudeHome,
      cwd: path.join(DISC, "project-cwd"),
      logger,
    });

    const byNs = new Map(sources.map((s) => [s.namespace, s]));

    // plugin-skills: enabled in user settings, in registry → resolved via registry
    expect(
      byNs.get("plugin-skills")?.dir.endsWith("/market-a/plugin-skills/1.0.0"),
    ).toBe(true);

    // plugin-mcp: enabled in project settings, in registry
    expect(
      byNs.get("plugin-mcp")?.dir.endsWith("/market-b/plugin-mcp/2.5.0"),
    ).toBe(true);

    // plugin-orphan: enabled in project settings, NOT in registry → resolved via cache scan
    expect(
      byNs.get("plugin-orphan")?.dir.endsWith("/market-c/plugin-orphan/0.1.0"),
    ).toBe(true);

    // plugin-multi: in registry AND on disk; registry version (2.0.0) should win
    expect(
      byNs.get("plugin-multi")?.dir.endsWith("/market-d/plugin-multi/2.0.0"),
    ).toBe(true);

    // plugin-disabled@market-x explicitly disabled in user settings → absent
    expect(byNs.has("plugin-disabled")).toBe(false);

    // plugin-missing@market-x: settings says enabled but no install on disk → warn + skip
    expect(byNs.has("plugin-missing")).toBe(false);
    const warnCalls = (warn.mock.calls as unknown[]).map((c) =>
      String((c as unknown[])[0]),
    );
    expect(warnCalls.some((m) => m.includes("plugin-missing"))).toBe(true);
  });

  test("returns empty array when no claude config dir provided plugins", async () => {
    const { logger } = makeLogger();
    const sources = await discoverClaudePlugins({
      claudeConfigDir: path.join(DISC, "../settings/empty"),
      cwd: path.join(DISC, "../settings/empty"),
      logger,
    });
    expect(sources).toEqual([]);
  });
});
