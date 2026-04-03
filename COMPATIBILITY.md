# Compatibility Matrix

SkillsDock v0.2.0 supports both **user scope** and **project scope** for each built-in agent preset.

## Agent Path Matrix

<!-- COMPAT-MATRIX-START -->
| Agent | Display Name | Family | Canonical Dir | User Scope Source/Target | Project Scope Source/Target | Target Format |
|---|---|---|---|---|---|---|
| openclaw | OpenClaw | dedicated | `skills` | `~/.openclaw/skills` | `${projectRoot}/skills` | `openclaw-md` |
| codex | Codex | universal | `.agents/skills` | `~/.codex/skills` | `${projectRoot}/.codex/skills` | `skill-md` |
| claude | Claude | dedicated | `.claude/skills` | `~/.claude/skills` | `${projectRoot}/.claude/skills` | `skill-md` |
| cursor | Cursor | universal | `.agents/skills` | `~/.cursor/rules` | `${projectRoot}/.cursor/rules` | `mdc` |
| cline | Cline | universal | `.agents/skills` | `~/.cline/rules` | `${projectRoot}/.cline/rules` | `mdc` |
| codebuddy | CodeBuddy | dedicated | `.codebuddy/skills` | `~/.codebuddy/skills` | `${projectRoot}/.codebuddy/skills` | `skill-md` |
| trae | Trae | dedicated | `.trae/skills` | `~/.trae/skills` | `${projectRoot}/.trae/skills` | `skill-md` |
| opencode | OpenCode | universal | `.agents/skills` | `~/.opencode/skills` | `${projectRoot}/.opencode/skills` | `opencode-md` |
| amp | Amp | universal | `.agents/skills` | `~/.config/agents/skills` | `${projectRoot}/.agents/skills` | `skill-md` |
| antigravity | Antigravity | universal | `.agents/skills` | `~/.gemini/antigravity/skills` | `${projectRoot}/.agents/skills` | `skill-md` |
| augment | Augment | dedicated | `.augment/skills` | `~/.augment/skills` | `${projectRoot}/.augment/skills` | `skill-md` |
| command-code | Command Code | dedicated | `.commandcode/skills` | `~/.commandcode/skills` | `${projectRoot}/.commandcode/skills` | `skill-md` |
| continue | Continue | dedicated | `.continue/skills` | `~/.continue/skills` | `${projectRoot}/.continue/skills` | `skill-md` |
| cortex | Cortex Code | dedicated | `.cortex/skills` | `~/.snowflake/cortex/skills` | `${projectRoot}/.cortex/skills` | `skill-md` |
| crush | Crush | dedicated | `.crush/skills` | `~/.config/crush/skills` | `${projectRoot}/.crush/skills` | `skill-md` |
| deepagents | Deep Agents | universal | `.agents/skills` | `~/.deepagents/agent/skills` | `${projectRoot}/.agents/skills` | `skill-md` |
| droid | Droid | dedicated | `.factory/skills` | `~/.factory/skills` | `${projectRoot}/.factory/skills` | `skill-md` |
| gemini-cli | Gemini CLI | universal | `.agents/skills` | `~/.gemini/skills` | `${projectRoot}/.agents/skills` | `skill-md` |
| github-copilot | GitHub Copilot | universal | `.agents/skills` | `~/.copilot/skills` | `${projectRoot}/.agents/skills` | `skill-md` |
| goose | Goose | dedicated | `.goose/skills` | `~/.config/goose/skills` | `${projectRoot}/.goose/skills` | `skill-md` |
| junie | Junie | dedicated | `.junie/skills` | `~/.junie/skills` | `${projectRoot}/.junie/skills` | `skill-md` |
| iflow-cli | iFlow CLI | dedicated | `.iflow/skills` | `~/.iflow/skills` | `${projectRoot}/.iflow/skills` | `skill-md` |
| kilo | Kilo Code | dedicated | `.kilocode/skills` | `~/.kilocode/skills` | `${projectRoot}/.kilocode/skills` | `skill-md` |
| kimi-cli | Kimi Code CLI | universal | `.agents/skills` | `~/.config/agents/skills` | `${projectRoot}/.agents/skills` | `skill-md` |
| kiro-cli | Kiro CLI | dedicated | `.kiro/skills` | `~/.kiro/skills` | `${projectRoot}/.kiro/skills` | `skill-md` |
| kode | Kode | dedicated | `.kode/skills` | `~/.kode/skills` | `${projectRoot}/.kode/skills` | `skill-md` |
| mcpjam | MCPJam | dedicated | `.mcpjam/skills` | `~/.mcpjam/skills` | `${projectRoot}/.mcpjam/skills` | `skill-md` |
| mistral-vibe | Mistral Vibe | dedicated | `.vibe/skills` | `~/.vibe/skills` | `${projectRoot}/.vibe/skills` | `skill-md` |
| mux | Mux | dedicated | `.mux/skills` | `~/.mux/skills` | `${projectRoot}/.mux/skills` | `skill-md` |
| neovate | Neovate | dedicated | `.neovate/skills` | `~/.neovate/skills` | `${projectRoot}/.neovate/skills` | `skill-md` |
| openhands | OpenHands | dedicated | `.openhands/skills` | `~/.openhands/skills` | `${projectRoot}/.openhands/skills` | `skill-md` |
| pi | Pi | dedicated | `.pi/skills` | `~/.pi/agent/skills` | `${projectRoot}/.pi/skills` | `skill-md` |
| qoder | Qoder | dedicated | `.qoder/skills` | `~/.qoder/skills` | `${projectRoot}/.qoder/skills` | `skill-md` |
| qwen-code | Qwen Code | dedicated | `.qwen/skills` | `~/.qwen/skills` | `${projectRoot}/.qwen/skills` | `skill-md` |
| replit | Replit | universal | `.agents/skills` | `~/.config/agents/skills` | `${projectRoot}/.agents/skills` | `skill-md` |
| roo | Roo Code | dedicated | `.roo/skills` | `~/.roo/skills` | `${projectRoot}/.roo/skills` | `skill-md` |
| trae-cn | Trae CN | dedicated | `.trae-cn/skills` | `~/.trae-cn/skills` | `${projectRoot}/.trae-cn/skills` | `skill-md` |
| warp | Warp | universal | `.agents/skills` | `~/.agents/skills` | `${projectRoot}/.agents/skills` | `skill-md` |
| windsurf | Windsurf | dedicated | `.windsurf/skills` | `~/.codeium/windsurf/skills` | `${projectRoot}/.windsurf/skills` | `skill-md` |
| zencoder | Zencoder | dedicated | `.zencoder/skills` | `~/.zencoder/skills` | `${projectRoot}/.zencoder/skills` | `skill-md` |
| pochi | Pochi | dedicated | `.pochi/skills` | `~/.pochi/skills` | `${projectRoot}/.pochi/skills` | `skill-md` |
| adal | AdaL | dedicated | `.adal/skills` | `~/.adal/skills` | `${projectRoot}/.adal/skills` | `skill-md` |
<!-- COMPAT-MATRIX-END -->

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
- Default scan sources include the canonical `.agents/skills` directories when you run `skillsdock scan` without explicit path arguments:
  - `~/.agents/skills`
  - `${projectRoot}/.agents/skills`
