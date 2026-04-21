export function parseToolsList(value: unknown): Record<string, boolean> | undefined {
  if (!value) return undefined;

  let items: string[];
  if (typeof value === "string") {
    items = value.split(",").map((t) => t.trim()).filter(Boolean);
  } else if (Array.isArray(value)) {
    items = value.filter((t): t is string => typeof t === "string" && t.trim().length > 0).map((t) => t.trim());
  } else {
    return undefined;
  }

  if (items.length === 0) return undefined;

  const result: Record<string, boolean> = {};
  for (const tool of items) {
    result[tool.toLowerCase()] = true;
  }
  return result;
}
