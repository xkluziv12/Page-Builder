# Mission Control — Verification & Drift Report

_Verification pass dated 2026-06-21. Scope: exercise every external call and
pipeline phase of the **new** Mission Control system, confirm fail-loud
behavior, run both tracks end-to-end, and compare current behavior against the
original design intent (GitHub-Pages shell + self-contained tools, the AIEngine
seam, fail-loud / schema-first, and the Builder Protocol). This was a
verification task; the only behavior change made was a clear low-risk fix
(regenerating a stale generated doc — see Drift #1)._

## How this was verified

- `pnpm --filter @workspace/mc-core run test` → **148/148 passing** (includes a
  new local-only end-to-end test of the atomic publish seam — see §2).
- API server workflow running; live HTTP sweep through the shared proxy
  (`localhost:80/api/...`).
- Real runs driven through the live pipeline (page + blog), incl. **two
  concurrent runs** observed in flight; the external webhooks were **fired live**
  with test-safe payloads; work-log + sitemap exercised against the live STS
  production sitemap. All test rows cleaned up afterward (DB left empty:
  0 runs / 0 work-log).

## 1. External-call sweep

| Dependency | Status | Notes |
|---|---|---|
| Direct research provider (Perplexity grounded + SerpAPI entities + Claude synthesis) | **Working** | Returned real web-grounded brief with citations; the entity gate flagged 7 (page) / 10 (blog) data-quality issues and held the Research review gate. |
| SerpAPI + DataForSEO SEO-intel (`/api/mc/seo-intel`) | **Working** | Real primary/related keywords, search volumes, competitors, local-pack + PAA; `sources: ["serpapi","dataforseo"]`. |
| Anthropic Build / Audit / Schema (Dashboard "claude" engine) | **Working** | All three phases produced real output; Schema emitted valid JSON-LD (~3.2 KB) + Joomla meta (alias/title/description/keywords). |
| `mark-blog-log` blog webhook (n8n) | **Working (fired live)** | POSTed a clearly test-safe payload (`city: "VERIFY-TEST"`, `status: "verification-test"`) → **HTTP 200 `{"success":true,...}`**. By design a logging failure only appends a `WARNING:` to the phase summary and never blocks the blog publish. |
| `mark-ai-brain` research webhook (n8n) | **External fallback, not default** | Only used when `MC_RESEARCH_PROVIDER=n8n`; default is `direct` (verified). |
| Google Sheets mirror (`POST /api/mc/sheets/sync`) | **Fails loud as designed** | `WORKLOG_SHEET_ID` unset → HTTP 400 with a clear message. The fire-and-forget post-completion mirror instead skips quietly (logs a debug line) so it never blocks an upsert — intentional split. |
| Monthly GSC pull (`POST /api/mc/gsc/pull`) | **Fails loud as designed** | GSC creds unset → HTTP 400. The internal daily scheduler stays quiet (does not throw) until configured. |
| Static-dashboard n8n data feeds (DCD / SALES / WIW) | **Working (read live)** | GET the three read webhooks (`dcd-dashboard`, `dashboard-data`, `sts-dashboard-read`) → all **HTTP 200** with real payloads (~1.1 MB / 5.2 MB / 894 KB). These remain n8n-backed by design. |

**Runtime key visibility note:** `SERPAPI_API_KEY`, `PERPLEXITY_API_KEY`,
`DATAFORSEO_LOGIN/PASSWORD`, and `GTMETRIX_API_KEY` are **present in the server
process at runtime** (the SEO/research/AI calls genuinely succeed) even though
they did not appear in the secrets listing. `JOOMLA_PUBLISH_URL`,
`WORKLOG_SHEET_ID`, and `GSC_API_KEY` are genuinely unset — which is exactly why
the publish/Sheets/GSC paths fall back to their fail-loud / stub behavior.

## 2. Pipeline end-to-end (both tracks)

**Page track** (Austin, TX): Research → Build → Audit → Schema → Publish all
ran. Each phase paused at its review gate; "approve" auto-advanced the next phase
(Dashboard mode). Publish was **correctly blocked**: _"Publish blocked: 5 checker
error(s) must be resolved first."_ — the loud checker gate refuses to publish (and
therefore never reaches a false-publish) while errors remain. This is the
schema-first / fail-loud contract behaving as intended.

**Blog track** (Dallas, TX): Research → Build ran with the **blog** checker
variant (track-aware checker suite); the blog research brief and entity gate
behaved identically to the page track.

**Per-phase gates / checker suite:** working. Research holds on entity flags;
Build/Audit/Schema each re-run the checker; Publish enforces zero checker errors
(with the auditable link-audit override as the only escape hatch, and only for
link-audit errors).

**Parallel runs (concurrent, observed live):** with one run mid-Research, a
second run was created concurrently; a live `GET /api/mc/runs` snapshot showed
**two simultaneous runs with distinct IDs and fully independent state** — Austin
(`page`, `running`, Research) and Dallas (`blog`, `review`, Research) — each
carrying its own phase ladder. Run state is per-row in `mc_runs`, so runs neither
share nor block each other's gates; both were deleted afterward.

