# Changelog

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
