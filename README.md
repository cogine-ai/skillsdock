# SkillsDock

`skillsdock` is a CLI to discover, track, and sync AI skills across tools like Codex, Claude, Cursor, and other local skill sources.

This repository is intentionally **CLI-only**.

## Install

```bash
npm install -g @cogineai/skillsdock
```

Or run directly:

```bash
npx @cogineai/skillsdock --help
```

## Quick Start

```bash
# create default config + registry
skillsdock init

# scan default sources
skillsdock scan

# show primary active skills
skillsdock list

# preview sync
skillsdock sync --to claude --dry-run
```

## Commands

```bash
skillsdock init [--config <path>] [--registry <path>]
skillsdock scan [paths...] [--config <path>] [--registry <path>]
skillsdock list [--config <path>] [--registry <path>] [--source <name>] [--changed] [--all] [--json]
skillsdock inspect <id|key> [--registry <path>] [--json]
skillsdock sync --to <target> [--registry <path>] [--config <path>] [--dry-run] [--all]
skillsdock doctor [--config <path>] [--registry <path>]
skillsdock version
```

## Default Sources And Targets

Default sources:
- `~/.codex/skills`
- `~/.claude/skills`
- `~/.agents/skills`

Default targets:
- `codex` -> nested `SKILL.md`
- `claude` -> nested `SKILL.md`
- `cursor` -> flat `*.mdc`

## Registry

SkillsDock stores metadata in `~/.skillsdock/registry.json`:
- discovery state (`active` / `missing`)
- timestamps (`firstSeenAt`, `lastSeenAt`, `changedAt`)
- inferred creation/update times (`createdAt`, `updatedAt`)
- source and origin info (`sourceName`, `sourcePath`, `originRepo`)
- content hash (`sha256`)
- `isPrimary` copy selection per skill id

## Publish

```bash
npm run pack:check
npm publish --access public
```

## License

MIT
