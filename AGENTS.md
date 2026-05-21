# PROJECT KNOWLEDGE BASE

**Project:** `@sjawhar/opencode-claude-bridge`
**Generated:** 2026-05-03 (UTC)
**Commit:** `ce2ce45c` (main)

## OVERVIEW
OpenCode plugin that translates Claude Code `agents/`, `commands/`, and `skills/` (.md + YAML frontmatter) into entries on OpenCode `config.agent`, `config.command`, `config.mcp`, and `config.skills.paths` via the plugin `config` hook. Skills dual-register (skill + command surfaces); per-skill suppression via Claude Code's official `disable-model-invocation` and `user-invocable` fields. Materialization cache lives under `$XDG_CACHE_HOME/opencode-claude-bridge/skills/`. Runs on Bun, single npm package (no monorepo).

## STRUCTURE
```
.
├── src/                 # 18 flat .ts modules — NO subdirs, NO barrel files
├── test/                # *.test.ts (1:1 with src/) + integration.test.ts + integration.claude-plugins.test.ts
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
| Skill `SKILL.md` → structured `TranslatedSkill` (body + flags + MCP + command fields) | `src/skill-translator.ts` |
| Materialize SKILL.md to bridge cache (write + prune) | `src/skill-materializer.ts` → `materializeSkill`, `pruneStaleCache` |
| XDG cache root + per-source key derivation | `src/cache-paths.ts` → `getCacheRoot`, `computeSourceKey` |
| YAML `mcp:` block → `config.mcp` (local + remote) | `src/mcp-translator.ts` |
| YAML frontmatter splitter | `src/frontmatter.ts` (uses `yaml` package) |
| Claude model alias map (`opus`/`sonnet`/`haiku`) | `src/model-mapper.ts` |
| Tools whitelist (`CANONICAL_TOOLS` Set) | `src/tools-parser.ts` |
| YAML scalar → string coercion | `src/coerce.ts` (`asScalarString`) |
| Color validation (hex + theme set) | `src/color-mapper.ts` |
| Path rewrite `~/.claude/` → `~/.config/opencode/` | `src/rewrite-paths.ts` |
| Logger (OpenCode client OR console fallback) | `src/logger.ts` |
| Collision + dual-registration + namespace integration tests | `test/integration.test.ts` |
| Dual-registration + cache integration tests | `test/integration.test.ts` (also covers `config.skills.paths` pushes and prune) |
| YAML scalar quirks regression tests | `test/yaml-quirks.test.ts` |

## CODE MAP
| Symbol | Kind | Location | Role |
|--------|------|----------|------|
| `createClaudeBridge` | fn | `src/index.ts` | Public plugin factory (only public export besides `ClaudeBridgeSource`) |
| `registerWithCollision` | fn | `src/index.ts` | Namespace fallback (`/` agents+commands, `-` MCPs) |
| `loadSource` | fn | `src/source-loader.ts` | Walks one source's agents/commands/skills subdirs |
| `scanSkills` | fn | `src/source-loader.ts` | Per-skill subdirectory scanner (each skill is `<dir>/<name>/SKILL.md`) |
| `translateAgentFile` | fn | `src/agent-translator.ts` | Returns `null` on failure; logs `warn` |
| `translateCommandFile` | fn | `src/command-translator.ts` | Wraps body in `<command-instruction>` template |
| `translateSkillFile` | fn | `src/skill-translator.ts` | Returns `TranslatedSkill { name, description?, body, disableModelInvocation, userInvocable, extraFrontmatter, mcps, commandFields }` |
| `materializeSkill` | fn | `src/skill-materializer.ts` | Writes a normalized SKILL.md to the bridge cache, idempotent via content compare |
| `pruneStaleCache` | fn | `src/skill-materializer.ts` | Removes cache entries not in the live manifest; called once per `config` hook run |
| `getCacheRoot` | fn | `src/cache-paths.ts` | Resolves `$XDG_CACHE_HOME/opencode-claude-bridge/skills` (default `~/.cache/...`) |
| `computeSourceKey` | fn | `src/cache-paths.ts` | Namespace if provided, else 12-char SHA-256 of absolute source dir |
| `TranslatedSkill` | type | `src/skill-translator.ts` | Structured skill |
| `SkillToMaterialize` | iface | `src/skill-materializer.ts` | Input to `materializeSkill`: cache root + source identity + skill payload |
| `translateMcpBlock` | fn | `src/mcp-translator.ts` | Validates each server; skips malformed with `warn` |
| `parseFrontmatter<T>` | fn | `src/frontmatter.ts` | Returns `{ data: T, body: string }`; tolerant of malformed YAML |
| `mapClaudeModel` | fn | `src/model-mapper.ts` | `"inherit"` → undefined; aliases → `anthropic/...` |
| `parseToolsList` | fn | `src/tools-parser.ts` | Drops unknown tools at `debug` level |
| `mapClaudeColor` | fn | `src/color-mapper.ts` | Hex `^#[0-9a-fA-F]{3,8}$` OR theme set; else undefined |
| `asScalarString` | fn | `src/coerce.ts` | Stringifies primitives; rejects objects/arrays |
| `rewriteClaudePaths` | fn | `src/rewrite-paths.ts` | Global string replace on agent prompts + command/skill bodies |
| `createLogger` | fn | `src/logger.ts` | Returns async `{debug,info,warn,error}` |
| `ClaudeBridgeSource` | iface | `src/source-loader.ts` | `{ dir, namespace?, agents?, commands?, skills? }` |
| `TranslatedMcp` | type | `src/mcp-translator.ts` | Discriminated union: `local` (command[]) or `remote` (url) |

