# @sjawhar/opencode-claude-bridge

Register Claude Code agents, commands, and skill-embedded MCP servers into OpenCode via the plugin `config` hook.

## Install

```bash
bun add @sjawhar/opencode-claude-bridge
# or
npm install @sjawhar/opencode-claude-bridge
```

## Usage

```ts
// ~/.config/opencode/plugins/my-bridge.ts  (global)
// or .opencode/plugins/my-bridge.ts          (project)

import { createClaudeBridge } from "@sjawhar/opencode-claude-bridge";
import path from "node:path";
import os from "node:os";

export const MyBridge = createClaudeBridge({
  sources: [
    { dir: path.join(os.homedir(), ".dotfiles/plugins/sjawhar"), namespace: "sjawhar" },
    { dir: ".claude" }, // project-relative — resolved by OpenCode at load time
  ],
});
```

Each source is scanned for `<dir>/agents/*.md`, `<dir>/commands/*.md`, and `<dir>/skills/*/SKILL.md`. Skills register **dually**: as opencode skills (via `config.skills.paths`) and as slash-commands (via `config.command`), so the model sees them in `<available_skills>` and users can still type `/<name>`. Per-skill surface control follows the official Claude Code frontmatter — `disable-model-invocation: true` suppresses skill registration (model can't see it; user can still `/<name>`); `user-invocable: false` suppresses command registration (model can see it; not in the `/` menu). The `mcp:` block is still translated into `config.mcp` entries regardless of which surface(s) the skill registers on.

### Source options

| Field | Type | Default | Meaning |
|---|---|---|---|
| `dir` | `string` | — (required) | Path to a directory with Claude-format `agents/` and/or `commands/` subdirs |
| `agents` | `string \| false` | `"agents"` | Subdir to scan for agent `.md` files; `false` to skip |
| `commands` | `string \| false` | `"commands"` | Subdir to scan for command `.md` files; `false` to skip |
| `skills` | `string \| false` | `"skills"` | Subdir to scan for skill `SKILL.md` files. Each skill registers as an opencode skill (materialized into the bridge cache, then pushed via `config.skills.paths`) AND as a slash-command (in `config.command`), unless suppressed by `disable-model-invocation: true` or `user-invocable: false` frontmatter. `mcp:` blocks are extracted into `config.mcp`. Pass `false` to skip skill scanning entirely. |
| `namespace` | `string` | — | Used as a fallback prefix on name collisions — see [Collision handling](#collision-handling) |

## Skill cache

The bridge writes a normalized `SKILL.md` for every model-visible skill into a bridge-owned cache, defaulting to `$XDG_CACHE_HOME/opencode-claude-bridge/skills/<source-key>/<skill-name>/SKILL.md` (`~/.cache/opencode-claude-bridge/skills/...` when XDG is unset). Opencode discovers these via `config.skills.paths`.

The materialization step:

- Synthesizes the frontmatter `name` from the parent directory when omitted (opencode requires `name` in frontmatter or skips the skill — the bridge fills it in).
- Expands `${CLAUDE_PLUGIN_ROOT}` tokens in the body to the original source dir, so links and shell args inside the skill body resolve correctly.
- Is idempotent — only rewrites a cached `SKILL.md` when its content changes (content compare, no mtime games).
- Prunes stale entries on each `config` hook run: removing a source (or uninstalling a marketplace plugin) cleans itself up.

Override the cache root with `cacheRoot` on `createClaudeBridge`:

```ts
createClaudeBridge({
  sources: [...],
  cacheRoot: "/custom/cache/path",
});
```

Tests use this to point at a tmpdir. Users almost never need to override it.

## Claude Code marketplace plugin discovery

Set `claudePlugins: true` to automatically load every plugin that claude code's settings consider enabled, at both user scope (`<CLAUDE_CONFIG_DIR>/settings.json`) and project scope (`<cwd>/.claude/settings.json`):

```ts
createClaudeBridge({
  sources: [...your hand-listed sources...],
  claudePlugins: true,
});
```

This means the same `enabledPlugins` flag that controls what claude code loads also controls what OpenCode picks up — no second config edit needed when you `/plugin install` something new.

Discovery algorithm:

1. Reads `enabledPlugins` from both settings files. Project settings override user settings on key conflict.
2. Enumerates plugins from `<CLAUDE_CONFIG_DIR>/plugins/installed_plugins.json` (v2 or v3 format) **and** from the directory layout `<CLAUDE_CONFIG_DIR>/plugins/cache/<marketplace>/<plugin>/<version>/`. The union of both is the candidate set.
3. A plugin loads unless `enabledPlugins` explicitly maps its key to `false`. Absence means enabled — matching claude code's default behavior.
4. Path resolution prefers `installed_plugins.json` (canonical) and falls back to the cache directory (handles claude's "orphaned" plugins where the registry entry was pruned but files remain on disk). Multiple versions in cache → newest mtime wins.
5. Each resolved plugin becomes a `ClaudeBridgeSource` with `dir = <installPath>` and `namespace = <plugin name>`. Existing translators handle `agents/`, `commands/`, and `skills/`.

Discovered sources are concatenated **after** hand-listed sources, so your explicit `sources` entries occupy unprefixed slots; discovered plugins fall back to namespace-prefixed names on collision (per the existing collision handler).

### Install hints for unresolved plugins

When `enabledPlugins` references a plugin that is **not installed on disk** (no `installed_plugins.json` entry and nothing in the cache dir), the bridge emits a warning that tells the user exactly how to install it via Claude Code. If the project's `extraKnownMarketplaces` declares the plugin's marketplace as a github source, the warning includes both commands:

```text
Plugin "verification-skills@verification-skills" is enabled in settings but not installed.
Run in Claude Code (in this project):
  /plugin marketplace add theorem-labs/verification-skills
  /plugin install verification-skills@verification-skills
```

If the marketplace is not declared (or is a non-github source), the warning falls back to the `/plugin install` line only. The bridge itself never auto-installs — anyone with write access to a project's `.claude/settings.json` could otherwise declare an arbitrary marketplace, so installs stay an explicit user action in Claude Code.

### Test overrides

Pass an object for explicit control (used by the test suite to inject fixture directories):

```ts
createClaudeBridge({
  sources: [],
  claudePlugins: {
    claudeConfigDir: "/tmp/fake-claude-home",
    cwd: "/tmp/fake-project",
  },
});
```

| Field | Default | Meaning |
|---|---|---|
| `claudeConfigDir` | `process.env.CLAUDE_CONFIG_DIR` or `<homedir>/.claude` | Where to look for `settings.json` and `plugins/` |
| `cwd` | `process.cwd()` | Where to look for `<cwd>/.claude/settings.json` (project-scoped enables) |

## Root-level `.mcp.json` and `${CLAUDE_PLUGIN_ROOT}`

Plugins that ship MCP servers at the plugin root (alongside `agents/` and `skills/`) — not embedded in skill frontmatter — are also picked up. The file uses the same schema as Claude's `.mcp.json`:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "${CLAUDE_PLUGIN_ROOT}/bin/server.sh",
      "args": ["--config", "${CLAUDE_PLUGIN_ROOT}/etc/cfg.toml"]
    }
  }
}
```

The `${CLAUDE_PLUGIN_ROOT}` token is expanded to the source's absolute `dir` value (the plugin install path for discovered sources, or the explicit `dir` for hand-listed sources). Expansion applies to:

- Every MCP server's `command`, `args`, `env`, `cwd`, and `url` (mandatory — these become shell exec args).
- Agent prompts, command bodies, and skill bodies (cosmetic — keeps content shown to the LLM internally consistent).

This loader runs on **every** source, not just discovered ones. Hand-listed sources can ship a `.mcp.json` at their `dir` root if needed.

## Agent translation (Claude `.md` → OpenCode `config.agent`)

| Claude frontmatter | OpenCode config | Translation |
|---|---|---|
| `name` (or filename) | object key | `name` (or filename if no `name`); on collision falls back to `${namespace}/${name}` — see [Collision handling](#collision-handling) |
| `description` | `description` | pass through |
| `model: opus\|sonnet\|haiku` | `model` | map to `anthropic/claude-opus-4-6` / `sonnet-4-6` / `haiku-4-5`; pass through `provider/id` format; drop `inherit` |
| `tools: "Read, Edit, ..."` | `tools` | split, lowercase, build `{read: true, edit: true, ...}` |
| `color: <name>` | `color` | pass through if hex or OpenCode theme color; else drop (debug log) |
| body | `prompt` | strip frontmatter, trim |
| (none) | `mode` | `"subagent"` unless frontmatter overrides |

## Command translation (Claude `.md` → OpenCode `config.command`)

| Claude frontmatter | OpenCode config | Translation |
|---|---|---|
| filename | object key | filename (without `.md`); on collision falls back to `${namespace}/${name}` — see [Collision handling](#collision-handling) |
| `description` | `description` | pass through |
| body | `template` | wrap as `<command-instruction>...\n</command-instruction>\n\n<user-request>\n$ARGUMENTS\n</user-request>` |
| `agent` | `agent` | pass through |
| `model` | `model` | via agent model mapping |
| `subtask` | `subtask` | pass through |
| `handoffs` | `handoffs` | pass through |
| `argument-hint` | — | dropped (OpenCode `config.command` schema rejects it) |

## Model-invocation suppression (`disable-model-invocation`)

Claude Code's `disable-model-invocation: true` frontmatter field hides a skill from the model's auto-discovery but keeps it user-invocable. The bridge honors this by **not materializing the skill into the cache** — the skill never reaches `config.skills.paths`, so opencode's model-side discovery doesn't see it. The slash-command registration (`config.command[<name>]`) still happens, so `/<name>` continues to work for explicit user invocation.

### Behavior change (v0.5+)

Previously the bridge wrote `config.permission.skill[<name>] = "deny"` whenever a skill had `disable-model-invocation: true`. That write is now removed. Suppression happens via the path-push mechanism — the bridge simply doesn't materialize/push skills with `disable-model-invocation: true`, so opencode never sees them via the bridge.

If you need belt-and-suspenders coverage against opencode's other native discovery paths (`~/.claude/skills/<name>/`, `.agents/skills/<name>/`, etc.), set `config.permission.skill[<name>] = "deny"` yourself in your opencode config — the bridge no longer does this for you.

## User-invocable suppression (`user-invocable`)

Claude Code's `user-invocable: false` frontmatter field hides a skill from the `/` menu while keeping it model-invocable. The bridge honors this by skipping the slash-command registration: the model sees the skill (via `config.skills.paths`) but the `/` menu doesn't list it.

Setting both `disable-model-invocation: true` AND `user-invocable: false` removes the skill from both surfaces.

## Skill MCP servers (frontmatter `mcp:` block)

OpenCode natively discovers `SKILL.md` files but only reads a small fixed set of frontmatter fields (`name`, `description`, `license`, `compatibility`, `metadata`) — any `mcp:` block is silently ignored. This bridge parses the `mcp:` block and registers each server under `config.mcp[<name>]` so the model gets the corresponding `<name>_<tool>` tools at session start.

### Supported shapes (per server)

**Local (Claude Code style)** — `command` is a string, `args` is an optional array, `env` is an optional string map:

```yaml
mcp:
  slack:
    command: secrets
    args: ["SLACK_MCP_XOXP_TOKEN", "--", "slack-mcp-server"]
    env:
      SLACK_MCP_ADD_MESSAGE_TOOL: "true"
