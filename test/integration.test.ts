import { describe, expect, mock, test } from "bun:test";
import path from "node:path";
import { createClaudeBridge } from "../src/index";

const sjawhar = path.join(import.meta.dir, "fixtures/sjawhar");

describe("createClaudeBridge", () => {
  test("populates config.agent and config.command from sources", async () => {
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
    const config: Record<string, unknown> = {};
    await configHook(config);

    expect(
      (config.agent as Record<string, unknown>)["sjawhar-bug-finder"],
    ).toBeDefined();
    expect(
      (config.command as Record<string, unknown>)["sjawhar-no-excuses"],
    ).toBeDefined();
  });

  test("warns on cross-source agent name collision", async () => {
    const logFn = mock(async () => ({}));
    const plugin = createClaudeBridge({
      // Same source twice — second pass hits every name as a collision
      sources: [
        { dir: sjawhar, namespace: "sjawhar" },
        { dir: sjawhar, namespace: "sjawhar" },
      ],
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
    await configHook({});

    const warnCalls = logFn.mock.calls.filter(
      (call) => (call[0] as { body: { level: string } }).body.level === "warn",
    );
    expect(warnCalls.length).toBeGreaterThan(0);
  });

  test("preserves pre-existing entries in config.agent/command", async () => {
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
      agent: { "pre-existing-agent": { prompt: "keep me" } },
      command: { "pre-existing-cmd": { template: "keep" } },
    };
    await configHook(config);
    expect(
      (config.agent as Record<string, unknown>)["pre-existing-agent"],
    ).toEqual({ prompt: "keep me" });
    expect(
      (config.command as Record<string, unknown>)["pre-existing-cmd"],
    ).toEqual({ template: "keep" });
  });
});
