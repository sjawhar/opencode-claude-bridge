import { describe, expect, mock, test } from "bun:test";
import { createClaudeBridge } from "../src/index";

// A plugin input as opencode passes it when the package is listed by name in
// the opencode `plugin` array.
function pluginInput() {
  return {
    client: { app: { log: mock(async () => ({})) } },
    directory: process.cwd(),
    worktree: process.cwd(),
    project: { path: process.cwd() },
    $: mock(() => ({})),
  };
}

describe("createClaudeBridge dual-mode", () => {
  test("factory mode: given a config, returns a Plugin function", () => {
    const plugin = createClaudeBridge({ sources: [{ dir: ".claude" }] });
    expect(typeof plugin).toBe("function");
  });

  test("plugin mode: given a plugin input, runs zero-config and returns hooks", async () => {
    // Called the way opencode invokes a config-array plugin export.
    const result = createClaudeBridge(
      pluginInput() as unknown as Parameters<typeof createClaudeBridge>[0],
    );
    // Zero-config plugin mode returns the hooks promise directly, not a Plugin.
    expect(typeof result).not.toBe("function");
    const hooks = (await result) as Record<string, unknown>;
    expect(typeof hooks.config).toBe("function");
  });

  test("no-arg mode: returns a Plugin function using .claude defaults", () => {
    const plugin = createClaudeBridge();
    expect(typeof plugin).toBe("function");
  });
});
