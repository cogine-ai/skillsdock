# AGENTS.md

## Project Basics

- Package: `@cogineai/skillsdock`
- Repo type: CLI-only Node.js project
- Runtime: Node.js `>=18.17.0`

## What Belongs Here

- Keep this file focused on collaboration and engineering guardrails.
- Keep product/business logic in source docs (`README.md`, `docs/*`, `COMPATIBILITY.md`), not here.
- Do not hardcode release-line notes here; source of truth is `package.json` and changelog.

## Engineering Guardrails

- Preserve backward compatibility for user config/registry unless a migration is explicitly implemented.
- Keep `init` non-destructive (never overwrite explicit user paths).
- Keep sync operations safe:
  - require `--scope user|project` for dual-scope agent sync by agent name
  - use atomic copy writes (`tmp` + `rename`)
- Keep outputs deterministic and machine-friendly for `--json` modes.

## Quality Gates

Before merge:

- `npm test`
- `npm run pack:check`

For behavior changes:

- update `README.md`, `COMPATIBILITY.md`, `CHANGELOG.md`
- keep `package.json` version and `bin/skillsdock-core.mjs` `APP_VERSION` in sync

## Git / PR Workflow

- Branch names should use prefix: `<agent-name>/...`
- Valid `<agent-name>` values come from the built-in agent registry (`bin/agent-registry.json`), currently:
  - `openclaw`
  - `codex`
  - `claude`
  - `cursor`
  - `cline`
  - `codebuddy`
  - `trae`
  - `opencode`
- Keep commits focused and reviewable.
- Default PR flow: create branch -> push -> open PR -> stop.
- Do **not** merge PRs automatically (including `gh pr merge`) unless the user explicitly asks to merge.
