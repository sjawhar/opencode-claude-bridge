import { existsSync, readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { asScalarString } from "./coerce";
import { parseFrontmatter } from "./frontmatter";
import type { Logger } from "./logger";
import { type TranslatedMcp, translateMcpBlock } from "./mcp-translator";
import { mapClaudeModel } from "./model-mapper";

interface SkillFrontmatter {
  name?: unknown;
  description?: unknown;
  model?: unknown;
  agent?: unknown;
  subtask?: unknown;
  "disable-model-invocation"?: unknown;
  mcp?: unknown;
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
  mcps: Record<string, TranslatedMcp>;
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
  const name = asScalarString(data.name);
  const baseName = name || basename(dirname(filePath));

  const disableRaw = data["disable-model-invocation"];
  const disabled = disableRaw === true || disableRaw === "true";

  const template =
    "<command-instruction>\n" +
    body.trim() +
    "\n</command-instruction>\n\n" +
    "<user-request>\n$ARGUMENTS\n</user-request>";

  const config: TranslatedSkillAsCommand["config"] = { template };
  const description = asScalarString(data.description);
  if (description) config.description = description;
  const agent = asScalarString(data.agent);
  if (agent) config.agent = agent;
  const model = mapClaudeModel(asScalarString(data.model));
  if (model) config.model = model;
  if (typeof data.subtask === "boolean") config.subtask = data.subtask;

  const mcps = await translateMcpBlock(data.mcp, baseName, logger);

  return { baseName, disabled, config, mcps };
}
