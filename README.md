# SkillsDock

`skillsdock` is a CLI to discover, track, and sync AI skills across multiple agents and IDEs.

This repository is intentionally **CLI-only**.

## What Changed In v0.2.0

- Expanded the built-in agent registry from 8 presets to 42 curated agents.
- Added registry metadata for future routing logic:
  - `referenceId`
  - `installFamily`
  - `canonicalDir`
  - `detectInstalled`
- Updated `doctor --agents` to show install family, canonical dir, and install detection status.
- Kept default config generation registry-driven, so new presets automatically flow through `init` and `doctor`.
- Added canonical-first `.agents/skills` support for `skill-md` universal agents:
  - default scan now includes `~/.agents/skills` and `${projectRoot}/.agents/skills`
  - `list` / `all-local-skills` collapse same-realpath canonical copies
  - universal `skill-md` sync writes canonical output without redundant native symlinks
- Added plugin ownership metadata for `.claude-plugin` discovered skills:
  - `scan` persists `pluginName` on registry items when ownership is declared by plugin manifests
  - text `list` / `all-local-skills` render stable grouped sections for ungrouped and plugin-owned skills
  - `--json` output keeps the existing `count` + `items` envelope and only adds fields
- Added read-only interop with `vercel-labs/skills` global lock metadata:
  - `scan` reads `$XDG_STATE_HOME/skills/.skill-lock.json` or `~/.agents/.skill-lock.json`
  - canonical `~/.agents/skills/*` files remain the source of truth for visibility and governance
  - registry items may now retain additive external metadata such as `externalSourceUrl`, `externalHash`, and `externalPluginName`
  - `doctor` reports lockfile presence, version, and unmatched entries without writing back to the external lockfile

## Design Principle

SkillsDock uses a curated local agent path registry as a **pattern seed**.

- It does **not** fetch skill content from external ecosystems at runtime.
- It does **not** treat Vercel (or any other ecosystem) metadata as the source of your skills.
- Source of truth remains your local files and configured source paths.
- External lockfiles are read-only interoperability inputs, never authoritative content stores.

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

# scaffold a new SKILL.md in ./my-skill
skillsdock init skill my-skill

# scan configured sources
skillsdock scan

# governance view
skillsdock all-local-skills

# registry view
skillsdock list

# inspect one skill (path/key/id selector)
skillsdock skill-detail my-skill --all-copies

# mark a skill as frozen
skillsdock tag set my-skill --tag frozen --reason "manual lock"

# preview cleanup actions
skillsdock cleanup --plan

# dry-run sync to OpenClaw user scope
skillsdock sync --to openclaw --scope user --dry-run

# install skills from a GitHub repo
skillsdock add owner/repo --scope user

# install a specific skill from a repo
skillsdock add owner/repo@skill-name

# install from a local directory
skillsdock add ./path/to/skills --scope project

# preview what would be installed
skillsdock add owner/repo --dry-run

# inspect built-in agent compatibility + detection
skillsdock doctor --agents
```

## Commands

```bash
skillsdock init [--config <path>] [--registry <path>]
skillsdock init skill [name]
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
skillsdock add <source> [--scope user|project] [--dry-run] [--copy]
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

`skillsdock init` now seeds 42 built-in agent presets (84 default source/target entries across `user` and `project` scopes).

`skillsdock init skill [name]` scaffolds a `SKILL.md` template with valid frontmatter plus `Description`, `When To Use`, and `Instructions` sections. If `[name]` is omitted, SkillsDock writes `SKILL.md` in the current directory and derives the default skill name from the directory name. Existing `SKILL.md` files are never overwritten.

For `skill-md` universal agents, the default config also seeds canonical scan sources:

- `agents-user` -> `~/.agents/skills`
- `agents-project` -> `${projectRoot}/.agents/skills`

## Add Command

`skillsdock add <source>` installs skills from a remote repository or local directory into the canonical `.agents/skills` directory.

### Source Formats

- `owner/repo` — GitHub shorthand, installs all SKILL.md files from the repository
- `owner/repo@skill-name` — Install a specific skill from a repository
- `https://github.com/owner/repo/tree/branch/path` — Full GitHub URL with optional branch and subpath
- `https://gitlab.com/owner/repo/-/tree/branch/path` — Full GitLab URL
- `./path/to/skills` or `/absolute/path` — Install from a local directory

### Options

- `--scope user|project` — Installation target (default: `user`)
  - `user`: installs to `~/.agents/skills/<skill-name>/`
  - `project`: installs to `${projectRoot}/.agents/skills/<skill-name>/`
- `--dry-run` — Preview what would be installed without writing files
- `--copy` — Force copy mode; skip creating symlinks to non-universal agent directories

