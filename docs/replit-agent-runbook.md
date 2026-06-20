# Replit-Agent Operator Run-Book — Mission Control "Replit" Engine

This run-book describes how to run Mission Control's page-building pipeline with
the **Replit Agent ("Replit mode")** as the build engine, instead of the
automated Claude-API path ("Dashboard mode").

Both engines drive the **exact same** pipeline against the **same** shared
project — same database, same checker suite, same URL registry, same research
integration, same Joomla publisher. Replit mode is the human-in-the-loop path;
Dashboard mode is hands-off.

---

## What "Replit mode" is

- **Dashboard mode (`claude`)** — the api-server calls the Claude API and runs
  each phase automatically. Hands-off, good for high parallel volume.
- **Replit mode (`replit`)** — a team member is logged into Replit and Replit's
  own Agent pulls the research and builds the HTML, driven interactively. Best
  for careful, reviewed, lower-volume builds. **This run-book is for this mode.**

The **engine toggle** on Mission Control's *New Build* form selects which engine
runs a given city. Every run records its `engine`, so the dashboard's
preview / review / approve flow works identically regardless of engine.

The key idea: **the dashboard is still the control panel and review surface in
Replit mode.** Creating a Replit run **queues** it (status `queued`); the
person-in-Replit picks up the queued city, the Agent does the work via the CLI
below, and results flow back into the same DB and appear in the dashboard just
like a Dashboard-mode run.

---

## Operating model: same phase gates, different control

The pipeline pauses at the **same checkpoints** in both modes. Five phases, each
followed by a review gate:

```
Research  →[gate]→  Build  →[gate]→  Audit  →[gate]→  Schema  →[gate]→  Publish
```

- **Dashboard mode:** the VA clicks **Approve** in the dashboard to advance; the
  next phase then runs automatically.
- **Replit mode:** the operator types **`next`** (the `mc next` command, below)
  to approve a phase. Approval only **opens the gate** — it does *not* auto-run
  the next phase. The operator then produces the next artifact with the Agent and
  submits it. This keeps a human in the loop between every phase.

---

## The operator CLI

All commands run from the repo root and go through the shared api-server:

```
pnpm --filter @workspace/scripts run mc <command> [args]
```

| Command | What it does |
| --- | --- |
| `mc queue` | List Replit runs waiting for operator action |
| `mc show <id>` | Print a run's phase ladder + checker summary |
| `mc research <id>` | Run Research (reuses the shared n8n `mark-ai-brain` fetch) |
| `mc build <id> <file.html>` | Submit the Agent-built HTML for the Build phase |
| `mc audit <id> <file.html>` | Submit the Agent-audited HTML for the Audit phase |
| `mc schema <id> <file.json>` | Submit the Agent-built JSON-LD for the Schema phase |
| `mc check <id>` | Run the checker suite against the current HTML |
| `mc next <id>` | Approve the phase currently in review ("next") |
| `mc publish <id>` | Run the Publish phase via the shared Joomla publisher |

> The CLI targets the dev proxy (`http://localhost:80/api`) by default. Override
> with `MC_API_BASE` if needed.

---

## Operator workflow (step by step)

### 0. Prerequisites
- Be logged into Replit with access to this project; the **API Server** workflow
  must be running.
- `DATABASE_URL` must be set (plus the research/publish credentials below for
  those phases).

### 1. Pick up the queued city
- In Mission Control's *New Build* form, set **Engine = Replit (Agent)** and
  launch. This creates a **queued** run (it does **not** auto-run).
- Find it: `mc queue` → note the run `#id`.
- `mc show <id>` confirms the city/target and the phase ladder. Research starts
  `ready`.

### 2. Research → gate
- `mc research <id>` — runs the **same** research source as Dashboard mode (the
  n8n `mark-ai-brain` webhook), so output does not drift between engines. The
  brief (and any entity data-quality flags) is written to the shared run record.
  - Requires the research webhook to be reachable; if it fails, the phase is
    marked `failed` — fix and re-run `mc research <id>`.
- Review the brief + flags in the dashboard, then `mc next <id>`.

### 3. Build → gate
- With the Agent, build the page HTML against the STS master prompts / design
  bible. Save it to a file (e.g. `/tmp/<city>.html`).
- `mc build <id> /tmp/<city>.html` — the HTML flows through the shared
  orchestrator and the checker suite runs automatically. The command prints the
  checker report.
- Review the preview in the dashboard, then `mc next <id>`.

### 4. Audit → gate
- With the Agent, revise the HTML (fix any checker errors from Build). Save it.
- `mc audit <id> /tmp/<city>.html` — re-runs the checker suite (post-audit
  rules). Iterate on the HTML and re-run until clean.
- Review, then `mc next <id>`.

### 5. Schema → gate
- With the Agent, produce the JSON-LD structured data. Save it (e.g.
  `/tmp/<city>.json`).
- `mc schema <id> /tmp/<city>.json` — validates the JSON-LD (falls back to the
  deterministic LocalBusiness schema if invalid) and runs the full checker suite
  including entity/schema consistency against the URL registry.
- Review, then `mc next <id>`.

### 6. Publish
- `mc publish <id>` — publishes to the **same** Joomla site via the **shared**
  publisher. Requires `JOOMLA_PUBLISH_URL` (+ `JOOMLA_PUBLISH_TOKEN`); without
  them the stub publisher returns "not published" and the run stays in review —
  never a false "published".
- Publish is **blocked** unless the checker report passes (see Parity gate).

---

## Parity gate (non-negotiable)

A Replit-mode page passes the **exact same** checker suite as a Dashboard-mode
page before it can be approved or published — this is enforced in code, not by
convention:

- Every Replit phase runs through the **same orchestrator** (`runPhase`) and the
  **same `runCheckers`** as Claude. The only difference is *where the HTML comes
  from* (the operator's Agent vs the Claude API).
- `mc next` (approve) only works on a phase that has actually run and is in
  `review`.
- `mc publish` is blocked unless the checker report passes (`report.passed`).

The two engines may produce slightly different prose; the shared checkers + URL
registry are what keep outputs consistent. Replit mode gets no exceptions.

---

## What gets written back (run-record contract)

Every Replit-mode run writes **identical** run records to a Dashboard-mode run,
so the dashboard preview/review/approve flow is engine-agnostic: `engine`
(`replit`), research brief, built HTML, schema, per-phase checker report, Joomla
meta, page-version history, and the publish result. The only run-level
difference is the `engine` label and the initial `queued` status.

---

## Trade-offs

- Replit mode is **interactive** — a person drives the Agent. It is not a
  hands-off background service like Dashboard mode. Best for careful, reviewed,
  lower-volume builds; Dashboard mode is better for high parallel volume.
- Each operator needs their own Replit access. Cost shifts from Anthropic API
  usage to Replit usage.
- AI Edit Chat (surgical edits) is a Dashboard-only feature. In Replit mode,
  edit the HTML with the Agent and re-submit `mc build` / `mc audit`.
