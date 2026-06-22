---
name: Prompt Manager publish/sync
description: How the Prompt Manager publishes (DB + Google Drive; outbound GitHub backup removed) and the Replit connector proxy pattern it relies on.
---

# Prompt Manager — Publish to DB + Drive

Publishing a prompt writes to the app database and a Google Drive folder
(VA-facing copies).

**Outbound GitHub "backup repo" publish was REMOVED.** Prompts are authored
upstream in `GITHUB_SOURCE_REPO` (`xkluziv12/master-prompts`) and pulled into the
DB read-only by the inbound auto-sync — that source repo IS the durable git
master, so a second app-written backup repo (`page-terminal-prompts`) was
redundant. The whole outbound commit path + `GITHUB_PROMPTS_REPO`/`_BRANCH` env
were removed (`commitPromptFile` gone; `PublishOutcome`/`PublishResult` are
`{ prompt, drive }`; `prompt_publishes` dropped its `git_*` columns).
**Why:** single source of truth lives upstream; an app-pushed copy only invited
drift and a write-boundary risk toward the parallel dashboard's repos.

## Design rules (keep these)
- **No auto-publish.** Nothing ever syncs to Drive on its own. A push only
  happens when an admin clicks **Publish** (admin-token gated). Saving edits and
  publishing are separate, deliberate actions.
- **DB first, then publish.** The row is saved and its version bumped before the
  Drive write runs. Drive can't throw (failures are caught into a per-target
  status), so a failure never loses the DB copy and is always retryable. No
  silent fallback — the UI shows the Drive ok/fail status.
- A new Drive file's id is persisted back to the prompt row (`driveFileId`) so
  future publishes update in place instead of creating duplicates.

## Replit connector proxy pattern (the non-obvious part)
Both GitHub and Google Drive go through the **Replit connectors proxy**, not the
vendor SDKs directly. Install `@replit/connectors-sdk` and call:
`new ReplitConnectors().proxy("<github|google-drive>", path, { method, body, headers })`.
- The proxy injects + refreshes the OAuth token automatically. Never cache a token.
- The proxy base is the vendor host: GitHub path is like `/repos/{owner}/{repo}/...`
  (api.github.com); Drive path is like `/drive/v3/files` and `/upload/drive/v3/files`
  (googleapis.com). The proxy returns a raw `Response` — call `.json()`/`.text()`.
- The app **writes** Drive copies into its own found-or-created "M.A.R.K. Prompts"
  folder. Creating a file is two steps: POST `/drive/v3/files` (metadata) then
  PATCH `/upload/drive/v3/files/{id}?uploadType=media`.
- Note: the connected google-drive connector actually has **broader-than-`drive.file`
  read** scope — it CAN list/export the user's pre-existing Docs (used to import
  the real master content). The app still creates its own copies for publishing.
- GitHub is now used **read-only** (inbound source sync only — see below). There
  is no outbound GitHub commit path anymore.

## Config (env)
- `GITHUB_SOURCE_REPO` = READ-ONLY source of truth (`xkluziv12/master-prompts`),
  branch via `GITHUB_SOURCE_BRANCH` (default main). Inbound auto-sync reads from here.
- `GIT_SYNC_INTERVAL_MS` poll interval (default 10s, min 3s).
- `GITHUB_WEBHOOK_SECRET` optional; if set, the webhook verifies the HMAC.

## Inbound auto-sync (git → DB, read-only)
`gitSync.ts` poller (started in `index.ts` after listen) pulls source files into
the DB so the tools/VA library always reflect the latest master logic.
- Per prompt, `prompts.git_source_path` names the source file (e.g.
  `sts-dcd/page-builder.md`). Null = not synced. Sync writes both `content` and
  `published_content` and bumps version only when the text actually changed.
- Cheap: checks source branch HEAD sha first, skips file fetches when unchanged
  (unless forced). Only advances the in-memory synced-sha when ALL files read
  cleanly, so a transient read error retries next poll.
