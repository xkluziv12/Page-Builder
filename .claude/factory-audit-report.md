I couldn't get the one number you most wanted, Mark: this session blocked shell access to the dev database, so the `mc_runs` completion count is not verified (the exact query is under Q4). Everything below comes from reading the code and archived artifacts. I modified no project files. Shell, test runs, scripts and env checks were also blocked, so I ran no tests.

**Labels used throughout:** **[V]** verified from this workspace · **[R]** reported in the brief or another attached document · **[?]** cannot verify from this workspace.

Two things I noticed but did not cause:
- `.claude/factory-audit-report.md` was already emptied in the working tree when this session started (331 deleted lines).
- `artifacts/bake-off/src/data/results.json` changed while I was working (its `ranAt` went from 16:14Z to 17:08Z), so something is writing bake-off data right now.

## Executive diagnosis

1. **Phases run inside the HTTP request, and a phase left at "running" can never be recovered.** [V] `executePhase` marks the phase `running` and then waits for the model inside the create, approve or run request (`artifacts/api-server/src/routes/mc.ts:161-184`).
   - A worst-case audit is 12 model calls of up to 600 s each (`lib/mc-core/src/engine/transport.ts:18-33`, `routed.ts:128-152`).
   - Nothing resets stale `running` rows on startup (`artifacts/api-server/src/index.ts:22-33`).
   - The server refuses to re-run a `running` phase (`mc.ts:480`), and the UI shows no button for it (`run-detail.tsx:815-816`).
   - A process restart or killed request therefore leaves the run stuck for good, and the browser only says "Unknown error".
   - This matches the separately reported "1 run, failed at audit, 15-minute timeout, 0 publishes" [R].

2. **The schema phase rejects output that follows the schema prompt.** [V]
   - The Schema Generator v1.4.3 prompt requires the output to start with `<script type="application/ld+json">` and allows "NO raw JSON" (`lib/mc-core/src/prompts/schemaGenerator.ts:3`). It also contains interactive stops such as "Existing schema detected... Continue?" (`schemaGenerator.ts:2`).
   - Mission Control validates the output with a bare `JSON.parse` (`schema/generator.ts:32-40`, `engine/transport.ts:117`, `pipeline/orchestrator.ts:163`).
   - So an obedient model fails all 4 attempts and the phase halts. Schema only succeeds when the model ignores its prompt, which makes it intermittent by design.
   - The bake-off already solved this with a script-tag extractor and a headless-execution note (`scripts/src/bakeoff/extract.ts:93-120`, `miniPrompts.ts:148-160`). Neither was ported to Mission Control.
   - The tests only feed bare JSON (`orchestrator.test.ts:11`), so they pass.

3. **Pages reach publish with blocking errors that depend on the model, and output integrity is weaker than in the bake-off.** [V]
   - A word count under 2,000 is a blocking error that no override can clear (`registry.ts:9`, `checkers/index.ts:290-299`, `887-897`).
   - All 5 archived Opus-tier pages were 1,289 to 1,438 words. One earlier Claude page reached 2,028. Publish therefore passes or fails on model verbosity.
   - Mission Control's Claude engine is non-streaming with `max_tokens: 16000` and never checks `stop_reason` (`engine/claude.ts:8,41-56`). The bake-off uses streaming with 32,000 (`providers.ts:78,325`).
   - Mission Control takes the *first* fenced code block as the artifact (`engine/base.ts:27-39`). A cut-off page that still contains `<!doctype html` passes validation (`transport.ts:101-103`).

The local evidence says model choice is not the bottleneck: every failure path I found is in wrapper code.

## System map

