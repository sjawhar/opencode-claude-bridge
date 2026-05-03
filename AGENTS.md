# PROJECT KNOWLEDGE BASE

**Project:** `@sjawhar/opencode-claude-bridge`
**Generated:** 2026-05-03 (UTC)
**Commit:** `ce2ce45c` (main)

## OVERVIEW
OpenCode plugin that translates Claude Code `agents/`, `commands/`, and `skills/` (.md + YAML frontmatter) into entries on OpenCode `config.agent`, `config.command`, `config.mcp`, and `config.permission.skill` via the plugin `config` hook. ~824 LOC TypeScript, runs on Bun, single npm package (no monorepo).

## STRUCTURE
```
.
├── src/                 # 13 flat .ts modules — NO subdirs, NO barrel files
├── test/                # 13 *.test.ts (1:1 with src/) + integration.test.ts
│   └── fixtures/        # sjawhar/ (real layout), yaml-quirks/ (regressions), empty/
├── .github/workflows/   # ci.yml (lint+typecheck+test+build, parallel) + publish.yml
├── biome.json           # lint+format (NOT eslint/prettier)
├── bun.lock             # Bun lockfile — frozen in CI
└── tsconfig.json        # strict, ES2022, ESM, rootDir=src
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Plugin entry / collision logic | `src/index.ts` → `createClaudeBridge`, `registerWithCollision` |
| Per-source orchestration | `src/source-loader.ts` → `loadSource`, `scanSkills` |
| Agent `.md` → config | `src/agent-translator.ts` |
| Command `.md` → config | `src/command-translator.ts` |
| Skill `SKILL.md` → command + permission + MCP | `src/skill-translator.ts` |
| YAML `mcp:` block → `config.mcp` (local + remote) | `src/mcp-translator.ts` |
| YAML frontmatter splitter | `src/frontmatter.ts` (uses `yaml` package) |
| Claude model alias map (`opus`/`sonnet`/`haiku`) | `src/model-mapper.ts` |
| Tools whitelist (`CANONICAL_TOOLS` Set) | `src/tools-parser.ts` |
| YAML scalar → string coercion | `src/coerce.ts` (`asScalarString`) |
| Color validation (hex + theme set) | `src/color-mapper.ts` |
| Path rewrite `~/.claude/` → `~/.config/opencode/` | `src/rewrite-paths.ts` |
| Logger (OpenCode client OR console fallback) | `src/logger.ts` |
| Collision + permission + namespace integration tests | `test/integration.test.ts` |
| YAML scalar quirks regression tests | `test/yaml-quirks.test.ts` |

## CODE MAP
| Symbol | Kind | Location | Role |
|--------|------|----------|------|
| `createClaudeBridge` | fn | `src/index.ts:47` | Public plugin factory (only public export besides `ClaudeBridgeSource`) |
| `registerWithCollision` | fn | `src/index.ts:13` | Namespace fallback (`/` agents+commands, `-` MCPs) |
| `loadSource` | fn | `src/source-loader.ts:83` | Walks one source's agents/commands/skills subdirs |
| `scanSkills` | fn | `src/source-loader.ts:39` | Per-skill subdirectory scanner (each skill is `<dir>/<name>/SKILL.md`) |
| `translateAgentFile` | fn | `src/agent-translator.ts:32` | Returns `null` on failure; logs `warn` |
| `translateCommandFile` | fn | `src/command-translator.ts:30` | Wraps body in `<command-instruction>` template |
| `translateSkillFile` | fn | `src/skill-translator.ts:32` | Returns `{ baseName, disabled, config, mcps }` — triple output |
| `translateMcpBlock` | fn | `src/mcp-translator.ts:121` | Validates each server; skips malformed with `warn` |
| `parseFrontmatter<T>` | fn | `src/frontmatter.ts:10` | Returns `{ data: T, body: string }`; tolerant of malformed YAML |
| `mapClaudeModel` | fn | `src/model-mapper.ts:9` | `"inherit"` → undefined; aliases → `anthropic/...` |
| `parseToolsList` | fn | `src/tools-parser.ts:20` | Drops unknown tools at `debug` level |
| `mapClaudeColor` | fn | `src/color-mapper.ts:12` | Hex `^#[0-9a-fA-F]{3,8}$` OR theme set; else undefined |
| `asScalarString` | fn | `src/coerce.ts:9` | Stringifies primitives; rejects objects/arrays |
| `rewriteClaudePaths` | fn | `src/rewrite-paths.ts:1` | Global string replace on agent prompts + command/skill bodies |
| `createLogger` | fn | `src/logger.ts:14` | Returns async `{debug,info,warn,error}` |
| `ClaudeBridgeSource` | iface | `src/source-loader.ts:10` | `{ dir, namespace?, agents?, commands?, skills? }` |
| `TranslatedMcp` | type | `src/mcp-translator.ts:20` | Discriminated union: `local` (command[]) or `remote` (url) |

