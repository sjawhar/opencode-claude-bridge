const TOKEN = "$" + "{CLAUDE_PLUGIN_ROOT}";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function expandPluginRoot<T>(value: T, pluginRoot: string): T {
  if (typeof value === "string") {
    return (
      value.includes(TOKEN) ? value.replaceAll(TOKEN, pluginRoot) : value
    ) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => expandPluginRoot(item, pluginRoot)) as T;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = expandPluginRoot(v, pluginRoot);
    }
    return out as T;
  }
  return value;
}
