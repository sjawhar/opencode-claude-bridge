# @sjawhar/opencode-claude-bridge

Register Claude Code agents and commands into OpenCode via the plugin `config` hook. Skills are intentionally not handled — OpenCode already discovers them natively from `.claude/skills/` and `~/.claude/skills/`.

## Usage

```ts
import { createClaudeBridge } from "@sjawhar/opencode-claude-bridge";

export const MyBridge = createClaudeBridge({
  sources: [
    { dir: "/path/to/plugins/sjawhar", namespace: "sjawhar" },
    { dir: ".claude" },  // project-relative also works when OpenCode resolves it
  ],
});
```

Each source directory is scanned for `<dir>/agents/*.md` and `<dir>/commands/*.md`. Translation details in `src/agent-translator.ts` and `src/command-translator.ts`.
