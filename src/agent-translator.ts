import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { mapClaudeColor } from "./color-mapper";
import { parseFrontmatter } from "./frontmatter";
import type { Logger } from "./logger";
import { mapClaudeModel } from "./model-mapper";
import { rewriteClaudePaths } from "./rewrite-paths";
import { parseToolsList } from "./tools-parser";

interface AgentFrontmatter {
  name?: string;
  description?: string;
  model?: string;
  mode?: string;
  tools?: unknown;
  color?: string;
}

export interface TranslatedAgent {
  baseName: string;
  config: {
    description?: string;
    mode: string;
    prompt: string;
    model?: string;
    tools?: Record<string, boolean>;
    color?: string;
  };
}

export async function translateAgentFile(
  filePath: string,
  logger: Logger,
): Promise<TranslatedAgent | null> {
  if (!existsSync(filePath)) return null;

  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (err) {
    await logger.warn(`Failed to read agent file: ${filePath}`, {
      error: String(err),
    });
    return null;
  }

  const { data, body } = parseFrontmatter<AgentFrontmatter>(content);
  const baseName = data.name || basename(filePath).replace(/\.md$/i, "");

  const config: TranslatedAgent["config"] = {
    mode: data.mode || "subagent",
    prompt: rewriteClaudePaths(body.trim()),
  };

  if (data.description) config.description = data.description;

  if (config.mode === "primary") {
    const model = mapClaudeModel(data.model);
    if (model) config.model = model;
  }

  const tools = parseToolsList(data.tools, logger);
  if (tools) config.tools = tools;

  const color = mapClaudeColor(data.color);
  if (color) config.color = color;
  else if (data.color) {
    await logger.debug(
      `Dropped unrecognized color "${data.color}" from agent ${baseName}`,
    );
  }

  return { baseName, config };
}
