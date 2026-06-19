import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { createLogger } from "../src/logger";
import {
  materializeSkill,
  pruneStaleCache,
  type SkillToMaterialize,
} from "../src/skill-materializer";

const logger = createLogger(undefined);
const pluginRootToken = "$" + "{CLAUDE_PLUGIN_ROOT}";

function makeTmp(): string {
  return mkdtempSync(path.join(os.tmpdir(), "ocb-mat-"));
}

function makeSkill(over: Partial<SkillToMaterialize> = {}): SkillToMaterialize {
  return {
    cacheRoot: "/will-be-overridden",
    sourceKey: "sjawhar",
    pluginRoot: "/abs/source",
    skillName: "public-thing",
    description: "A plain skill",
    body: "Body without tokens.",
    extraFrontmatter: {},
    ...over,
  };
}

function expectMaterialized(
  result: Awaited<ReturnType<typeof materializeSkill>>,
) {
  expect(result).not.toBeNull();
  if (!result) throw new Error("Expected skill to materialize");
  return result;
}

describe("materializeSkill", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTmp();
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("writes SKILL.md at <cacheRoot>/<sourceKey>/<skillName>/SKILL.md", async () => {
    const result = expectMaterialized(
      await materializeSkill(makeSkill({ cacheRoot: tmp }), logger),
    );
    const expected = path.join(tmp, "sjawhar", "public-thing", "SKILL.md");
    expect(result.cachedSkillPath).toBe(expected);
    expect(existsSync(expected)).toBe(true);
  });

  test("writes name + description + body into the materialized file", async () => {
    const result = expectMaterialized(
      await materializeSkill(
        makeSkill({ cacheRoot: tmp, body: "Hello body." }),
        logger,
      ),
    );
    const content = readFileSync(result.cachedSkillPath, "utf-8");
    expect(content).toContain("name: public-thing");
    expect(content).toContain("description: A plain skill");
    expect(content).toContain("Hello body.");
  });

  test(`expands ${pluginRootToken} in body to pluginRoot`, async () => {
    const result = expectMaterialized(
      await materializeSkill(
        makeSkill({
          cacheRoot: tmp,
          pluginRoot: "/abs/source",
          body: `Run ${pluginRootToken}/bin/x`,
        }),
        logger,
      ),
    );
    const content = readFileSync(result.cachedSkillPath, "utf-8");
    expect(content).toContain("Run /abs/source/bin/x");
    expect(content).not.toContain(pluginRootToken);
  });

  test("passes extra frontmatter fields through unchanged", async () => {
    const result = expectMaterialized(
      await materializeSkill(
        makeSkill({
          cacheRoot: tmp,
          extraFrontmatter: { license: "MIT", "allowed-tools": "Read Write" },
        }),
        logger,
      ),
    );
    const content = readFileSync(result.cachedSkillPath, "utf-8");
    expect(content).toContain("license: MIT");
    expect(content).toMatch(/allowed-tools: ['"]?Read Write['"]?/);
  });

  test("round-trips nested metadata and compatibility structurally", async () => {
    const extra = {
      compatibility: "Requires Python 3.14+ and uv",
      metadata: {
        author: "Sami",
        tags: ["dev", "review"],
        details: { team: "Trajectory", priority: 1 },
      },
    };
    const result = expectMaterialized(
      await materializeSkill(
        makeSkill({ cacheRoot: tmp, extraFrontmatter: extra }),
        logger,
      ),
    );
    const content = readFileSync(result.cachedSkillPath, "utf-8");
    const fm = content.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? "";
    const parsed = parseYaml(fm) as Record<string, unknown>;
    expect(parsed.compatibility).toBe(extra.compatibility);
    expect(parsed.metadata).toEqual(extra.metadata);
  });

  test("omits description line when description is undefined", async () => {
    const result = expectMaterialized(
      await materializeSkill(
        makeSkill({ cacheRoot: tmp, description: undefined }),
        logger,
      ),
    );
    const content = readFileSync(result.cachedSkillPath, "utf-8");
    expect(content).not.toContain("description:");
  });

  test("is idempotent: second call with identical input does not rewrite the file", async () => {
    const skill = makeSkill({ cacheRoot: tmp });
    const first = expectMaterialized(await materializeSkill(skill, logger));
    const mtime1 = statSync(first.cachedSkillPath).mtimeMs;
    await new Promise((r) => setTimeout(r, 15));
    const second = expectMaterialized(await materializeSkill(skill, logger));
    const mtime2 = statSync(second.cachedSkillPath).mtimeMs;
    expect(second.cachedSkillPath).toBe(first.cachedSkillPath);
    expect(mtime2).toBe(mtime1);
  });

  test("rewrites the file when input content changes", async () => {
    const skill = makeSkill({ cacheRoot: tmp });
    const first = expectMaterialized(await materializeSkill(skill, logger));
    const mtime1 = statSync(first.cachedSkillPath).mtimeMs;
    await new Promise((r) => setTimeout(r, 15));
    const second = expectMaterialized(
      await materializeSkill({ ...skill, body: "Different body" }, logger),
    );
    const mtime2 = statSync(second.cachedSkillPath).mtimeMs;
    expect(mtime2).toBeGreaterThan(mtime1);
    expect(readFileSync(second.cachedSkillPath, "utf-8")).toContain(
      "Different body",
    );
  });

  test("returns the per-source push path", async () => {
    const result = expectMaterialized(
      await materializeSkill(
        makeSkill({ cacheRoot: tmp, sourceKey: "sjawhar" }),
        logger,
      ),
    );
    expect(result.sourcePushPath).toBe(path.join(tmp, "sjawhar"));
  });

  test("round-trips a skill-embedded mcp: block and expands CLAUDE_PLUGIN_ROOT", async () => {
    const result = expectMaterialized(
      await materializeSkill(
        makeSkill({
          cacheRoot: tmp,
          pluginRoot: "/abs/source",
          extraFrontmatter: {
            mcp: {
              slack: {
                command: "secrets",
                args: ["X", "--", `${pluginRootToken}/bin/slack-mcp-server`],
                env: { SLACK_MCP_ADD_MESSAGE_TOOL: "true" },
              },
            },
          },
        }),
        logger,
      ),
    );
    const content = readFileSync(result.cachedSkillPath, "utf-8");
    const fm = content.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? "";
    const parsed = parseYaml(fm) as Record<string, unknown>;
    expect(parsed.mcp).toEqual({
      slack: {
        command: "secrets",
        args: ["X", "--", "/abs/source/bin/slack-mcp-server"],
        env: { SLACK_MCP_ADD_MESSAGE_TOOL: "true" },
      },
    });
    expect(content).not.toContain(pluginRootToken);
  });
});

describe("materializeSkill — security/containment", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTmp();
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("refuses to materialize when sourceKey is path-traversal", async () => {
    const escapeName = `escape-${path.basename(tmp)}`;
    const result = await materializeSkill(
      makeSkill({ cacheRoot: tmp, sourceKey: `../${escapeName}` }),
      logger,
    );
    expect(result).toBeNull();
    expect(existsSync(path.join(path.dirname(tmp), escapeName))).toBe(false);
  });

  test("refuses to materialize when skillName is path-traversal", async () => {
    const result = await materializeSkill(
      makeSkill({ cacheRoot: tmp, sourceKey: "ok", skillName: "../escape" }),
      logger,
    );
    expect(result).toBeNull();
  });

  test("writes ownership marker on first materialization", async () => {
    await materializeSkill(makeSkill({ cacheRoot: tmp }), logger);
    expect(existsSync(path.join(tmp, ".opencode-claude-bridge-cache"))).toBe(
      true,
    );
  });

  test("does not honor symlinks in the cache — unlinks before write", async () => {
    const outside = path.join(tmp, "outside-target");
    writeFileSync(outside, "should-not-be-overwritten\n");
    const skill = makeSkill({ cacheRoot: tmp });
    const targetDir = path.join(tmp, skill.sourceKey, skill.skillName);
    mkdirSync(targetDir, { recursive: true });
    const targetSkillMd = path.join(targetDir, "SKILL.md");
    symlinkSync(outside, targetSkillMd);

    await materializeSkill(skill, logger);

    expect(readFileSync(outside, "utf-8")).toBe("should-not-be-overwritten\n");
    expect(readFileSync(targetSkillMd, "utf-8")).toContain(
      "name: public-thing",
    );
  });
});