| # | Stage | Component (file) | Persistence |
|---|---|---|---|
| 0 | UI | Mission Control SPA. Polls the run every 4 s (`run-detail.tsx:403`). Admin gate in front. | none |
| 1 | Input / location | `POST /mc/runs` → `deriveRunInputs`: normalize URL, SSRF guard, parse city/state from the URL, probe the page (15 s bound), cross-check the state, SerpAPI required, DataForSEO optional (`mc-runtime.ts:515-589`) | Row inserted only after this succeeds |
| 2 | Research | Runs automatically on create (`mc.ts:357`). `DirectResearchProvider`: Perplexity `sonar-pro`, then SerpAPI entities, then a synthesis LLM (Claude Sonnet 4.6, 8,192 tokens) producing JSON (`research/direct.ts`, `mc-runtime.ts:342-403`). Entity gate adds flags. | `mc_runs.research_brief` |
| 3 | Provider / prompt | `engineFor` returns a `RoutedEngine`: main = requested provider, backup = Claude↔OpenAI, Gemini→Claude (`mc-runtime.ts:174-294`). Prompts are master documents rewritten at runtime by `editorialReview.ts`, plus `describeContext` (`prompts/builders.ts`). | none |
| 4 | Generation / parse | `PromptCompletionEngine.complete` → `extractContent` → validator. Up to 2 attempts per candidate, then backup. Audit adds a verify loop (`routed.ts`). | Only on success |
| 5 | Checkers | `runCheckers`: 18 checks after every model phase (`checkers/index.ts:900-940`) | `mc_runs.checker_report` |
| 6 | Persistence | JSONB phase ladder on one row; page versions in `mc_page_versions` (`mc.ts:200-237`). No transaction, no version column. | Postgres |
| 7 | Publish | Blocking-error gate, then `HttpJoomlaPublisher` (one POST, no timeout) or a stub that returns `published:false` when `JOOMLA_PUBLISH_URL` is unset (`publisher/joomla.ts`). | Run status `published` only if confirmed |
| 8 | Background | After publish, fire-and-forget work-log upsert, Sheets sync and GTmetrix QC (`mc.ts:245-262`). Separate schedulers: GSC, git sync, GitHub mirror. | `mc_qc_results`, `mc_work_log` |

The flow is: Create runs research and stops at review. Each Approve runs the next phase inside the same request (`mc.ts:658-661`). Approving schema runs publish.

## Failure boundaries

| Where | Failure | How it is represented | Lost or hidden |
|---|---|---|---|
| Create: bad URL / SerpAPI | throws | 400 `{error}` | UI toast says "Unknown error" (`run-detail.tsx`, `dashboard.tsx:83`) |
| Create: SerpAPI / DataForSEO hang | no timeout | request hangs | nothing persisted |
| Research: Perplexity / synthesis hang | no timeout (`perplexity.ts:46-63`, `mc-runtime.ts:347-374`) | phase `running` | stuck if the request dies |
| Research: synthesis wraps JSON in prose | strict `unfence` only accepts `^```...```$` (`direct.ts:33-37`) | phase `failed`, "malformed JSON" | no retry; raw synthesis discarded |
| Engine resolve: missing key | throws | phase `failed` (`mc.ts:143-156`) | ok |
| Model call timeout / 5xx | retry, then backup | events logged to pino | **attempt history not saved on failure** (`mc.ts:268-272` patch has no `attempts`) |
| Output truncated (Claude/Gemini) | not detected | accepted if it contains `<!doctype` | silent; may surface later as a word-floor or link error |
| First fenced block is not the page | invalid → retry | "output is invalid" | the raw output is never stored |
| Refusal regex false positive | invalid → retry (`transport.ts:87-94`) | same | low likelihood: no trigger phrases in the prompts (checked) |
| Verify: no ✅ verdict after corrections | throws (`routed.ts:82-87`) | audit `failed` | **the paid audit output is thrown away** |
| Schema: `<script>` wrapper or interactive stop | invalid ×4, then throws | schema `failed` | the obedient output is discarded |
| Process restart mid-phase | none | phase `running` forever | **no recovery path in server or UI** |
| Client/proxy gives up mid-request | server keeps running | browser shows `TypeError` → "Unknown error" | user sees failure while the backend may succeed |
| Concurrent chat edit during a phase | last write wins (`mc.ts:219-237`, `1057-1074`) | none | **edit silently overwritten** |
| Publish: word floor / cert / schema errors | throws "Publish blocked: N" | publish `failed` | word floor cannot be overridden |
| Publish: stub publisher | `published:false` → `review` | Approve sets publish `approved`, run `approved` (`mc.ts:633-647`) | **UI shows a green check on publish with nothing published** |
| Publish retry after an ambiguous Joomla timeout | no idempotency key | possible duplicate article | [?] |
| Post-publish QC / work-log | `void ...catch(log)` | logs only | QC row missing with no UI error |
| UI polling errors | `isError` never read | stale data shown | "running" displayed indefinitely |

