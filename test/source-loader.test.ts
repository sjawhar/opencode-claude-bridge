import { describe, expect, mock, test } from "bun:test";
import path from "node:path";
import { createLogger } from "../src/logger";
import { loadSource } from "../src/source-loader";

const logger = createLogger(undefined);
const sjawhar = path.join(import.meta.dir, "fixtures/sjawhar");
const empty = path.join(import.meta.dir, "fixtures/empty");

describe("loadSource", () => {
  test("loads agents and commands from a populated source", async () => {
    const result = await loadSource({ dir: sjawhar }, logger);
    expect(Object.keys(result.agents)).toContain("bug-finder");
    expect(Object.keys(result.commands)).toContain("no-excuses");
  });

  test("returns empty records for dir with no agents/ or commands/", async () => {
    const result = await loadSource({ dir: empty }, logger);
    expect(result.agents).toEqual({});
    expect(result.commands).toEqual({});
  });

  test("skips agents when agents: false", async () => {
    const result = await loadSource({ dir: sjawhar, agents: false }, logger);
    expect(result.agents).toEqual({});
    expect(Object.keys(result.commands).length).toBeGreaterThan(0);
  });

  test("skips commands when commands: false", async () => {
    const result = await loadSource({ dir: sjawhar, commands: false }, logger);
    expect(result.commands).toEqual({});
    expect(Object.keys(result.agents).length).toBeGreaterThan(0);
  });

  test("supports custom agents subdir name", async () => {
    // Point at a dir where agents subdir does not exist
    const result = await loadSource(
      { dir: sjawhar, agents: "subagents" },
      logger,
    );
    expect(result.agents).toEqual({});
  });

  test("scans skills dir for disable-model-invocation: true and returns skillCommands", async () => {
    const result = await loadSource({ dir: sjawhar }, logger);
    expect(result.deniedSkills).toContain("hidden-thing");
    expect(result.deniedSkills).toContain("derived-name");
    expect(result.deniedSkills).not.toContain("public-thing");
    expect(Object.keys(result.skillCommands)).toContain("public-thing");
    expect(Object.keys(result.skillCommands)).toContain("hidden-thing");
    expect(Object.keys(result.skillCommands)).toContain("derived-name");
  });

  test("skips skills scan when skills: false", async () => {
    const result = await loadSource({ dir: sjawhar, skills: false }, logger);
    expect(result.deniedSkills).toEqual([]);
    expect(result.skillCommands).toEqual({});
  });

  test("returns empty skillCommands and deniedSkills when skills subdir doesn't exist", async () => {
    const result = await loadSource({ dir: empty }, logger);
    expect(result.deniedSkills).toEqual([]);
    expect(result.skillCommands).toEqual({});
    expect(result.skillMcps).toEqual({});
  });

  test("aggregates MCPs from all skill SKILL.md files in the source dir", async () => {
    const result = await loadSource({ dir: sjawhar }, logger);
    expect(Object.keys(result.skillMcps)).toContain("slack");
    expect(Object.keys(result.skillMcps)).toContain("playwright");
    expect(Object.keys(result.skillMcps)).toContain("upstream");
    expect(result.skillMcps.slack).toMatchObject({ type: "local" });
    expect(result.skillMcps.upstream).toMatchObject({ type: "remote" });
  });

  test("omits skillMcps when skills: false", async () => {
    const result = await loadSource({ dir: sjawhar, skills: false }, logger);
    expect(result.skillMcps).toEqual({});
  });
});

describe("loadSource: root .mcp.json + CLAUDE_PLUGIN_ROOT expansion", () => {
  test("loads root .mcp.json entries and expands the token", async () => {
    const dir = path.join(
      import.meta.dir,
      "fixtures/claude-plugins/source-loader-rootmcp",
    );
    const logger = {
      debug: mock(async () => {}),
      info: mock(async () => {}),
      warn: mock(async () => {}),
      error: mock(async () => {}),
    };
    const result = await loadSource({ dir }, logger);

    const rooted = result.skillMcps.rooted;
    expect(rooted).toBeDefined();
    expect(rooted).toMatchObject({
      type: "local",
      command: [`${dir}/bin/server.sh`, "--config", `${dir}/etc/cfg.toml`],
      environment: { DATA: `${dir}/data` },
    });
  });

  test("expands token in skill body templates", async () => {
    const dir = path.join(
      import.meta.dir,
      "fixtures/claude-plugins/source-loader-rootmcp",
    );
    const logger = {
      debug: mock(async () => {}),
      info: mock(async () => {}),
      warn: mock(async () => {}),
      error: mock(async () => {}),
    };
    const result = await loadSource({ dir }, logger);

    const skill = result.skillCommands["token-skill"] as { template: string };
    expect(skill).toBeDefined();
    expect(skill.template).toContain(`${dir}/bin/helper.sh`);
    const TOKEN = "$" + "{CLAUDE_PLUGIN_ROOT}";
    expect(skill.template).not.toContain(TOKEN);
  });
});
