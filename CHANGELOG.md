# Changelog

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
