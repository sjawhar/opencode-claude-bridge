import { existsSync, readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { parseFrontmatter } from "./frontmatter";
import type { Logger } from "./logger";
import { mapClaudeModel } from "./model-mapper";

interface SkillFrontmatter {
  name?: string;
  description?: string;
  model?: string;
  agent?: string;
  subtask?: boolean;
  "disable-model-invocation"?: unknown;
}

export interface TranslatedSkillAsCommand {
  baseName: string;
  disabled: boolean; // true if disable-model-invocation: true
  config: {
    description?: string;
    template: string;
    agent?: string;
    model?: string;
    subtask?: boolean;
  };
}

export async function translateSkillFile(
  filePath: string,
  logger: Logger,
): Promise<TranslatedSkillAsCommand | null> {
  if (!existsSync(filePath)) return null;

  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (err) {
    await logger.warn(`Failed to read skill file: ${filePath}`, {
      error: String(err),
    });
    return null;
  }

  const { data, body } = parseFrontmatter<SkillFrontmatter>(content);
  const baseName = data.name || basename(dirname(filePath));

  const disableRaw = data["disable-model-invocation"];
  const disabled = disableRaw === true || disableRaw === "true";

  const template =
    "<command-instruction>\n" +
    body.trim() +
    "\n</command-instruction>\n\n" +
    "<user-request>\n$ARGUMENTS\n</user-request>";

  const config: TranslatedSkillAsCommand["config"] = { template };
  if (data.description) config.description = data.description;
  if (data.agent) config.agent = data.agent;
  const model = mapClaudeModel(data.model);
  if (model) config.model = model;
  if (typeof data.subtask === "boolean") config.subtask = data.subtask;

  return { baseName, disabled, config };
}
