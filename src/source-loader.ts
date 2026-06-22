import { existsSync, readdirSync } from "node:fs";
import path, { join } from "node:path";
import { translateAgentFile } from "./agent-translator";
import { computeSourceKey, getCacheRoot } from "./cache-paths";
import { translateCommandFile } from "./command-translator";
import { expandPluginRoot } from "./expand-plugin-root";
import type { Logger } from "./logger";
import type { TranslatedMcp } from "./mcp-translator";
import { loadRootMcp } from "./root-mcp-loader";
import { materializeSkill } from "./skill-materializer";
import { type TranslatedSkill, translateSkillFile } from "./skill-translator";

export interface ClaudeBridgeSource {
  dir: string;
  agents?: string | false;
  commands?: string | false;
  skills?: string | false;
  namespace?: string;
}

export interface LoadSourceOptions {
  /** Override cache root (used by tests). Defaults to `getCacheRoot()`. */
  cacheRoot?: string;
}

export interface LoadedSource {
  agents: Record<string, unknown>;
  /** Merged: standalone commands + skill-derived commands (for user-invocable skills). */
  commands: Record<string, unknown>;
  /** Per-source push paths fed into `config.skills.paths`. One entry per source (or none if no skills materialized). */
  skillCachePushPaths: string[];
  /** Absolute paths of materialized SKILL.md files. Used for stale-cache pruning. */
  materializedSkillPaths: string[];
  /**
   * The cache source-key this source owns (`computeSourceKey`), present only
   * when skills are enabled for the source. Lets the caller scope cache pruning
   * to the source-keys this bridge instance manages, so multiple bridge
   * instances sharing one cache root do not prune each other's skills.
   */
  skillSourceKey?: string;
  skillMcps: Record<string, TranslatedMcp>;
}

function expandMap<T>(map: Record<string, T>, root: string): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(map)) out[k] = expandPluginRoot(v, root);
  return out;
}

function listMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md"))
    .map((e) => join(dir, e.name));
}

function buildCommandTemplate(body: string): string {
  return (
    "<command-instruction>\n" +
    body.trim() +
    "\n</command-instruction>\n\n" +
    "<user-request>\n$ARGUMENTS\n</user-request>"
  );
}

interface SkillsScanResult {
  commands: Record<string, unknown>;
  pushPaths: string[];
  materializedPaths: string[];
}

async function scanSkills(
  dir: string,
  sourceDir: string,
  sourceKey: string,
  cacheRoot: string,
  logger: Logger,
): Promise<SkillsScanResult> {
  const empty: SkillsScanResult = {
    commands: {},
    pushPaths: [],
    materializedPaths: [],
  };
  if (!existsSync(dir)) return empty;

  const commands: Record<string, unknown> = {};
  const materializedPaths: string[] = [];
  let pushPath: string | undefined;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillPath = join(dir, entry.name, "SKILL.md");
    if (!existsSync(skillPath)) continue;

    let skill: TranslatedSkill | null;
    try {
      skill = await translateSkillFile(skillPath, logger);
    } catch (err) {
      await logger.warn(
        `Failed to translate skill at ${skillPath}; skipping.`,
        {
          error: String(err),
        },
      );
      continue;
    }
    if (!skill) continue;

    // Skill-side registration (model surface): materialize unless
    // disable-model-invocation: true.
    if (!skill.disableModelInvocation) {
      try {
        const result = await materializeSkill(
          {
            cacheRoot,
            sourceKey,
            pluginRoot: sourceDir,
            skillName: skill.name,
            description: skill.description,
            body: skill.body,
            extraFrontmatter: skill.extraFrontmatter,
          },
          logger,
        );
        if (result) {
          pushPath = result.sourcePushPath;
          materializedPaths.push(result.cachedSkillPath);
        }
      } catch (err) {
        await logger.warn(
          `Failed to materialize skill "${skill.name}" from ${skillPath}; skipping skill registration.`,
          { error: String(err) },
        );
      }
    }

    // Command-side registration (user surface): build a templated command
    // unless user-invocable: false.
    if (skill.userInvocable) {
      if (commands[skill.name]) {
        await logger.warn(`Duplicate skill name within source: ${skill.name}`);
      }
      const cmd: Record<string, unknown> = {
        template: buildCommandTemplate(skill.body),
      };
      if (skill.description !== undefined) cmd.description = skill.description;
      if (skill.commandFields.agent !== undefined) {
        cmd.agent = skill.commandFields.agent;
      }
      if (skill.commandFields.model !== undefined) {
        cmd.model = skill.commandFields.model;
      }
      if (skill.commandFields.subtask !== undefined) {
        cmd.subtask = skill.commandFields.subtask;
      }
      commands[skill.name] = cmd;
    }
  }

  return {
    commands,
    pushPaths: pushPath ? [pushPath] : [],
    materializedPaths,
  };
}

