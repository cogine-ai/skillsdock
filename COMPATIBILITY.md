# Compatibility Matrix

SkillsDock v0.1.2 supports both **user scope** and **project scope** for each built-in agent preset.

## Agent Path Matrix

| Agent | User Scope Source/Target | Project Scope Source/Target | Target Format |
|---|---|---|---|
| openclaw | `~/.openclaw/skills` | `${projectRoot}/skills` | `openclaw-md` |
| codex | `~/.codex/skills` | `${projectRoot}/.codex/skills` | `skill-md` |
| claude | `~/.claude/skills` | `${projectRoot}/.claude/skills` | `skill-md` |
| cursor | `~/.cursor/rules` | `${projectRoot}/.cursor/rules` | `mdc` |
| cline | `~/.cline/rules` | `${projectRoot}/.cline/rules` | `mdc` |
| codebuddy | `~/.codebuddy/skills` | `${projectRoot}/.codebuddy/skills` | `skill-md` |
| trae | `~/.trae/skills` | `${projectRoot}/.trae/skills` | `skill-md` |
| opencode | `~/.opencode/skills` | `${projectRoot}/.opencode/skills` | `opencode-md` |

## Source Format Mapping

| Source Format | Scanned Files |
|---|---|
| `skill-md` | `SKILL.md`, `.skill` |
| `mdc` | `*.mdc` |
| `openclaw-md` | `*.md` |
| `opencode-md` | `*.md` |

## `skill-md` Compatibility Notes

- `SKILL.md` must contain YAML frontmatter with string `name` and `description`.
- `metadata.internal: true` is skipped by default during scan.
  - Set `INSTALL_INTERNAL_SKILLS=1` or `INSTALL_INTERNAL_SKILLS=true` to include internal skills.
- Scan discovery follows the same priority style as `vercel-labs/skills`:
  - common directories (such as `skills/`, `.agents/skills/`, `.claude/skills/`, `.codex/skills/`, etc.)
  - `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json` declared skill paths
  - recursive scan fallback
- Frontmatter parsing is powered by `gray-matter`.
- `skillsdock doctor --skills-spec` validates spec-convention compliance and plugin manifest path safety.

## Sync Format Behavior

- Same format + non-package source: symlink (default mode) or copy.
- `.skill` source package: extracted and copied as converted content.
- Cross-format sync: converted and copied.
- Symlink writes resolve destination parent realpaths before computing relative link targets.
- If source and destination already resolve to the same real path, the sync write is skipped.
- Existing broken or circular destination symlinks are replaced safely before writing.
- If symlink fails and fallback is `copy`, SkillsDock writes copied content and reports a warning.
- Governance tag behavior:
  - `regular` and `frozen` are eligible for sync.
  - `disabled` and `deleted` are excluded from sync.

## Platform Support

- Required and validated in CI: **macOS**, **Linux**.
- Node versions in CI: **18**, **20**, **22**.
- Windows support is not guaranteed in v0.1.2.

## Reference Note

Agent path presets are curated from publicly documented conventions and maintained in-repo at `bin/agent-registry.json`.

SkillsDock does not fetch agent path data from network at runtime.
