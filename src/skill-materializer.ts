import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { expandPluginRoot } from "./expand-plugin-root";
import type { Logger } from "./logger";

export interface SkillToMaterialize {
  /** Absolute cache root, typically `getCacheRoot()`. */
  cacheRoot: string;
  /** Per-source key produced by `computeSourceKey`. */
  sourceKey: string;
  /** Original source dir; substituted for `${CLAUDE_PLUGIN_ROOT}` in the body. */
  pluginRoot: string;
  /** Skill name. Already synthesized if frontmatter omitted it. */
  skillName: string;
  /** Optional description. */
  description?: string;
  /** Raw body with `${CLAUDE_PLUGIN_ROOT}` still present. Expansion runs here. */
  body: string;
  /**
   * Any frontmatter fields beyond name/description to round-trip into the
   * materialized SKILL.md. Bridge-handled fields like `disable-model-invocation`,
   * `user-invocable`, and `mcp:` should be omitted by the caller — opencode
   * ignores unknown fields, so passing them is harmless, but the caller has
   * already acted on them, so stripping keeps the cache file clean.
   */
  extraFrontmatter: Record<string, unknown>;
}

export interface MaterializeResult {
  /** Full path to the materialized SKILL.md file. */
  cachedSkillPath: string;
  /** Per-source push path that the bridge feeds to `config.skills.paths`. */
  sourcePushPath: string;
}

function buildContent(skill: SkillToMaterialize): string {
  const fm: Record<string, unknown> = { name: skill.skillName };
  if (skill.description !== undefined) fm.description = skill.description;
  for (const [k, v] of Object.entries(skill.extraFrontmatter)) {
    if (k === "name" || k === "description") continue;
    fm[k] = v;
  }
  const expandedBody = expandPluginRoot(skill.body, skill.pluginRoot);
  return `---\n${stringifyYaml(fm)}---\n\n${expandedBody.trimEnd()}\n`;
}

export async function materializeSkill(
  skill: SkillToMaterialize,
  logger: Logger,
): Promise<MaterializeResult> {
  const sourcePushPath = path.join(skill.cacheRoot, skill.sourceKey);
  const skillDir = path.join(sourcePushPath, skill.skillName);
  const cachedSkillPath = path.join(skillDir, "SKILL.md");

  const next = buildContent(skill);
  let prev: string | undefined;
  if (existsSync(cachedSkillPath)) {
    try {
      prev = readFileSync(cachedSkillPath, "utf-8");
    } catch (err) {
      await logger.warn(`Failed to read cached skill: ${cachedSkillPath}`, {
        error: String(err),
      });
    }
  }

  if (prev !== next) {
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(cachedSkillPath, next, "utf-8");
  }

  return { cachedSkillPath, sourcePushPath };
}
