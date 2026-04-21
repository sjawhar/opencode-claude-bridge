import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { translateAgentFile } from "./agent-translator";
import { translateCommandFile } from "./command-translator";
import type { Logger } from "./logger";

export interface ClaudeBridgeSource {
  dir: string;
  agents?: string | false;
  commands?: string | false;
  namespace?: string;
}

export interface LoadedSource {
  agents: Record<string, unknown>;
  commands: Record<string, unknown>;
}

function listMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md"))
    .map((e) => join(dir, e.name));
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

  return { agents, commands };
}
