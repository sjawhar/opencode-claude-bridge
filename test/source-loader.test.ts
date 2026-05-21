import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLogger } from "../src/logger";
import { loadSource } from "../src/source-loader";

const logger = createLogger(undefined);
const sjawhar = path.join(import.meta.dir, "fixtures/sjawhar");
const empty = path.join(import.meta.dir, "fixtures/empty");

let cacheRoot: string;

beforeEach(() => {
  cacheRoot = mkdtempSync(path.join(os.tmpdir(), "ocb-src-"));
});

afterEach(() => {
  rmSync(cacheRoot, { recursive: true, force: true });
});

describe("loadSource", () => {
  test("loads agents and commands from a populated source", async () => {
    const result = await loadSource({ dir: sjawhar }, logger, { cacheRoot });
    expect(Object.keys(result.agents)).toContain("bug-finder");
    expect(Object.keys(result.commands)).toContain("no-excuses");
  });

  test("returns empty records for dir with no agents/ or commands/", async () => {
    const result = await loadSource({ dir: empty }, logger, { cacheRoot });
    expect(result.agents).toEqual({});
    expect(result.commands).toEqual({});
  });

  test("skips agents when agents: false", async () => {
    const result = await loadSource({ dir: sjawhar, agents: false }, logger, {
      cacheRoot,
    });
    expect(result.agents).toEqual({});
    expect(Object.keys(result.commands).length).toBeGreaterThan(0);
  });

  test("skips commands when commands: false", async () => {
    const result = await loadSource({ dir: sjawhar, commands: false }, logger, {
      cacheRoot,
    });
    expect(result.commands["no-excuses"]).toBeUndefined();
    expect(result.commands["public-thing"]).toBeDefined();
    expect(Object.keys(result.agents).length).toBeGreaterThan(0);
  });

  test("supports custom agents subdir name", async () => {
    // Point at a dir where agents subdir does not exist
    const result = await loadSource(
      { dir: sjawhar, agents: "subagents" },
      logger,
      { cacheRoot },
    );
    expect(result.agents).toEqual({});
  });

  test("returns a single per-source push path under cacheRoot/sourceKey", async () => {
    const result = await loadSource(
      { dir: sjawhar, namespace: "sjawhar" },
      logger,
      { cacheRoot },
    );
    expect(result.skillCachePushPaths).toEqual([
      path.join(cacheRoot, "sjawhar"),
    ]);
  });

  test("materializes every non-disabled skill into the cache", async () => {
    await loadSource({ dir: sjawhar, namespace: "sjawhar" }, logger, {
      cacheRoot,
    });
    // public-thing has no disable flag → materialized
    expect(
      existsSync(path.join(cacheRoot, "sjawhar", "public-thing", "SKILL.md")),
    ).toBe(true);
    // hidden-thing has disable-model-invocation: true → NOT materialized
    expect(
      existsSync(path.join(cacheRoot, "sjawhar", "hidden-thing", "SKILL.md")),
    ).toBe(false);
    // user-only has user-invocable: false → still materialized (skill side preserved)
    expect(
      existsSync(path.join(cacheRoot, "sjawhar", "user-only", "SKILL.md")),
    ).toBe(true);
  });

  test("synthesizes name in cache: playwright-like (with no disable flag) materializes correctly", async () => {
    await loadSource({ dir: sjawhar, namespace: "sjawhar" }, logger, {
      cacheRoot,
    });
    const file = path.join(cacheRoot, "sjawhar", "playwright-like", "SKILL.md");
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, "utf-8")).toContain("name: playwright-like");
  });

  test("merges skill-derived commands into the source's commands map", async () => {
    const result = await loadSource(
      { dir: sjawhar, namespace: "sjawhar" },
      logger,
      { cacheRoot },
    );
    // user-only has user-invocable: false → NOT in commands
    expect(result.commands["user-only"]).toBeUndefined();
    // public-thing default → IS in commands, with the templated body
    const cmd = result.commands["public-thing"] as { template: string };
    expect(cmd).toBeDefined();
    expect(cmd.template).toContain("<command-instruction>");
    expect(cmd.template).toContain("Body for public-thing.");
    expect(cmd.template).toContain("<user-request>");
    expect(cmd.template).toContain("$ARGUMENTS");
  });

  test("hidden-thing still gets a command entry (disable-model-invocation preserves /name)", async () => {
    const result = await loadSource(
      { dir: sjawhar, namespace: "sjawhar" },
      logger,
      { cacheRoot },
    );
    expect(result.commands["hidden-thing"]).toBeDefined();
  });

  test("skill MCPs still come through into skillMcps", async () => {
    const result = await loadSource(
      { dir: sjawhar, namespace: "sjawhar" },
      logger,
      { cacheRoot },
    );
    expect(result.skillMcps.slack).toBeDefined();
    expect(result.skillMcps.playwright).toBeDefined();
    expect(result.skillMcps.upstream).toBeDefined();
  });

  test("materializedSkillPaths lists every materialized SKILL.md absolute path", async () => {
    const result = await loadSource(
      { dir: sjawhar, namespace: "sjawhar" },
      logger,
      { cacheRoot },
    );
    // public-thing, playwright-like, slack-bot-like, remote-mcp, user-only → 5 materialized
    // (hidden-thing and derived-name have disable-model-invocation: true → excluded)
    expect(result.materializedSkillPaths.length).toBe(5);
    for (const p of result.materializedSkillPaths) {
      expect(existsSync(p)).toBe(true);
    }
  });

  test("skips skills scan when skills: false", async () => {
    const result = await loadSource({ dir: sjawhar, skills: false }, logger, {
      cacheRoot,
    });
    expect(result.skillCachePushPaths).toEqual([]);
    expect(result.materializedSkillPaths).toEqual([]);
  });

  test("returns empty materialization metadata when skills subdir doesn't exist", async () => {
    const result = await loadSource({ dir: empty }, logger, { cacheRoot });
    expect(result.skillCachePushPaths).toEqual([]);
    expect(result.materializedSkillPaths).toEqual([]);
    expect(result.skillMcps).toEqual({});
  });

  test("aggregates MCPs from all skill SKILL.md files in the source dir", async () => {
    const result = await loadSource({ dir: sjawhar }, logger, { cacheRoot });
    expect(Object.keys(result.skillMcps)).toContain("slack");
    expect(Object.keys(result.skillMcps)).toContain("playwright");
    expect(Object.keys(result.skillMcps)).toContain("upstream");
    expect(result.skillMcps.slack).toMatchObject({ type: "local" });
    expect(result.skillMcps.upstream).toMatchObject({ type: "remote" });
  });

  test("omits skillMcps when skills: false", async () => {
    const result = await loadSource({ dir: sjawhar, skills: false }, logger, {
      cacheRoot,
    });
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
    const result = await loadSource({ dir }, logger, { cacheRoot });

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
    const result = await loadSource({ dir }, logger, { cacheRoot });

    const skill = result.commands["token-skill"] as { template: string };
    expect(skill).toBeDefined();
    expect(skill.template).toContain(`${dir}/bin/helper.sh`);
    const TOKEN = "$" + "{CLAUDE_PLUGIN_ROOT}";
    expect(skill.template).not.toContain(TOKEN);
  });
});
