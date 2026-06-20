---
name: Replit-Agent engine mode (Mission Control second engine)
description: How "Replit mode" works as a second build engine in Mission Control — operator-driven, queued, parity-gated — and the non-obvious design choices behind it.
---

# Replit-Agent engine mode (Mission Control "Replit" engine)

Mission Control has **two** build engines behind the `AIEngine` seam:

- **Dashboard mode (`claude`)** — the api-server auto-runs each phase by calling
  the Anthropic API. Synchronous.
- **Replit mode (`replit`)** — a human operator drives Replit's own Agent, which
  produces each phase artifact; the operator submits it. The server never calls
  an external model for these runs.

## Non-obvious design decisions

- **Replit mode is NOT a synchronous `AIEngine` that calls an API.** It is a
  human+Agent loop. `ReplitEngine` (lib/mc-core) implements `AIEngine` but its
  methods just *return operator-supplied content* (and throw if empty). This lets
  Replit phases flow through the SAME `runPhase` orchestrator + `runCheckers` as
  Claude — that is what makes the parity gate automatic, not bolted on.
  **Why:** reusing the orchestrator means a Replit page clears the identical
  checker bar; reimplementing the pipeline would let the two engines drift.

- **`engineFor()` only resolves Claude.** Replit runs are operator-driven and
  pass their own `ReplitEngine` into `executePhase` via the `engineOverride`
  param. Calling `engineFor("replit")` throws on purpose, so a Replit run can
  never silently auto-run on the Claude path.

- **Replit runs are created with status `queued` and DO NOT auto-run.** Dashboard
  runs auto-run Research on create and auto-run the next phase on approve. For
  Replit, create just queues; approve ("next") only opens the gate — the operator
  produces and submits the next artifact. The branch is `engine !== "replit"` in
  the create and approve handlers.

- **Handoff seam:** `POST /mc/runs/:id/phases/:phase/replit` accepts
  `{ html?, schema? }` and runs that phase. Build/Audit need `html`, Schema needs
  `schema`; Research reuses the shared n8n fetch and Publish uses the shared
  publisher (neither needs a body). Same phase-gate ladder + `report.passed`
  publish block as Dashboard mode.

- **Operator CLI:** `pnpm --filter @workspace/scripts run mc <cmd>` (queue / show
  / research / build / audit / schema / check / next / publish) — a thin HTTP
  client over the api-server. The run-book is `docs/replit-agent-runbook.md`.

## Operating model (preserve across engines)

Same five phases, review gate after each: Research → Build → Audit → Schema →
Publish. Dashboard advances via the **Approve** button (auto-runs next); Replit
advances when the operator types **`next`** (`mc next`, gate-only). Both write
identical run records (only `engine` + initial `queued` differ) and pass the
identical checker suite before approve/publish.