export async function loadSource(
  source: ClaudeBridgeSource,
  logger: Logger,
  opts: LoadSourceOptions = {},
): Promise<LoadedSource> {
  const normalizedDir = path.resolve(source.dir);
  const normalizedSource: ClaudeBridgeSource = {
    ...source,
    dir: normalizedDir,
  };
  const agents: Record<string, unknown> = {};
  const commands: Record<string, unknown> = {};

  const agentsSubdir =
    normalizedSource.agents === undefined ? "agents" : normalizedSource.agents;
  if (agentsSubdir !== false) {
    const dir = join(normalizedSource.dir, agentsSubdir);
    for (const filePath of listMarkdown(dir)) {
      const translated = await translateAgentFile(filePath, logger);
      if (translated) {
        if (agents[translated.baseName]) {
          await logger.warn(
            `Duplicate agent name within source ${normalizedSource.dir}: ${translated.baseName}`,
          );
        }
        agents[translated.baseName] = translated.config;
      }
    }
  }

  const commandsSubdir =
    normalizedSource.commands === undefined
      ? "commands"
      : normalizedSource.commands;
  if (commandsSubdir !== false) {
    const dir = join(normalizedSource.dir, commandsSubdir);
    for (const filePath of listMarkdown(dir)) {
      const translated = await translateCommandFile(filePath, logger);
      if (translated) {
        if (commands[translated.baseName]) {
          await logger.warn(
            `Duplicate command name within source ${normalizedSource.dir}: ${translated.baseName}`,
          );
        }
        commands[translated.baseName] = translated.config;
      }
    }
  }

  const skillsSubdir =
    normalizedSource.skills === undefined ? "skills" : normalizedSource.skills;
  let skillCachePushPaths: string[] = [];
  let materializedSkillPaths: string[] = [];
  let skillSourceKey: string | undefined;
  if (skillsSubdir !== false) {
    const dir = join(normalizedSource.dir, skillsSubdir);
    const sourceKey = computeSourceKey(
      normalizedSource.dir,
      normalizedSource.namespace,
    );
    skillSourceKey = sourceKey;
    const cacheRoot = opts.cacheRoot ?? getCacheRoot();
    const result = await scanSkills(
      dir,
      normalizedSource.dir,
      sourceKey,
      cacheRoot,
      logger,
    );
    // Merge skill-derived commands into the source-level commands map.
    // Standalone commands (from <dir>/commands/) take precedence; skill-derived
    // commands of the same name are skipped with a warning.
    for (const [k, v] of Object.entries(result.commands)) {
      if (commands[k]) {
        await logger.warn(
          `Duplicate command name within source ${normalizedSource.dir}: "${k}" already provided by commands/; skipping skill-derived command from the same source.`,
        );
        continue;
      }
      commands[k] = v;
    }
    skillCachePushPaths = result.pushPaths;
    materializedSkillPaths = result.materializedPaths;
  }

  // Root-level .mcp.json (plugins that ship MCP servers at the root). Skill-
  // embedded `mcp:` blocks are intentionally NOT collected here: they ride the
  // materialized SKILL.md frontmatter for the host to consume.
  const skillMcps = await loadRootMcp(normalizedSource.dir, logger);

  return {
    agents: expandMap(agents, normalizedSource.dir),
    commands: expandMap(commands, normalizedSource.dir),
    skillCachePushPaths,
    materializedSkillPaths,
    skillSourceKey,
    skillMcps: expandMap(skillMcps, normalizedSource.dir),
  };
}
