# Page Terminal

Page Terminal is the "M.A.R.K." (Machine Assisted Routing Kit) toolset — a navy/gold navigation shell that hosts a set of standalone SEO/page-building tools (Page Rebuild, Hub + Spoke, Service Pages, Blogs, and dashboards) for STS Electronic Recycling virtual assistants.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/page-terminal/src/App.tsx` — the navigation shell (navy/gold nav bar) that switches the active tool in an iframe. Nav items and their target files are defined in the `TOOLS` array.
- `artifacts/page-terminal/src/terminal.css` — styling for the nav shell.
- `artifacts/page-terminal/public/tools/*.html` — the standalone tool pages (one self-contained HTML file each), served as static assets and loaded into the shell via iframe.
- `artifacts/page-terminal/public/tools/_placeholder.css` + `new-pages.html` / `marketing.html` / `ai-pages.html` — themed "not configured yet" placeholders for the modules that were empty in the source.

## Architecture decisions

- The original system was a GitHub Pages site (`xkluziv12/Page-Builder`) where a thin wrapper iframed standalone HTML tools. This rebuild preserves that architecture: a React nav shell + static HTML tools loaded by iframe — not a React rewrite of each tool.
- The tool pages are fully self-contained (inline CSS/JS). They are NOT cross-linked; navigation lives only in the shell.
- Several dashboard tools (`DCD-grading`, `SALES-grading`, `WIW-data`, `blog-terminal`) fetch from external n8n webhooks at `stsrecycling.app.n8n.cloud`. Those remain external dependencies and are not hosted here.

## Product

This monorepo also hosts **Mission Control** (`artifacts/mission-control`), a standalone page-builder app (Dashboard mode) for STS VAs. A VA enters a city + Go and the server runs a phase pipeline — Research → Build → Audit → Schema → Publish — with per-phase review/approve gates, DB-backed run state, a live preview frame, AI chat-edit, a loud checker suite, parallel runs, an STS blog track, and an atomic Joomla publishing seam.

- Engine logic lives in the reusable lib `@workspace/mc-core` behind a clean `AIEngine` seam. A run picks ONE engine: the three model-backed Dashboard engines — `ClaudeEngine` (claude-sonnet-4-6), `OpenAIEngine` (gpt-5.4, Responses API + background poll), `GeminiEngine` (gemini-3.1-pro-preview) — all extend a shared `PromptCompletionEngine` base so they drive the pipeline with byte-identical prompts and differ only in the provider call; plus `ReplitEngine` (Replit mode, an operator-driven engine that returns Agent-supplied content). The pipeline orchestrator never imports a concrete LLM client directly, and every engine flows through the same `runPhase` + checker suite. The factory `engineFor()` in `mc-runtime.ts` constructs each: Claude via the Anthropic integration, OpenAI/Gemini via STS's own `OPENAI_API_KEY` / `GEMINI_API_KEY` (lazy + fail-loud). Fan-out to multiple engines per run is deferred.
- Backed by namespaced routes (`/api/mc/*`) in the shared api-server and dedicated `mc_*` tables. Page Terminal is untouched.
- The Research phase runs behind a `ResearchProvider` seam. By default it uses the in-app `DirectResearchProvider` (Perplexity web-grounded research + citations via `PERPLEXITY_API_KEY`, SerpAPI entities via `SERPAPI_API_KEY`, and Claude synthesis via the existing Anthropic integration). Set `MC_RESEARCH_PROVIDER=n8n` to fall back to the external `mark-ai-brain` webhook. Missing keys / failed provider calls fail loudly and downstream phases stay locked.
- On run creation the server derives city/state/niche/classification/competition/seoIntel live from the target URL, then **cross-checks the URL-parsed city/state against the fetched page content** (JSON-LD PostalAddress + "City, ST ZIP" text) to catch same-named cities in the wrong state. Verification only confirms or corrects the **state** (never switches to a different city) and never blocks run creation — see `lib/mc-core/src/seo/location.ts` and `deriveRunInputs` in `artifacts/api-server/src/lib/mc-runtime.ts`.
- Run with `pnpm --filter @workspace/mission-control run dev`; engine unit tests: `pnpm --filter @workspace/mc-core run test`.

## User preferences

### Working style (Mark's Builder Protocol — distilled)

Apply these on every build in this repo. Full reference: `docs/marks-builder-protocol.md`.

- **Clarify before building.** Resolve ambiguous requirements with 1–3 targeted questions up front, not after writing code. One unclear requirement at the design stage becomes several failures at execution.
- **Flag change vs. new.** When modifying an existing prompt, workflow, schema, or component, explicitly call out what changed vs. what is genuinely new.
- **Schema-first; validate at every handoff.** Any output entering a pipeline / CMS / DB / n8n / API must match an explicit schema (Zod + OpenAPI here) and be validated before it crosses the boundary. Never trust format compliance — confirm it.
- **Fail loudly; never silently degrade.** If a build can't proceed cleanly (missing input, failed tool, malformed schema), halt and state what's missing rather than emit a partial or placeholder result. (Matches the existing fail-loud convention in `deriveRunInputs`, Research, and SerpAPI.)
- **Treat all external input as untrusted.** Form submissions, VA inputs, scraped/fetched page content, n8n payloads, and API responses are prompt-injection and data-integrity vectors — sanitize/validate before use.
- **Trace error propagation before shipping.** For multi-step automations, check how a step-1 error compounds downstream; fix the chain, not just the node.
- **Critique–revise + review before "done."** At least one self-review pass against the original spec, plus an architect code review for major features.
- **Produce a handoff spec for VA/deploy work.** Inputs, outputs, dependencies, edge cases, stop conditions (see `docs/replit-agent-runbook.md`).

## Gotchas

- **Mission Control control-plane routes are admin-protected.** The `/api/mc/*` endpoints and separately mounted Mission Control work-log routes use the shared fail-closed admin bearer middleware. The Mission Control UI also verifies the admin token at runtime before mounting dashboard queries. Preserve this boundary for new mutating control-plane routes; do not weaken it or expose the API without equivalent protection.
- The work-log Sheets mirror fires **fire-and-forget after every completion** (old-tool POST, MC publish, and post-import). It is best-effort: when the Google Sheets connector / `WORKLOG_SHEET_ID` is unset it logs a debug "skipped (not configured)" and never fails the underlying upsert.
- The monthly GSC snapshot pull runs from an **internal daily scheduler** (`mc-worklog-scheduler.ts`, started in `index.ts`). It self-throttles by checking the snapshot table for a `gsc-monthly` row in the current month, so restarts never double-pull. Tune the day-of-month via `GSC_PULL_DAY_OF_MONTH` (default 3).
- **GitHub auto-sync is a ONE-WAY mirror (workspace → `xkluziv12/page-terminal@main`); remote-only edits get overwritten.** The api-server runs a background scheduler (`github-mirror-scheduler.ts` + `@workspace/github-sync`) that fingerprints tracked files every `GITHUB_SYNC_INTERVAL_MINUTES` (default 5) and pushes a mirror commit via the GitHub Git Data API using the `xkluziv12_git` secret. Kill switch: `GITHUB_SYNC_DISABLED=1`. Status: `GET /api/github-sync/status`; instant push: `POST /api/github-sync/now` with `Authorization: Bearer <ADMIN_TOKEN>`, or `pnpm --filter @workspace/scripts run github:sync`. A missing token or GitHub failure logs a loud error every tick (never a silent skip). Don't confuse it with the separate **inbound** prompt sync (`gitSync.ts`, `GITHUB_SOURCE_REPO`), whose webhook must have `GITHUB_WEBHOOK_SECRET` configured and pass its HMAC check.

_Populate as you build — sharp edges, "always run X before Y" rules._

## Claude CLI dispatch (Replit as supervisor)

Adopted from Mark's Replit-Agent rules packet, adapted to this repo's actual architecture. Applies to all new work in this workspace, not only Mission Control.

- **Roles are split.** Claude Code CLI is the implementation, debugging, and verification worker. Replit's own Agent is the scope/dispatch/supervision layer: it defines the task, hands it to the CLI, and independently re-checks the result. Replit does not write the fix itself when the CLI can be dispatched instead.
- **Default model: Sonnet at medium reasoning effort.** Use a stronger tier only when a task explicitly calls for it, not by default.
- **Exact invocation** (stdin input, no session persistence — each dispatch is a fresh process, never `--continue`/`--resume`):
  ```
  cat <task-file> | claude --print --model sonnet --effort medium --permission-mode plan
  cat <task-file> | claude --print --model sonnet --effort medium --permission-mode acceptEdits
  ```
  Use `plan` for diagnosis/audit-only dispatches and `acceptEdits` only for an already-scoped, approved implementation task.
- **Bounded, named-file tasks only.** Scope each dispatch to one artifact (Mission Control, Page Terminal, Bake-Off, or the API/shared-core layer) and a named list of files, per the pattern already in `.agents/memory/claude-cli-workflow.md`. Open-ended root-wide "audit and fix" prompts have previously run past the shell execution window without a trustworthy result.
- **Audit and implementation are separate dispatches.** Run a `plan` pass to diagnose first; only start a separate `acceptEdits` pass once the fix is scoped and approved. Don't fold both into one dispatch.
- **Completion requires more than exit code 0.** A dispatch is done only when the CLI's exit code is clean AND Replit independently reruns the artifact's own verification commands (see each `artifacts/*/CLAUDE.md`) and inspects the diff. Exit code alone is not proof of a correct change.
- **Secret checks are presence-only.** When a dispatch needs to confirm a secret is configured, probe for its presence (e.g. that the env var is set) and never print, log, or echo its value. Locally verified secret names actually read by this codebase: `DATABASE_URL`, `ADMIN_TOKEN`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `PERPLEXITY_API_KEY`, `SERPAPI_API_KEY`, `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `GTMETRIX_API_KEY`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_SYNC_REPO`, `XKLUZIV12_GITHUB_MASTER_TOKEN`, `JOOMLA_PUBLISH_URL`, `JOOMLA_PUBLISH_TOKEN`, `WORKLOG_SHEET_ID`. Treat any secret name not confirmed by reading current source as unverified.
- **No new Replit-managed LLM integrations or connectors.** The `[agent] integrations` list in `.replit` currently wires up `github` and `google-drive` only — no Replit-managed AI/LLM connector exists or should be added. Mission Control's model access (`@workspace/integrations-anthropic-ai`, `ANTHROPIC_API_KEY`) is a **pre-existing, deliberate exception**: a direct Anthropic SDK integration chosen by project design before this rules adoption, kept as-is. Any *new* provider work (a new model, a new AI-backed feature) must go through a direct SDK/API-key integration the same way, wired through STS's own key, never through a new Replit blueprint/connector for an LLM. This does not affect "Replit mode" (`docs/replit-agent-runbook.md`), which is a human-driven Mission Control build engine, not an LLM connector.
- **Google Drive stays out of scope for new work.** The existing Drive connector (prompt-library publish target in `artifacts/api-server/src/lib/googleDrive.ts`) is legacy and unchanged; do not expand its usage or add Drive integration anywhere else (already enforced per-artifact in each `artifacts/*/CLAUDE.md`).
- **GitHub and deployment boundaries as they actually exist today:** `.replit` deploys this workspace as a single `autoscale` target; outbound GitHub sync is a **one-way mirror** (workspace to `xkluziv12/page-terminal@main`) driven by `github-mirror-scheduler.ts`, gated by the `XKLUZIV12_GITHUB_MASTER_TOKEN` secret, with a separate admin-gated manual trigger (`POST /api/github-sync/now`). Inbound prompt sync from `GITHUB_SOURCE_REPO` is a distinct, read-only path gated by `GITHUB_WEBHOOK_SECRET` + HMAC. Neither Replit nor a Claude CLI dispatch should push to any other GitHub repo, force-push, or change deployment config without an explicit, separate approval.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- `docs/replit-agent-runbook.md` — operator run-book for "Replit mode": running the page-building pipeline with the Replit Agent as a second engine alongside the Claude-API "Dashboard mode". Covers the engine toggle, queued runs, the operator CLI (`pnpm --filter @workspace/scripts run mc <cmd>`), per-phase handoff, and the parity gate.
- **Bake-Off (dead-simple URL + GMB compare):** `pnpm --filter @workspace/scripts run bakeoff:compare` — give a target URL + a verified GMB JSON block and it runs all models against that real page, scored against the live URL. Set `BAKEOFF_TARGET_URL` to the page URL and `BAKEOFF_GMB_JSON` to the verified Google Business Profile block (object with `pageUrl, gmbUrl, cid, businessName, street, city, state, zip, county, phone, landmark, lat, lng, hours`; `neighborhoods` optional). This script defaults `BAKEOFF_SCENARIOS=gmb`; on a non-Billings target with no `BAKEOFF_GMB_JSON` it fails loud (never invents NAP/CID). The faithful old VA reproduction stays reachable via `BAKEOFF_SCENARIOS=no-gmb pnpm --filter @workspace/scripts run bakeoff`. A live sweep costs money — only Mark triggers it with a real URL+GMB.
