import { parse as parseYaml } from "yaml";

export interface FrontmatterResult<T = Record<string, unknown>> {
  data: T;
  body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseFrontmatter<T = Record<string, unknown>>(
  content: string,
): FrontmatterResult<T> {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return { data: {} as T, body: content };

  const [, frontmatterStr, body] = match;
  let data: unknown;
  try {
    data = parseYaml(frontmatterStr);
  } catch {
    return { data: {} as T, body };
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { data: {} as T, body };
  }

  return { data: data as T, body };
}
