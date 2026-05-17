import { describe, expect, mock, test } from "bun:test";
import path from "node:path";
import { readEnabledPlugins } from "../src/plugin-discovery";

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
