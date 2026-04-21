import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseFrontmatter } from "./frontmatter";
import { mapClaudeModel } from "./model-mapper";
import { parseToolsList } from "./tools-parser";
import { mapClaudeColor } from "./color-mapper";
import type { Logger } from "./logger";

interface AgentFrontmatter {
  name?: string;
  description?: string;
  model?: string;
  mode?: string;
  tools?: unknown;
  color?: string;
}

export interface TranslatedAgent {
  name: string;
  config: {
    description?: string;
    mode: string;
    prompt: string;
    model?: string;
    tools?: Record<string, boolean>;
    color?: string;
  };
}

export interface TranslateOptions {
  namespace?: string;
}

export async function translateAgentFile(
  filePath: string,
  opts: TranslateOptions,
  logger: Logger,
): Promise<TranslatedAgent | null> {
  if (!existsSync(filePath)) return null;

  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (err) {
    await logger.warn(`Failed to read agent file: ${filePath}`, { error: String(err) });
    return null;
  }

  const { data, body } = parseFrontmatter<AgentFrontmatter>(content);
  const baseName = data.name || basename(filePath).replace(/\.md$/i, "");
  const name = opts.namespace ? `${opts.namespace}-${baseName}` : baseName;

  const config: TranslatedAgent["config"] = {
    mode: data.mode || "subagent",
    prompt: body.trim(),
  };

  if (data.description) config.description = data.description;

  const model = mapClaudeModel(data.model);
  if (model) config.model = model;

  const tools = parseToolsList(data.tools);
  if (tools) config.tools = tools;

  const color = mapClaudeColor(data.color);
  if (color) config.color = color;
  else if (data.color) {
    await logger.debug(`Dropped unrecognized color "${data.color}" from agent ${name}`);
  }

  return { name, config };
}
