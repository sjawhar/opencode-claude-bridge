---
date: 2026-05-20
topic: skills-as-native-opencode-skills
---

# Register Imported Skills as Native OpenCode Skills (Issue #5)

## Problem Frame

The bridge currently registers every `<dir>/skills/*/SKILL.md` as an entry in `config.command`, never as an opencode skill. Concretely, this causes:

- Bridge-imported skills do not appear in `opencode debug skill` output.
- The model does not see them in its `<available_skills>` block — opencode-native skill-aware features silently skip them.
- The bridge's internal label `skill-command` is itself a tell: skill files are being shoehorned into the wrong category.

Reproduction (from the issue): a user installs a 9-skill Claude Code marketplace plugin (`verification-skills`), runs `opencode debug skill`, expects to see 9 skills, sees 0. The skills are present and `/<name>`-invocable, but live in the `command` map — invisible to any tooling that asks "what skills are loaded?".

OpenCode treats `command` and `skill` as distinct first-class concepts (separate debug surfaces, separate discovery code). Future opencode behavior specific to skills will silently miss everything the bridge imports. This is a category mismatch, not a presentation bug.

## Requirements

- **R1.** Skills imported by the bridge appear in opencode's skill catalog (`opencode debug skill`), the model's `<available_skills>` block, and the `skill` tool's lookups — by default, with no per-skill opt-in.
- **R2.** Skills remain invocable via `/<name>` slash commands by default. Current users do not lose the slash-command surface they rely on.
- **R3.** The official Claude Code frontmatter field `disable-model-invocation: true` suppresses **skill** registration (model cannot see or auto-invoke), while **preserving** command registration so `/<name>` still works for explicit user invocation. Matches Claude Code's documented semantics.
- **R4.** The official Claude Code frontmatter field `user-invocable: false` suppresses **command** registration (skill is hidden from the `/` menu), while **preserving** skill registration so the model can still auto-invoke. Matches Claude Code's documented semantics.
- **R5.** Setting both fields removes the skill from both surfaces.
- **R6.** The bridge does NOT write to `config.permission.skill` by default. The "don't push path" mechanism is sufficient for the bridge's own scope; cross-source permission overrides are a user concern, not a bridge concern. Existing behavior (which forced `permission.skill[name] = "deny"` whenever `disable-model-invocation: true`) is removed.
- **R7.** The bridge materializes a normalized copy of every bridge-imported SKILL.md into a bridge-owned cache directory. The materialized copy has:
  - `name` synthesized from the parent directory when missing in source frontmatter (preserves current name-derivation behavior).
  - `${CLAUDE_PLUGIN_ROOT}` tokens expanded in the body (keeps body-expansion working under the model-discovery path, not just the slash-command-template path).
  - All other frontmatter passed through unchanged via `extraFrontmatter`, EXCEPT the fields the bridge consumes elsewhere (`name`, `description`, `disable-model-invocation`, `user-invocable`, `mcp`, `agent`, `model`, `subtask`). Those are stripped because the bridge has already extracted them into the structured `TranslatedSkill`; round-tripping them into the cache would be redundant (opencode ignores `agent`/`model`/`subtask` on the skill surface) or confusing (`mcp` lives on `config.mcp` now, not in the cached file). Non-consumed Claude-Code-specific fields (`license`, `compatibility`, `metadata`, `allowed-tools`, `argument-hint`, `context`, `effort`, `hooks`, `paths`, `shell`, `arguments`, `when_to_use`) flow through verbatim.
- **R8.** The bridge pushes the materialized cache paths into `config.skills.paths` in the plugin's `config` hook. Opencode then discovers the materialized SKILL.md files via its normal scan (`SKILL_PATTERN = "**/SKILL.md"`).
- **R9.** Materialization is idempotent: re-running the `config` hook with unchanged source state produces no filesystem writes.
- **R10.** The bridge prunes stale cache entries when a source's skills are removed (e.g., a marketplace plugin is uninstalled, or a source dir is removed). Stale = present in cache, no longer present in any live source.
- **R11.** The `claudePlugins: true` discovery path applies the same rules. Marketplace plugin skills materialize and register via `config.skills.paths` exactly as hand-listed sources do.
- **R12.** The bridge's existing `mcp:` block extraction (into `config.mcp`) is unchanged. The MCP dimension is independent of which invocation surface(s) the skill registers on.
- **R13.** Existing source options continue to work: `source.skills: string | false` still opts a source out of skill scanning; `source.namespace` still applies to command-side collision handling and to cache key derivation. No new top-level config options required.
- **R14.** README and AGENTS.md are updated to describe the new behavior, the cache location, and the supported frontmatter fields.

## Success Criteria

