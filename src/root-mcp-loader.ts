import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Logger } from "./logger";
import { type TranslatedMcp, translateMcpBlock } from "./mcp-translator";

export async function loadRootMcp(
  pluginDir: string,
  logger: Logger,
): Promise<Record<string, TranslatedMcp>> {
  const filePath = join(pluginDir, ".mcp.json");
  if (!existsSync(filePath)) return {};

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err) {
    await logger.warn(`Failed to read root .mcp.json: ${filePath}`, {
      error: String(err),
    });
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    await logger.warn(`Failed to parse root .mcp.json: ${filePath}`, {
      error: String(err),
    });
    return {};
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  const servers = (parsed as Record<string, unknown>).mcpServers;
  return translateMcpBlock(servers, filePath, logger);
}