## CONVENTIONS
- **Bun-first**: dev runtime is Bun 1.3.11, tests run via `bun:test`, lockfile is `bun.lock`. CI uses `--frozen-lockfile`. DO NOT add npm/pnpm/yarn scripts.
- **Linter+formatter**: Biome (`biome.json`). 2-space, double quotes, always semicolons. `noAssignInExpressions: off` — assignments inside conditionals are intentionally allowed (see `??=` patterns in `index.ts:52-59`).
- **TypeScript**: `strict: true`, ES2022, ESNext, `moduleResolution: "Bundler"`, `rootDir: src`. Build emits ESM + `.d.ts` to `dist/`.
- **Frontmatter scalars are NATIVE YAML types** (number, boolean, null) — not strings. Always pipe through `asScalarString()` before treating as text. The `yaml` package swap broke the old "everything is a string" assumption; `test/yaml-quirks.test.ts` is the regression suite. DO NOT use `String(value)` directly.
- **Translators never throw** — they `return null` and log `warn`. The pipeline relies on graceful skip semantics; throwing breaks `loadSource`.
- **Logger is async + injected**, never global. `Logger` methods return `Promise<void>` — `await` them. Falls back to `console` when `client` is `undefined` (tests).
- **Collision separator**: `/` for agents and commands, `-` for MCPs. The `-` is mandatory for MCPs because Anthropic tool names must match `^[a-zA-Z0-9_-]{1,128}$`.
- **Body wrapping** for commands and skills is exactly `<command-instruction>\n…\n</command-instruction>\n\n<user-request>\n$ARGUMENTS\n</user-request>` (`command-translator.ts` and `source-loader.ts` `buildCommandTemplate`). Change both call sites together.
- **JJ, not git**: this user uses Jujutsu. NEVER `git commit` / `git push`. Use `jj describe`, `jj new`, `jj git push`. See workspace `AGENTS.md`/`CLAUDE.md` overrides.
- **Cache directory**: `$XDG_CACHE_HOME/opencode-claude-bridge/skills/<source-key>/<skill-name>/SKILL.md` is bridge-owned. Created on demand, idempotent (content compare on rewrite), pruned each `config` hook run. Do NOT commit cache contents to the repo. Tests pass `cacheRoot: mkdtempSync(...)` for hermeticity (see `test/integration.test.ts` inline pattern and `test/source-loader.test.ts` `beforeEach`/`afterEach` pattern).

## ANTI-PATTERNS (THIS PROJECT)
- DO NOT add `as any` or `@ts-ignore` — strict mode is enforced. Use `unknown` + type guards (see `isPlainObject`, `toStringArray`, `toStringMap` in `mcp-translator.ts`).
- DO NOT throw out of `translate*File`. Caller skips on `null`. Throwing aborts the whole source load.
- DO NOT use `/` separator for MCP collision fallback — breaks Anthropic tool-name regex. Use `-` only.
- DO NOT call `String(yamlValue)` on frontmatter — coerces objects/arrays to garbage. Use `asScalarString` from `src/coerce.ts`.
- DO NOT bypass `registerWithCollision` when adding new register loops in `index.ts`. Every map write goes through it for uniform `info`/`warn` semantics (see test cases in `test/integration.test.ts`).
- DO NOT pass `argument-hint` through to OpenCode `config.command` — its schema rejects the field. The bridge intentionally drops it.
- DO NOT manually bump `package.json` version — `publish.yml` derives version from conventional commits and rewrites it.
- DO NOT publish `provenance` (`NPM_CONFIG_PROVENANCE: false` in `publish.yml`) — explicit choice; don't enable.
- DO NOT write to `config.permission.skill` from the bridge's default code paths — issue #5 explicitly removed that behavior. Cross-source permission policy is the user's responsibility.
- DO NOT call `loadSource` or `createClaudeBridge` from a test without passing `cacheRoot` — the bridge falls back to `getCacheRoot()` (the real XDG path) and pollutes the user's home dir during the test run.

## UNIQUE STYLES
- **Path rewrite is destructive global replace** (`src/rewrite-paths.ts`): applies to agent prompts and command/skill template bodies. Skill bodies passed to OpenCode native skill discovery are NOT rewritten — only the body that becomes the slash-command template is.
- **Skill is dual-surface**: one `SKILL.md` becomes (a) a materialized entry under `config.skills.paths` (model surface, suppressed by `disable-model-invocation: true`) and (b) a `config.command[<name>]` entry with the historic `<command-instruction>` template (user surface, suppressed by `user-invocable: false`). Plus (c) zero-or-more `config.mcp[<server>]` entries from the frontmatter `mcp:` block. The two CC fields are independent toggles — both, either, or neither surface can be active per skill.
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