- Running `opencode debug skill` in a project that uses the bridge shows every bridge-imported skill in the output, with the correct `name` and `description`.
- `/<name>` continues to invoke bridge-imported skills with no behavior change for users who add no new frontmatter.
- A SKILL.md with `disable-model-invocation: true` does NOT appear in the model's `<available_skills>`, but `/<name>` still works.
- A SKILL.md with `user-invocable: false` appears in `<available_skills>` (model can auto-invoke), but does NOT appear in the `/` menu.
- A SKILL.md without a `name` frontmatter field (e.g., the existing [`derived-name` fixture](file:///home/sami/Code/opencode/claude-bridge/test/fixtures/sjawhar/skills/derived-name/SKILL.md)) appears in `opencode debug skill` with the directory-derived name — no silent drop.
- The bridge's MCP extraction continues to populate `config.mcp` from `mcp:` blocks regardless of skill/command registration state.
- The bridge no longer overrides user-set `config.permission.skill[name]` values. No `"Skill X permission overridden to deny"` warnings unless the user explicitly opts back in via configuration (TBD whether we expose an opt-in).
- The materialized cache is contained at a single deterministic root, idempotent across sessions, and self-cleaning when sources go away.

## Scope Boundaries

- **Symmetric flip for `<dir>/commands/*.md`** (defaulting commands to also-register-as-skills) is explicitly out of scope per the original issue.
- **Cross-source skill name collisions** are NOT resolved by the bridge. If two sources contribute a skill named `foo`, opencode logs its standard duplicate-skill warning and keeps whichever it scanned first. The bridge does not mangle names to disambiguate at the skill layer. (Command-layer collisions still use the existing `namespace/` fallback.)
- **Upstream advocacy** — asking opencode to add a more direct skill-registration plugin API or richer per-skill plugin hooks — is a separate, complementary effort, not blocking this work.
- **Other Claude Code frontmatter fields** (`context: fork`, `agent`, `model`, `effort`, `hooks`, `paths`, `shell`, `arguments`, `argument-hint`, etc.) flow through the materialized SKILL.md unchanged. The bridge does not translate them. Their command-side flow (where the bridge today extracts `agent`, `model`, `subtask`, `handoffs` into `config.command[name]`) is unchanged.
- **OpenCode-native (`config.skill[name] = "deny"`) permission management** stays a user responsibility. The bridge stops writing to it; it does not start reading from it either.

## Key Decisions

- **K1.** Use OFFICIAL Claude Code frontmatter fields (`disable-model-invocation`, `user-invocable`) for invocation control. **Rationale:** the bridge is a Claude → opencode translator and should respect the source schema rather than invent new fields. The Agent Skills cross-vendor spec [explicitly defines unknown fields as ignored](https://agentskills.io/specification), so this is forward-compatible.
- **K2.** Materialize EVERY bridge-imported SKILL.md, not just name-missing ones. **Rationale:** uniform implementation (no per-file case-split); keeps `${CLAUDE_PLUGIN_ROOT}` body expansion consistent across both the model-visible skill body and the slash-command template; gives one deterministic cache location that's easy to clean up.
- **K3.** Drop `permission.skill[name] = "deny"` writes by default. **Rationale:** under the new design, suppression is already achieved by not pushing the path into `config.skills.paths`. The permission write is redundant for the primary case and aggressively overrides cross-source user intent for the secondary case. Users who want the belt-and-suspenders behavior can configure permissions manually.
- **K4.** Cache directory: `$XDG_CACHE_HOME/opencode-claude-bridge/skills/<source-key>/<skill-name>/SKILL.md`, defaulting to `~/.cache/opencode-claude-bridge/skills/...`. **Rationale:** XDG-compliant, bridge-owned, single root for cleanup, stable across sessions, does not pollute opencode's or Claude Code's own discovery roots.
- **K5.** `${CLAUDE_PLUGIN_ROOT}` in materialized SKILL.md bodies expands to the **original** source `dir`, NOT to the cache location. **Rationale:** sibling files referenced by the skill body (e.g. `${CLAUDE_PLUGIN_ROOT}/skills/<name>/examples/foo.md`) need to resolve to the real, on-disk files. Bridge does not have to copy those siblings into the cache — only the SKILL.md.
- **K6.** Command-side body templating is unchanged: the slash-command `template` continues to be `<command-instruction>\n…\n</command-instruction>\n\n<user-request>\n$ARGUMENTS\n</user-request>` with `rewriteClaudePaths` applied. The model-side skill body (in the cache) is the raw transformed body with token expansion but no `<command-instruction>` wrapping. This asymmetry is the natural shape — opencode-native skills don't have `$ARGUMENTS` substitution either.

## Dependencies / Assumptions

- Opencode's `config.skills.paths` plugin-API surface is stable enough to depend on. Verified against opencode SHA `4ad261d8a7b97376880c717e6c5c54fde44d1fd7` ([`packages/opencode/src/skill/index.ts`](https://github.com/sst/opencode/blob/4ad261d8a7b97376880c717e6c5c54fde44d1fd7/packages/opencode/src/skill/index.ts)).
- Opencode does NOT auto-expose discovered skills as `/<name>` slash commands. The bridge MUST keep writing to `config.command` to preserve that surface. Verified against the same opencode SHA — the skill service exposes `get`/`all`/`dirs`/`available` only; the slash-command resolution path is separate.
- Opencode's skill frontmatter validator requires `name: string` ([`isSkillFrontmatter` type guard](https://github.com/sst/opencode/blob/4ad261d8a7b97376880c717e6c5c54fde44d1fd7/packages/opencode/src/skill/index.ts)). Name-missing SKILL.md files are silently dropped during discovery. This is the reason materialization is mandatory rather than optional.
- The plugin `config` hook receives a live, mutable `config` object — pushing into `config.skills.paths` during the hook is the documented pattern (used by [obra/superpowers's opencode plugin](https://github.com/obra/superpowers/blob/main/.opencode/plugins/superpowers.js)).
- Materialization writes are safe: the cache directory is owned by the bridge, lives under the user's `$XDG_CACHE_HOME`, and is not shared with any other tool's discovery roots.

## Outstanding Questions

### Resolve Before Planning

_(none — design is locked enough to plan against. The remaining items below are technical specifics that planning can resolve from codebase context.)_

### Deferred to Planning

- **[Affects R7, R10][Technical]** Exact cache key derivation. Options: stable hash of `source.dir`; the source's `namespace` when present and a hash otherwise; per-source-index numeric key. Affects collision detection between sources and the cleanup-stale-entries strategy.
- **[Affects R8][Technical]** Push the materialized parent-of-skills directory once per source (`<cache>/<source-key>/` — opencode walks `**/SKILL.md`), or push each `<skill-name>` dir individually? The former is simpler; the latter gives finer-grained control over which specific skills opencode sees. Per-skill push enables the `disable-model-invocation: true` semantics (don't materialize that skill at all) but requires more entries in `config.skills.paths`.
- **[Affects R9][Technical]** Idempotence detection. Source mtime vs cache mtime is fastest. Content hash is most robust. Hybrid (mtime as fast-path; hash on mtime change) is probably best. Decide during planning.
- **[Affects R10][Technical]** Stale-entry cleanup strategy. Track a manifest file under the cache root, or scan-and-diff each run? Manifest is faster and survives partial failures; scan-and-diff is simpler. Both work.
- **[Affects R2][Technical]** Verify experimentally that opencode's `/<name>` resolver prefers `config.command[name]` over a same-named skill registered via `config.skills.paths`. If opencode auto-resolves slash commands to skills when no command entry exists, then for `user-invocable: false` we need to also ensure the bridge's command-side suppression actually hides the skill from the `/` menu (it should, since the bridge isn't writing the command entry, but worth confirming opencode doesn't fall back to the skill name).
- **[Affects R7][Needs research]** Should the materialized SKILL.md strip the bridge-relevant fields (`disable-model-invocation`, `user-invocable`, `mcp:`) since the bridge has already acted on them? Or pass them through unchanged for fidelity? Opencode ignores unknown frontmatter per spec, so passing through is safe. Stripping is cleaner if we want the cache file to look "vanilla" to anyone inspecting it. Lean toward pass-through.
- **[Affects all][Technical]** Test fixtures need updating. New cases to cover: `disable-model-invocation: true` (skill suppressed, command preserved), `user-invocable: false` (skill preserved, command suppressed), both set (effectively disabled), materialization output (cache layout, expanded tokens, synthesized name), idempotence (no writes on rerun), stale-entry cleanup. Existing fixtures (`hidden-thing`, `derived-name`, `playwright-like`, `slack-bot-like`, `remote-mcp`, `numeric-fields`) likely all still work but their assertions move from `config.command` checks to `config.skills.paths` + materialized-file checks.
- **[Affects R13][Technical]** Cache key when `source.namespace` is unset and two sources have the same `basename(source.dir)`. Need to disambiguate (probably by hashing the absolute path).
- **[Affects R6][Technical]** Migration note: existing users who depended on the bridge's `permission.skill[name] = "deny"` writes will see that behavior disappear. README should call this out explicitly. If it turns out the dropped behavior matters more than expected, we can re-introduce it as an explicit opt-in per-source field — but only if asked for.
- **[Affects R7][Technical]** Behavior when the cache directory is on a read-only filesystem (rare but possible — e.g., NixOS Nix store paths, sandboxed CI). Probably: fall back to a temp dir, log a warning. Or fail loudly. Decide during planning.

## Next Steps

→ `/ce:plan` for structured implementation planning
