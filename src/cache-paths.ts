import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

const CACHE_SUBPATH = "opencode-claude-bridge/skills";
const SAFE_KEY_REGEX = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function isSafeKey(s: string): boolean {
  return SAFE_KEY_REGEX.test(s) && !s.includes("..");
}

export function getCacheRoot(): string {
  const xdg = process.env.XDG_CACHE_HOME;
  const root = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), ".cache");
  return path.join(root, CACHE_SUBPATH);
}

export function computeSourceKey(
  sourceDir: string,
  namespace?: string,
): string {
  if (namespace && isSafeKey(namespace)) return namespace;
  return createHash("sha256").update(sourceDir).digest("hex").slice(0, 12);
}
