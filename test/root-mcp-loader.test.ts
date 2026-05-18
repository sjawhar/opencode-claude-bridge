import { describe, expect, mock, test } from "bun:test";
import path from "node:path";
import { loadRootMcp } from "../src/root-mcp-loader";

function makeLogger() {
  const warn = mock(async () => {});
  return {
    logger: {
      debug: mock(async () => {}),
      info: mock(async () => {}),
      warn,
      error: mock(async () => {}),
    },
    warn,
  };
}

const F = path.join(import.meta.dir, "fixtures/claude-plugins/root-mcp");

describe("loadRootMcp", () => {
  test("returns parsed MCP entries from a valid file", async () => {
    const { logger } = makeLogger();
    const out = await loadRootMcp(path.join(F, "good"), logger);
    expect(Object.keys(out).sort()).toEqual(["alpha", "beta"]);
    expect(out.alpha).toMatchObject({
      type: "local",
      command: ["node", "server.js"],
    });
    expect(out.beta).toMatchObject({
      type: "remote",
      url: "https://example.com/mcp",
    });
  });

  test("returns empty map when .mcp.json is absent", async () => {
    const { logger, warn } = makeLogger();
    const out = await loadRootMcp(path.join(F, "absent-dir"), logger);
    expect(out).toEqual({});
    expect(warn).not.toHaveBeenCalled();
  });

  test("returns empty map and warns when .mcp.json is malformed", async () => {
    const { logger, warn } = makeLogger();
    const out = await loadRootMcp(path.join(F, "malformed"), logger);
    expect(out).toEqual({});
    expect(warn).toHaveBeenCalled();
  });

  test("returns empty map when .mcp.json lacks mcpServers key", async () => {
    const { logger } = makeLogger();
    const out = await loadRootMcp(path.join(F, "no-key"), logger);
    expect(out).toEqual({});
  });
});
