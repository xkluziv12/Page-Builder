---
name: Claude CLI dispatch discipline
description: How to use the project's Claude Code CLI reliably for implementation and verification work, and the rules-packet boundaries adopted alongside it.
---

# Claude CLI dispatch discipline

Use Claude Code as the implementation worker through short, artifact-scoped dispatches. Each artifact should have a concise `CLAUDE.md` describing its boundaries, source-of-truth rules, and verification commands. Use the pinned Sonnet/medium, no-session-persistence invocation; choose `plan` for diagnosis-only work and `acceptEdits` only for an approved bounded implementation task.

**Why:** Broad root-level audit-and-fix prompts repeatedly exceeded the shell execution window or stopped before returning a trustworthy report. Narrow passes over one artifact and a named set of files completed, made focused changes, and returned verifiable checks.

**How to apply:** Split site-wide work into Mission Control, Page Terminal, Bake-Off, and API/shared-core passes. Require Claude to run the artifact's exact typecheck/test/build commands, then independently rerun them, inspect the diff, and capture a preview screenshot where applicable. Keep Google Drive and secrets out of every prompt.

## Rules-packet adoption (root replit.md / root CLAUDE.md)

The root `replit.md` "Claude CLI dispatch" section and the standalone root `CLAUDE.md` codify a practical adaptation of an external rules packet (Mark's Replit-Agent rules), not a verbatim adoption. Key decisions worth remembering:

- Mission Control's direct Anthropic SDK integration (`@workspace/integrations-anthropic-ai`, `ANTHROPIC_API_KEY`) is a documented **pre-existing exception**, kept as-is — never "fixed" into a Replit-managed connector.
- Any *new* provider/model work must follow the same direct SDK/API-key pattern (see `OpenAIEngine`/`GeminiEngine` in `mc-runtime.ts`); no new Replit-managed LLM integration goes into `.replit`'s `[agent] integrations` list.
- Google Drive is frozen at its existing legacy usage (`googleDrive.ts`, `promptSync.ts`) — out of scope for any new work, in any artifact.
- Protected paths (`.replit`, `artifact.toml`, `replit.nix`, `.env*`, lockfiles, `attached_assets/`) and the actual GitHub/deployment boundaries (one-way outbound mirror only, no other pushes/force-pushes/deploy-config changes) are enumerated in root `CLAUDE.md`, not reinvented per dispatch.
- Grok and Codex remain dormant unless their installation and workflow are verified locally. Do not fabricate wrappers, health checks, gates, hooks, or task systems from the universal packet.
- Long jobs require a managed workflow or human-owned Shell tab, and imported operational claims must retain their evidence classification until reproduced here.

**Why:** Without a written boundary, a dispatch could plausibly "improve" the Anthropic integration into a Replit connector, expand Drive usage, or push to an unintended remote — all plausible-looking but unauthorized changes.

**How to apply:** Point any Claude CLI dispatch at root `CLAUDE.md` for these boundaries instead of restating them ad hoc in task prompts; treat it as the durable source of truth and update it (not just this memory) when the boundaries actually change.