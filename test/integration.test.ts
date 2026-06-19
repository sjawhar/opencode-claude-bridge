import { describe, expect, mock, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { computeSourceKey } from "../src/cache-paths";
import { createClaudeBridge } from "../src/index";

const sjawhar = path.join(import.meta.dir, "fixtures/sjawhar");

type LogEntry = { body: { level?: string; message?: string } };

function logEntries(logFn: { mock: { calls: unknown[][] } }): LogEntry[] {
  return logFn.mock.calls
    .map((call) => call[0])
    .filter((entry): entry is LogEntry => {
      if (typeof entry !== "object" || entry === null) return false;
      const body = (entry as { body?: unknown }).body;
      return typeof body === "object" && body !== null;
    });
}

async function runBridge(
  bridgeConfig: Parameters<typeof createClaudeBridge>[0],
  config: Record<string, unknown> = {},
  logFn = mock(async () => ({})),
): Promise<Record<string, unknown>> {
  const plugin = createClaudeBridge(bridgeConfig);
  const hooks = await (
    plugin as (ctx: unknown) => Promise<Record<string, unknown>>
  )({
    client: { app: { log: logFn } },
    directory: process.cwd(),
    worktree: process.cwd(),
    project: { path: process.cwd() },
    $: mock(() => ({})),
  });
  const configHook = hooks.config as (
    c: Record<string, unknown>,
  ) => Promise<void>;
  await configHook(config);
  return config;
}

describe("createClaudeBridge", () => {
  test("populates config.agent and config.command from sources without namespace", async () => {
    const cacheRoot = mkdtempSync(path.join(os.tmpdir(), "ocb-int-"));
    try {
      const config = await runBridge({
        sources: [{ dir: sjawhar }],
        cacheRoot,
      });

      expect(
        (config.agent as Record<string, unknown>)["bug-finder"],
      ).toBeDefined();
      expect(
        (config.command as Record<string, unknown>)["no-excuses"],
      ).toBeDefined();
    } finally {
      rmSync(cacheRoot, { recursive: true, force: true });
    }
  });

  test("applies namespace on collision with pre-existing config entry", async () => {
    const cacheRoot = mkdtempSync(path.join(os.tmpdir(), "ocb-int-"));
    try {
      const config = await runBridge(
        {
          sources: [{ dir: sjawhar, namespace: "sjawhar" }],
          cacheRoot,
        },
        {
          agent: { "bug-finder": { existing: true } },
          command: { "no-excuses": { existing: true } },
        },
      );

      // Pre-existing entries should be untouched.
      expect((config.agent as Record<string, unknown>)["bug-finder"]).toEqual({
        existing: true,
      });
      expect((config.command as Record<string, unknown>)["no-excuses"]).toEqual(
        {
          existing: true,
        },
      );

      // New entries should be registered under prefixed names.
      expect(
        (config.agent as Record<string, unknown>)["sjawhar/bug-finder"],
      ).toBeDefined();
      expect(
        (config.command as Record<string, unknown>)["sjawhar/no-excuses"],
      ).toBeDefined();
    } finally {
      rmSync(cacheRoot, { recursive: true, force: true });
    }
  });

  test("falls back to overwrite with warning when no namespace and collision", async () => {
    const cacheRoot = mkdtempSync(path.join(os.tmpdir(), "ocb-int-"));
    const logFn = mock(async () => ({}));
    try {
      const config = await runBridge(
        {
          sources: [{ dir: sjawhar }],
          cacheRoot,
        },
        {
          agent: { "bug-finder": { existing: true } },
        },
        logFn,
      );

      // Should overwrite with warning.
      const warnCalls = logEntries(logFn).filter(
        (entry) => entry.body.level === "warn",
      );
      expect(warnCalls.length).toBeGreaterThan(0);
      expect(
        (config.agent as Record<string, unknown>)["bug-finder"],
      ).toBeDefined();
    } finally {
      rmSync(cacheRoot, { recursive: true, force: true });
    }
  });

  test("uses slash separator in namespace", async () => {
    const cacheRoot = mkdtempSync(path.join(os.tmpdir(), "ocb-int-"));
    try {
      const config = await runBridge(
        {
          sources: [{ dir: sjawhar, namespace: "sjawhar" }],
          cacheRoot,
        },
        {
          agent: { "bug-finder": { existing: true } },
        },
      );

      // Should use slash, not dash.
      expect(
        (config.agent as Record<string, unknown>)["sjawhar/bug-finder"],
      ).toBeDefined();
      expect(
        (config.agent as Record<string, unknown>)["sjawhar-bug-finder"],
      ).toBeUndefined();
    } finally {
      rmSync(cacheRoot, { recursive: true, force: true });
    }
  });

  test("registers skills as commands in config.command", async () => {
    const cacheRoot = mkdtempSync(path.join(os.tmpdir(), "ocb-int-"));
    try {
      const config = await runBridge({
        sources: [{ dir: sjawhar }],
        cacheRoot,
      });

      const commandMap = config.command as Record<string, unknown>;
      expect(commandMap["public-thing"]).toBeDefined();
      expect(commandMap["hidden-thing"]).toBeDefined();
      expect(commandMap["derived-name"]).toBeDefined();
      expect(commandMap["user-only"]).toBeUndefined();
      // Verify they have the command template structure.
      expect(
        (commandMap["public-thing"] as Record<string, unknown>).template,
      ).toContain("<command-instruction>");
    } finally {
      rmSync(cacheRoot, { recursive: true, force: true });
    }
  });

  test("namespaces skill-derived command on collision with pre-existing command", async () => {
    const cacheRoot = mkdtempSync(path.join(os.tmpdir(), "ocb-int-"));
    try {
      const config = await runBridge(
        {
          sources: [{ dir: sjawhar, namespace: "sjawhar" }],
          cacheRoot,
        },
        {
          command: { "public-thing": { existing: true } },
        },
      );

      const commandMap = config.command as Record<string, unknown>;
      // Pre-existing entry should be untouched.
      expect(commandMap["public-thing"]).toEqual({ existing: true });
      // Skill-derived command should be registered under prefixed name.
      expect(commandMap["sjawhar/public-thing"]).toBeDefined();
    } finally {
      rmSync(cacheRoot, { recursive: true, force: true });
    }
  });
});

describe("dual registration (skill + command surfaces)", () => {
  test("default skill registers in config.command AND pushes a cache path", async () => {
    const cacheRoot = mkdtempSync(path.join(os.tmpdir(), "ocb-int-"));
    try {
      const config = await runBridge({
        sources: [{ dir: sjawhar }],
        cacheRoot,
      });

      const cmd = (config.command as Record<string, unknown>)["public-thing"];
      expect(cmd).toBeDefined();

      const skills = (config.skills as { paths?: string[] }) ?? {};
      // No namespace on this source, so the bridge derives a hash key.
      expect(skills.paths).toContain(
        path.join(cacheRoot, computeSourceKey(sjawhar)),
      );
      const skillPath = skills.paths?.[0];
      expect(skillPath).toBeDefined();
      expect(
        existsSync(path.join(skillPath as string, "public-thing", "SKILL.md")),
      ).toBe(true);

      // No permission.skill writes anymore.
      expect((config.permission as { skill?: unknown })?.skill).toBeUndefined();
    } finally {
      rmSync(cacheRoot, { recursive: true, force: true });
    }
  });

  test("disable-model-invocation: true → command yes, skill no", async () => {
    const cacheRoot = mkdtempSync(path.join(os.tmpdir(), "ocb-int-"));
    try {
      const config = await runBridge({
        sources: [{ dir: sjawhar, namespace: "sjawhar" }],
        cacheRoot,
      });

      // Command IS present (preserves /name).
      expect(
        (config.command as Record<string, unknown>)["hidden-thing"],
      ).toBeDefined();
      // Skill file is NOT materialized.
      expect(
        existsSync(path.join(cacheRoot, "sjawhar", "hidden-thing", "SKILL.md")),
      ).toBe(false);
    } finally {
      rmSync(cacheRoot, { recursive: true, force: true });
    }
  });

  test("user-invocable: false → skill yes, command no", async () => {
    const cacheRoot = mkdtempSync(path.join(os.tmpdir(), "ocb-int-"));
    try {
      const config = await runBridge({
        sources: [{ dir: sjawhar, namespace: "sjawhar" }],
        cacheRoot,
      });

      expect(
        (config.command as Record<string, unknown>)["user-only"],
      ).toBeUndefined();
      expect(
        existsSync(path.join(cacheRoot, "sjawhar", "user-only", "SKILL.md")),
      ).toBe(true);
    } finally {
      rmSync(cacheRoot, { recursive: true, force: true });
    }
  });

  test("both flags set → neither surface", async () => {
    const cacheRoot = mkdtempSync(path.join(os.tmpdir(), "ocb-int-"));
    try {
      const config = await runBridge({
        sources: [{ dir: sjawhar, namespace: "sjawhar" }],
        cacheRoot,
      });
      // Not in commands.
      expect(
        (config.command as Record<string, unknown>)["double-blocked"],
      ).toBeUndefined();
      // Not in cache.
      expect(
        existsSync(
          path.join(cacheRoot, "sjawhar", "double-blocked", "SKILL.md"),
        ),
      ).toBe(false);
    } finally {
      rmSync(cacheRoot, { recursive: true, force: true });
    }
  });

  test("prunes stale cache entries on subsequent runs with reduced sources", async () => {
    const cacheRoot = mkdtempSync(path.join(os.tmpdir(), "ocb-int-"));
    try {
      // First run: materializes everything.
      await runBridge({
        sources: [{ dir: sjawhar, namespace: "sjawhar" }],
        cacheRoot,
      });
      expect(
        existsSync(path.join(cacheRoot, "sjawhar", "public-thing", "SKILL.md")),
      ).toBe(true);

      // Second run: empty sources → prune everything.
      await runBridge({ sources: [], cacheRoot });
      expect(existsSync(path.join(cacheRoot, "sjawhar"))).toBe(false);
    } finally {
      rmSync(cacheRoot, { recursive: true, force: true });
    }
  });
});
