# AGENTS.md

## Project Identity

- Name: `@cogineai/skillsdock`
- Type: CLI-only Node.js project
- Runtime: Node.js `>=18.17.0`
- Current target release line: `0.1.1`

## Product Scope

SkillsDock manages local skill files across multiple agents and scopes.

Core behavior:
- Discover skills from configured sources.
- Persist metadata in `~/.skillsdock/registry.json`.
- Sync to configured agent targets.
- Diagnose compatibility via `doctor` and `doctor --agents`.

Non-goals for current scope:
- No web UI in this repository.
- No runtime network fetch for agent registry.
- No remote skill marketplace dependency.

## Agent Registry Rules

- Built-in presets are defined in `bin/agent-registry.json`.
- Presets are curated snapshots (pattern seed only), not runtime upstream dependencies.
- Every built-in agent must support both scopes:
  - `user`
  - `project`
- Default built-in agents in v0.1.1:
  - openclaw
  - codex
  - claude
  - cursor
  - cline
  - codebuddy
  - trae
  - opencode

## Config Rules

- Config schema version is `2`.
- `init` must remain non-destructive:
  - preserve existing user-defined entries
  - append missing defaults only
  - never overwrite explicit user paths
- Targets are separate per-scope keys:
  - `<agent>-user`
  - `<agent>-project`

## Sync Rules

- For dual-scope agents, `--scope user|project` is required when syncing by agent name.
- Default sync mode is `symlink`.
- Fallback policy default is `copy`.
- If conversion is needed, copy is required and should warn.
- Copy writes should be atomic (`tmp` + `rename`).

## Supported Formats (v0.1.1)

- `skill-md` (`SKILL.md`, `.skill`)
- `mdc` (`*.mdc`)
- `openclaw-md` (`*.md`)
- `opencode-md` (`*.md`)

Registry items should keep:
- original raw content
- normalized content fields:
  - `normalized.name`
  - `normalized.description`
  - `normalized.body`

## Testing and CI

Required checks before merge:
- unit tests pass
- smoke test pass (`init -> scan -> list -> inspect -> sync --dry-run -> doctor --agents`)
- `npm run pack:check` pass

CI matrix must include:
- macOS
- Linux
- Node 18/20/22

## Release Hygiene

- Keep `package.json` version and `bin/skillsdock-core.mjs` app version in sync.
- Update `README.md`, `COMPATIBILITY.md`, and `CHANGELOG.md` for behavior changes.
- Keep npm package file list minimal and explicit.

## Branch/Worktree Workflow

- Use prefixed branch names: `codex/...`
- For non-trivial feature work, prefer dedicated worktree.
- Keep commits scoped and reviewable.