- Scan discovery follows the same priority style as `vercel-labs/skills`:
  - common directories (such as `skills/`, `.agents/skills/`, `.claude/skills/`, `.codex/skills/`, etc.)
  - `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json` declared skill paths
  - recursive scan fallback
- Manifest-declared plugin ownership is persisted as `pluginName` on scanned registry items.
- SkillsDock also supports read-only interoperability with the `vercel-labs/skills` global lockfile:
  - reads `$XDG_STATE_HOME/skills/.skill-lock.json` when `XDG_STATE_HOME` is set
  - otherwise falls back to `~/.agents/.skill-lock.json`
  - only enriches matched `~/.agents/skills/<name>/SKILL.md` registry items with additive metadata such as `externalSourceUrl`, `externalHash`, and `externalPluginName`
  - does not write back to the external lockfile and does not create synthetic skills from lock entries alone
- Frontmatter parsing is powered by `gray-matter`.
- `skillsdock doctor --skills-spec` validates spec-convention compliance and plugin manifest path safety.
- `skillsdock doctor` also reports external lockfile presence, version, and unmatched entries for read-only interop health checks.
- `list` and `all-local-skills` prefer canonical `.agents/skills` copies and collapse duplicate rows when multiple records resolve to the same real path.
- Text `list` and `all-local-skills` output is grouped into stable `Ungrouped` and per-plugin sections; `--json` keeps the existing `count` + `items` envelope and only adds plugin metadata fields.

## Sync Format Behavior

- Same format + non-package source: symlink (default mode) or copy.
- `.skill` source package: extracted and copied as converted content.
- Cross-format sync: converted and copied.
- Built-in `skill-md` targets sync canonical-first:
  - universal agents write directly into `.agents/skills`
  - non-universal agents keep their native target path as a symlink mirror of `.agents/skills`
- Symlink writes resolve destination parent realpaths before computing relative link targets.
- If source and destination already resolve to the same real path, the sync write is skipped.
- Existing broken or circular destination symlinks are replaced safely before writing.
- If symlink fails and fallback is `copy`, SkillsDock writes copied content and reports a warning.
- Governance tag behavior:
  - `regular` and `frozen` are eligible for sync.
  - `disabled` and `deleted` are excluded from sync.

## Detection Metadata

- Each built-in agent scope now includes `detectInstalled.paths` metadata in `bin/agent-registry.json`.
- `skillsdock doctor --agents` resolves those paths and reports:
  - install family (`dedicated` or `universal`)
  - canonical dir hint
  - installed detection status (`yes`, `no`, or `n/a`)

## Platform Support

- Required and validated in CI: **macOS**, **Linux**.
- Node versions in CI: **18**, **20**, **22**.
- Windows support is not guaranteed in v0.2.0.

## Reference Note

Agent path presets are curated from publicly documented conventions and maintained in-repo at `bin/agent-registry.json`.

SkillsDock does not fetch agent path data from network at runtime.
