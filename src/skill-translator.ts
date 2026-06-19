import { existsSync, readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { asScalarString } from "./coerce";
import { parseFrontmatter } from "./frontmatter";
import type { Logger } from "./logger";
import { mapClaudeModel } from "./model-mapper";

interface SkillFrontmatter {
  name?: unknown;
  description?: unknown;
  model?: unknown;
  agent?: unknown;
  subtask?: unknown;
  "disable-model-invocation"?: unknown;
  "user-invocable"?: unknown;
  mcp?: unknown;
}

const BRIDGE_HANDLED_FIELDS = new Set([
  "name",
  "description",
  "disable-model-invocation",
  "user-invocable",
  // Command-side fields the bridge consumes (do NOT round-trip them into the
  // materialized SKILL.md — opencode would ignore them anyway, and stripping
  // keeps the cache file clean):
  "agent",
  "model",
  "subtask",
]);

export interface TranslatedSkill {
  /** Name from frontmatter, else parent directory name. */
  name: string;
  /** Description from frontmatter; undefined when absent. */
  description?: string;
  /** Raw body (no command-instruction wrapping, no token expansion yet). */
  body: string;
  /** Claude Code official: true → suppress skill registration. */
  disableModelInvocation: boolean;
  /** Claude Code official: false → suppress command registration. */
  userInvocable: boolean;
  /** Frontmatter passed through into the materialized SKILL.md, minus bridge-handled fields. */
  extraFrontmatter: Record<string, unknown>;
  /** Command-side fields the loader uses to build the slash-command config. */
  commandFields: {
    agent?: string;
    model?: string;
    subtask?: boolean;
  };
}

function readBool(value: unknown): boolean | undefined {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
}

export async function translateSkillFile(
  filePath: string,
  logger: Logger,
): Promise<TranslatedSkill | null> {
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
  const skillDir = dirname(filePath);
  const name = asScalarString(data.name) || basename(skillDir);

  const disableModelInvocation =
    readBool(data["disable-model-invocation"]) ?? false;
  const userInvocable = readBool(data["user-invocable"]) ?? true;

  const commandFields: TranslatedSkill["commandFields"] = {};
  const agent = asScalarString(data.agent);
  if (agent) commandFields.agent = agent;
  const model = mapClaudeModel(asScalarString(data.model));
  if (model) commandFields.model = model;
  if (typeof data.subtask === "boolean") commandFields.subtask = data.subtask;

  const extraFrontmatter: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (BRIDGE_HANDLED_FIELDS.has(k)) continue;
    extraFrontmatter[k] = v;
  }

  const result: TranslatedSkill = {
    name,
    body: body.trimEnd(),
    disableModelInvocation,
    userInvocable,
    extraFrontmatter,
    commandFields,
  };
  const description = asScalarString(data.description);
  if (description) result.description = description;
  return result;
}
