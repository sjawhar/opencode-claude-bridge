import { describe, expect, mock, test } from "bun:test";
import { createLogger } from "../src/logger";

describe("createLogger", () => {
  test("calls client.app.log when client provided", async () => {
    const logFn = mock(async () => ({}));
    const client = { app: { log: logFn } };
    const logger = createLogger(client as never);
    await logger.warn("hello", { foo: 1 });
    expect(logFn).toHaveBeenCalledWith({
      body: {
        service: "opencode-claude-bridge",
        level: "warn",
        message: "hello",
        extra: { foo: 1 },
      },
    });
  });

  test("falls back to console.warn when no client", async () => {
    const origWarn = console.warn;
    const calls: unknown[][] = [];
    console.warn = (...args: unknown[]) => {
      calls.push(args);
    };
    try {
      const logger = createLogger(undefined);
      await logger.warn("hello");
      expect(calls.length).toBe(1);
      expect(calls[0][0]).toContain("[opencode-claude-bridge]");
      expect(calls[0][0]).toContain("hello");
    } finally {
      console.warn = origWarn;
    }
  });
});
