import type { Plugin } from "@opencode-ai/plugin";
import type { OpencodeClient } from "@opencode-ai/sdk";
import { createLogger } from "./logger";
import { type ClaudeBridgeSource, loadSource } from "./source-loader";

export type { ClaudeBridgeSource } from "./source-loader";

export interface ClaudeBridgeConfig {
  sources: ClaudeBridgeSource[];
}

export function createClaudeBridge(bridgeConfig: ClaudeBridgeConfig): Plugin {
  return async ({ client }) => {
    const logger = createLogger(client as OpencodeClient);
    return {
      config: async (config: Record<string, unknown>) => {
        const agentMap = (config.agent ??= {}) as Record<string, unknown>;
        const commandMap = (config.command ??= {}) as Record<string, unknown>;

        for (const source of bridgeConfig.sources) {
          const { agents, commands } = await loadSource(source, logger);

          // Register agents with collision-fallback logic
          for (const [baseName, cfg] of Object.entries(agents)) {
            if (!agentMap[baseName]) {
              // No collision: register under baseName
              agentMap[baseName] = cfg;
            } else if (source.namespace) {
              // Collision with namespace: try prefixed name
              const prefixedName = `${source.namespace}/${baseName}`;
              if (!agentMap[prefixedName]) {
                // Prefixed name is free: register there
                agentMap[prefixedName] = cfg;
                await logger.info(
                  `collision: agent "${baseName}" already taken; registered as "${prefixedName}"`,
                );
              } else {
                // Both baseName and prefixed name taken: overwrite prefixed
                agentMap[prefixedName] = cfg;
                await logger.warn(
                  `collision: both "${baseName}" and "${prefixedName}" already taken; overwriting "${prefixedName}"`,
                );
              }
            } else {
              // Collision without namespace: overwrite baseName
              agentMap[baseName] = cfg;
              await logger.warn(
                `collision: agent "${baseName}" already taken and no namespace to fall back to; overwriting`,
              );
            }
          }

          // Register commands with collision-fallback logic
          for (const [baseName, cfg] of Object.entries(commands)) {
            if (!commandMap[baseName]) {
              // No collision: register under baseName
              commandMap[baseName] = cfg;
            } else if (source.namespace) {
              // Collision with namespace: try prefixed name
              const prefixedName = `${source.namespace}/${baseName}`;
              if (!commandMap[prefixedName]) {
                // Prefixed name is free: register there
                commandMap[prefixedName] = cfg;
                await logger.info(
                  `collision: command "${baseName}" already taken; registered as "${prefixedName}"`,
                );
              } else {
                // Both baseName and prefixed name taken: overwrite prefixed
                commandMap[prefixedName] = cfg;
                await logger.warn(
                  `collision: both "${baseName}" and "${prefixedName}" already taken; overwriting "${prefixedName}"`,
                );
              }
            } else {
              // Collision without namespace: overwrite baseName
              commandMap[baseName] = cfg;
              await logger.warn(
                `collision: command "${baseName}" already taken and no namespace to fall back to; overwriting`,
              );
            }
          }
        }
      },
    };
  };
}
