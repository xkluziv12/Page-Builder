# CLAUDE.md (root)

This file governs Claude Code CLI dispatches in this workspace. It stands alone: read it even if you were not given `replit.md` or an artifact `CLAUDE.md` in your task context. Replit's own Agent is the layer that scopes, dispatches, and independently verifies your work; you are the implementation, debugging, and verification worker for the bounded task you were given.

## Root workspace boundary

This is a pnpm workspace monorepo (`pnpm-workspace.yaml`) with four independently deployed frontend artifacts under `artifacts/*` sharing packages under `lib/*`. A dispatch scoped to one artifact must not edit files in another artifact, `lib/*`, or root config unless the task explicitly names those files. If a fix in your scope appears to require a change outside it, stop and report that instead of reaching across the boundary.

## Artifact boundaries

Each artifact has its own `CLAUDE.md` with artifact-specific hard rules, file map, and verification commands. Defer to it for anything artifact-specific; this file only covers what's common to all of them.

- `artifacts/mission-control/CLAUDE.md` — admin dashboard frontend, no server code of its own.
- `artifacts/api-server/CLAUDE.md` — shared Express API, admin-gated Mission Control routes.
- `artifacts/page-terminal/CLAUDE.md` — self-contained static HTML tools in a React shell; never convert a tool into a React component.
- `artifacts/bake-off/CLAUDE.md` — static leaderboard viewer only; the generation harness lives in `scripts/src/bakeoff/` and is a separate scope.

## Protected paths

Never edit without an explicit, named instruction to do so:

- `.replit`, `.replit-artifact/*/artifact.toml`, `replit.nix` — deployment and workflow config.
- `.git/*`, GitHub remotes/tokens, or anything that pushes/force-pushes outside the existing one-way mirror described below.
- `.env*` files, secret values anywhere (code, logs, commit messages, tool output).
- `pnpm-lock.yaml`, `pnpm-workspace.yaml` unless the task is a dependency change.
- Any file under `attached_assets/`.

## The pre-existing Anthropic integration exception

Mission Control's model access (`lib/integrations-anthropic-ai`, using `@anthropic-ai/sdk` directly against `ANTHROPIC_API_KEY`) is a **pre-existing, deliberate project choice**, not something this rules adoption introduced. Leave it as-is. Do not "fix" it into a Replit-managed connector, do not duplicate it, and do not treat its existence as license to add more Replit-managed AI connectors elsewhere.

## Direct-provider rule for new provider work

If a task asks you to add or change model/provider access anywhere in this repo (a new model, a new AI-backed feature, a new API key), wire it the same way the existing engines do: a direct SDK/API-key integration reading from an environment variable owned by this project (see `OpenAIEngine`/`GeminiEngine` in `artifacts/api-server/src/lib/mc-runtime.ts` for the pattern). Never create, propose, or silently introduce a new Replit-managed LLM integration or connector. The `.replit` `[agent] integrations` list currently contains only `github` and `google-drive` — do not add an AI/LLM entry to it.

## Google Drive exclusion

Google Drive is out of scope for new work anywhere in this repo. The only live Drive usage is the legacy prompt-library publish target in `artifacts/api-server/src/lib/googleDrive.ts` and `promptSync.ts` — leave it unchanged. Do not add new Drive calls, Drive UI, or Drive auth in any artifact, even if a task seems to imply it.

## Verification commands

Run the commands for the artifact(s) you actually touched, then let Replit independently rerun them. Do not report a task complete on a clean exit code alone.

- Root: `pnpm run typecheck` (typechecks libs + all artifacts + scripts), `pnpm run build`.
- `artifacts/mission-control/`: `npm run typecheck`, `npm run build`.
- `artifacts/api-server/`: `pnpm run typecheck`, `pnpm run test`, `pnpm run build`.
- `artifacts/page-terminal/`: `pnpm --filter @workspace/page-terminal run typecheck`.
- `artifacts/bake-off/`: `pnpm run typecheck`, `pnpm run build`.
- `lib/mc-core`: `pnpm --filter @workspace/mc-core run test`.

Never run `dev`/`start`/`serve` as a verification step; those boot live servers and expect real env vars and network access.

## No secret output

Never print, log, echo, or write a secret value in any tool output, commit, or report back to Replit. If a task needs to confirm a secret is configured, check for its presence only (e.g. `[ -n "$VAR_NAME" ]` or reading whether `process.env.VAR_NAME` is set), never its content.

## No unapproved GitHub or deployment operations

The only sanctioned GitHub write path from this workspace is the existing one-way outbound mirror to `xkluziv12/page-terminal@main` (already implemented, admin-gated, token-gated). Do not push to any other repo, do not force-push, do not touch deployment config (`.replit` `[deployment]`, `artifact.toml` files) unless the task explicitly names that as the work.

## Bounded-task and completion contract

- Work only the named files/artifact you were dispatched for. If the fix needs a change outside that scope, stop and report the gap rather than expanding scope yourself.
- Keep audit (diagnosis, `plan` mode) and implementation (`acceptEdits` mode) as separate dispatches; don't fix while still diagnosing.
- A task is complete only when: the dispatch exits cleanly, the relevant verification commands above pass, and the diff matches the named scope. Report what you changed and what you verified, not just that you finished.
