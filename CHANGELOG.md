# Changelog

## Unreleased

### Added

- `skillsdock find [query] [--json]` — search for skills in the skills.sh ecosystem:
  - Non-interactive mode: `skillsdock find <query>` searches and prints a formatted results table
  - Interactive mode: `skillsdock find` in a TTY launches a readline-based live search with debounce
  - `--json` flag outputs machine-readable JSON array
  - Defensive API response parsing (supports array, `{ results }`, and `{ skills }` formats)
  - Graceful degradation for network errors, timeouts, and non-200 HTTP status codes
  - Non-TTY without query shows usage hint
- `skillsdock remove <selector>` — new command to clean up installed skill files, symlinks, and registry/lockfile entries:
  - Resolves skills by id, key, or path via `resolveSelectorMatches()`
  - Deletes canonical skill directories under `.agents/skills/`
  - Scans and removes symlinks from non-universal agent directories that point to the canonical skill
  - Sets registry tag to `deleted` and removes lockfile entries
  - `--scope user|project` — restrict removal to a specific scope
  - `--all --scope <scope>` — remove all skills in the given scope
  - `--dry-run` — preview actions without modifying files
  - `--force` — override `frozen` tag protection
- Test suite `test/remove-command.test.mjs` covering normal removal, frozen protection, `--force`, `--dry-run`, `--all`, lockfile updates, registry tag updates, project scope, and error handling.
- `skillsdock add <source>` — lightweight remote/local skill installation:
  - Supports GitHub `owner/repo`, `owner/repo@skill-name` shorthand, full GitHub/GitLab URLs, and local paths
  - `--scope user|project` to control installation target (default: `user`)
  - `--dry-run` to preview installation without writing files
  - `--copy` to force copy mode instead of agent symlinks
  - Clones GitHub repos with `git clone --depth 1 --single-branch` for minimal bandwidth
  - Scans cloned/local directories for `SKILL.md` files (root, `skills/`, `.agents/skills/`)
  - Installs skills to canonical `.agents/skills/<skill-name>/` directory
  - Creates symlinks to non-universal agent directories by default
  - Updates SkillsDock registry with installed skill metadata
  - Updates lockfiles for both user and project scopes
  - Validates `SKILL.md` frontmatter before installation; skips invalid files with warnings
  - Cleans up temporary clone directories in a `finally` block
- Added `writeExternalSkillLock()` for writing user-scope `.skill-lock.json` lockfiles
- `sync --from node_modules` — discover and sync skills from `node_modules` packages:
  - `discoverNodeModuleSkills(projectRoot)` scans `node_modules` (including scoped `@org/pkg` packages) for `SKILL.md` files in package root, `skills/`, and `.agents/skills/` directories
  - Incremental diff using SHA-256 hash comparison (`computeSkillFolderHash`): unchanged skills are skipped ("up to date"), new/changed skills are installed/updated
  - Syncs to canonical `.agents/skills/<skill-name>/` directory
  - Updates `skills-lock.json` with `sourceType: "node_modules"` and package name as `source`
  - `--dry-run` support: prints planned actions without writing files
  - `--scope user|project` support (defaults to `project`)
  - Skips `.bin`, `.cache`, and other non-package directories in `node_modules`
- Test suite `test/node-modules-sync.test.mjs` covering discovery, scoped packages, incremental skip, hash-change update, dry-run, and lockfile updates

- `parseSource(raw)` — pure-function parser that classifies skill sources: GitHub URL, GitLab URL (including sub-groups), SSH URL, local path, `owner/repo` shorthand, and prefix shorthand (`github:`, `gitlab:`). Returns a structured descriptor with `type`, `owner`, `repo`, `branch`, `subpath`, `skillFilter`, and `raw`.
- `getOwnerRepo(parsed)` — helper that returns `"owner/repo"` from a parsed source descriptor (for lockfile tracking).
- `sanitizeSubpath(subpath)` — path-traversal guard that rejects any segment equal to `..`.
- Test suite `test/source-parser.test.mjs` covering all source formats, edge cases, and traversal attacks.
- Added `scripts/sync-agent-docs.mjs` to auto-generate agent tables in `README.md` and `COMPATIBILITY.md` from `bin/agent-registry.json`.
- Added `scripts/validate-agent-registry.mjs` to validate registry data integrity (required fields, duplicate IDs, path format, scope completeness).
- Added `registry:sync` and `registry:validate` npm scripts.
- Added CI steps to validate agent registry and detect docs drift on every push/PR.
- Wrapped existing agent tables in `README.md` and `COMPATIBILITY.md` with marker comments for automated sync.
- Added project-level `skills-lock.json` for deterministic skill tracking:
  - `readProjectLockfile(projectRoot)` — reads lockfile; gracefully handles missing files, invalid JSON, and merge-conflict markers
  - `writeProjectLockfile(projectRoot, lockData)` — writes sorted, deterministic JSON with 2-space indent and trailing newline
  - `computeSkillFolderHash(skillDirPath)` — SHA-256 hash of a skill directory (path-aware, skips `.git`/`node_modules`)
  - `updateLockfileEntry(projectRoot, skillName, entryData)` — upsert a single skill entry
  - `removeLockfileEntry(projectRoot, skillName)` — remove a single skill entry
