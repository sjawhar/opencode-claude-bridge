import type { Logger } from "./logger";

export interface TranslatedLocalMcp {
  type: "local";
  command: string[];
  environment?: Record<string, string>;
  enabled?: boolean;
  timeout?: number;
}

export interface TranslatedRemoteMcp {
  type: "remote";
  url: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  timeout?: number;
  oauth?: unknown;
}

export type TranslatedMcp = TranslatedLocalMcp | TranslatedRemoteMcp;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const item of value) {
      if (typeof item !== "string") return null;
      out.push(item);
    }
    return out;
  }
  if (typeof value === "string") return [value];
  return null;
}

function toStringMap(value: unknown): Record<string, string> | null {
  if (value === undefined || value === null) return {};
  if (!isPlainObject(value)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v !== "string") return null;
    out[k] = v;
  }
  return out;
}

async function translateSingle(
  serverName: string,
  raw: unknown,
  skillName: string,
  logger: Logger,
): Promise<TranslatedMcp | null> {
  if (!isPlainObject(raw)) {
    await logger.warn(
      `Skipping MCP "${serverName}" in skill "${skillName}": server config must be an object.`,
    );
    return null;
  }

  const rawType = typeof raw.type === "string" ? raw.type : undefined;
  const isRemote = rawType === "remote" || typeof raw.url === "string";

  if (isRemote) {
    if (typeof raw.url !== "string" || raw.url.length === 0) {
      await logger.warn(
        `Skipping remote MCP "${serverName}" in skill "${skillName}": missing url.`,
      );
      return null;
    }
    const headers = toStringMap(raw.headers);
    if (headers === null) {
      await logger.warn(
        `Skipping remote MCP "${serverName}" in skill "${skillName}": headers must be a string map.`,
      );
      return null;
    }
    const result: TranslatedRemoteMcp = { type: "remote", url: raw.url };
    if (Object.keys(headers).length > 0) result.headers = headers;
    if (typeof raw.enabled === "boolean") result.enabled = raw.enabled;
    if (typeof raw.timeout === "number") result.timeout = raw.timeout;
    if (raw.oauth !== undefined) result.oauth = raw.oauth;
    return result;
  }

  // Local MCP: normalize command + args into a single string[]
  const commandParts = toStringArray(raw.command);
  if (commandParts === null || commandParts.length === 0) {
    await logger.warn(
      `Skipping local MCP "${serverName}" in skill "${skillName}": invalid or missing command.`,
    );
    return null;
  }
  const argsParts = toStringArray(raw.args);
  if (argsParts === null) {
    await logger.warn(
      `Skipping local MCP "${serverName}" in skill "${skillName}": args must be a string array.`,
    );
    return null;
  }
  const environment = toStringMap(raw.env);
  if (environment === null) {
    await logger.warn(
      `Skipping local MCP "${serverName}" in skill "${skillName}": env must be a string map.`,
    );
    return null;
  }
  const result: TranslatedLocalMcp = {
    type: "local",
    command: [...commandParts, ...argsParts],
  };
  if (Object.keys(environment).length > 0) result.environment = environment;
  if (typeof raw.enabled === "boolean") result.enabled = raw.enabled;
  if (typeof raw.timeout === "number") result.timeout = raw.timeout;
  return result;
}

export async function translateMcpBlock(
  raw: unknown,
  skillName: string,
  logger: Logger,
): Promise<Record<string, TranslatedMcp>> {
  if (raw === undefined || raw === null) return {};
  if (!isPlainObject(raw)) {
    await logger.warn(
      `Skipping "mcp" block in skill "${skillName}": expected an object keyed by server name.`,
    );
    return {};
  }

  const out: Record<string, TranslatedMcp> = {};
  for (const [serverName, serverConfig] of Object.entries(raw)) {
    const translated = await translateSingle(
      serverName,
      serverConfig,
      skillName,
      logger,
    );
    if (translated) out[serverName] = translated;
  }
  return out;
}
