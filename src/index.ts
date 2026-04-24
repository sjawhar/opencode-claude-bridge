import type { Plugin } from "@opencode-ai/plugin";
import type { OpencodeClient } from "@opencode-ai/sdk";
import { createLogger, type Logger } from "./logger";
import type { TranslatedMcp } from "./mcp-translator";
import { type ClaudeBridgeSource, loadSource } from "./source-loader";

export type { ClaudeBridgeSource } from "./source-loader";

export interface ClaudeBridgeConfig {
  sources: ClaudeBridgeSource[];
}

async function registerWithCollision<T>(
  map: Record<string, unknown>,
  baseName: string,
  value: T,
  kind: string,
  namespace: string | undefined,
  separator: string,
  logger: Logger,
): Promise<void> {
  if (!map[baseName]) {
    map[baseName] = value;
    return;
  }
  if (namespace) {
    const prefixedName = `${namespace}${separator}${baseName}`;
    if (!map[prefixedName]) {
      map[prefixedName] = value;
      await logger.info(
        `collision: ${kind} "${baseName}" already taken; registered as "${prefixedName}"`,
      );
      return;
    }
    map[prefixedName] = value;
    await logger.warn(
      `collision: ${kind} both "${baseName}" and "${prefixedName}" already taken; overwriting "${prefixedName}"`,
    );
    return;
  }
  map[baseName] = value;
  await logger.warn(
    `collision: ${kind} "${baseName}" already taken and no namespace to fall back to; overwriting`,
  );
}

export function createClaudeBridge(bridgeConfig: ClaudeBridgeConfig): Plugin {
  return async ({ client }) => {
    const logger = createLogger(client as OpencodeClient);
    return {
      config: async (config: Record<string, unknown>) => {
        const agentMap = (config.agent ??= {}) as Record<string, unknown>;
        const commandMap = (config.command ??= {}) as Record<string, unknown>;
        const mcpMap = (config.mcp ??= {}) as Record<string, unknown>;
        const skillPerms = (config.permission ??= {}) as Record<
          string,
          unknown
        >;
        const skillMap = (skillPerms.skill ??= {}) as Record<string, unknown>;

        for (const source of bridgeConfig.sources) {
          const { agents, commands, skillCommands, deniedSkills, skillMcps } =
            await loadSource(source, logger);

          for (const [baseName, cfg] of Object.entries(agents)) {
            await registerWithCollision(
              agentMap,
              baseName,
              cfg,
              "agent",
              source.namespace,
              "/",
              logger,
            );
          }

          for (const [baseName, cfg] of Object.entries(commands)) {
            await registerWithCollision(
              commandMap,
              baseName,
              cfg,
              "command",
              source.namespace,
              "/",
              logger,
            );
          }

          for (const [baseName, cfg] of Object.entries(skillCommands)) {
            await registerWithCollision(
              commandMap,
              baseName,
              cfg,
              "skill-command",
              source.namespace,
              "/",
              logger,
            );
          }

          for (const [mcpName, mcpCfg] of Object.entries(
            skillMcps as Record<string, TranslatedMcp>,
          )) {
            await registerWithCollision(
              mcpMap,
              mcpName,
              mcpCfg,
              "mcp",
              source.namespace,
              "-",
              logger,
            );
          }

          for (const name of deniedSkills) {
            if (skillMap[name] && skillMap[name] !== "deny") {
              await logger.warn(
                `Skill "${name}" permission overridden to "deny" (was "${skillMap[name]}")`,
              );
            }
            skillMap[name] = "deny";
          }
        }
      },
    };
  };
}
