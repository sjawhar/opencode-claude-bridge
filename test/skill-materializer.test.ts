import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
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

describe("materializeSkill", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTmp();
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("writes SKILL.md at <cacheRoot>/<sourceKey>/<skillName>/SKILL.md", async () => {
    const result = await materializeSkill(
      makeSkill({ cacheRoot: tmp }),
      logger,
    );
    const expected = path.join(tmp, "sjawhar", "public-thing", "SKILL.md");
    expect(result.cachedSkillPath).toBe(expected);
    expect(existsSync(expected)).toBe(true);
  });

  test("writes name + description + body into the materialized file", async () => {
    const result = await materializeSkill(
      makeSkill({ cacheRoot: tmp, body: "Hello body." }),
      logger,
    );
    const content = readFileSync(result.cachedSkillPath, "utf-8");
    expect(content).toContain("name: public-thing");
    expect(content).toContain("description: A plain skill");
    expect(content).toContain("Hello body.");
  });

  test(`expands ${pluginRootToken} in body to pluginRoot`, async () => {
    const result = await materializeSkill(
      makeSkill({
        cacheRoot: tmp,
        pluginRoot: "/abs/source",
        body: `Run ${pluginRootToken}/bin/x`,
      }),
      logger,
    );
    const content = readFileSync(result.cachedSkillPath, "utf-8");
    expect(content).toContain("Run /abs/source/bin/x");
    expect(content).not.toContain(pluginRootToken);
  });

  test("passes extra frontmatter fields through unchanged", async () => {
    const result = await materializeSkill(
      makeSkill({
        cacheRoot: tmp,
        extraFrontmatter: { license: "MIT", "allowed-tools": "Read Write" },
      }),
      logger,
    );
    const content = readFileSync(result.cachedSkillPath, "utf-8");
    expect(content).toContain("license: MIT");
    expect(content).toMatch(/allowed-tools: ['"]?Read Write['"]?/);
  });

  test("omits description line when description is undefined", async () => {
    const result = await materializeSkill(
      makeSkill({ cacheRoot: tmp, description: undefined }),
      logger,
    );
    const content = readFileSync(result.cachedSkillPath, "utf-8");
    expect(content).not.toContain("description:");
  });

  test("is idempotent: second call with identical input does not rewrite the file", async () => {
    const skill = makeSkill({ cacheRoot: tmp });
    const first = await materializeSkill(skill, logger);
    const mtime1 = statSync(first.cachedSkillPath).mtimeMs;
    await new Promise((r) => setTimeout(r, 15));
    const second = await materializeSkill(skill, logger);
    const mtime2 = statSync(second.cachedSkillPath).mtimeMs;
    expect(second.cachedSkillPath).toBe(first.cachedSkillPath);
    expect(mtime2).toBe(mtime1);
  });

  test("rewrites the file when input content changes", async () => {
    const skill = makeSkill({ cacheRoot: tmp });
    const first = await materializeSkill(skill, logger);
    const mtime1 = statSync(first.cachedSkillPath).mtimeMs;
    await new Promise((r) => setTimeout(r, 15));
    const second = await materializeSkill(
      { ...skill, body: "Different body" },
      logger,
    );
    const mtime2 = statSync(second.cachedSkillPath).mtimeMs;
    expect(mtime2).toBeGreaterThan(mtime1);
    expect(readFileSync(second.cachedSkillPath, "utf-8")).toContain(
      "Different body",
    );
  });

  test("returns the per-source push path", async () => {
    const result = await materializeSkill(
      makeSkill({ cacheRoot: tmp, sourceKey: "sjawhar" }),
      logger,
    );
    expect(result.sourcePushPath).toBe(path.join(tmp, "sjawhar"));
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

  test("removes skill dirs not in the live manifest", async () => {
    seed("sjawhar", "alive");
    seed("sjawhar", "stale");
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
    await pruneStaleCache(tmp, new Set(), logger);
    expect(existsSync(path.join(tmp, "dead-source"))).toBe(false);
  });

  test("leaves the cache root in place even when fully empty", async () => {
    seed("k", "s");
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
});