- No timestamp fields in `skills-lock.json` to minimize git merge conflicts
- Lockfile location: `${projectRoot}/skills-lock.json`

## 0.2.0

- Expanded the built-in agent registry from 8 presets to 42 curated agents.
- Added `skillsdock init skill [name]` to scaffold `SKILL.md` templates without changing existing config/registry init behavior.
- Added per-agent metadata for future routing and install detection:
  - `referenceId`
  - `installFamily`
  - `canonicalDir`
  - `scopes.*.detectInstalled`
- Updated `doctor --agents` to show install family, canonical dir, and installed detection status.
- Kept `init`/default config generation registry-driven so the expanded preset matrix flows through without new commands.
- Added canonical-first `.agents/skills` handling for `skill-md` agents:
  - seed `agents-user` / `agents-project` scan sources for `~/.agents/skills` and `${projectRoot}/.agents/skills`
  - merge same-realpath canonical copies in `list` and `all-local-skills`
  - sync universal `skill-md` agents directly into `.agents/skills` without redundant native symlinks
- Added plugin grouping metadata and views:
  - persist manifest-declared `pluginName` on scanned registry items
  - render stable grouped sections in `list` and `all-local-skills`
  - keep `--json` output backward compatible with additive fields only
- Added read-only `vercel-labs/skills` lockfile interop:
  - read `$XDG_STATE_HOME/skills/.skill-lock.json` or `~/.agents/.skill-lock.json` during `scan`
  - merge additive external metadata such as `externalSourceUrl`, `externalHash`, and `externalPluginName` onto matched `~/.agents/skills/*` registry items
  - keep local files as the source of truth; unmatched lock entries do not create synthetic skills
  - extend `doctor` with lockfile presence, version, and unmatched-entry health checks
- Updated `README.md` and `COMPATIBILITY.md` to document the expanded registry and full compatibility table.

## 0.1.2

- Added governance commands:
  - `all-local-skills`
  - `skill-detail`
  - `tag set`
  - `tag list`
  - `cleanup --plan|--apply|--rollback`
- Added registry schema `version: 2` with canonical path keys and legacy key index compatibility.
- Added skill policy tags:
  - `regular`
  - `disabled`
  - `frozen`
  - `deleted` (soft delete)
- Added structure manifest parsing for multi-file skills and manifest-hash based duplicate detection.
- Aligned `skill-md` parsing with `vercel-labs/skills` conventions:
  - require YAML frontmatter
  - require string `name` + `description`
  - honor `metadata.internal: true` with `INSTALL_INTERNAL_SKILLS` opt-in
- Added priority discovery compatibility for `skill-md`:
  - common skill directories
  - `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json` declared paths
- Switched frontmatter parsing to `gray-matter`.
- Added `doctor --skills-spec` checks for:
  - skill frontmatter/spec conventions
  - plugin marketplace manifest path safety
- Added cleanup planner + apply + rollback workflow using `cleanupHistory`.
- Updated `scan` to:
  - upsert by canonical path
  - respect `frozen` immutability for content-derived fields
  - maintain legacy key aliases
- Updated `sync` to exclude `disabled` and `deleted` skills by default.
- Hardened `sync --mode symlink` to:
  - short-circuit same-realpath writes
  - resolve destination parent symlinks before computing relative link targets
  - safely replace broken or circular destination symlinks
- Updated `doctor` to validate canonical registry index integrity.
- Added governance tests and updated smoke flow.
- Updated docs (`README.md`, `COMPATIBILITY.md`) and bumped CLI/package version to `0.1.2`.

## 0.1.1

- Added built-in agent registry (`bin/agent-registry.json`) for OpenClaw + Core presets.
- Upgraded config to schema `version: 2` with non-destructive migration.
- Added dual-scope target support (`user`, `project`) for all built-in agents.
- Added scope-required sync UX for dual-scope agents.
- Added format-aware discovery and conversion pipeline:
  - `skill-md`
  - `mdc`
  - `openclaw-md`
  - `opencode-md`
- Added `sync --mode symlink|copy` and `--fallback copy|fail`.
- Added safe fallback copy behavior and atomic copy writes.
- Added `doctor --agents` compatibility matrix output.
- Removed legacy `agents` preset from defaults (legacy custom config is still honored).
- Added test suite (`node --test`) and macOS/Linux CI matrix.
- Updated docs (`README.md`, `COMPATIBILITY.md`) and bumped CLI/package version to `0.1.1`.

## 0.1.0

- Initial public CLI release.
