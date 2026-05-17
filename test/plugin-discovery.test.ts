import { describe, expect, mock, test } from "bun:test";
import path from "node:path";
import {
  readEnabledPlugins,
  readInstalledRegistry,
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