### Behavior

- GitHub/GitLab sources are cloned with `git clone --depth 1 --single-branch`
- SKILL.md files are discovered in the root, `skills/`, and `.agents/skills/` directories
- Each skill is validated (frontmatter must include `name` and `description`); invalid files are skipped with a warning
- Skills are copied to the canonical directory; by default, symlinks are created in non-universal agent directories
- The SkillsDock registry is updated with installed skill metadata
- The `.skill-lock.json` lockfile is updated for the active scope
- Temporary clone directories are always cleaned up

### Examples

```bash
# install all skills from a GitHub repo to user scope
skillsdock add acme/awesome-skills

# install one specific skill
skillsdock add acme/awesome-skills@lint-check

# install from a specific branch + path
skillsdock add https://github.com/acme/skills/tree/v2/curated

# install from local directory to project scope
skillsdock add ./my-skills --scope project

# preview without writing
skillsdock add acme/awesome-skills --dry-run
```

## Sync Modes

- Default mode: `--mode symlink`
- Fallback policy: `--fallback copy`

Behavior:

- If format conversion is needed, sync auto-copies (symlink is not possible).
- Built-in `skill-md` targets now sync canonical-first:
  - universal agents write directly into `.agents/skills`
  - non-universal `skill-md` agents mirror from `.agents/skills` with a symlink
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

### `skill-md` Parsing Rules (v0.2.0)

SkillsDock v0.2.0 aligns local `SKILL.md` parsing with the conventions used by [vercel-labs/skills](https://github.com/vercel-labs/skills):

- `SKILL.md` must include YAML frontmatter.
- Frontmatter must include string `name` and string `description`.
- `metadata.internal: true` is treated as internal and skipped by default.
  - Set `INSTALL_INTERNAL_SKILLS=1` (or `true`) to include internal skills in `scan`.
- Discovery prioritizes common skills directories and `.claude-plugin` manifest-declared paths, then recursively scans as fallback.
- `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json` ownership is persisted as `pluginName` on matching registry items.
- `scan` also reads `vercel-labs/skills` global lock metadata from `$XDG_STATE_HOME/skills/.skill-lock.json` or `~/.agents/.skill-lock.json` in read-only mode.
  - matched `~/.agents/skills/<name>/SKILL.md` files retain additive external metadata (`externalSourceUrl`, `externalHash`, `externalPluginName`, etc.)
  - unmatched lock entries do not create synthetic skills; local files still control visibility
- Frontmatter parsing uses [gray-matter](https://github.com/jonschlinkert/gray-matter) for compatibility and YAML edge cases.

### Grouped Text Views

- `skillsdock list` prints stable sections in this order:
  - `Ungrouped`
  - each plugin name in lexical order
  - `Mixed Plugin Ownership` (only when an aggregated row spans multiple plugin owners)
- `skillsdock all-local-skills` uses the same grouped section ordering.
- `--json` remains backward compatible:
  - top-level shape is still `{ "count": number, "items": [...] }`
  - registry items may now include `pluginName`
  - registry items may now include `externalSourceUrl`, `externalHash`, `externalPluginName`, `externalSourceType`, and related read-only interop fields
  - aggregated `all-local-skills` rows may now include `pluginName` and `pluginNames`

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
      "name": "agents-user",
      "agent": "agents",
      "scope": "user",
      "path": "~/.agents/skills",
      "format": "skill-md",
      "optional": true
    },
    {
      "name": "openclaw-user",
      "agent": "openclaw",
      "scope": "user",
      "path": "~/.openclaw/skills",
      "format": "openclaw-md",
      "optional": true
    },
    {
      "name": "agents-project",
      "agent": "agents",
      "scope": "project",
      "path": "${projectRoot}/.agents/skills",
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
- plugin ownership field:
  - `pluginName`
- optional read-only interop fields:
  - `externalSource`
  - `externalSourceType`
  - `externalSourceUrl`
  - `externalSkillPath`
  - `externalHash`
  - `externalPluginName`
  - `externalInstalledAt`
  - `externalUpdatedAt`
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

## Built-In Agent Registry

The built-in registry now covers 42 agents, including `amp`, `antigravity`, `augment`, `gemini-cli`, `github-copilot`, `goose`, `roo`, `windsurf`, `zencoder`, `pochi`, and `adal`.

Each registry entry includes:

- native `user` + `project` scope source/target presets
- `detectInstalled` paths for `doctor --agents`
- `installFamily` and `canonicalDir` metadata for follow-up universal-agent logic

## Publish

```bash
npm run pack:check
npm publish --access public
```

## License

MIT
