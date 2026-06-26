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

- **`/api/*` is unauthenticated by design — this is a private internal VA tool.** None of the `/api/mc/*` endpoints (run create/publish/QC, and the work-log upsert/import/sheets-sync/gsc-pull) have route-level auth; the server mounts only `cors()` + body parsers. New mutating endpoints intentionally follow this existing convention rather than introducing a one-off auth system. **Do not expose this API to the public internet as-is** — if it ever needs to be internet-facing, add a single shared auth middleware across the whole `/api` router, not per-endpoint.
- The work-log Sheets mirror fires **fire-and-forget after every completion** (old-tool POST, MC publish, and post-import). It is best-effort: when the Google Sheets connector / `WORKLOG_SHEET_ID` is unset it logs a debug "skipped (not configured)" and never fails the underlying upsert.
- The monthly GSC snapshot pull runs from an **internal daily scheduler** (`mc-worklog-scheduler.ts`, started in `index.ts`). It self-throttles by checking the snapshot table for a `gsc-monthly` row in the current month, so restarts never double-pull. Tune the day-of-month via `GSC_PULL_DAY_OF_MONTH` (default 3).

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- `docs/replit-agent-runbook.md` — operator run-book for "Replit mode": running the page-building pipeline with the Replit Agent as a second engine alongside the Claude-API "Dashboard mode". Covers the engine toggle, queued runs, the operator CLI (`pnpm --filter @workspace/scripts run mc <cmd>`), per-phase handoff, and the parity gate.
