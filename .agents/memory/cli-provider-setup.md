---
name: CLI provider setup
description: Environment-specific setup and authentication behavior for the direct-provider CLI/MCP tools.
---

Claude Code, Codex, and Gemini CLIs can be installed into the existing project-local
global-bin directory used by the DeepSeek wrapper. A pnpm global install may skip
Claude's native postinstall; running its bundled installer script is required before
the `claude` launcher works.

**Why:** The workspace has no default pnpm global-bin directory, and Codex did not
forward the project's OpenAI key under its usual name during a first probe.

**How to apply:** Configure the global bin directory before installing CLI packages,
run the Claude native installer when its launcher reports a missing binary, and map
the project's OpenAI key to `CODEX_API_KEY` for Codex CLI invocations. Codex CLI
version verified here accepts `xhigh` as its highest reasoning setting. Native
Claude `sonnet` resolved to `claude-sonnet-5` during a medium-effort probe.