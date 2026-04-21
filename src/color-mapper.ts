const THEME_COLORS = new Set([
  "primary",
  "secondary",
  "accent",
  "success",
  "warning",
  "error",
  "info",
]);
const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

export function mapClaudeColor(color: string | undefined): string | undefined {
  if (!color) return undefined;
  const trimmed = color.trim();
  if (!trimmed) return undefined;
  if (HEX_RE.test(trimmed)) return trimmed;
  if (THEME_COLORS.has(trimmed.toLowerCase())) return trimmed.toLowerCase();
  return undefined;
}
