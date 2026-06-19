import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLogger } from "../src/logger";
import { loadSource } from "../src/source-loader";

const logger = createLogger(undefined);
const sjawhar = path.join(import.meta.dir, "fixtures/sjawhar");
const empty = path.join(import.meta.dir, "fixtures/empty");
const pluginRootToken = "$" + "{CLAUDE_PLUGIN_ROOT}";

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

  test("standalone commands take precedence over same-named skill commands", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ocb-precedence-"));
    try {
      mkdirSync(path.join(dir, "commands"), { recursive: true });
      mkdirSync(path.join(dir, "skills", "same-name"), { recursive: true });
      writeFileSync(
        path.join(dir, "commands", "same-name.md"),
        "---\ndescription: Standalone command\n---\n\nStandalone body.",
      );
      writeFileSync(
        path.join(dir, "skills", "same-name", "SKILL.md"),
        "---\nname: same-name\ndescription: Skill command\ndisable-model-invocation: true\n---\n\nSkill body.",
      );

      const result = await loadSource({ dir }, logger, { cacheRoot });
      const cmd = result.commands["same-name"] as {
        description?: string;
        template: string;
      };
      expect(cmd.description).toBe("Standalone command");
      expect(cmd.template).toContain("Standalone body.");
      expect(cmd.template).not.toContain("Skill body.");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("normalizes source.dir before source-key derivation and plugin-root expansion", async () => {
    const parent = mkdtempSync(path.join(os.tmpdir(), "ocb-normalize-"));
    try {
      const dir = path.join(parent, "source");
      mkdirSync(path.join(dir, "skills", "token-skill"), { recursive: true });
      writeFileSync(
        path.join(dir, "skills", "token-skill", "SKILL.md"),
        `---\nname: token-skill\n---\n\nRun ${pluginRootToken}/bin/helper.sh`,
      );

      const relativeDir = path.relative(process.cwd(), dir);
      const result = await loadSource({ dir: relativeDir }, logger, {
        cacheRoot,
      });
      const absoluteDir = path.resolve(relativeDir);
      const expectedSourceKey = path.basename(result.skillCachePushPaths[0]);
      const second = await loadSource({ dir: absoluteDir }, logger, {
        cacheRoot,
      });
      expect(path.basename(second.skillCachePushPaths[0])).toBe(
        expectedSourceKey,
      );
      const cached = readFileSync(result.materializedSkillPaths[0], "utf-8");
      expect(cached).toContain(`Run ${absoluteDir}/bin/helper.sh`);
      expect(cached).not.toContain(pluginRootToken);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("hidden-thing still gets a command entry (disable-model-invocation preserves /name)", async () => {
    const result = await loadSource(
      { dir: sjawhar, namespace: "sjawhar" },
      logger,
      { cacheRoot },
    );
    expect(result.commands["hidden-thing"]).toBeDefined();
  });

  test("flows commandFields (agent/model/subtask) into the registered command", async () => {
    const result = await loadSource(
      { dir: sjawhar, namespace: "sjawhar" },
      logger,
      { cacheRoot },
    );
    const cmd = result.commands["with-command-fields"] as {
      agent?: string;
      model?: string;
      subtask?: boolean;
    };
    expect(cmd).toBeDefined();
    expect(cmd.agent).toBe("my-agent");
    expect(cmd.model).toBe("anthropic/claude-sonnet-4-6");
    expect(cmd.subtask).toBe(true);
  });

  test("materializedSkillPaths lists every materialized SKILL.md absolute path", async () => {
    const result = await loadSource(
      { dir: sjawhar, namespace: "sjawhar" },
      logger,
      { cacheRoot },
    );
    // public-thing, playwright-like, slack-bot-like, remote-mcp, user-only,
    // with-command-fields → 6 materialized
    // (hidden-thing, derived-name, and double-blocked have
    // disable-model-invocation: true → excluded)
    expect(result.materializedSkillPaths.length).toBe(6);
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

  test("materializeSkill failure does not abort the source loop", async () => {
    // Pre-create a directory at the SKILL.md target path for "public-thing" so
    // writeFileSync fails with EISDIR. The other skills should still materialize.
    mkdirSync(path.join(cacheRoot, "sjawhar", "public-thing", "SKILL.md"), {
      recursive: true,
    });
    const result = await loadSource(
      { dir: sjawhar, namespace: "sjawhar" },
      logger,
      { cacheRoot },
    );
    // public-thing's materialization failed (target was a dir, not a file).
    // The materializedSkillPaths list MUST NOT include public-thing.
    const publicThingPath = path.join(
      cacheRoot,
      "sjawhar",
      "public-thing",
      "SKILL.md",
    );
    expect(result.materializedSkillPaths).not.toContain(publicThingPath);
    // But other skills DID materialize.
    expect(result.materializedSkillPaths.length).toBeGreaterThan(0);
    // And the command-side registration for public-thing still happened (the
    // command-side path is independent of materialization).
    expect(result.commands["public-thing"]).toBeDefined();
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
