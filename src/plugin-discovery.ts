import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Logger } from "./logger";
import type { ClaudeBridgeSource } from "./source-loader";

export interface ReadSettingsOptions {
  claudeConfigDir: string;
  cwd: string;
  logger: Logger;
}

export interface MarketplaceSource {
  source: string;
  repo?: string;
}

export interface MarketplaceEntry {
  source: MarketplaceSource;
}

export interface SettingsResult {
  enabled: Record<string, boolean>;
  marketplaces: Record<string, MarketplaceEntry>;
}

function parseEnabled(
  parsed: Record<string, unknown>,
): Record<string, boolean> {
  const ep = parsed.enabledPlugins;
  if (typeof ep !== "object" || ep === null || Array.isArray(ep)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(ep)) {
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

function parseMarketplaces(
  parsed: Record<string, unknown>,
): Record<string, MarketplaceEntry> {
  const raw = parsed.extraKnownMarketplaces;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, MarketplaceEntry> = {};
  for (const [name, entry] of Object.entries(raw)) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue;
    }
    const source = (entry as Record<string, unknown>).source;
    if (
      typeof source !== "object" ||
      source === null ||
      Array.isArray(source)
    ) {
      continue;
    }
    const sourceType = (source as Record<string, unknown>).source;
    if (typeof sourceType !== "string") continue;
    const repoRaw = (source as Record<string, unknown>).repo;
    if (repoRaw !== undefined && typeof repoRaw !== "string") continue;
    const repo = typeof repoRaw === "string" ? repoRaw : undefined;
    const marketplaceSource: MarketplaceSource = { source: sourceType };
    if (repo !== undefined) marketplaceSource.repo = repo;
    out[name] = {
      source: marketplaceSource,
    };
  }
  return out;
}

async function readSettingsFile(
  filePath: string,
  logger: Logger,
): Promise<{
  enabled: Record<string, boolean>;
  marketplaces: Record<string, MarketplaceEntry>;
}> {
  if (!existsSync(filePath)) return { enabled: {}, marketplaces: {} };
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err) {
    await logger.warn(`Failed to read settings.json: ${filePath}`, {
      error: String(err),
    });
    return { enabled: {}, marketplaces: {} };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    await logger.warn(`Failed to parse settings.json: ${filePath}`, {
      error: String(err),
    });
    return { enabled: {}, marketplaces: {} };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { enabled: {}, marketplaces: {} };
  }
  const p = parsed as Record<string, unknown>;
  return { enabled: parseEnabled(p), marketplaces: parseMarketplaces(p) };
}

export async function readSettings(
  opts: ReadSettingsOptions,
): Promise<SettingsResult> {
  const userPath = join(opts.claudeConfigDir, "settings.json");
  const projectPath = join(opts.cwd, ".claude", "settings.json");
  const user = await readSettingsFile(userPath, opts.logger);
  const project = await readSettingsFile(projectPath, opts.logger);
  return {
    enabled: { ...user.enabled, ...project.enabled },
    marketplaces: { ...user.marketplaces, ...project.marketplaces },
  };
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
      // Pick the most recently-installed version. mtime works across non-semver
      // version dirs (e.g. claude sometimes uses commit hashes as version names).
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

export type DiscoverOptions = ReadSettingsOptions;

function splitKey(key: string): { name: string; marketplace: string } | null {
  const idx = key.indexOf("@");
  if (idx <= 0 || idx === key.length - 1) return null;
  return { name: key.slice(0, idx), marketplace: key.slice(idx + 1) };
}

export async function discoverClaudePlugins(
  opts: DiscoverOptions,
): Promise<ClaudeBridgeSource[]> {
  const [settings, registry, cache] = await Promise.all([
    readSettings(opts),
    readInstalledRegistry(opts.claudeConfigDir, opts.logger),
    scanCache(opts.claudeConfigDir),
  ]);
  const enabled = settings.enabled;
  const marketplaces = settings.marketplaces;

  const allKeys = new Set<string>([
    ...Object.keys(registry),
    ...Object.keys(cache),
    ...Object.keys(enabled),
  ]);

  const sources: ClaudeBridgeSource[] = [];
  for (const key of allKeys) {
    if (enabled[key] === false) continue;

    const parts = splitKey(key);
    if (!parts) {
      await opts.logger.warn(
        `Skipping plugin key "${key}": expected "name@marketplace" format.`,
      );
      continue;
    }

    let entry = registry[key];
    if (!entry || !existsSync(entry.installPath)) {
      entry = cache[key];
    }
    if (!entry) {
      const market = marketplaces[parts.marketplace];
      const githubRepo =
        market?.source.source === "github" &&
        typeof market.source.repo === "string"
          ? market.source.repo
          : undefined;
      const lines = [
        `Plugin "${key}" is enabled in settings but not installed.`,
        "Run in Claude Code (in this project):",
      ];
      if (githubRepo) {
        lines.push(`  /plugin marketplace add ${githubRepo}`);
      }
      lines.push(`  /plugin install ${key}`);
      await opts.logger.warn(lines.join("\n"));
      continue;
    }

    sources.push({ dir: entry.installPath, namespace: parts.name });
  }

  return sources;
}
