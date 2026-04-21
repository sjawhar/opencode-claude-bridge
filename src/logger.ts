import type { OpencodeClient } from "@opencode-ai/sdk";

type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug: (message: string, extra?: unknown) => Promise<void>;
  info: (message: string, extra?: unknown) => Promise<void>;
  warn: (message: string, extra?: unknown) => Promise<void>;
  error: (message: string, extra?: unknown) => Promise<void>;
}

const SERVICE = "opencode-claude-bridge";

export function createLogger(client: OpencodeClient | undefined): Logger {
  const log = async (level: LogLevel, message: string, extra?: unknown) => {
    if (client) {
      try {
        await client.app.log({
          body: {
            service: SERVICE,
            level,
            message,
            extra: extra as { [key: string]: unknown } | undefined,
          },
        });
        return;
      } catch {
        // fall through to console
      }
    }
    const prefix = `[${SERVICE}] ${level}:`;
    const msg = `${prefix} ${message}`;
    const args = extra === undefined ? [msg] : [msg, extra];
    switch (level) {
      case "error":
        console.error(...args);
        break;
      case "warn":
        console.warn(...args);
        break;
      default:
        console.log(...args);
    }
  };

  return {
    debug: (m, e) => log("debug", m, e),
    info: (m, e) => log("info", m, e),
    warn: (m, e) => log("warn", m, e),
    error: (m, e) => log("error", m, e),
  };
}
