/**
 * Coerce a YAML scalar value to a string.
 *
 * Returns `undefined` for null/undefined/objects/arrays. Strings, numbers,
 * booleans, and other primitives are stringified. This restores the
 * implicit string semantics the hand-rolled frontmatter parser used to
 * provide before the swap to the `yaml` package.
 */
export function asScalarString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  // Reject objects, arrays, symbols, functions.
  return undefined;
}
