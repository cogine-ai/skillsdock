# Changelog

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