## Evidence

### Cause 1: in-request execution, stuck "running" (confidence: high on mechanism, medium on frequency)
- [V] The phase is written as `running` before the model call (`mc.ts:161-169`) and only cleared by a later write in the same request (`219-237` or `273-277`).
- [V] Call budget: `MC_REQUEST_TIMEOUT_MS` 600,000 ms, `MC_MAX_ATTEMPTS` 2, `MC_VERIFY_CORRECTIONS` 1 (`transport.ts:18-33`).
  - Build: up to 4 calls.
  - Audit: 4 audit calls plus 2 verify turns × 4 calls = 12 calls.
  - All of it sits inside `POST .../approve` (`mc.ts:658-660`).
- [V] Nothing resets `running` on startup (`index.ts:22-33`). Only ready/review/failed can be re-run (`mc.ts:480`, `run-detail.tsx:815-816`).
- [V] Client side: `new QueryClient()` with no defaults (`App.tsx:14`). Every `onError` reads `err.error`, but `ApiError` has no `error` field (`custom-fetch.ts:174`), so every toast says "Unknown error" (`run-detail.tsx:259,451,496,518,544,583,601,619,712`).
- [R] "1 run, failed at audit, 15-minute timeout, 0 publishes" (`attached_assets/Pasted-Read-it-all-..._1789151549109.txt:7`). [?] Where a 15-minute limit comes from: it is not in the code defaults.

### Cause 2: schema contract mismatch (confidence: high)
- [V] Prompt: "schema.txt starts with `<script type="application/ld+json">`... NO raw JSON" and "Generate schema.txt as PURE JSON-LD, script tag to script tag" (`schemaGenerator.ts:3`), plus "warn user... Continue?" (`schemaGenerator.ts:2`).
- [V] Parser: `JSON.parse(raw)` (`generator.ts:32-40`), used by the routed validator (`transport.ts:117`) and the orchestrator (`orchestrator.ts:163-173`).
- [V] The bake-off pulls the JSON out of the last script block (`extract.ts:93-120`) and appends a headless note so the model won't pause or ask questions (`miniPrompts.ts:148-160`). Mission Control's `schemaPrompt` has neither (`builders.ts:118-125`).
- [?] How often production models return the wrapped form. No transcripts or raw outputs are saved.

### Cause 3: publish gate and output integrity (confidence: high on the code, medium on impact)
- [V] Floor is 2,000 and is a blocking error after audit. The override only excuses link checks.
- [V] Archived Opus-tier pages: 1,342 / 1,289 / 1,438 / 1,319 / 1,295 words, all failing `word-floor` (`archive/2026-06-23-opus-tier-5model/results.json:108-116`, `exports/bakeoff-dossier.md:9366-9435`).
- [V] Claude engine: 16,000 tokens, non-streaming, no `stop_reason` check. Gemini: no `finishReason` check (`gemini.ts:42`). OpenAI does handle `incomplete` (`openai.ts:75-81`).
- [V] A code comment in the bake-off says Claude writes about 39 KB of phase narration before the `<!DOCTYPE>` (`extract.ts:13-15`). Narration plus a roughly 46K-character page can exceed 16,000 tokens. [?] Whether this truncates in production.
- [V] Contributing: Mission Control's audit prompt (v10.13.3) tells the model to use `https://www.stselectronicrecyclinginc.com/secure data destruction-certified-data-destruction`, a URL with spaces (`prompts/seoAudit.ts:5-6`). This looks like a global "NAID" text replacement that hit a URL. Attached v10.14 has `/naid-certified-data-destruction`. Neither URL is in the code registry, so either one triggers an overridable `url-registry` error. [?] Database registry rows.

