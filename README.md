# SkillsDock

`skillsdock` is a simple CLI to scan, track, and sync AI skills across tools like Codex, Claude, and Cursor from one place.

It is built for two audiences:
- Engineers with many skill repositories and local folders.
- New or non-technical users who just want one command to keep skills organized.

## Why this exists

Most people end up with skills spread across:
- `~/.codex/skills`
- `~/.claude/skills`
- `~/.cursor/rules`
- random repos and local workspaces

SkillsDock gives you a single registry with:
- discovery (`scan`)
- visibility (`list`, `inspect`)
- synchronization (`sync`)
- basic health checks (`doctor`)

## Install

```bash
npm install -g skillsdock
```

Or run without global install:

```bash
npx skillsdock --help
```

For local development in this repository:

```bash
bun install
bun run skillsdock -- --help
```

## Quick Start (60 seconds)

```bash
# 1) create default config + registry in ~/.skillsdock
skillsdock init

# 2) scan default source folders
skillsdock scan

# 3) view current primary skills
skillsdock list

# 4) sync to a target agent
skillsdock sync --to claude --dry-run
skillsdock sync --to claude
```

## Commands

```bash
skillsdock init [--config <path>] [--registry <path>]
skillsdock scan [paths...] [--config <path>] [--registry <path>]
skillsdock list [--source <name>] [--changed] [--all] [--json]
skillsdock inspect <id|key> [--json]
skillsdock sync --to <target> [--dry-run] [--all]
skillsdock doctor
```

## Registry model

SkillsDock stores data in `~/.skillsdock/registry.json`:
- `firstSeenAt` and `lastSeenAt`
- `changedAt`
- `createdAt` and `updatedAt` (git-aware when possible)
- `sourcePath`, `sourceName`, `originRepo`
- content hash (`sha256`)
- a `primary` copy per skill id for conflict-free sync

## Config

Default config location: `~/.skillsdock/config.json`

```json
{
  "version": 1,
  "sources": [
    { "name": "codex", "path": "~/.codex/skills" },
    { "name": "claude", "path": "~/.claude/skills" },
    { "name": "agents", "path": "~/.agents/skills" }
  ],
  "targets": {
    "codex": { "path": "~/.codex/skills", "layout": "nested", "filename": "SKILL.md" },
    "claude": { "path": "~/.claude/skills", "layout": "nested", "filename": "SKILL.md" },
    "cursor": { "path": "~/.cursor/rules", "layout": "flat", "extension": ".mdc" }
  },
  "scan": {
    "maxDepth": 8,
    "ignoreDirs": ["node_modules", ".git", ".next", "dist", "build", ".turbo", ".cache"]
  }
}
```

## Notes

- SkillsDock scans `SKILL.md` and `*.skill` files.
- `sync` writes the primary copy of each active skill by default.
- Use `--all` on `sync` and `list` to include non-primary copies.

## Current scope

The CLI is now the core product in this repository.  
The existing Next.js app remains work-in-progress and will be aligned to the same registry model.

## Publish

```bash
# dry-run package contents
npm run pack:check

# publish to npm
npm publish --access public
```

## License

MIT
