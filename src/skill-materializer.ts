import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { expandPluginRoot } from "./expand-plugin-root";
import type { Logger } from "./logger";

const CACHE_OWNERSHIP_MARKER = ".opencode-claude-bridge-cache";

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
   * Any frontmatter fields beyond name/description, round-tripped verbatim into
   * the materialized SKILL.md. The caller strips the fields the bridge consumes
   * (`disable-model-invocation`, `user-invocable`, `agent`, `model`, `subtask`);
   * everything else passes through. `${CLAUDE_PLUGIN_ROOT}` is expanded (in the
   * frontmatter and the body) in buildContent.
   */
  extraFrontmatter: Record<string, unknown>;
}

export interface MaterializeResult {
  /** Full path to the materialized SKILL.md file. */
  cachedSkillPath: string;
  /** Per-source push path that the bridge feeds to `config.skills.paths`. */
  sourcePushPath: string;
}

function isContained(child: string, parent: string): boolean {
  const resolvedParent = path.resolve(parent);
  const resolvedChild = path.resolve(child);
  const rel = path.relative(resolvedParent, resolvedChild);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

function buildContent(skill: SkillToMaterialize): string {
  const fm: Record<string, unknown> = { name: skill.skillName };
  if (skill.description !== undefined) fm.description = skill.description;
  for (const [k, v] of Object.entries(skill.extraFrontmatter)) {
    if (k === "name" || k === "description") continue;
    fm[k] = v;
  }
  const expandedBody = expandPluginRoot(skill.body, skill.pluginRoot);
  return `---\n${stringifyYaml(expandPluginRoot(fm, skill.pluginRoot))}---\n\n${expandedBody.trimEnd()}\n`;
}

export async function materializeSkill(
  skill: SkillToMaterialize,
  logger: Logger,
): Promise<MaterializeResult | null> {
  const sourcePushPath = path.join(skill.cacheRoot, skill.sourceKey);
  const skillDir = path.join(sourcePushPath, skill.skillName);
  const cachedSkillPath = path.join(skillDir, "SKILL.md");

  if (
    !isContained(sourcePushPath, skill.cacheRoot) ||
    !isContained(cachedSkillPath, sourcePushPath)
  ) {
    await logger.warn(
      `Refusing to materialize skill "${skill.skillName}" (source key "${skill.sourceKey}"): resolved cache path escapes cacheRoot.`,
    );
    return null;
  }

  try {
    const lst = lstatSync(cachedSkillPath);
    if (lst.isSymbolicLink()) {
      unlinkSync(cachedSkillPath);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      await logger.warn(`Could not lstat cached skill ${cachedSkillPath}`, {
        error: String(err),
      });
    }
  }

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
    mkdirSync(skill.cacheRoot, { recursive: true });
    const markerPath = path.join(skill.cacheRoot, CACHE_OWNERSHIP_MARKER);
    if (!existsSync(markerPath)) {
      writeFileSync(
        markerPath,
        "This directory is managed by @sjawhar/opencode-claude-bridge.\n" +
          "It is safe to delete the entire directory; the bridge will recreate it.\n" +
          "Do NOT place unrelated files here.\n",
        "utf-8",
      );
    }
    mkdirSync(skillDir, { recursive: true });
    const tmp = `${cachedSkillPath}.tmp.${process.pid}.${Date.now()}`;
    writeFileSync(tmp, next, "utf-8");
    renameSync(tmp, cachedSkillPath);
  }

  return { cachedSkillPath, sourcePushPath };
}

export async function pruneStaleCache(
  cacheRoot: string,
  liveSkillPaths: Set<string>,
  ownedSourceKeys: Set<string>,
  logger: Logger,
): Promise<void> {
  if (!existsSync(cacheRoot)) return;

  const markerPath = path.join(cacheRoot, CACHE_OWNERSHIP_MARKER);
  if (!existsSync(markerPath)) {
    await logger.warn(
      `Refusing to prune cache at ${cacheRoot}: ownership marker ${CACHE_OWNERSHIP_MARKER} is missing. This directory may not be a bridge-owned cache.`,
    );
    return;
  }

  let sourceKeys: string[];
  try {
    sourceKeys = readdirSync(cacheRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (err) {
    await logger.warn(`Failed to read cache root: ${cacheRoot}`, {
      error: String(err),
    });
    return;
  }

  for (const sourceKey of sourceKeys) {
    // Only prune within source-keys this bridge instance owns. Multiple bridge
    // instances can share one cache root (e.g. a global and a project bridge);
    // pruning a source-key we do not own would delete another instance's skills.
    if (!ownedSourceKeys.has(sourceKey)) continue;
    const sourceDir = path.join(cacheRoot, sourceKey);
    let skillNames: string[];
    try {
      skillNames = readdirSync(sourceDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch (err) {
      await logger.warn(`Failed to read cache source dir: ${sourceDir}`, {
        error: String(err),
      });
      continue;
    }

    let kept = 0;
    for (const skillName of skillNames) {
      const skillDir = path.join(sourceDir, skillName);
      const skillPath = path.join(skillDir, "SKILL.md");
      if (liveSkillPaths.has(skillPath)) {
        kept++;
        continue;
      }
      try {
        rmSync(skillDir, { recursive: true, force: true });
      } catch (err) {
        await logger.warn(`Failed to prune stale skill dir: ${skillDir}`, {
          error: String(err),
        });
      }
    }

    // If the source-key dir held only skill dirs and they're all gone now,
    // remove the source-key dir too. Be defensive: re-read entries and remove
    // only when the entire directory is empty (no leftover files/dirs).
    if (kept === 0) {
      try {
        const remaining = readdirSync(sourceDir);
        if (remaining.length === 0) {
          rmSync(sourceDir, { recursive: true, force: true });
        }
      } catch (err) {
        await logger.warn(`Failed to re-read cache source dir: ${sourceDir}`, {
          error: String(err),
        });
      }
    }
  }
}
