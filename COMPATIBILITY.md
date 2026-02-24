# Compatibility Matrix

SkillsDock v0.1.1 supports both **user scope** and **project scope** for each built-in agent preset.

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

## Sync Format Behavior

- Same format + non-package source: symlink (default mode) or copy.
- `.skill` source package: extracted and copied as converted content.
- Cross-format sync: converted and copied.
- If symlink fails and fallback is `copy`, SkillsDock writes copied content and reports a warning.

## Platform Support

- Required and validated in CI: **macOS**, **Linux**.
- Node versions in CI: **18**, **20**, **22**.
- Windows support is not guaranteed in v0.1.1.

## Reference Note

Agent path presets are curated from publicly documented conventions and maintained in-repo at `bin/agent-registry.json`.

SkillsDock does not fetch agent path data from network at runtime.
