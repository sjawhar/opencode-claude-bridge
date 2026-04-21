import { describe, expect, test } from "bun:test";
import path from "node:path";
import { createLogger } from "../src/logger";
import { loadSource } from "../src/source-loader";

const logger = createLogger(undefined);
const sjawhar = path.join(import.meta.dir, "fixtures/sjawhar");
const empty = path.join(import.meta.dir, "fixtures/empty");

describe("loadSource", () => {
  test("loads agents and commands from a populated source", async () => {
    const result = await loadSource(
      { dir: sjawhar, namespace: "sjawhar" },
      logger,
    );
    expect(Object.keys(result.agents)).toContain("sjawhar-bug-finder");
    expect(Object.keys(result.commands)).toContain("sjawhar-no-excuses");
  });

  test("returns empty records for dir with no agents/ or commands/", async () => {
    const result = await loadSource({ dir: empty }, logger);
    expect(result.agents).toEqual({});
    expect(result.commands).toEqual({});
  });

  test("skips agents when agents: false", async () => {
    const result = await loadSource({ dir: sjawhar, agents: false }, logger);
    expect(result.agents).toEqual({});
    expect(Object.keys(result.commands).length).toBeGreaterThan(0);
  });

  test("skips commands when commands: false", async () => {
    const result = await loadSource({ dir: sjawhar, commands: false }, logger);
    expect(result.commands).toEqual({});
    expect(Object.keys(result.agents).length).toBeGreaterThan(0);
  });

  test("supports custom agents subdir name", async () => {
    // Point at a dir where agents subdir does not exist
    const result = await loadSource(
      { dir: sjawhar, agents: "subagents" },
      logger,
    );
    expect(result.agents).toEqual({});
  });
});