### Secondary findings [V]
- **Lost updates:** no optimistic lock on `mc_runs`. A chat or manual edit during a running phase is overwritten.
- **Approving publish on the stub:** sets the run to `approved` without publishing (`mc.ts:633-647`). The UI offers the button (`run-detail.tsx:817,950-954`).
- **Polling hides errors:** `isError` is never read, and a 401, 500 or network error renders as "Run not found."
- **`deriveJoomlaMeta`:** the alias comes from the `<title>`, not the target URL slug (`generator.ts:56-59`), so the QC URL may not be the real live path. [?]

### Brief question answers

**Q1. Why `structure` = 50.**
- [V] Four 25-point signals (`score.ts:13-21`), using `extractStructuralSignals` (`structural-hash.ts:31-41`).
- Across all 13 archived model pages:

| Signal | Fires? | Evidence |
|---|---|---|
| `rootCss` | yes, 25 | `:root{` present in every page |
| `sectionSequence` | never, 0 | Zero `<section class=` or `<!-- SECTION` matches in any model page. The reference has 12. |
| `equipmentTitles` | never, 0 | Zero `class="...equipment..."` in any page, the reference included |
| `sacredUrls` | yes, 25 | Needs 9 distinct absolute STS hrefs. Pages have 19 to 41 occurrences. |

- 25 + 0 + 25 + 0 = 50 for every page. The reference page itself would score 75.
- `heroMarginTop` is extracted but never scored.
- I counted with grep; script execution was blocked. The 0s are direct counts. The two 25s follow from the stored score of 50.
- Verdict: **dead weight** in the June archives (a constant 7.5 points for everyone). It is not a quality metric: it rewards class-name conventions, and the link signal only works for STS.
- The newest results differ (55 for most models, 100 for one) [V, read by a search agent; the file is changing]. That reflects markup conventions, not quality.
- Also: in the 5-model run, schema was the harness's own **deterministic schema** (0.0 s, `bakeoff-dossier.md:9366`), so `schema` = 100 for everyone. That is another constant 0.15. **30% of the composite weight is constant.**

**Q2. htmlMatch / visualMatch.** [V] Both are **reference-similarity metrics, not quality metrics**.
- `htmlMatch` = tag-frequency cosine plus visible-word Jaccard against one page (`score.ts:99-103`).
- `visualMatch` = pixel diff plus an LLM asked "how visually similar" (`visual.ts:124`). Without screenshots it falls back to design-token Jaccard (`score.ts:124-126`).
- A better page that differs from the reference is penalized by construction.
- The "golden" reference has been text-rewritten too: it contains the spaced URL (`reference/billings-mt.html:431,515`). [?] Whether the live page matches it.
- In the newest run, visualMatch is 2 for every model because screenshots were null [V, read by the search agent]. The metric silently fell back to the token proxy.

**Q3. Cost spread.**
- The brief's attribution is wrong [V]: "$1.19 in 250 s" is **OpenAI GPT-5.4** (`bakeoff-dossier.md:9369-9375`). Claude Opus 4.8 took 579 s (`results.json:341`).
- GPT-5.5-PRO at 793.9 s / $12.09 matches (`dossier:9427`). Grok at 165 s matches. [?] Grok's $0.42; I didn't find it.
- [V] The stored composites **cannot be reproduced from the current weights** (`score.ts:140-148`):

| Model | Stored | Current weights |
|---|---|---|
| Claude Opus 4.8 | 76 | 77 |
| GPT-5.5 | 75 | 77 |
| GPT-5.5-PRO | 73 | 76 |
| Gemini 3.1 Pro | 73 | 74 |
| Grok 4.3 | 72 | 69 |

