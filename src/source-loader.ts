import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { translateAgentFile } from "./agent-translator";
import { translateCommandFile } from "./command-translator";
import { parseFrontmatter } from "./frontmatter";
import type { Logger } from "./logger";

export interface ClaudeBridgeSource {
  dir: string;
  agents?: string | false;
  commands?: string | false;
  skills?: string | false;
  namespace?: string;
}

export interface LoadedSource {
  agents: Record<string, unknown>;
  commands: Record<string, unknown>;
  deniedSkills: string[];
}

function listMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md"))
    .map((e) => join(dir, e.name));
}

async function scanSkillsForDenial(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const denied: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = join(dir, entry.name, "SKILL.md");
    if (!existsSync(skillPath)) continue;
    try {
      const content = await readFile(skillPath, "utf-8");
      const { data } = parseFrontmatter(content);
      if (
        data["disable-model-invocation"] === "true" ||
        data["disable-model-invocation"] === true
      ) {
        const skillName = (data.name as string) || entry.name;
        denied.push(skillName);
      }
    } catch {
      // Silently skip unparseable files
    }
  }
  return denied;
}

export async function loadSource(
  source: ClaudeBridgeSource,
  logger: Logger,
): Promise<LoadedSource> {
  const agents: Record<string, unknown> = {};
  const commands: Record<string, unknown> = {};

  const agentsSubdir = source.agents === undefined ? "agents" : source.agents;
  if (agentsSubdir !== false) {
    const dir = join(source.dir, agentsSubdir);
    for (const filePath of listMarkdown(dir)) {
      const translated = await translateAgentFile(filePath, logger);
      if (translated) {
        if (agents[translated.baseName]) {
          await logger.warn(
            `Duplicate agent name within source ${source.dir}: ${translated.baseName}`,
          );
        }
        agents[translated.baseName] = translated.config;
      }
    }
  }

  const commandsSubdir =
    source.commands === undefined ? "commands" : source.commands;
  if (commandsSubdir !== false) {
    const dir = join(source.dir, commandsSubdir);
    for (const filePath of listMarkdown(dir)) {
      const translated = await translateCommandFile(filePath, logger);
      if (translated) {
        if (commands[translated.baseName]) {
          await logger.warn(
            `Duplicate command name within source ${source.dir}: ${translated.baseName}`,
          );
        }
        commands[translated.baseName] = translated.config;
      }
    }
  }

  const skillsSubdir = source.skills === undefined ? "skills" : source.skills;
  let deniedSkills: string[] = [];
  if (skillsSubdir !== false) {
    const dir = join(source.dir, skillsSubdir);
    deniedSkills = await scanSkillsForDenial(dir);
  }

  return { agents, commands, deniedSkills };
}
