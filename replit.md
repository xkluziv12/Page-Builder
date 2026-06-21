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

- Engine logic lives in the reusable lib `@workspace/mc-core` behind a clean `AIEngine` seam with two engines: `ClaudeEngine` (Dashboard mode, auto-runs via the Anthropic API) and `ReplitEngine` (Replit mode, an operator-driven engine that returns Agent-supplied content). The pipeline orchestrator never imports a concrete LLM client directly, and both engines flow through the same `runPhase` + checker suite.
- Backed by namespaced routes (`/api/mc/*`) in the shared api-server and dedicated `mc_*` tables. Page Terminal is untouched.
- The Research phase depends on the external n8n `mark-ai-brain` webhook; when that webhook is unavailable the phase fails loudly and downstream phases stay locked.
- On run creation the server derives city/state/niche/classification/competition/seoIntel live from the target URL, then **cross-checks the URL-parsed city/state against the fetched page content** (JSON-LD PostalAddress + "City, ST ZIP" text) to catch same-named cities in the wrong state. Verification only confirms or corrects the **state** (never switches to a different city) and never blocks run creation — see `lib/mc-core/src/seo/location.ts` and `deriveRunInputs` in `artifacts/api-server/src/lib/mc-runtime.ts`.
- Run with `pnpm --filter @workspace/mission-control run dev`; engine unit tests: `pnpm --filter @workspace/mc-core run test`.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- `docs/replit-agent-runbook.md` — operator run-book for "Replit mode": running the page-building pipeline with the Replit Agent as a second engine alongside the Claude-API "Dashboard mode". Covers the engine toggle, queued runs, the operator CLI (`pnpm --filter @workspace/scripts run mc <cmd>`), per-phase handoff, and the parity gate.
