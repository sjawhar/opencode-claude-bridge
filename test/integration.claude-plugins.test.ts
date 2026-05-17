import { describe, expect, mock, test } from "bun:test";
import path from "node:path";
import { createClaudeBridge } from "../src/index";
import { copyClaudeHomeFixtureWithRealPaths } from "./helpers/claude-fixtures";

async function runBridge(config: Parameters<typeof createClaudeBridge>[0]) {
  const plugin = createClaudeBridge(config);
  const hooks = await (
    plugin as (ctx: unknown) => Promise<Record<string, unknown>>
  )({
    client: { app: { log: mock(async () => ({})) } },
    directory: process.cwd(),
    worktree: process.cwd(),
    project: { path: process.cwd() },
    $: mock(() => ({})),
  });
  const configHook = hooks.config as (
    c: Record<string, unknown>,
  ) => Promise<void>;
  const out: Record<string, unknown> = {};
  await configHook(out);
  return out;
}

const DISC = path.join(import.meta.dir, "fixtures/claude-plugins/discover");

describe("createClaudeBridge with claudePlugins discovery", () => {
  test("loads discovered plugin sources alongside hand-listed sources", async () => {
    const claudeHome = copyClaudeHomeFixtureWithRealPaths(
      path.join(DISC, "claude-home"),
    );

    const cfg = await runBridge({
      sources: [],
      claudePlugins: {
        claudeConfigDir: claudeHome,
        cwd: path.join(DISC, "project-cwd"),
      },
    });

    const commands = cfg.command as Record<string, unknown>;
    // plugin-skills has skills/example-skill → registered as a command
    expect(commands["example-skill"]).toBeDefined();
  });

  test("user-listed sources occupy unprefixed slots; discovered ones namespace-fallback on collision", async () => {
    const claudeHome = copyClaudeHomeFixtureWithRealPaths(
      path.join(DISC, "claude-home"),
    );

    const handPath = path.join(
      claudeHome,
      "plugins/cache/market-a/plugin-skills/1.0.0",
    );
    const cfg = await runBridge({
      sources: [{ dir: handPath, namespace: "hand" }],
      claudePlugins: {
        claudeConfigDir: claudeHome,
        cwd: path.join(DISC, "project-cwd"),
      },
    });
    const commands = cfg.command as Record<string, unknown>;
    // user-listed: unprefixed
    expect(commands["example-skill"]).toBeDefined();
    // discovered: namespaced to plugin-skills/example-skill (collision fallback)
    expect(commands["plugin-skills/example-skill"]).toBeDefined();
  });

  test("claudePlugins: true uses default env-based config dir", async () => {
    // Sanity: with `true`, bridge resolves claudeConfigDir from
    // process.env.CLAUDE_CONFIG_DIR or homedir. Just verify it runs without
    // throwing (discovery may return empty if env doesn't point to anything).
    const cfg = await runBridge({
      sources: [],
      claudePlugins: true,
    });
    expect(cfg.command).toBeDefined();
  });
});
