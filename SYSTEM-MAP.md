# System Map

> One-read orientation for this project. The **DB tables**, **API routes**, and
> **Artifacts** sections below are generated from source — do not edit them by
> hand; run `pnpm run system-map` to refresh. Everything else is hand-kept.

## Overview

This monorepo (pnpm workspaces, Node 24, TypeScript) ships four artifacts that
together serve STS Electronic Recycling's virtual assistants:

- **API Server** (`/api`) — the only backend. Express + Drizzle/Postgres. It
  serves a health check and the whole Mission Control pipeline under `/api/mc/*`.
- **Mission Control** (`/mission-control`) — the page-builder app. A VA enters a
  target URL; the server derives city/state + SEO intel and runs a five-phase
  pipeline (Research → Build → Audit → Schema → Publish) with review/approve
  gates, DB-backed run state, a live preview, AI chat-edit, and a checker suite.
  Engine logic lives in the reusable lib `@workspace/mc-core` behind an
  `AIEngine` seam (Claude "Dashboard mode" + operator-driven "Replit mode").
- **Page Terminal** (`/`) — the M.A.R.K. navy/gold nav shell that hosts a set of
  self-contained static HTML SEO tools via iframe. It is independent of the API.
- **Canvas** (`/__mockup`) — a design/component preview sandbox.

How they relate: Page Terminal and Canvas are front-of-house shells with no
backend coupling. Mission Control is the data-driven app and is the only artifact
that talks to the API Server, which owns the Postgres `mc_*` tables and the
external SEO / research / publish seams.

## DB tables

<!-- BEGIN GENERATED:db-tables (do not edit by hand — run `pnpm run system-map`) -->

| Table | Purpose |
| --- | --- |
| `mc_runs` | Mission Control build runs. Most pipeline state lives on the run row as JSONB (phases, research brief, checker report, joomla meta) so a single read reconstructs the full MissionRun the dashboard renders. |
| `mc_chat_messages` | AI chat-edit history per run. |
| `mc_page_versions` | Page HTML/schema version history (edit trail). |
| `mc_url_registry` | Configurable safeguard registry. The source allowlist shipped empty, so the checker suite validates against these DB-seeded rows (merged with defaults) rather than a hard-coded list. `kind` is one of: sacred, image, industry, allowlist. |
| `mc_qc_results` | Durable per-city post-publish QC record. Each run of the dashboard QC suite (GTmetrix speed + JSON-LD duplicate/integrity scan against the LIVE URL) inserts one row so the team keeps a permanent QC trail per city. The full QcReport is stored as JSONB; the boolean columns are denormalized for quick listing/filtering. |
| `mc_work_log` | Canonical unified work-log / page registry. This is the ONE trustworthy view of "which pages/blogs are done vs not done" that every path feeds into: the old static VA tools (Page Terminal, No-GMB, Hub+Spoke, Blog Terminal), the new Mission Control pipeline, and the one-time historical import all upsert here. The natural key is `normalizedUrl` (a stripped, lower-cased URL) enforced by a unique index, so re-logging the same page UPDATES the row rather than creating a duplicate. SEO history lives in the separate mc_seo_snapshot table (one row per check) — never overwrite a single value on this row. |
| `mc_seo_snapshot` | Date-stamped SEO snapshot, keyed to a work-log page (one row per page per check). History is preserved so monthly check-ins can compute trends (impressions % change, keyword position movement) — never overwrite. Two sources populate it: a "day-of" score captured on completion, and a scheduled monthly Google Search Console pull. |

<!-- END GENERATED:db-tables -->

## API routes

