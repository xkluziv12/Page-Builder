# Page Terminal / M.A.R.K. — STS Electronic Recycling Toolset

A pnpm monorepo that ships the internal tooling for STS Electronic Recycling's
virtual assistants: SEO page-building tools, an AI page-builder pipeline, and a
multi-model bake-off harness.

**Start here when scanning this repo:**

| File | What it gives you |
|------|-------------------|
| `SYSTEM-MAP.md` | One-read orientation: every artifact, DB table, and API route, partly auto-generated from source (`pnpm run system-map`). |
| `replit.md` | Project README for the Replit agent: run commands, stack, architecture decisions, working-style rules, gotchas. |
| `docs/` | Human/process documentation (builder protocol, operator runbooks, research findings). |

## Repository layout

```
artifacts/          Deployable apps (each is a pnpm workspace package)
  page-terminal/    M.A.R.K. nav shell (React) + self-contained static HTML SEO tools
  mission-control/  AI page-builder pipeline app (React) — Research → Build → Audit → Schema → Publish
  api-server/       The ONLY backend (Express + Drizzle/Postgres), serves /api and /api/mc/*
  bake-off/         Static viewer for multi-model bake-off results and transcripts
  mockup-sandbox/   Design/component preview sandbox (canvas)
lib/                Shared libraries (composite TypeScript packages)
  mc-core/          The AI engine layer: pipeline prompts, checkers, AIEngine seam, model engines
  db/               Drizzle schema + Postgres access
  api-spec/         OpenAPI spec (source of truth for the API contract; codegen via Orval)
  api-zod/          Generated Zod schemas
  api-client-react/ Generated React Query hooks
  integrations*/    Replit connector helpers (GitHub, Drive, Anthropic)
scripts/            Operator CLI + bake-off/judge runners (@workspace/scripts)
docs/               Process docs, runbooks, research reports
attached_assets/    Screenshots, uploads, and reference assets
exports/            Generated exports (reports, sheets)
```

## Kinds of content — how to tell them apart

- **Static HTML tools** (`artifacts/page-terminal/public/tools/*.html`) — fully
  self-contained pages (inline CSS/JS), loaded by the shell via iframe. These
  are the original VA tools; they are intentionally NOT React and should not be
  rewritten into React.
- **React apps** (`artifacts/*/src/`) — Vite + React + TypeScript. Navigation
  shell, Mission Control dashboard, bake-off viewer.
- **Engines** (`lib/mc-core/src/engine/`, `lib/mc-core/src/registry.ts`) — model
  adapters behind an `AIEngine` seam (Claude / OpenAI / Gemini / operator-driven
  Replit mode). All engines run byte-identical prompts; never special-case one
  model.
- **Prompts** (`lib/mc-core/src/prompts/` and `scripts/src/bakeoff/miniPrompts.ts`) —
  the per-phase build/audit/schema prompt builders. Shared between Dashboard and
  Replit mode.
- **Documents** (`docs/*.md`) — process and research docs for humans; not code.
- **Replit config** (`.replit`, `replit.nix`, `replit.md`, `.local/`) — Replit
  workspace configuration and agent guidance; not part of the shipped apps.
- **Generated output** (`artifacts/bake-off/public/transcripts/`, `exports/`) —
  machine-produced run results; treat as data, not source.

## Run & operate

```bash
pnpm --filter @workspace/api-server run dev   # API server (port 5000)
pnpm run typecheck                            # full typecheck across all packages
pnpm run build                                # typecheck + build all packages
pnpm --filter @workspace/api-spec run codegen # regenerate API hooks/Zod from OpenAPI
pnpm --filter @workspace/db run push          # push DB schema changes (dev only)
pnpm --filter @workspace/mc-core run test     # engine unit tests
```

Required env: `DATABASE_URL` (Postgres). Model/provider keys are documented in
`replit.md`.

## Conventions that matter

- **Schema-first**: anything crossing a boundary (API, DB, CMS, n8n) is
  validated with Zod/OpenAPI before it crosses.
- **Fail loudly**: missing inputs or failed provider calls halt with a clear
  error — never silent fallbacks or placeholder output.
- **Never special-case a model**: all engines flow through the same
  orchestrator, prompts, and checker suite.
- Full working-style reference: `docs/marks-builder-protocol.md`.
