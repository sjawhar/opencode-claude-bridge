import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Logger } from "./logger";

export interface ReadEnabledPluginsOptions {
  claudeConfigDir: string;
  cwd: string;
  logger: Logger;
}

async function readSettingsFile(
  filePath: string,
  logger: Logger,
): Promise<Record<string, boolean>> {
  if (!existsSync(filePath)) return {};
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err) {
    await logger.warn(`Failed to read settings.json: ${filePath}`, {
      error: String(err),
    });
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    await logger.warn(`Failed to parse settings.json: ${filePath}`, {
      error: String(err),
    });
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  const ep = (parsed as Record<string, unknown>).enabledPlugins;
  if (typeof ep !== "object" || ep === null || Array.isArray(ep)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(ep)) {
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

export async function readEnabledPlugins(
  opts: ReadEnabledPluginsOptions,
): Promise<Record<string, boolean>> {
  const userPath = join(opts.claudeConfigDir, "settings.json");
  const projectPath = join(opts.cwd, ".claude", "settings.json");
  const user = await readSettingsFile(userPath, opts.logger);
  const project = await readSettingsFile(projectPath, opts.logger);
  return { ...user, ...project };
}
