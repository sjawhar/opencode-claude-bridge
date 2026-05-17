import { describe, expect, mock, test } from "bun:test";
import { utimesSync } from "node:fs";
import path from "node:path";
import {
  readEnabledPlugins,
  readInstalledRegistry,
  scanCache,
} from "../src/plugin-discovery";

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

describe("readEnabledPlugins", () => {
  test("reads user-level enabledPlugins when only user file exists", async () => {
    const { logger } = makeLogger();
    const out = await readEnabledPlugins({
      claudeConfigDir: path.join(F, "user-only"),
      cwd: path.join(F, "user-only"),
      logger,
    });
    expect(out).toEqual({ "a@m1": true, "b@m1": false });
  });

  test("reads project-level enabledPlugins when only project file exists", async () => {
    const { logger } = makeLogger();
    const out = await readEnabledPlugins({
      claudeConfigDir: path.join(F, "project-only"),
      cwd: path.join(F, "project-only/project-cwd"),
      logger,
    });
    expect(out).toEqual({ "c@m2": true });
  });

  test("merges both with project overriding user on key conflict", async () => {
    const { logger } = makeLogger();
    const out = await readEnabledPlugins({
      claudeConfigDir: path.join(F, "both"),
      cwd: path.join(F, "both/project-cwd"),
      logger,
    });
    expect(out).toEqual({
      "a@m1": true,
      "shared@m1": true,
      "b@m2": true,
    });
  });

  test("returns empty object when neither file exists", async () => {
    const { logger, warn } = makeLogger();
    const out = await readEnabledPlugins({
      claudeConfigDir: path.join(F, "empty"),
      cwd: path.join(F, "empty"),
      logger,
    });
    expect(out).toEqual({});
    expect(warn).not.toHaveBeenCalled();
  });

  test("warns and skips when settings.json is malformed", async () => {
    const { logger, warn } = makeLogger();
    const out = await readEnabledPlugins({
      claudeConfigDir: path.join(F, "malformed"),
      cwd: path.join(F, "malformed"),
      logger,
    });
    expect(out).toEqual({});
    expect(warn).toHaveBeenCalled();
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
    const { logger } = makeLogger();
    const out = await scanCache(path.join(CACHE, "populated"), logger);
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
    const { logger } = makeLogger();
    const out = await scanCache(path.join(CACHE, "empty"), logger);
    // "empty" has plugins/cache/ but no subdirs
    expect(out).toEqual({});
  });

  test("picks the most recent mtime when multiple versions exist", async () => {
    const { logger } = makeLogger();
    // Force a specific newest-mtime order: bump 1.0.0 to be newer than 2.0.0
    const target = path.join(
      CACHE,
      "multi/plugins/cache/market-m/plugin-multi/1.0.0",
    );
    const future = new Date(Date.now() + 60_000);
    utimesSync(target, future, future);

    const out = await scanCache(path.join(CACHE, "multi"), logger);
    expect(
      out["plugin-multi@market-m"].installPath.endsWith("/plugin-multi/1.0.0"),
    ).toBe(true);
    expect(out["plugin-multi@market-m"].version).toBe("1.0.0");
  });
});