```

Translated to `{ type: "local", command: ["secrets", "SLACK_MCP_XOXP_TOKEN", "--", "slack-mcp-server"], environment: { ... } }`.

**Local (array-command style)** — `command` is already the full `argv` array; `args`/`env` optional:

```yaml
mcp:
  playwright:
    command: ["npx", "-y", "@playwright/mcp@latest"]
```

**Remote** — `type: remote` (or presence of `url`) with `url` and optional `headers`:

```yaml
mcp:
  upstream:
    type: remote
    url: https://mcp.example.com/mcp
    headers:
      Authorization: "Bearer ${UPSTREAM_TOKEN}"
```

A server is treated as **remote** when `type: remote` or a `url` is present. Otherwise it is treated as **local** and must have a `command`. Servers with shapes that match neither (e.g. missing both `command` and `url`, or non-string `command`/`args`/`env`/`headers` values) are skipped with a `warn`-level log.

### MCP collision handling

If a server name already exists in `config.mcp` (e.g. user-defined in `opencode.json`), the bridge uses `${namespace}-${serverName}` as a fallback. Without a namespace, the bridge overwrites the existing entry and logs a warning — same policy as agents and commands. The `-` separator (vs `/` for agents/commands) keeps the resulting Anthropic tool name `<server>_<tool>` inside the `^[a-zA-Z0-9_-]{1,128}$` allowlist.

## Skills (native OpenCode discovery)

Beyond MCPs and the bridge cache, skill bodies are left to OpenCode's native discovery. OpenCode scans:

- `.opencode/skills/<name>/SKILL.md` (project-local OpenCode)
- `~/.config/opencode/skills/<name>/SKILL.md` (global OpenCode)
- `.claude/skills/<name>/SKILL.md` (project-local Claude compat)
- `~/.claude/skills/<name>/SKILL.md` (global Claude compat)
- Any path you push into `config.skills.paths` (this is what the bridge uses — see [Skill cache](#skill-cache) above).

If you want OpenCode to see skills from an arbitrary directory, either symlink them into one of the paths above OR feed them through the bridge (which materializes them into the bridge cache and pushes the cache path).

## Collision handling

When a source produces a name that already exists in the target map (`config.agent`, `config.command`, or `config.mcp`), the bridge uses `${namespace}${separator}${baseName}` as a fallback — `/` separator for agents and commands, `-` for MCPs (to keep tool names within the Anthropic API's `^[a-zA-Z0-9_-]{1,128}$` allowlist). Without a namespace, the bridge overwrites the existing entry and logs a `warn`. Use `namespace` on each source to avoid collisions by construction.

## Logging

Runtime messages go to OpenCode's log via `client.app.log({ body: { service: "opencode-claude-bridge", level, message, extra? } })`. Levels used:

- `warn` — collision overwrites, duplicate names within a source, malformed `mcp:` shapes, file read or skill translation failures
- `info` — collision fallbacks (registering under the namespaced name)
- `debug` — dropped unrecognized fields (e.g. invalid color names)

If the plugin is loaded outside OpenCode (tests, unit-level usage), messages fall back to `console`.

## Development

```bash
bun install
bun test         # all tests
bun run build    # dist/
bun run typecheck
bun run lint
```

## License

MIT
