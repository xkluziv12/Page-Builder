---
name: Claude CLI dispatch discipline
description: How to use the project’s Claude Code CLI reliably for implementation and verification work.
---

# Claude CLI dispatch discipline

Use Claude Code as the implementation worker through short, artifact-scoped dispatches. Each artifact should have a concise `CLAUDE.md` describing its boundaries, source-of-truth rules, and verification commands. Use the pinned Sonnet/medium, no-session-persistence invocation; choose `plan` for diagnosis-only work and `acceptEdits` only for an approved bounded implementation task.

**Why:** Broad root-level audit-and-fix prompts repeatedly exceeded the shell execution window or stopped before returning a trustworthy report. Narrow passes over one artifact and a named set of files completed, made focused changes, and returned verifiable checks.

**How to apply:** Split site-wide work into Mission Control, Page Terminal, Bake-Off, and API/shared-core passes. Require Claude to run the artifact’s exact typecheck/test/build commands, then independently rerun them, inspect the diff, and capture a preview screenshot where applicable. Keep Google Drive and secrets out of every prompt.