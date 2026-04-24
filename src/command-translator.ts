import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { asScalarString } from "./coerce";
import { parseFrontmatter } from "./frontmatter";
import type { Logger } from "./logger";
import { mapClaudeModel } from "./model-mapper";
import { rewriteClaudePaths } from "./rewrite-paths";

interface CommandFrontmatter {
  description?: unknown;
  agent?: unknown;
  model?: unknown;
  subtask?: unknown;
  handoffs?: unknown;
  "argument-hint"?: unknown;
}

export interface TranslatedCommand {
  baseName: string;
  config: {
    description?: string;
    template: string;
    agent?: string;
    model?: string;
    subtask?: boolean;
    handoffs?: unknown;
  };
}

export async function translateCommandFile(
  filePath: string,
  logger: Logger,
): Promise<TranslatedCommand | null> {
  if (!existsSync(filePath)) return null;

  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (err) {
    await logger.warn(`Failed to read command file: ${filePath}`, {
      error: String(err),
    });
    return null;
  }

  const { data, body } = parseFrontmatter<CommandFrontmatter>(content);
  const baseName = basename(filePath).replace(/\.md$/i, "");

  const template =
    "<command-instruction>\n" +
    rewriteClaudePaths(body.trim()) +
    "\n</command-instruction>\n\n" +
    "<user-request>\n$ARGUMENTS\n</user-request>";

  const config: TranslatedCommand["config"] = { template };
  const description = asScalarString(data.description);
  if (description) config.description = description;
  const agent = asScalarString(data.agent);
  if (agent) config.agent = agent;
  const model = mapClaudeModel(asScalarString(data.model));
  if (model) config.model = model;
  if (typeof data.subtask === "boolean") config.subtask = data.subtask;
  if (data.handoffs) config.handoffs = data.handoffs;

  return { baseName, config };
}
