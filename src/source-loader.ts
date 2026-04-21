import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { translateAgentFile } from "./agent-translator";
import { translateCommandFile } from "./command-translator";

import type { Logger } from "./logger";
import { translateSkillFile } from "./skill-translator";

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
  skillCommands: Record<string, unknown>;
  deniedSkills: string[];
}

function listMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md"))
    .map((e) => join(dir, e.name));
}

async function scanSkillsForDenialAndCommands(
  dir: string,
  logger: Logger,
): Promise<{ skillCommands: Record<string, unknown>; denied: string[] }> {
  if (!existsSync(dir)) return { skillCommands: {}, denied: [] };
  const skillCommands: Record<string, unknown> = {};
  const denied: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = join(dir, entry.name, "SKILL.md");
    if (!existsSync(skillPath)) continue;
    try {
      const translated = await translateSkillFile(skillPath, logger);
      if (translated) {
        if (skillCommands[translated.baseName]) {
          await logger.warn(
            `Duplicate skill name within source: ${translated.baseName}`,
          );
        }
        skillCommands[translated.baseName] = translated.config;
        if (translated.disabled) {
          denied.push(translated.baseName);
        }
      }
    } catch {
      // Silently skip unparseable files
    }
  }
  return { skillCommands, denied };
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
  let skillCommands: Record<string, unknown> = {};
  let deniedSkills: string[] = [];
  if (skillsSubdir !== false) {
    const dir = join(source.dir, skillsSubdir);
    const result = await scanSkillsForDenialAndCommands(dir, logger);
    skillCommands = result.skillCommands;
    deniedSkills = result.denied;
  }

  return { agents, commands, skillCommands, deniedSkills };
}
