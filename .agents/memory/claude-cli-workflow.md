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
- DeepSeek can use the Claude CLI harness through a local wrapper and direct Anthropic-compatible endpoint, but its model IDs may trigger a non-fatal Claude CLI registry warning. Verify both the provider response and CLI output, and keep the warning explicit until the CLI mapping is fixed.

**Why:** Without a written boundary, a dispatch could plausibly "improve" the Anthropic integration into a Replit connector, expand Drive usage, or push to an unintended remote — all plausible-looking but unauthorized changes.

**How to apply:** Point any Claude CLI dispatch at root `CLAUDE.md` for these boundaries instead of restating them ad hoc in task prompts; treat it as the durable source of truth and update it (not just this memory) when the boundaries actually change.

## Large prompt-string cleanup

For large, single-line static prompt strings, a freeform CLI rewrite can time out before producing a terminal result. Prefer a narrowly scoped, reviewable deterministic transformation when literal removal is authorized, then independently scan the complete intended scope and run the affected tests and typechecks.

**Why:** A process that stops without a terminal result cannot be trusted, and mechanical replacements can invalidate stale test expectations.

**How to apply:** Keep the transformation reversible and scoped, inspect the diff, repair only tests made obsolete by the authorized policy change, and do not call the cleanup complete until the literal scan, diff check, and relevant verification all pass.

## CLI OAuth environment handoff

In this workspace, the provisioned Claude CLI OAuth secret is named `claudOauth`, while Claude Code expects `CLAUDE_CODE_OAUTH_TOKEN`. The CLI reports “Not logged in” unless the former is passed to the latter for the process. Check presence only and never print the value.

**Why:** The wrapper is installed and healthy, but its expected environment-variable name differs from the provisioned secret name.

**How to apply:** For a bounded Claude dispatch, use a process-local environment assignment such as `CLAUDE_CODE_OAUTH_TOKEN="$claudOauth"`; do not persist or echo the token.

## Large visual audits

Split large visual audits into page-sized CLI reviews with a saved terminal report
for each page, followed by a source-only engine review. Verify image and source
coverage against successful tool results, not the auditor's claimed coverage.

**Why:** An all-in-one screenshot audit repeatedly reread earlier images without
advancing to page sources or returning a usable report. Bigger prompts did not
solve the missing coverage.

**How to apply:** Give each review an explicit file/image manifest, persist its
result independently, record successful image reads without retaining image bytes
in logs, and reconcile coverage before consolidating. Keep deterministic checker
execution separate from subjective visual scoring.