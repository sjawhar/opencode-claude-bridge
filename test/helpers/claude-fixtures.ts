import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export function copyClaudeHomeFixtureWithRealPaths(
  srcClaudeHome: string,
): string {
  const tmpRoot = mkdtempSync(path.join(tmpdir(), "claude-bridge-test-"));
  const dstClaudeHome = path.join(tmpRoot, "claude-home");
  cpSync(srcClaudeHome, dstClaudeHome, { recursive: true });

  const regPath = path.join(dstClaudeHome, "plugins/installed_plugins.json");
  const raw = readFileSync(regPath, "utf-8");
  const targets = [
    path.join(dstClaudeHome, "plugins/cache/market-a/plugin-skills/1.0.0"),
    path.join(dstClaudeHome, "plugins/cache/market-b/plugin-mcp/2.5.0"),
    path.join(dstClaudeHome, "plugins/cache/market-d/plugin-multi/2.0.0"),
  ];
  let i = 0;
  writeFileSync(
    regPath,
    raw.replace(/REPLACE_ME_AT_TEST_TIME/g, () => targets[i++] ?? "X"),
  );

  return dstClaudeHome;
}
