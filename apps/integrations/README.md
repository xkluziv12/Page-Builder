# Claude Code model integrations

This directory provides a project-scoped MCP server for Claude Code. It keeps
the native Claude worker separate from direct provider calls and never uses a
Replit-managed LLM connector.

## Installed and verified

- Claude Code `2.1.247`
  - Native model: `sonnet` resolved to `claude-sonnet-5`
  - Default effort: `medium`
  - Auth: the existing `claudOauth` secret is mapped at process launch to
    `CLAUDE_CODE_OAUTH_TOKEN`
- Codex CLI `0.150.1`
  - Model: `gpt-5.6-luna`
  - Highest verified Codex reasoning setting: `xhigh`
  - Auth: `CODEX_API_KEY` is mapped from `OPENAI_API_KEY`
- Gemini CLI `0.57.0`
  - Direct integration model: `gemini-3.7-flash`
- DeepSeek direct API: `deepseek-v4-pro`
- xAI direct API: `grok-4.6` and `grok-build-0.1`

The provider keys are passed through `.mcp.json` by environment-variable
reference only. Secret values are never stored in this directory.

## Claude Code tools

After approving the project-scoped MCP server in Claude Code, these tools are
available:

- `codex_luna_max`
- `deepseek_v4_pro`
- `grok_4_6`
- `grok_build`
- `gemini_3_7_flash`

The tools accept a single `prompt` string. The Codex tool uses a read-only
sandbox and `xhigh` reasoning. Other providers use their direct HTTPS APIs.