describe("pruneStaleCache", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTmp();
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function seed(sourceKey: string, skillName: string) {
    const dir = path.join(tmp, sourceKey, skillName);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "SKILL.md"), "stale\n");
  }

  function seedMarker() {
    writeFileSync(path.join(tmp, ".opencode-claude-bridge-cache"), "marker\n");
  }

  test("removes skill dirs not in the live manifest", async () => {
    seed("sjawhar", "alive");
    seed("sjawhar", "stale");
    seedMarker();
    await pruneStaleCache(
      tmp,
      new Set([path.join(tmp, "sjawhar", "alive", "SKILL.md")]),
      logger,
    );
    expect(existsSync(path.join(tmp, "sjawhar", "alive"))).toBe(true);
    expect(existsSync(path.join(tmp, "sjawhar", "stale"))).toBe(false);
  });

  test("removes empty source-key dirs after their last skill is pruned", async () => {
    seed("dead-source", "only-skill");
    seedMarker();
    await pruneStaleCache(tmp, new Set(), logger);
    expect(existsSync(path.join(tmp, "dead-source"))).toBe(false);
  });

  test("leaves the cache root in place even when fully empty", async () => {
    seed("k", "s");
    seedMarker();
    await pruneStaleCache(tmp, new Set(), logger);
    expect(existsSync(tmp)).toBe(true);
  });

  test("no-op when cache root does not exist", async () => {
    const missing = path.join(tmp, "does-not-exist");
    await pruneStaleCache(missing, new Set(), logger);
    expect(existsSync(missing)).toBe(false);
  });

  test("ignores unrelated files in source-key dirs", async () => {
    const skillDir = path.join(tmp, "sjawhar", "keepme");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(path.join(skillDir, "SKILL.md"), "ok\n");
    writeFileSync(path.join(tmp, "sjawhar", "stray.txt"), "leftover");
    seedMarker();
    await pruneStaleCache(
      tmp,
      new Set([path.join(skillDir, "SKILL.md")]),
      logger,
    );
    // Skill dir still there
    expect(existsSync(skillDir)).toBe(true);
    // Stray file was not in any skill dir; prune leaves it; not removed
    // because the source-key dir is non-empty.
    expect(existsSync(path.join(tmp, "sjawhar", "stray.txt"))).toBe(true);
  });

  test("refuses to prune when ownership marker is absent", async () => {
    seed("sjawhar", "stale");
    await pruneStaleCache(tmp, new Set(), logger);
    expect(existsSync(path.join(tmp, "sjawhar", "stale"))).toBe(true);
  });

  test("prunes normally when ownership marker is present", async () => {
    seed("sjawhar", "stale");
    seedMarker();
    await pruneStaleCache(tmp, new Set(), logger);
    expect(existsSync(path.join(tmp, "sjawhar", "stale"))).toBe(false);
  });
});
