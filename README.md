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

Each source is scanned for `<dir>/agents/*.md`, `<dir>/commands/*.md`, and `<dir>/skills/*/SKILL.md`. Skills are registered as slash-commands, have their `disable-model-invocation: true` flag respected (see below), and have their `mcp:` frontmatter block translated into OpenCode `config.mcp` entries.

### Source options

| Field | Type | Default | Meaning |
|---|---|---|---|
| `dir` | `string` | — (required) | Path to a directory with Claude-format `agents/` and/or `commands/` subdirs |
| `agents` | `string \| false` | `"agents"` | Subdir to scan for agent `.md` files; `false` to skip |
| `commands` | `string \| false` | `"commands"` | Subdir to scan for command `.md` files; `false` to skip |
| `skills` | `string \| false` | `"skills"` | Subdir to scan for skill `SKILL.md` files (registered as commands, with `mcp:` blocks extracted and `disable-model-invocation: true` enforced as `deny` permissions); `false` to skip |
| `namespace` | `string` | — | Used as a fallback prefix on name collisions — see [Collision handling](#collision-handling) |

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

## Skill permissions (disable-model-invocation)

Claude's `disable-model-invocation: true` frontmatter field hides a skill from the model's auto-discovery but keeps it user-invocable via slash command. OpenCode doesn't natively honor this field — skills with it are fully auto-invocable by the model.

This bridge bridges the gap: for each SKILL.md with `disable-model-invocation: true` in a source's `skills/` subdir, it adds `config.permission.skill[<name>] = "deny"`. Result: the model can't see or invoke the skill, but the user can still run it via `/<name>`.

Source option to skip skill scanning:

```ts
createBridge({
  sources: [
    { dir: "/path", skills: false },  // don't scan skills at all
    { dir: "/other", skills: "my-skills" },  // custom subdir name
  ],
});
```

If a skill already has a different permission set in `config.permission.skill[<name>]`, the bridge will overwrite it with `"deny"` and log a warning.

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

Beyond permissions and MCPs, skill bodies are left to OpenCode's native discovery. OpenCode scans:

- `.opencode/skills/<name>/SKILL.md` (project-local OpenCode)
- `~/.config/opencode/skills/<name>/SKILL.md` (global OpenCode)
- `.claude/skills/<name>/SKILL.md` (project-local Claude compat)
- `~/.claude/skills/<name>/SKILL.md` (global Claude compat)

If you want OpenCode to see skills from an arbitrary directory, symlink them into one of the paths above (e.g. `ln -sfn /my/skills ~/.claude/skills/my-set`).

## Collision handling

When a source produces a name that already exists in the target map (`config.agent`, `config.command`, or `config.mcp`), the bridge uses `${namespace}${separator}${baseName}` as a fallback — `/` separator for agents and commands, `-` for MCPs (to keep tool names within the Anthropic API's `^[a-zA-Z0-9_-]{1,128}$` allowlist). Without a namespace, the bridge overwrites the existing entry and logs a `warn`. Use `namespace` on each source to avoid collisions by construction.

## Logging

Runtime messages go to OpenCode's log via `client.app.log({ body: { service: "opencode-claude-bridge", level, message, extra? } })`. Levels used:

- `warn` — collision overwrites, duplicate names within a source, malformed `mcp:` shapes, file read or skill translation failures, overriding existing skill permissions
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
