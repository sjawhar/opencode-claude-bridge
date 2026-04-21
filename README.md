# @sjawhar/opencode-claude-bridge

Register Claude Code agents and commands into OpenCode via the plugin `config` hook. Skills are intentionally not handled — OpenCode already discovers them natively from `.claude/skills/` and `~/.claude/skills/`.

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

Each source is scanned for `<dir>/agents/*.md` and `<dir>/commands/*.md`. Skills in `<dir>/skills/` are ignored (see below).

### Source options

| Field | Type | Default | Meaning |
|---|---|---|---|
| `dir` | `string` | — (required) | Path to a directory with Claude-format `agents/` and/or `commands/` subdirs |
| `agents` | `string \| false` | `"agents"` | Subdir to scan for agent `.md` files; `false` to skip |
| `commands` | `string \| false` | `"commands"` | Subdir to scan for command `.md` files; `false` to skip |
| `namespace` | `string` | — | Prefix added to every registered agent/command name, hyphen-separated |

## Agent translation (Claude `.md` → OpenCode `config.agent`)

| Claude frontmatter | OpenCode config | Translation |
|---|---|---|
| `name` (or filename) | object key | `${namespace}-${name}` if namespace set, else `name` |
| `description` | `description` | pass through |
| `model: opus\|sonnet\|haiku` | `model` | map to `anthropic/claude-opus-4-6` / `sonnet-4-6` / `haiku-4-5`; pass through `provider/id` format; drop `inherit` |
| `tools: "Read, Edit, ..."` | `tools` | split, lowercase, build `{read: true, edit: true, ...}` |
| `color: <name>` | `color` | pass through if hex or OpenCode theme color; else drop (debug log) |
| body | `prompt` | strip frontmatter, trim |
| (none) | `mode` | `"subagent"` unless frontmatter overrides |

## Command translation (Claude `.md` → OpenCode `config.command`)

| Claude frontmatter | OpenCode config | Translation |
|---|---|---|
| filename | object key | `${namespace}-${name}` if namespace set, else `name` |
| `description` | `description` | pass through |
| body | `template` | wrap as `<command-instruction>...\n</command-instruction>\n\n<user-request>\n$ARGUMENTS\n</user-request>` |
| `agent` | `agent` | pass through |
| `model` | `model` | via agent model mapping |
| `subtask` | `subtask` | pass through |
| `handoffs` | `handoffs` | pass through |
| `argument-hint` | — | dropped (OpenCode `config.command` schema rejects it) |

## Skills

Skills are **not** handled by this plugin. OpenCode natively discovers skills from:

- `.opencode/skills/<name>/SKILL.md` (project-local OpenCode)
- `~/.config/opencode/skills/<name>/SKILL.md` (global OpenCode)
- `.claude/skills/<name>/SKILL.md` (project-local Claude compat)
- `~/.claude/skills/<name>/SKILL.md` (global Claude compat)

If you want OpenCode to see skills from an arbitrary directory, symlink them into one of the paths above (e.g. `ln -sfn /my/skills ~/.claude/skills/my-set`).

## Collision handling

When two sources produce the same final agent or command name, **the later source wins** and a `warn`-level log is emitted via `client.app.log`. Use `namespace` on each source to avoid collisions by construction.

## Logging

Runtime messages go to OpenCode's log via `client.app.log({ body: { service: "opencode-claude-bridge", level, message, extra? } })`. Levels used:

- `warn` — name collisions, file read failures
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