- The stored values fit an older formula that counted speed (Grok's speed = 100). The checker rules also changed: an archived cert-scope rule is gone from `registry.ts:239-253`.
- Ranking depends on which formula version you use. One checker error moves the composite about 3 points, and the top four sit within one error of each other. Each model ran once, so there is no variance estimate.
- Conclusion: the rubric cannot separate these models. That does not prove they are equal quality.

**Q4. `mc_runs` distribution.** **Not queried.** `psql` and even an env-presence check were denied in this session.
- [R] 1 run, failed at audit, 0 publishes.
- Query to run:
  ```sql
  select status, current_phase, count(*) from mc_runs group by 1,2;
  select p->>'phase', p->>'status', count(*) from mc_runs, jsonb_array_elements(phases) p group by 1,2;
  ```

**Q5. External brief.** [V] **Not through the API.** URL-derived research is mandatory and tied to the run.
- `POST /mc/runs` requires `url`, runs `deriveRunInputs` with SerpAPI required, then auto-runs research (`mc.ts:289-358`).
- No route accepts a `researchBrief`. Build is locked until research is approved (`mc.ts:478-487`).
- Replit mode also runs research through the provider (`mc.ts:537-539`).
- The library is already separated, though: `runPhase("build")` just reads `state.researchBrief` (`orchestrator.ts:124-139`), and `PipelineDeps.research` is an override hook (`:74`). Accepting a brief is a small route change, not a redesign.
- There is no "page brief" or exact-count contract anywhere.

**Q6. Rerun cost.** [V] **Yes for schema.** A failed or in-review schema phase re-runs alone and reuses the stored brief and HTML (`mc.ts:172-184`). Limits:
- A `running` phase cannot be re-run.
- Approved phases cannot be re-run.
- A failed audit or verify loses its paid output.
- Raw attempt outputs are never stored.
- Publish retries are not idempotent.

**Q7. Shape comparison.**

| | Lean runner [R] | Mission Control [V] | Precision factory [R] |
|---|---|---|---|
| Stage handoff | file per stage | JSONB columns on one row per phase | Postgres manifest |
| Resume | rerun stage | per phase, except `running` / approved | resume |
| Schema | deterministic, exact counts, halts | LLM + `JSON.parse` + rule checks, no counts. A deterministic generator exists but is deliberately unused (`orchestrator.ts:164-173`). | stage |
| Gates | 11 | 18 checks after each phase + human approval between phases | 13 |
| Execution | one CLI command | synchronous inside HTTP requests, no job owner | script |

- Mission Control is closer to the lean runner (stage in, persisted state out, per-phase retry) than to an all-or-nothing monolith.
- It diverges in two places: in-request execution, and the LLM schema stage. That is where the failures cluster. It is repairable; no rewrite needed.

**Q8. Prompt versions.**
- [V] Mission Control carries **Page Builder v3.12, SEO Audit v10.13.3, Schema Generator v1.4.3** (line 2 of each prompt file). The brief's v3.7 / v10.12.4 / v1.4.1 are [R].
- Provable local drift [V]:
  - `editorialReview.ts` rewrites all three at runtime, so the version label does not identify the bytes actually sent.
  - `fixtures.ts:17` and `run.ts:141,186` say schema v1.4.1, but the fixture is v1.4.3.
  - The spaced NAID URL is in Mission Control's audit prompt, the bake-off SEO fixture, the design fixture and the reference page. Attached v10.14 fixed it, but v10.14 is used nowhere.
  - TechnoCycle copies are v3.5 / v1.4.1 / v10.12.1. Hub+Spoke Planner is v8.5 (`hub-spoke.html:471`), not v8.2.
  - `page-terminal.html` does not embed master prompt text.
  - Fixture vs attached-source diffs: 123 / 58 / 58 lines [V, by the search agent; I did not re-run them].
- [?] The framework repo's `lib/prompts/prompts/`.

## Reproduction plan

All of these are unit or fixture tests with fake engines. No network needed.

1. **Schema:** fake engine returns ```` ```html\n<script type="application/ld+json">{"@context":"https://schema.org"}</script>\n``` ````. Expect `RoutedEngine.generateSchema` to make 4 calls and throw, and `runPhase("schema")` to throw. Bare JSON passes.
2. **Stuck running:** seed a row with build=`running` and call `POST /phases/build/run`. Expect 409, with no UI action rendered.
3. **Call budget:** `MC_REQUEST_TIMEOUT_MS=20` with an engine that never resolves. Count audit calls (expect 12).
4. **Truncation:** fake Anthropic client returns `stop_reason:"max_tokens"` and the text `<!doctype html><html><body><p>cut`. Expect `isValidEngineOutput` to return `true` (the bug).
5. **First fence:** raw text `"Report\n```\nMETA: x\n```\n```html\n<!doctype html>...</html>\n```"`. `extractContent` returns `META: x`, while the bake-off's `extractHtmlDocument` succeeds.
6. **Word floor:** run `runCheckers` (afterAudit) on `archive/2026-06-23-opus-tier-5model/pages/no-gmb/claude.html`. Expect `blockingErrorCount(report, true) > 0`.
7. **Spaced URL:** a page with the `seoAudit.ts` href fails `url-registry`.
8. **Lost update:** hold an audit open with a delayed fake engine and PUT `/html` meanwhile. The final `page_html` equals the audit output.
9. **Attempts dropped:** a routed failure leaves the ladder entry with no `attempts`.
10. **Stub approve:** approve publish while in review with no `JOOMLA_PUBLISH_URL`. Run status becomes `approved`.
11. **Research synthesis:** `synthesize` returns `"Here is the brief:\n```json\n{...}\n```"`. Expect `parseBriefJson` to throw.
12. **Scoring:** compute `structureScore` over the archived pages (all 50), and recompute composites from the stored sub-scores (mismatch).
13. **UI:** a mock `ApiError` toast renders "Unknown error".

## Minimal remediation plan

Each fix stays in one scope (mc-core, api-server, or mission-control), so each is its own dispatch.

1. **Observability first** (api-server): save `attempts`, the error text, and the first 2 KB of the raw output on the failure path (`mc.ts:268-272`). About 5 lines.
2. **Schema** (mc-core): port `extractSchemaJson` and the `SCHEMA_TO_INLINE` note into the validator, the orchestrator and `schemaPrompt`. Add the wrapped-output fixture test. [?] Confirm whether the Joomla helper expects wrapped or raw JSON.
3. **Output integrity** (mc-core): treat `max_tokens` / `MAX_TOKENS` stop reasons as invalid output. Move Claude to streaming with 32,000 tokens, matching the bake-off. Use the bake-off's doctype-to-`</html>` slicing for HTML.
4. **Stuck-running recovery** (api-server, then UI): treat `running` older than the total budget as `failed` ("interrupted"), both on read and at startup. Add a Reset button.
5. **Concurrency** (api-server): make the gate and the final write conditional on `updated_at` (or a `version` column, which needs a db change). Fail loudly on conflict.
6. **Get off the request path** (api-server): return 202 after marking `running` and let the UI poll. Only safe after step 4.
7. **Publish gate** (api-server + UI): refuse to approve publish unless it was actually published. Mark decides the word-floor policy: either the prompt states the floor or the checker matches the prompt's targets.
8. **Prompt URL fix:** needs Mark to confirm the correct live NAID URL. Then fix the prompt (adopt v10.14 or patch `editorialReview`) and the registry.
9. **Timeouts** (mc-core / api-server): `AbortSignal.timeout` on Perplexity, SerpAPI, synthesis and Joomla. Retry research synthesis once.
10. **UI errors** (mission-control): read `err.message`, surface `isError` and stale data, handle 401.
11. **Rubric** (scripts): drop `structure`; label the match metrics "similarity"; store the weights version with each result; run each model 3 or more times. Pick nothing until then.

## Missing observability

- A run/phase correlation ID in every pino line and every provider call.
- Raw model output (or a hash plus the first and last 2 KB) and `stop_reason`, per attempt, saved even on failure.
- Token usage and cost per Mission Control phase. The bake-off records it; Mission Control does not.
- A heartbeat or lease timestamp on `running` phases.
- A prompt SHA-256 per phase, since `editorialReview` makes the version labels unreliable.
- A Joomla request ID or idempotency key, plus the response body.
- Background QC and work-log failures written to a table, not just logs.
- A results-file schema version (weights and checker set) in the bake-off output.

**Questions that need information from outside this repo**
1. The two `mc_runs` queries above, run against dev and prod.
2. Production logs for the reported audit failure, and where the 15-minute limit comes from (proxy, deployment, or an `MC_REQUEST_TIMEOUT_MS` override).
3. Whether `JOOMLA_PUBLISH_URL` is set in prod, and the format the helper expects for `schema`.
4. Which NAID data-destruction URL is actually live.
5. Whether the database registry (`mc_url_registry`) holds rows beyond the code defaults.
6. Whether autoscale instances restart or scale down during long in-flight requests.
7. Raw provider responses for any failed schema or audit attempt, if the providers' dashboards keep them.
