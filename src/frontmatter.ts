export interface FrontmatterResult<T = Record<string, unknown>> {
  data: T;
  body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

function parseInlineArray(value: string): string[] {
  // Accept "[a, b, c]" or "[]"
  const inner = value.slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(",").map((v) => stripQuotes(v.trim())).filter(Boolean);
}

export function parseFrontmatter<T = Record<string, unknown>>(content: string): FrontmatterResult<T> {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return { data: {} as T, body: content };

  const [, frontmatterStr, body] = match;
  const data: Record<string, unknown> = {};
  const lines = frontmatterStr.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const colonIdx = line.indexOf(":");
    if (colonIdx <= 0) continue;

    const key = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1).trim();

    if (rawValue === "|" || rawValue === ">") {
      // Block scalar — gather indented following lines
      const blockLines: string[] = [];
      const baseIndent = lines[i + 1] ? lines[i + 1].match(/^\s*/)?.[0].length ?? 0 : 0;
      while (i + 1 < lines.length && (lines[i + 1].startsWith(" ".repeat(baseIndent)) || lines[i + 1] === "")) {
        blockLines.push(lines[i + 1].slice(baseIndent));
        i++;
      }
      const joiner = rawValue === "|" ? "\n" : " ";
      data[key] = blockLines.join(joiner).trimEnd();
      continue;
    }

    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      data[key] = parseInlineArray(rawValue);
      continue;
    }

    data[key] = stripQuotes(rawValue);
  }

  return { data: data as T, body };
}
