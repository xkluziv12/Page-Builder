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

## Model support can depend on the CLI version

An explicit Claude model can be available to the account but rejected by an older
Claude Code client with a minimum-version error. Do not misreport that as a missing
model or silently substitute another model.

**Why:** The requested Opus model was rejected before the audit began because the
installed CLI was too old, not because authentication or repository access failed.

**How to apply:** Obtain authorization for a CLI upgrade, update the existing
global CLI rather than adding it to app dependencies, complete its native
postinstall if pnpm skipped it, and verify the launcher before redispatching.