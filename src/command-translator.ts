import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseFrontmatter } from "./frontmatter";
import { mapClaudeModel } from "./model-mapper";
import type { Logger } from "./logger";

interface CommandFrontmatter {
  description?: string;
  agent?: string;
  model?: string;
  subtask?: boolean;
  handoffs?: unknown;
  "argument-hint"?: string;
}

export interface TranslatedCommand {
  name: string;
  config: {
    description?: string;
    template: string;
    agent?: string;
    model?: string;
    subtask?: boolean;
    handoffs?: unknown;
  };
}

export interface TranslateCommandOptions {
  namespace?: string;
}

export async function translateCommandFile(
  filePath: string,
  opts: TranslateCommandOptions,
  logger: Logger,
): Promise<TranslatedCommand | null> {
  if (!existsSync(filePath)) return null;

  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (err) {
    await logger.warn(`Failed to read command file: ${filePath}`, { error: String(err) });
    return null;
  }

  const { data, body } = parseFrontmatter<CommandFrontmatter>(content);
  const baseName = basename(filePath).replace(/\.md$/i, "");
  const name = opts.namespace ? `${opts.namespace}-${baseName}` : baseName;

  const template =
    "<command-instruction>\n" +
    body.trim() +
    "\n</command-instruction>\n\n" +
    "<user-request>\n$ARGUMENTS\n</user-request>";

  const config: TranslatedCommand["config"] = { template };
  if (data.description) config.description = data.description;
  if (data.agent) config.agent = data.agent;
  const model = mapClaudeModel(data.model);
  if (model) config.model = model;
  if (typeof data.subtask === "boolean") config.subtask = data.subtask;
  if (data.handoffs) config.handoffs = data.handoffs;

  return { name, config };
}
