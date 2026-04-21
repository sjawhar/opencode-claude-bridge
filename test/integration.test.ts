import { describe, expect, mock, test } from "bun:test";
import path from "node:path";
import { createClaudeBridge } from "../src/index";

const sjawhar = path.join(import.meta.dir, "fixtures/sjawhar");

describe("createClaudeBridge", () => {
  test("populates config.agent and config.command from sources without namespace", async () => {
    const plugin = createClaudeBridge({
      sources: [{ dir: sjawhar }],
    });
    const hooks = await (
      plugin as (ctx: unknown) => Promise<Record<string, unknown>>
    )({
      client: { app: { log: mock(async () => ({})) } },
      directory: process.cwd(),
      worktree: process.cwd(),
      project: { path: process.cwd() },
      $: mock(() => ({})),
    });
    const configHook = hooks.config as (
      c: Record<string, unknown>,
    ) => Promise<void>;
    const config: Record<string, unknown> = {};
    await configHook(config);

    expect(
      (config.agent as Record<string, unknown>)["bug-finder"],
    ).toBeDefined();
    expect(
      (config.command as Record<string, unknown>)["no-excuses"],
    ).toBeDefined();
  });

  test("applies namespace on collision with pre-existing config entry", async () => {
    const plugin = createClaudeBridge({
      sources: [{ dir: sjawhar, namespace: "sjawhar" }],
    });
    const hooks = await (
      plugin as (ctx: unknown) => Promise<Record<string, unknown>>
    )({
      client: { app: { log: mock(async () => ({})) } },
      directory: process.cwd(),
      worktree: process.cwd(),
      project: { path: process.cwd() },
      $: mock(() => ({})),
    });
    const configHook = hooks.config as (
      c: Record<string, unknown>,
    ) => Promise<void>;
    const config: Record<string, unknown> = {
      agent: { "bug-finder": { existing: true } },
      command: { "no-excuses": { existing: true } },
    };
    await configHook(config);

    // Pre-existing entries should be untouched
    expect((config.agent as Record<string, unknown>)["bug-finder"]).toEqual({
      existing: true,
    });
    expect((config.command as Record<string, unknown>)["no-excuses"]).toEqual({
      existing: true,
    });

    // New entries should be registered under prefixed names
    expect(
      (config.agent as Record<string, unknown>)["sjawhar/bug-finder"],
    ).toBeDefined();
    expect(
      (config.command as Record<string, unknown>)["sjawhar/no-excuses"],
    ).toBeDefined();
  });

  test("falls back to overwrite with warning when no namespace and collision", async () => {
    const logFn = mock(async () => ({}));
    const plugin = createClaudeBridge({
      sources: [{ dir: sjawhar }],
    });
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
    const config: Record<string, unknown> = {
      agent: { "bug-finder": { existing: true } },
    };
    await configHook(config);

    // Should overwrite with warning
    const warnCalls = logFn.mock.calls.filter(
      (call) => (call[0] as { body: { level: string } }).body.level === "warn",
    );
    expect(warnCalls.length).toBeGreaterThan(0);
    expect(
      (config.agent as Record<string, unknown>)["bug-finder"],
    ).toBeDefined();
  });

  test("uses slash separator in namespace", async () => {
    const plugin = createClaudeBridge({
      sources: [{ dir: sjawhar, namespace: "sjawhar" }],
    });
    const hooks = await (
      plugin as (ctx: unknown) => Promise<Record<string, unknown>>
    )({
      client: { app: { log: mock(async () => ({})) } },
      directory: process.cwd(),
      worktree: process.cwd(),
      project: { path: process.cwd() },
      $: mock(() => ({})),
    });
    const configHook = hooks.config as (
      c: Record<string, unknown>,
    ) => Promise<void>;
    const config: Record<string, unknown> = {
      agent: { "bug-finder": { existing: true } },
    };
    await configHook(config);

    // Should use slash, not dash
    expect(
      (config.agent as Record<string, unknown>)["sjawhar/bug-finder"],
    ).toBeDefined();
    expect(
      (config.agent as Record<string, unknown>)["sjawhar-bug-finder"],
    ).toBeUndefined();
  });

  test("writes deny entries to config.permission.skill", async () => {
    const plugin = createClaudeBridge({
      sources: [{ dir: sjawhar }],
    });
    const hooks = await (
      plugin as (ctx: unknown) => Promise<Record<string, unknown>>
    )({
      client: { app: { log: mock(async () => ({})) } },
      directory: process.cwd(),
      worktree: process.cwd(),
      project: { path: process.cwd() },
      $: mock(() => ({})),
    });
    const configHook = hooks.config as (
      c: Record<string, unknown>,
    ) => Promise<void>;
    const config: Record<string, unknown> = {};
    await configHook(config);

    const skillPerms = config.permission as Record<string, unknown>;
    const skillMap = skillPerms.skill as Record<string, unknown>;
    expect(skillMap["hidden-thing"]).toBe("deny");
    expect(skillMap["derived-name"]).toBe("deny");
    expect(skillMap["public-thing"]).toBeUndefined();
  });

  test("warns when overriding existing non-deny permission", async () => {
    const logFn = mock(async () => ({}));
    const plugin = createClaudeBridge({
      sources: [{ dir: sjawhar }],
    });
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
    const config: Record<string, unknown> = {
      permission: {
        skill: { "hidden-thing": "allow" },
      },
    };
    await configHook(config);

    const skillPerms = config.permission as Record<string, unknown>;
    const skillMap = skillPerms.skill as Record<string, unknown>;
    expect(skillMap["hidden-thing"]).toBe("deny");
    const warnCalls = logFn.mock.calls.filter(
      (call) => (call[0] as { body: { level: string } }).body.level === "warn",
    );
    expect(warnCalls.length).toBeGreaterThan(0);
  });

  test("preserves existing unrelated skill permissions", async () => {
    const plugin = createClaudeBridge({
      sources: [{ dir: sjawhar }],
    });
    const hooks = await (
      plugin as (ctx: unknown) => Promise<Record<string, unknown>>
    )({
      client: { app: { log: mock(async () => ({})) } },
      directory: process.cwd(),
      worktree: process.cwd(),
      project: { path: process.cwd() },
      $: mock(() => ({})),
    });
    const configHook = hooks.config as (
      c: Record<string, unknown>,
    ) => Promise<void>;
    const config: Record<string, unknown> = {
      permission: {
        skill: { "other-skill": "ask" },
      },
    };
    await configHook(config);

    const skillPerms = config.permission as Record<string, unknown>;
    const skillMap = skillPerms.skill as Record<string, unknown>;
    expect(skillMap["other-skill"]).toBe("ask");
  });
  test("registers skills as commands in config.command", async () => {
    const plugin = createClaudeBridge({
      sources: [{ dir: sjawhar }],
    });
    const hooks = await (
      plugin as (ctx: unknown) => Promise<Record<string, unknown>>
    )({
      client: { app: { log: mock(async () => ({})) } },
      directory: process.cwd(),
      worktree: process.cwd(),
      project: { path: process.cwd() },
      $: mock(() => ({})),
    });
    const configHook = hooks.config as (
      c: Record<string, unknown>,
    ) => Promise<void>;
    const config: Record<string, unknown> = {};
    await configHook(config);

    const commandMap = config.command as Record<string, unknown>;
    expect(commandMap["public-thing"]).toBeDefined();
    expect(commandMap["hidden-thing"]).toBeDefined();
    expect(commandMap["derived-name"]).toBeDefined();
    // Verify they have the command template structure
    expect(
      (commandMap["public-thing"] as Record<string, unknown>).template,
    ).toContain("<command-instruction>");
  });

  test("namespaces skill-command on collision with pre-existing command", async () => {
    const plugin = createClaudeBridge({
      sources: [{ dir: sjawhar, namespace: "sjawhar" }],
    });
    const hooks = await (
      plugin as (ctx: unknown) => Promise<Record<string, unknown>>
    )({
      client: { app: { log: mock(async () => ({})) } },
      directory: process.cwd(),
      worktree: process.cwd(),
      project: { path: process.cwd() },
      $: mock(() => ({})),
    });
    const configHook = hooks.config as (
      c: Record<string, unknown>,
    ) => Promise<void>;
    const config: Record<string, unknown> = {
      command: { "public-thing": { existing: true } },
    };
    await configHook(config);

    const commandMap = config.command as Record<string, unknown>;
    // Pre-existing entry should be untouched
    expect(commandMap["public-thing"]).toEqual({ existing: true });
    // Skill should be registered under prefixed name
    expect(commandMap["sjawhar/public-thing"]).toBeDefined();
  });

  test("registers skills as commands in config.command", async () => {
    const plugin = createClaudeBridge({
      sources: [{ dir: sjawhar }],
    });
    const hooks = await (
      plugin as (ctx: unknown) => Promise<Record<string, unknown>>
    )({
      client: { app: { log: mock(async () => ({})) } },
      directory: process.cwd(),
      worktree: process.cwd(),
      project: { path: process.cwd() },
      $: mock(() => ({})),
    });
    const configHook = hooks.config as (
      c: Record<string, unknown>,
    ) => Promise<void>;
    const config: Record<string, unknown> = {};
    await configHook(config);

    const commandMap = config.command as Record<string, unknown>;
    expect(commandMap["public-thing"]).toBeDefined();
    expect(commandMap["hidden-thing"]).toBeDefined();
    expect(commandMap["derived-name"]).toBeDefined();
    // Verify they have the command template structure
    expect(
      (commandMap["public-thing"] as Record<string, unknown>).template,
    ).toContain("<command-instruction>");
  });

  test("namespaces skill-command on collision with pre-existing command", async () => {
    const plugin = createClaudeBridge({
      sources: [{ dir: sjawhar, namespace: "sjawhar" }],
    });
    const hooks = await (
      plugin as (ctx: unknown) => Promise<Record<string, unknown>>
    )({
      client: { app: { log: mock(async () => ({})) } },
      directory: process.cwd(),
      worktree: process.cwd(),
      project: { path: process.cwd() },
      $: mock(() => ({})),
    });
    const configHook = hooks.config as (
      c: Record<string, unknown>,
    ) => Promise<void>;
    const config: Record<string, unknown> = {
      command: { "public-thing": { existing: true } },
    };
    await configHook(config);

    const commandMap = config.command as Record<string, unknown>;
    // Pre-existing entry should be untouched
    expect(commandMap["public-thing"]).toEqual({ existing: true });
    // Skill should be registered under prefixed name
    expect(commandMap["sjawhar/public-thing"]).toBeDefined();
  });
});
