const ANTHROPIC_PREFIX = "anthropic/";

const ALIASES: Record<string, string> = {
  opus: `${ANTHROPIC_PREFIX}claude-opus-4-6`,
  sonnet: `${ANTHROPIC_PREFIX}claude-sonnet-4-6`,
  haiku: `${ANTHROPIC_PREFIX}claude-haiku-4-5`,
};

export function mapClaudeModel(model: string | undefined): string | undefined {
  if (!model) return undefined;
  const trimmed = model.trim();
  if (!trimmed) return undefined;
  if (trimmed === "inherit") return undefined;

  const alias = ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;

  if (trimmed.includes("/")) return trimmed;

  if (trimmed.startsWith("claude-")) return `${ANTHROPIC_PREFIX}${trimmed}`;

  return undefined;
}
