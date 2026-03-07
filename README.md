# SkillsDock

`skillsdock` is a CLI to discover, track, and sync AI skills across multiple agents and IDEs.

This repository is intentionally **CLI-only**.

## What Changed In v0.1.2

- Added governance views:
  - `all-local-skills`
  - `skill-detail`
- Added lifecycle tags:
  - `regular`
  - `disabled`
  - `frozen`
  - `deleted` (soft delete)
- Added cleanup workflow:
  - `cleanup --plan`
  - `cleanup --apply`
  - `cleanup --rollback <runId>`
- Upgraded registry to canonical-path identity with legacy-key index compatibility.
- Added structure manifests for multi-file skills and manifest hash based duplicate detection.
- `sync` now skips `disabled` and `deleted` by default.

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

# governance view
skillsdock all-local-skills

# inspect one skill (path/key/id selector)
skillsdock skill-detail my-skill --all-copies

# mark a skill as frozen
skillsdock tag set my-skill --tag frozen --reason "manual lock"

# preview cleanup actions
skillsdock cleanup --plan

# dry-run sync to OpenClaw user scope
skillsdock sync --to openclaw --scope user --dry-run
```

## Commands

```bash
skillsdock init [--config <path>] [--registry <path>]
skillsdock scan [paths...] [--config <path>] [--registry <path>]
skillsdock all-local-skills [--config <path>] [--registry <path>] [--source <name>] [--scope <user|project>] [--tag <tag>] [--all] [--json]
skillsdock skill-detail <selector> [--registry <path>] [--all-copies] [--json]
skillsdock tag set <selector> --tag <regular|disabled|frozen|deleted> [--reason <text>] [--all-copies] [--registry <path>]
skillsdock tag list [--registry <path>] [--source <name>] [--scope <user|project>] [--tag <tag>] [--all] [--json]
skillsdock cleanup --plan|--apply [--registry <path>] [--source <name>] [--scope <user|project>] [--all] [--json]
skillsdock cleanup --rollback <runId> [--registry <path>]
skillsdock list [--config <path>] [--registry <path>] [--source <name>] [--changed] [--all] [--json]
skillsdock inspect <id|key|path> [--registry <path>] [--json]
skillsdock sync --to <agent|target> --scope <user|project> [--config <path>] [--registry <path>] [--mode <symlink|copy>] [--fallback <copy|fail>] [--dry-run] [--all]
skillsdock doctor [--config <path>] [--registry <path>] [--agents] [--skills-spec]
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
- Symlink mode resolves destination parent symlinks before computing the link target, so symlinked target roots do not produce broken links.
- If source and destination already resolve to the same real path, sync is a no-op for that item.
- Existing broken or circular destination symlinks are replaced safely during sync.
- Atomic copy writes are used (`tmp` + `rename`).

## Supported Formats

- `skill-md` (`SKILL.md`, `.skill`)
- `mdc` (`*.mdc`)
- `openclaw-md` (`*.md`)
- `opencode-md` (`*.md`)

### `skill-md` Parsing Rules (v0.1.2)

SkillsDock v0.1.2 aligns local `SKILL.md` parsing with the conventions used by [vercel-labs/skills](https://github.com/vercel-labs/skills):

- `SKILL.md` must include YAML frontmatter.
- Frontmatter must include string `name` and string `description`.
- `metadata.internal: true` is treated as internal and skipped by default.
  - Set `INSTALL_INTERNAL_SKILLS=1` (or `true`) to include internal skills in `scan`.
- Discovery prioritizes common skills directories and `.claude-plugin` manifest-declared paths, then recursively scans as fallback.
- Frontmatter parsing uses [gray-matter](https://github.com/jonschlinkert/gray-matter) for compatibility and YAML edge cases.

### Skills Spec Validation

Use `doctor --skills-spec` to validate local `skill-md` sources against the [Agent Skills specification](https://agentskills.io) conventions:

- validates `SKILL.md` parseability and required frontmatter fields
- validates name style (recommended lowercase + hyphen, up to 64 chars)
- validates `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json` path safety and local-path conventions

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

Registry version `2` includes:

- canonical keys (`path:/abs/path/to/skill/SKILL.md`)
- compatibility indexes:
  - `index.byCanonicalPath`
  - `index.byLegacyKey`
- item policy fields:
  - `policy.tag`
  - `policy.reason`
  - `policy.updatedAt`
- structure manifest fields:
  - `structureManifest.entryFile`
  - `structureManifest.includedFiles`
  - `structureManifest.fileHashes`
  - `manifestHash`
- cleanup history:
  - `cleanupHistory[].runId`
  - `cleanupHistory[].actions[]`

## Compatibility Matrix

See [COMPATIBILITY.md](./COMPATIBILITY.md).

## Publish

```bash
npm run pack:check
npm publish --access public
```

## License

MIT
