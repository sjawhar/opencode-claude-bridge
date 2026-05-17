import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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

export interface RegistryEntry {
  installPath: string;
  version: string;
}

function isStringField(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const v = (value as Record<string, unknown>)[key];
  return typeof v === "string" ? v : undefined;
}

function parseV2(
  plugins: Record<string, unknown>,
): Record<string, RegistryEntry> {
  const out: Record<string, RegistryEntry> = {};
  for (const [key, value] of Object.entries(plugins)) {
    const first = Array.isArray(value) ? value[0] : undefined;
    if (!first) continue;
    const installPath = isStringField(first, "installPath");
    const version = isStringField(first, "version") ?? "unknown";
    if (installPath) out[key] = { installPath, version };
  }
  return out;
}

function parseV3(entries: unknown[]): Record<string, RegistryEntry> {
  const out: Record<string, RegistryEntry> = {};
  for (const entry of entries) {
    const name = isStringField(entry, "name");
    const marketplace = isStringField(entry, "marketplace");
    const installPath = isStringField(entry, "installPath");
    const version = isStringField(entry, "version") ?? "unknown";
    if (name && marketplace && installPath) {
      out[`${name}@${marketplace}`] = { installPath, version };
    }
  }
  return out;
}

export async function readInstalledRegistry(
  claudeConfigDir: string,
  logger: Logger,
): Promise<Record<string, RegistryEntry>> {
  const filePath = join(claudeConfigDir, "plugins", "installed_plugins.json");
  if (!existsSync(filePath)) return {};

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err) {
    await logger.warn(`Failed to read installed_plugins.json: ${filePath}`, {
      error: String(err),
    });
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    await logger.warn(`Failed to parse installed_plugins.json: ${filePath}`, {
      error: String(err),
    });
    return {};
  }

  if (Array.isArray(parsed)) {
    return parseV3(parsed);
  }
  if (typeof parsed !== "object" || parsed === null) return {};
  const version = (parsed as Record<string, unknown>).version;
  const plugins = (parsed as Record<string, unknown>).plugins;

  if (version === 2 && typeof plugins === "object" && plugins !== null) {
    return parseV2(plugins as Record<string, unknown>);
  }
  if (version === 1) {
    await logger.info(
      `Ignoring v1 installed_plugins.json at ${filePath}; cache scan will be used as fallback.`,
    );
    return {};
  }
  await logger.info(
    `Unrecognized installed_plugins.json schema at ${filePath}; cache scan will be used as fallback.`,
  );
  return {};
}

export async function scanCache(
  claudeConfigDir: string,
  _logger: Logger,
): Promise<Record<string, RegistryEntry>> {
  const cacheRoot = join(claudeConfigDir, "plugins", "cache");
  if (!existsSync(cacheRoot)) return {};

  const out: Record<string, RegistryEntry> = {};
  for (const marketEntry of readdirSync(cacheRoot, { withFileTypes: true })) {
    if (!marketEntry.isDirectory()) continue;
    const marketDir = join(cacheRoot, marketEntry.name);
    for (const pluginEntry of readdirSync(marketDir, { withFileTypes: true })) {
      if (!pluginEntry.isDirectory()) continue;
      const pluginDir = join(marketDir, pluginEntry.name);
      const versions: { name: string; mtimeMs: number; path: string }[] = [];
      for (const verEntry of readdirSync(pluginDir, { withFileTypes: true })) {
        if (!verEntry.isDirectory()) continue;
        const p = join(pluginDir, verEntry.name);
        versions.push({
          name: verEntry.name,
          mtimeMs: statSync(p).mtimeMs,
          path: p,
        });
      }
      if (versions.length === 0) continue;
      versions.sort((a, b) => b.mtimeMs - a.mtimeMs);
      const picked = versions[0];
      out[`${pluginEntry.name}@${marketEntry.name}`] = {
        installPath: picked.path,
        version: picked.name,
      };
    }
  }
  return out;
}
