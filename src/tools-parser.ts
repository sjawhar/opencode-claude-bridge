import type { Logger } from "./logger";

const CANONICAL_TOOLS = new Set([
  "read",
  "write",
  "edit",
  "bash",
  "grep",
  "glob",
  "list",
  "webfetch",
  "skill",
  "patch",
  "task",
  "question",
  "todowrite",
  "todoread",
]);

export function parseToolsList(
  value: unknown,
  logger?: Logger,
): Record<string, boolean> | undefined {
  if (!value) return undefined;

  let items: string[];
  if (typeof value === "string") {
    items = value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  } else if (Array.isArray(value)) {
    items = value
      .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      .map((t) => t.trim());
  } else {
    return undefined;
  }

  if (items.length === 0) return undefined;

  const result: Record<string, boolean> = {};
  for (const tool of items) {
    const normalized = tool.toLowerCase();
    if (CANONICAL_TOOLS.has(normalized)) {
      result[normalized] = true;
    } else if (logger) {
      logger.debug(`Dropped unknown tool "${tool}"`).catch(() => {
        // ignore logging errors
      });
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
