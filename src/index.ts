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

          for (const [name, cfg] of Object.entries(agents)) {
            if (agentMap[name]) {
              await logger.warn(
                `Agent name "${name}" overwritten by source ${source.dir}`,
              );
            }
            agentMap[name] = cfg;
          }
          for (const [name, cfg] of Object.entries(commands)) {
            if (commandMap[name]) {
              await logger.warn(
                `Command name "${name}" overwritten by source ${source.dir}`,
              );
            }
            commandMap[name] = cfg;
          }
        }
      },
    };
  };
}