<!-- BEGIN GENERATED:api-routes (do not edit by hand — run `pnpm run system-map`) -->

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/healthz` | Health check |
| GET | `/api/mc/runs` | List all build runs |
| POST | `/api/mc/runs` | Create a new build run |
| GET | `/api/mc/summary` | Dashboard summary (counts and recent activity) |
| GET | `/api/mc/seo-intel` | Live SEO intel derived from a target URL |
| GET | `/api/mc/registry` | The locked URL/image/link safeguard registry |
| GET | `/api/mc/runs/{id}` | Get a single run with full state |
| DELETE | `/api/mc/runs/{id}` | Delete a run |
| POST | `/api/mc/runs/{id}/phases/{phase}/run` | Execute a pipeline phase |
| POST | `/api/mc/runs/{id}/phases/{phase}/replit` | Submit an operator/Agent-produced artifact and execute the phase (Replit mode) |
| POST | `/api/mc/runs/{id}/phases/{phase}/approve` | Approve a completed phase and unlock the next |
| POST | `/api/mc/runs/{id}/check` | Run the checker suite against the current page HTML |
| POST | `/api/mc/runs/{id}/link-audit/override` | Record a human override of a failing link audit so publish can proceed |
| DELETE | `/api/mc/runs/{id}/link-audit/override` | Revoke a previously recorded link-audit override |
| GET | `/api/mc/runs/{id}/qc` | List post-publish QC results for a run (most recent first) |
| POST | `/api/mc/runs/{id}/qc` | Run the post-publish QC suite (GTmetrix speed + JSON-LD scan) against the live URL |
| GET | `/api/mc/runs/{id}/chat` | Get the AI edit chat history for a run |
| POST | `/api/mc/runs/{id}/chat` | Request a surgical AI edit to the page via chat |
| GET | `/api/mc/work-log` | List the canonical work-log (every page/blog, all sources) |
| POST | `/api/mc/work-log` | Upsert a work-log record (natural-keyed by normalized URL) |
| GET | `/api/mc/work-log/{id}/snapshots` | List the dated SEO snapshots for a work-log page (newest first) |
| POST | `/api/mc/work-log/import` | One-time historical import of legacy master-list rows |
| GET | `/api/mc/sitemap-reconcile` | Reconcile the work-log against the live production sitemap |
| POST | `/api/mc/sheets/sync` | Push the work-log out to the fresh Google Sheet (one-way mirror) |
| POST | `/api/mc/gsc/pull` | Pull dated SEO snapshots from Google Search Console for tracked pages |

<!-- END GENERATED:api-routes -->

## Artifacts / tools

<!-- BEGIN GENERATED:artifacts (do not edit by hand — run `pnpm run system-map`) -->

| Artifact | Kind | Slug | Preview path | Purpose |
| --- | --- | --- | --- | --- |
| API Server | api | `api-server` | `/api` | Shared Express + Drizzle backend. Serves the health check and every Mission Control route (`/api/mc/*`). |
| Mission Control | web | `mission-control` | `/mission-control/` | Page-builder pipeline app. A VA enters a URL and the server runs Research → Build → Audit → Schema → Publish with per-phase review/approve gates. |
| Canvas | design | `mockup-sandbox` | `/__mockup` | Design canvas / component preview sandbox used to mock up UI in isolation. |
| Page Terminal | web | `page-terminal` | `/` | M.A.R.K. navy/gold navigation shell that hosts the standalone SEO/page-building HTML tools via iframe. |

<!-- END GENERATED:artifacts -->

## External dependencies

These live outside the repo. Most fail loudly when unavailable rather than
degrading silently.

- **Postgres** (`DATABASE_URL`) — backing store for all `mc_*` tables.
- **n8n webhooks** at `stsrecycling.app.n8n.cloud`:
  - `mark-ai-brain` — the Research phase source; when down, Research fails and
    downstream phases stay locked.
  - dashboard feeds for the Page Terminal tools (`DCD-grading`, `SALES-grading`,
    `WIW-data`, `blog-terminal`).
- **Anthropic API** — the Claude engine ("Dashboard mode") that auto-runs phases.
- **SerpAPI + DataForSEO** — live per-URL SEO intel derived on run creation
  (replaces the manual SEO spreadsheet).
- **GTmetrix** — post-publish QC speed checks against the live URL.
- **Joomla publish seam** (`JOOMLA_PUBLISH_URL`) — atomic publish target; with no
  URL configured the stub publisher reports "nothing published" and the run stays
  in review (never falsely "published").

## Key decisions

The "why," kept short. (Full project README is `replit.md`.)

- **Engine seam over a hard-wired LLM.** The pipeline orchestrator never imports
  a concrete client; both Claude and Replit engines flow through the same
  `runPhase` + checker suite, so a Replit-built page must clear the same bar.
- **Preserve the iframe shell.** Page Terminal stays a React shell hosting
  self-contained static HTML tools — the tools were not rewritten into React.
- **Single-row run state.** Most pipeline state is JSONB on the `mc_runs` row so a
  single read reconstructs the full run the dashboard renders.
- **Fail loudly; never silently degrade.** Missing inputs, failed tools, or
  malformed schemas halt with a clear message instead of emitting partials.
- **State-only location correction.** The URL-parsed city/state is cross-checked
  against fetched page content; verification only confirms/corrects the *state*,
  never switches city, and never blocks run creation.

## Where to look next

- **Change log / history:** use git history (`git log`) — it is not duplicated here.
- **Work items / roadmap:** use the project task list — it is not duplicated here.