- Triggers: background poll, `POST /api/prompts/sync` (admin, force),
  `POST /api/prompts/sync/github` (push webhook, instant). Status:
  `GET /api/prompts/sync/status`.
- Do NOT auto-create a webhook on master-prompts (write to their repo settings =
  boundary violation); the poller is the zero-touch default, webhook is opt-in.
- **Source→DB name mapping is NOT 1:1** — the dashboard genericized/renamed files.
  Verified by content: `sts-dcd/geo-authority-compliance.md` = "Job Title
  Framework" = our `sts/job-title-seo`; `geo-authority-k12.md` = our
  `k12-job-titles-seo`; `hub-spoke-planner.md` = our `hub-spoke`;
  `blog-creation-sts/dcd.md` = our `blog-strategy` (sts/dcd). Re-verify by content
  if remapping. Only STS-branded files + the one DCD blog file are mapped;
  unmapped dcd/* and technocycle/* placeholders intentionally don't sync (the
  source files are STS-branded; per-client rendering is the future fix).
- `GOOGLE_DRIVE_PROMPTS_FOLDER_ID` optional; unset → folder "M.A.R.K. Prompts"
  is found-or-created.
- `ADMIN_TOKEN` gates edit/publish (fail-closed if unset). VA copy/list view is
  ungated for now (whole app to be password-protected for VAs later).

## Repo boundary (agreed with the parallel dashboard project)
`xkluziv12/master-prompts` and `xkluziv12/framework` are owned by the SolveMy.AI
Prompts Dashboard. Page Terminal must NEVER write to them (no push/rename/delete/
history-rewrite); read-only is fine. Page Terminal's own prompt backup repo is
**`xkluziv12/page-terminal-prompts`** (private). Commits use the `xkluziv12`
account via the GitHub connector — never the `solve-my-ai-bot` identity/token.

## Agreed source-of-truth model (RENDER, don't fork) — future direction
The operator-approved model is **render-from-shared-template**, NOT owning forked
copies:
- `master-prompts` holds the genericized master templates (the shared "what to do"
  logic) with client-specific bits as `{{TOKENS}}`. The dashboard is the single
  writer there.
- Each client (STS/DCD/TechnoCycle) has its own **fact layer** (company name,
  services, certs, links). Example on their side: `clients/microant/fact-layer.json`.
- Page Terminal should **read the template read-only, fill `{{tokens}}` from the
  client's fact layer, and produce the rendered per-client prompt.** Our DB/repo
  hold the fact layers + rendered outputs, NOT a forked copy of the shared logic.
  This way one edit to shared logic re-renders for every client → no drift.
- Render contract: `{{double-brace}}` filled from fact layer; single `{brace}` are
  operator-filled; anything labelled "illustrative" stays verbatim.
- The 9 prompts seeded from Drive are RAW inputs of this shared logic — treat as
  inputs, not an independent fork to own/edit. (Refactor to the render engine is
  pending their deliverables: current genericized templates, fact-layer schema,
  an example fact layer.)

## How real content was loaded (one-off)
The Drive "(4.7)" docs (folder "MY STS PROMPTS") were exported and imported into
the 9 matching rows, then published. Each row publishes to
`page-terminal/<brand>/<slug>.md` in `git_path`.
- **CRITICAL — never point `drive_file_id` at the user's original Doc.** Publish
  WRITES to `drive_file_id`; pointing at a "(4.7)" source id would overwrite the
  user's master. Leave it null → app creates its own copy in "M.A.R.K. Prompts".

## Loading content into the app DB (sandbox can't resolve @workspace/db)
`code_execution` can't `import('@workspace/db')`. Pattern that works: export the
Drive docs to disk from the sandbox (Drive token via `listConnections`), then run
a loader in the `scripts` package (`scripts/src/load-real-prompts.ts`, reads
`PROMPT_CONTENT_DIR`) that writes `content` + normalizes `git_path`. Publish via
`POST /api/prompts/:id/publish` with `Authorization: Bearer $ADMIN_TOKEN` (the
server holds the connector auth; the bash shell has `$ADMIN_TOKEN`).
