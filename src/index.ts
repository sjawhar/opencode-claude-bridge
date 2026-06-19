import os from "node:os";
import path from "node:path";
import type { Plugin } from "@opencode-ai/plugin";
import type { OpencodeClient } from "@opencode-ai/sdk";
import { getCacheRoot } from "./cache-paths";
import { createLogger, type Logger } from "./logger";
import { discoverClaudePlugins } from "./plugin-discovery";
import { pruneStaleCache } from "./skill-materializer";
import { type ClaudeBridgeSource, loadSource } from "./source-loader";

export type { ClaudeBridgeSource } from "./source-loader";

export interface ClaudeBridgeDiscoveryOptions {
  /**
   * Override the claude config directory. Defaults to
   * `process.env.CLAUDE_CONFIG_DIR` or `<homedir>/.claude`.
   */
  claudeConfigDir?: string;
  /** Override cwd for project-level settings lookup. Defaults to `process.cwd()`. */
  cwd?: string;
}

export interface ClaudeBridgeConfig {
  sources: ClaudeBridgeSource[];
  claudePlugins?: boolean | ClaudeBridgeDiscoveryOptions;
  /**
   * Override the cache root for materialized skills. Defaults to
   * `$XDG_CACHE_HOME/opencode-claude-bridge/skills`. Tests use this to point
   * at a tmpdir; users rarely need to.
   */
  cacheRoot?: string;
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
    const cacheRoot = bridgeConfig.cacheRoot ?? getCacheRoot();
    return {
      config: async (config: Record<string, unknown>) => {
        const agentMap = (config.agent ??= {}) as Record<string, unknown>;
        const commandMap = (config.command ??= {}) as Record<string, unknown>;
        const skills = (config.skills ??= {}) as {
          paths?: string[];
          urls?: string[];
        };
        const skillPaths = (skills.paths ??= []);

        let allSources: ClaudeBridgeSource[] = bridgeConfig.sources;
        if (bridgeConfig.claudePlugins) {
          const opts =
            bridgeConfig.claudePlugins === true
              ? {}
              : bridgeConfig.claudePlugins;
          const claudeConfigDir =
            opts.claudeConfigDir ??
            process.env.CLAUDE_CONFIG_DIR ??
            path.join(os.homedir(), ".claude");
          const cwd = opts.cwd ?? process.cwd();
          const discovered = await discoverClaudePlugins({
            claudeConfigDir,
            cwd,
            logger,
          });
          allSources = [...bridgeConfig.sources, ...discovered];
        }

        const liveSkillPaths = new Set<string>();

        for (const source of allSources) {
          const loaded = await loadSource(source, logger, { cacheRoot });

          for (const [baseName, cfg] of Object.entries(loaded.agents)) {
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

          for (const [baseName, cfg] of Object.entries(loaded.commands)) {
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

          for (const p of loaded.skillCachePushPaths) {
            if (!skillPaths.includes(p)) skillPaths.push(p);
          }

          for (const sp of loaded.materializedSkillPaths) {
            liveSkillPaths.add(sp);
          }
        }

        await pruneStaleCache(cacheRoot, liveSkillPaths, logger);
      },
    };
  };
}
