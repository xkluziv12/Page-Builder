# api-server

Express API backing Mission Control (STS/DCD/TechnoCycle page-generation pipeline)
and the M.A.R.K. prompt library. Mounted at `/api`. Bundled with esbuild to a single
ESM file (`dist/index.mjs`); depends on the workspace packages `@workspace/db`,
`@workspace/mc-core`, `@workspace/github-sync`, `@workspace/api-zod`,
`@workspace/integrations-anthropic-ai`.

## Scope of this file

This CLAUDE.md governs **this artifact directory only**
(`artifacts/api-server/`). Do not use it to justify touching other artifacts
(`artifacts/mission-control`, `artifacts/page-terminal`) or `lib/*` shared
packages — those are out of scope for changes made under this file's authority.

## Hard rules

- **Google Drive is out of scope for new work.** `src/lib/googleDrive.ts` /
  `src/lib/promptSync.ts` are existing, working integrations (prompt library
  publishing via the Replit Drive connector) — leave them as-is. Do not add new
  Drive usage or expand its scope without an explicit ask.
- **Never expose secrets.** `ADMIN_TOKEN`, `GITHUB_WEBHOOK_SECRET`, the GitHub
  sync token (`TOKEN_ENV` from `@workspace/github-sync`), `GTMETRIX_API_KEY`,
  and Anthropic/OpenAI keys must never be echoed in responses, logs, or error
  bodies. `test/mc-auth.test.mjs` asserts the admin token is never echoed back —
  keep that invariant when touching auth-adjacent routes.
- **Preserve fail-closed auth.** `requireAdmin` / `isAdminRequest`
  (`src/middlewares/adminAuth.ts`) deny by default when `ADMIN_TOKEN` is unset —
  never change this to fail-open. All of `src/routes/mc.ts` is gated by
  `router.use(requireAdmin)` at the top of the file; `src/routes/index.ts`
  wraps `mc-worklog` with `requireAdmin` explicitly and mounts `prompts` (public
  reads, admin-gated writes) *before* `mcRouter` so the public prompt routes
  aren't accidentally shadowed by the admin gate. If you add a route, make sure
  it lands on the correct side of that gate intentionally, not by accident.
- **Preserve SSRF guards.** `isAllowedQcUrl` in `src/routes/mc.ts` restricts the
  operator-supplied QC override URL to the production base domain (+
  subdomains) over http/https — this exists because QC fetches an
  operator-supplied URL server-side. Page-research SSRF hardening (DNS
  resolution checks, redirect/timeout/response-size bounds) lives in the shared
  `lib/mc-core` package (`seo/url.ts`, `meta/research.ts`), not in this
  artifact — do not duplicate or bypass it when calling into `mc-core` from
  here; if a route accepts an operator-supplied URL that gets fetched
  server-side, it needs an equivalent allowlist/bounds check.
- **Preserve atomic publishing.** A Mission Control publish phase is only
  reported as `published` when the publisher confirms an actual write
  (`output.published === true` in `executePhase`, `src/routes/mc.ts`). The stub
  publisher (no `JOOMLA_PUBLISH_URL`) must keep returning `published: false` and
  leave the run in review — never report a half/no-write as published.
- **Preserve fail-loud checkers/sync.** Checker runs, git prompt sync
  (`src/lib/gitSync.ts`), and the GitHub mirror scheduler
  (`src/lib/github-mirror-scheduler.ts`) log errors every tick and surface
  `ok: false` / non-2xx on failure — they must never silently no-op or swallow
  an error into a false "synced" state.
- **Do not modify frontend artifacts or `main` directly.** This artifact talks
  to `artifacts/mission-control` and `artifacts/page-terminal` as clients but
  does not own their code. Working-tree changes to those directories (seen at
  inspection time) are pre-existing and out of scope for this file — see
  "Pre-existing changes observed" below.

## Stack