**Joomla publish seam (exercised end-to-end, atomically):** in the live API
environment the checker gate blocks first (`JOOMLA_PUBLISH_URL` is unset and the
auto-built page had checker errors), so a full live API publish was not reachable
without hand-editing content. To validate the **atomic seam itself** at runtime,
a new local-only integration test
(`lib/mc-core/src/pipeline/publish-seam.integration.test.ts`) drives the **real**
orchestrator `runPhase("publish", …)` → **real** `HttpJoomlaPublisher` → a
**real in-process HTTP endpoint**, exercising the exact wiring `executePhase`
uses. It confirms:
- a passing page **publishes atomically** — title + body HTML + JSON-LD schema +
  meta are posted in a **single** request, with `published:false` (new pages go
  live only after human review) and `atomic:true`;
- a **blog** publish logs to `mark-blog-log` **only after** the publish is
  confirmed;
- the publish is **refused and the endpoint is never called** when an unresolved
  checker error remains (`"Publish blocked: … checker error(s)"`);
- a **partial-write** acknowledgement from the helper is a **hard failure** — the
  seam never reports a half-published page as live.

This complements the existing `joomla.test.ts` (publisher unit, mocked fetch) and
`orchestrator.test.ts` (publish-result→status threading) with a true end-to-end
network exercise of the atomic boundary.

## 3. Work-log path

- **Upsert idempotency:** re-logging the same page (www + trailing-slash variant)
  collapsed to the **same row** via the normalized-URL natural key; the partial
  re-log preserved `createdAt` and earlier-populated fields while updating only
  what was sent. **Working.**
- **List / Master Grid source (`GET /api/mc/work-log`):** working; rows carry a
  computed `seoDelta` (null until snapshots exist).
- **Sitemap reconciliation (`GET /api/mc/sitemap-reconcile`):** fetched the live
  STS sitemap (**2,517 URLs**) and classified tracked-vs-live correctly
  (`tracked-not-live`, `live-not-tracked`). **Working.**
- **SEO snapshots / deltas:** day-of snapshot is captured on a confirmed MC
  publish; monthly GSC pull appends history; deltas compute from snapshot history.
  Snapshot write path verified by unit tests + code; live GSC pull gated off.
- **Sheets mirror:** gated / fail-loud (see sweep). Not exercised live (no sheet
  configured).

## 4. Drift vs. original design

### Intentional & documented (no action)
- **Mission Control is a new React pipeline app, not part of the GitHub-Pages
  shell.** Page Terminal still preserves the original architecture (React shell
  iframing self-contained static HTML tools). MC is a deliberate new product
  documented in `replit.md`. ✔
- **AIEngine seam intact.** The orchestrator (`runPhase`) never imports a concrete
  LLM; both `ClaudeEngine` (auto-run) and `ReplitEngine` (operator-driven, queued)
  flow through the same orchestrator + checker suite. ✔
- **Research swapped from n8n `mark-ai-brain` → in-app `DirectResearchProvider`**
  (default `direct`, `n8n` still selectable via `MC_RESEARCH_PROVIDER`).
  Documented in `replit.md`. ✔
- **Blog-log is silent-degrade**, Sheets/GSC are fail-loud — intentional split,
  documented. ✔
- **`/api/*` is unauthenticated** — intentional for this private internal tool,
  documented in `replit.md` gotchas. ✔
- **Fail-loud / schema-first** upheld throughout (SerpAPI/Perplexity/GSC/Sheets
  throw on missing creds; publish blocks on checker errors; Zod + OpenAPI at
  boundaries). ✔

### Accidental drift
1. **`SYSTEM-MAP.md` was stale — FIXED inline.** Its generated sections were
   missing the `mc_work_log` and `mc_seo_snapshot` tables and seven routes
   (work-log CRUD, `work-log/import`, `sitemap-reconcile`, `sheets/sync`,
   `gsc/pull`). Regenerated via `pnpm run system-map` (a pure regeneration of
   generated content — low risk). _Root-cause prevention (a check that fails CI
   when the map is out of date) is tracked by a separate task and is intentionally
   not duplicated here._

## Follow-ups (no larger accidental divergences found)
No larger accidental divergences requiring a separate fix were found — the system
matches its documented intent. The remaining gaps are environmental, not drift:
the **production** Joomla publish, Google Sheets mirror, and GSC pull each require
their credentials (`JOOMLA_PUBLISH_URL`, `WORKLOG_SHEET_ID`, `GSC_*`) to be
configured before they do real work — and each already fails loud / stubs safely
until then (the atomic Joomla seam itself is now verified end-to-end against a
real endpoint; see §2). Separately, a tracked follow-up notes that Dashboard-mode
auto-Build currently under-produces, so a fully automatic run can't clear the
publish checker gate without manual chat-edits.
