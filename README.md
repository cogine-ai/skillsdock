# SkillsDock

`skillsdock` is a CLI to discover, track, and sync AI skills across multiple agents and IDEs.

This repository is intentionally **CLI-only**.

## What Changed In v0.1.1

- Built-in agent registry for OpenClaw + Core agent presets.
- Dual-scope paths for every built-in agent (`user` + `project`).
- Format-aware sync with default `symlink` mode and safe copy fallback.
- Config schema upgraded to `version: 2` with non-destructive migration.
- `doctor --agents` compatibility matrix.
- CI matrix for macOS + Linux (Node 18/20/22).

## Design Principle

SkillsDock uses a curated local agent path registry as a **pattern seed**.

- It does **not** fetch skill content from external ecosystems at runtime.
- It does **not** treat Vercel (or any other ecosystem) as the source of your skills.
- Source of truth remains your local files and configured source paths.

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
# create or upgrade config + registry
skillsdock init

# scan configured sources
skillsdock scan

# view primary active skills
skillsdock list

# dry-run sync to OpenClaw user scope
skillsdock sync --to openclaw --scope user --dry-run
```

## Commands

```bash
skillsdock init [--config <path>] [--registry <path>]
skillsdock scan [paths...] [--config <path>] [--registry <path>]
skillsdock list [--config <path>] [--registry <path>] [--source <name>] [--changed] [--all] [--json]
skillsdock inspect <id|key> [--registry <path>] [--json]
skillsdock sync --to <agent|target> --scope <user|project> [--config <path>] [--registry <path>] [--mode <symlink|copy>] [--fallback <copy|fail>] [--dry-run] [--all]
skillsdock doctor [--config <path>] [--registry <path>] [--agents]
skillsdock version
```

## Scope And Target Resolution

For built-in dual-scope agents, `--scope` is required when using the agent name.

Examples:

```bash
# explicit user scope (required)
skillsdock sync --to codex --scope user

# explicit project scope (required)
skillsdock sync --to cursor --scope project

# direct target key also works
skillsdock sync --to openclaw-user
```

## Sync Modes

- Default mode: `--mode symlink`
- Fallback policy: `--fallback copy`

Behavior:

- If format conversion is needed, sync auto-copies (symlink is not possible).
- If symlink fails and fallback is `copy`, SkillsDock copies and prints a warning.
- Atomic copy writes are used (`tmp` + `rename`).

## Supported Formats

- `skill-md` (`SKILL.md`, `.skill`)
- `mdc` (`*.mdc`)
- `openclaw-md` (`*.md`)
- `opencode-md` (`*.md`)

## Config (v2)

Default config file: `~/.skillsdock/config.json`

```json
{
  "version": 2,
  "sources": [
    {
      "name": "openclaw-user",
      "agent": "openclaw",
      "scope": "user",
      "path": "~/.openclaw/skills",
      "format": "openclaw-md",
      "optional": true
    },
    {
      "name": "codex-project",
      "agent": "codex",
      "scope": "project",
      "path": "${projectRoot}/.codex/skills",
      "format": "skill-md",
      "optional": true
    }
  ],
  "targets": {
    "openclaw-user": {
      "name": "openclaw-user",
      "agent": "openclaw",
      "scope": "user",
      "path": "~/.openclaw/skills",
      "format": "openclaw-md",
      "layout": "flat",
      "extension": ".md"
    }
  },
  "scan": {
    "maxDepth": 8,
    "ignoreDirs": ["node_modules", ".git", ".next", "dist", "build", ".turbo", ".cache"]
  }
}
```

## Registry

SkillsDock stores metadata in `~/.skillsdock/registry.json`.

Each entry includes:

- source info (`sourceName`, `sourcePath`, `sourceFormat`)
- skill identity (`id`, `name`, `description`)
- normalized content (`normalized.name`, `normalized.description`, `normalized.body`)
- timestamps (`firstSeenAt`, `lastSeenAt`, `changedAt`, `createdAt`, `updatedAt`)
- content hash (`sha256`)
- primary selection (`isPrimary`)

## Compatibility Matrix

See [COMPATIBILITY.md](./COMPATIBILITY.md).

## Publish

```bash
npm run pack:check
npm publish --access public
```

## License

MIT