- Node + Express 5, TypeScript, esbuild bundling (`build.mjs` → `dist/index.mjs`)
- pino/pino-http logging (redacted serializers already strip req/res down to
  id/method/url/status — don't widen them to include headers/body)
- drizzle-orm against `@workspace/db`
- Anthropic (`@workspace/integrations-anthropic-ai`) + OpenAI + `@google/genai`
  as generation engines; `@replit/connectors-sdk` for the Google Drive connector

## File map

- `src/index.ts` — entrypoint; requires `PORT`; starts schedulers (work-log,
  git sync poller, GitHub mirror) after `app.listen`.
- `src/app.ts` — Express app: pino-http, cors, JSON body parsing (captures
  `rawBody` for the GitHub webhook HMAC check), mounts `router` at `/api`.
- `src/routes/index.ts` — route composition + the admin-gate ordering described
  above.
- `src/routes/mc.ts` — Mission Control run pipeline (create/list/run
  phase/approve/publish/QC/chat-edit/manual-edit). Entire router is
  admin-gated. Contains the phase-ladder state machine (`executePhase`) and the
  QC SSRF allowlist (`isAllowedQcUrl`).
- `src/routes/mc-worklog.ts` — canonical page work-log; admin-gated at the
  router level (`src/routes/index.ts`).
- `src/routes/prompts.ts` — M.A.R.K. prompt library: public reads (drafts
  redacted for non-admin via `redactDraft`), admin-gated writes/publish, and a
  signature-verified GitHub push webhook (`/prompts/sync/github`, disabled
  unless `GITHUB_WEBHOOK_SECRET` is set, HMAC-checked with
  `crypto.timingSafeEqual`).
- `src/routes/github-sync.ts` — outbound mirror status (public, no secrets) +
  admin-gated manual "sync now" trigger.
- `src/routes/health.ts` — health check.
- `src/lib/mc-runtime.ts` — engine resolution, registry loading, run-context
  assembly; bridges routes to `@workspace/mc-core`.
- `src/lib/gitSync.ts` — inbound prompt sync from `GITHUB_SOURCE_REPO` (poller +
  webhook-triggered), fail-loud, mutex-guarded.
- `src/lib/github-mirror-scheduler.ts` — outbound one-way mirror to GitHub,
  fingerprint-gated, fail-loud every tick.
- `src/lib/googleDrive.ts`, `src/lib/promptSync.ts` — prompt library's Google
  Drive publish target (never throws; failure is reported, not swallowed).
- `src/lib/mc-worklog.ts`, `src/lib/mc-worklog-external.ts`,
  `src/lib/mc-worklog-scheduler.ts` — work-log persistence, external
  (GSC/Sheets) sync seams, and its background scheduler.
- `src/middlewares/adminAuth.ts` — `requireAdmin` / `isAdminRequest`, fail-closed.
- `test/mc-auth.test.mjs` — regression test for the admin gate on `mc.ts`
  routes; bundles the real router with esbuild and asserts 401s + no token echo.

## Known lessons (see git history for detail)

- **Mission Control auth**: the admin gate was retrofitted route-by-route; the
  safe pattern is a router-level `router.use(requireAdmin)` (as in `mc.ts`)
  rather than gating each handler individually, since it's harder to forget on
  a new route. `test/mc-auth.test.mjs` exists specifically to catch a route
  accidentally added outside the gate — extend it when adding new protected
  routes rather than trusting manual review alone.
- **GitHub sync protection**: both directions (inbound prompt sync, outbound
  mirror) were hardened to require explicit authorization — the inbound webhook
  needs `GITHUB_WEBHOOK_SECRET` + valid HMAC signature (timing-safe compare) or
  it's disabled entirely (503); the outbound manual trigger needs
  `requireAdmin`. Neither should be reachable by an unauthenticated caller.
- **Page-research DNS/redirect/timeout/size safety**: page-research
  (SEO intel derivation, meta-research) fetches operator-supplied URLs
  server-side. The SSRF hardening (private/internal IP + DNS-rebinding checks,
  redirect limits, fetch timeouts, response-size caps) lives in `lib/mc-core`
  (`seo/url.ts`, `meta/research.ts`), not in this artifact. When adding a new
  route here that fetches an operator-supplied URL, reuse those `mc-core`
  helpers or apply the same class of guard (`isAllowedQcUrl` is the in-artifact
  example) — don't add a raw `fetch(userUrl)` without one.
- **Shared `mc-core` boundary**: business logic (checkers, registry, phase
  prompts, research/meta, SEO derivation, QC) lives in `@workspace/mc-core` and
  is treated as a stable dependency here, not code to inline or fork. This
  artifact is the HTTP/persistence/orchestration layer around it
  (`mc-runtime.ts` is the seam). Fixes to research/SSRF/checker behavior belong
  in `mc-core`; fixes to routing, auth gating, and DB persistence belong here.

## Verification commands (safe, local, no external calls)

Run from `artifacts/api-server/`:

```sh
pnpm run typecheck     # tsc --noEmit
pnpm run test          # node --test test/mc-auth.test.mjs (bundles mc.ts, asserts 401 gating)
pnpm run build         # esbuild bundle to dist/ (no network access required)
```

`pnpm run dev` / `pnpm run start` boot the real server and require `PORT`,
`DATABASE_URL`, and will attempt live DB/scheduler connections — do not run
these as a "verification" step; prefer `typecheck` + `test` + `build`.

## Pre-existing changes observed (not made by this task)

At inspection time, the repo working tree had unstaged/untracked modifications
in `artifacts/mission-control` and `artifacts/page-terminal`
(`index.html`, `run-detail.tsx`, `App.tsx`, several `public/tools/*.html`
files, and a new untracked `page-terminal/CLAUDE.md`). This artifact directory
(`artifacts/api-server/`) itself was clean (no diff, nothing untracked) before
this file was added. Those other changes were not created, modified, or
reviewed as part of documenting this artifact.