## CONVENTIONS
- **Bun-first**: dev runtime is Bun 1.3.11, tests run via `bun:test`, lockfile is `bun.lock`. CI uses `--frozen-lockfile`. DO NOT add npm/pnpm/yarn scripts.
- **Linter+formatter**: Biome (`biome.json`). 2-space, double quotes, always semicolons. `noAssignInExpressions: off` — assignments inside conditionals are intentionally allowed (see `??=` patterns in `index.ts:52-59`).
- **TypeScript**: `strict: true`, ES2022, ESNext, `moduleResolution: "Bundler"`, `rootDir: src`. Build emits ESM + `.d.ts` to `dist/`.
- **Frontmatter scalars are NATIVE YAML types** (number, boolean, null) — not strings. Always pipe through `asScalarString()` before treating as text. The `yaml` package swap broke the old "everything is a string" assumption; `test/yaml-quirks.test.ts` is the regression suite. DO NOT use `String(value)` directly.
- **Translators never throw** — they `return null` and log `warn`. The pipeline relies on graceful skip semantics; throwing breaks `loadSource`.
- **Logger is async + injected**, never global. `Logger` methods return `Promise<void>` — `await` them. Falls back to `console` when `client` is `undefined` (tests).
- **Collision separator**: `/` for agents and commands, `-` for MCPs. The `-` is mandatory for MCPs because Anthropic tool names must match `^[a-zA-Z0-9_-]{1,128}$`.
- **Body wrapping** for commands and skills is exactly `<command-instruction>\n…\n</command-instruction>\n\n<user-request>\n$ARGUMENTS\n</user-request>` (`command-translator.ts:49`, `skill-translator.ts:55`). Change both call sites together.
- **JJ, not git**: this user uses Jujutsu. NEVER `git commit` / `git push`. Use `jj describe`, `jj new`, `jj git push`. See workspace `AGENTS.md`/`CLAUDE.md` overrides.

## ANTI-PATTERNS (THIS PROJECT)
- DO NOT add `as any` or `@ts-ignore` — strict mode is enforced. Use `unknown` + type guards (see `isPlainObject`, `toStringArray`, `toStringMap` in `mcp-translator.ts`).
- DO NOT throw out of `translate*File`. Caller skips on `null`. Throwing aborts the whole source load.
- DO NOT use `/` separator for MCP collision fallback — breaks Anthropic tool-name regex. Use `-` only.
- DO NOT call `String(yamlValue)` on frontmatter — coerces objects/arrays to garbage. Use `asScalarString` from `src/coerce.ts`.
- DO NOT bypass `registerWithCollision` when adding new register loops in `index.ts`. Every map write goes through it for uniform `info`/`warn` semantics (see test cases in `test/integration.test.ts`).
- DO NOT pass `argument-hint` through to OpenCode `config.command` — its schema rejects the field. The bridge intentionally drops it.
- DO NOT manually bump `package.json` version — `publish.yml` derives version from conventional commits and rewrites it.
- DO NOT publish `provenance` (`NPM_CONFIG_PROVENANCE: false` in `publish.yml`) — explicit choice; don't enable.

## UNIQUE STYLES
- **Path rewrite is destructive global replace** (`src/rewrite-paths.ts`): applies to agent prompts and command/skill template bodies. Skill bodies passed to OpenCode native skill discovery are NOT rewritten — only the body that becomes the slash-command template is.
- **Skill is triple-purpose**: one `SKILL.md` becomes (a) entry in `config.command`, (b) optional `config.permission.skill[name] = "deny"` if `disable-model-invocation: true`, and (c) zero-or-more `config.mcp[serverName]` entries from frontmatter `mcp:` block. All three flow out of `translateSkillFile` in one pass.
- **Local MCP `command` is normalized to a single `string[]`** by concatenating `command + args` (`mcp-translator.ts:113`). Both shapes work in input: string `command` + array `args`, OR array `command` with no `args`.
- **Agent `mode` defaults to `"subagent"`**. Only `"primary"` agents get `model` populated (`agent-translator.ts:60`).
- `model: "inherit"` is dropped (returns `undefined`) — OpenCode handles inheritance natively.
- Color validator silently drops unknown values at `debug` level (not `warn`) — colors are cosmetic.

## COMMANDS
```bash
bun install                           # add --frozen-lockfile in CI
bun test                              # all tests (bun:test)
bun test test/foo.test.ts             # single file
bun run typecheck                     # tsc --noEmit
bun run lint                          # biome check src/ test/
bunx biome check --write src/ test/   # auto-fix
bun run build                         # ESM bundle + .d.ts emit → dist/
```

## RELEASE
Auto on push to `main` (`.github/workflows/publish.yml`):
- Conventional commits since latest `v*` tag determine bump: `feat!:` / `fix(scope)!:` / `BREAKING CHANGE` → major; `feat:` → minor; `fix:` → patch. No matching commits → no release.
- First release uses current `package.json` version (no tags yet).
- Publish is idempotent — checks `npm view @sjawhar/opencode-claude-bridge@<v>` first.
- On success: rewrites `package.json`, commits `chore: release v… [skip ci]`, tags `v…`, pushes both.

## NOTES
- `dist/` is in `.gitignore` but **published** (`"files": ["dist"]` in `package.json`). Do not commit it.
- `@opencode-ai/sdk` is a **type-only** import (`OpencodeClient`); not a runtime dep.
- The plugin shape is `(ctx) => Promise<{ config: (config) => Promise<void> }>`. The `config` hook **mutates `config` in place** — it is the live OpenCode config object, not a copy.
- Test fixtures `test/fixtures/sjawhar/` and `test/fixtures/yaml-quirks/` mirror real Claude `.claude/` layouts. Many tests reference exact filenames (`bug-finder`, `no-excuses`, `hidden-thing`, `derived-name`, `public-thing`, `slack`, `playwright`, `upstream`) — rename with care.
