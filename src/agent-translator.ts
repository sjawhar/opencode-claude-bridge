import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { asScalarString } from "./coerce";
import { mapClaudeColor } from "./color-mapper";
import { parseFrontmatter } from "./frontmatter";
import type { Logger } from "./logger";
import { mapClaudeModel } from "./model-mapper";
import { rewriteClaudePaths } from "./rewrite-paths";
import { parseToolsList } from "./tools-parser";

interface AgentFrontmatter {
  name?: unknown;
  description?: unknown;
  model?: unknown;
  mode?: unknown;
  tools?: unknown;
  color?: unknown;
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
  const name = asScalarString(data.name);
  const baseName = name || basename(filePath).replace(/\.md$/i, "");

  const config: TranslatedAgent["config"] = {
    mode: asScalarString(data.mode) || "subagent",
    prompt: rewriteClaudePaths(body.trim()),
  };

  const description = asScalarString(data.description);
  if (description) config.description = description;

  if (config.mode === "primary") {
    const model = mapClaudeModel(asScalarString(data.model));
    if (model) config.model = model;
  }

  const tools = parseToolsList(data.tools, logger);
  if (tools) config.tools = tools;

  const colorRaw = asScalarString(data.color);
  const color = mapClaudeColor(colorRaw);
  if (color) config.color = color;
  else if (colorRaw) {
    await logger.debug(
      `Dropped unrecognized color "${colorRaw}" from agent ${baseName}`,
    );
  }

  return { baseName, config };
}
