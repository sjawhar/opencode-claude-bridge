import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLogger } from "../src/logger";
import {
  materializeSkill,
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
