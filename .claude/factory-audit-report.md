I couldn't execute anything: this session's permission mode blocked the database query, all test runs, inline interpreters and `git log`. So this audit is static code reading plus the generated artifacts already in the repo, cross-checked with Grep. I modified no files.

## Executive diagnosis

1. **The prompts and the publish gate contradict each other, so a page that follows the prompts fails publish by construction.** Mission Control blocks publish using the `mc-core` checker suite, and the bake-off scores pages with that same suite. In the latest bake-off run, all 7 scored pages failed the same three blocking checks:
   - `url-registry`: the Page Builder prompt's own template link `/our-locations?view=map` is not in the URL registry.
   - `schema-rules`: the Schema Generator prompt requires a headquarters `streetAddress` and `postalCode` block that the No-GMB rule forbids.
   - `word-floor`: every page was under the 2,000-word floor.

   GMB runs can't pass either: the verified CID never reaches any prompt, but the checker requires it in the schema. Only link-audit errors can be overridden, and there is no route to edit a schema. None of this depends on model quality. Confidence: high that the conflict exists; medium that it is where Mission Control runs actually stall (I couldn't query the DB).

2. **Phases run inside the HTTP request, and nothing recovers a phase left in `running`.** Worst-case budgets are about 40 minutes for build, about 2 hours for audit, and no limit at all for research. If the process restarts mid-phase, the phase stays `running` forever. The server refuses to rerun a `running` phase, and the UI shows it as a spinner with no Retry button. The only way out is a new run, which pays for research again. This fails intermittently by nature. Confidence: high on the mechanics; how often it happens is unknown.

3. **Truncated or mis-extracted model output is accepted on the Claude and Gemini paths.** Neither path checks `stop_reason` or `finishReason`. Claude is capped at 16,000 output tokens for a report plus a full page. If `</html>` is missing, `extractContent` takes everything to the end of the response, and the first code fence wins. A cut-off page passes validation and then shows up later as a word-floor or verify failure, which looks like a quality problem and varies from run to run. Confidence: medium.

Model choice is not the bottleneck on local evidence:
- The same model's score moves between runs by as much as the gap between models.
- 4 of 11 cells in the latest bake-off run failed at a harness gate, not on page quality.

## System map

**Mission Control** (the production path):

1. **Input.** The UI posts to `POST /api/mc/runs` (`artifacts/api-server/src/routes/mc.ts:289`), which requires `vaName` and `url`. `deriveRunInputs` (`mc-runtime.ts:515`) then:
   - normalizes the URL and applies the SSRF guard;
   - parses city and state from the URL slug (hard failure if it can't);
   - requires a SerpAPI key;
   - probes the target page (never throws; any failure means `NEW_BUILD`);
   - corrects the state only, never the city;
   - fetches SEO intel: SerpAPI is required, and DataForSEO errors are swallowed (`seo/index.ts:93`).
2. **Research.** Runs in the same request (`mc.ts:357`) through `runPhase`. The default `DirectResearchProvider` calls Perplexity `sonar-pro`, then SerpAPI for entity seeds, then a synthesis model (Claude Sonnet 4.6, 8,192 tokens), and parses the JSON. Setting `MC_RESEARCH_PROVIDER=n8n` switches to the webhook. An entity gate then adds flags.
3. **Provider selection and prompts.**
   - `engineFor` builds a `RoutedEngine` (`mc-runtime.ts:210`). Each phase has a main model (the requested engine) and a default backup (claude↔openai, gemini→claude), overridable with `MC_ROUTE_<PHASE>_MAIN/BACKUP`.
   - System prompt: the hard-coded master text (v3.12 / v10.13.3 / v1.4.3) after the `editorialReview.ts` string rewrites.
   - User message: `describeContext`, which carries city, type, sacred links, SEO intel, and **only the research summary**.
4. **Generation.** `withTimeout` (600 s), `extractContent`, then `isValidEngineOutput`. Each candidate gets 2 attempts, then the backup is tried. Audit adds a verify loop that must end on an explicit ✅ verdict (`routed.ts:59-152`).
5. **Templates.** There is no template layer. The model emits a whole HTML document, the schema is model-written JSON-LD, and Joomla meta is extracted by regex (`schema/generator.ts:43`).
6. **Persistence.** One `mc_runs` row holds everything as JSONB (phase ladder, brief, HTML, schema, checker report). `mc_page_versions` gets a row when the HTML changes. Nothing goes to the filesystem.
7. **Checkers and publish.** 17 checks run after build, audit and schema. Publish throws on any non-overridable error (`orchestrator.ts:207-213`). The publisher is either one Joomla HTTP POST or a stub that returns `published:false`. A successful publish triggers fire-and-forget work-log, QC and Sheets updates.
8. **UI and queueing.** Approving a phase runs the next phase synchronously inside the approve request (`mc.ts:658`). The UI polls every 4 s (`run-detail.tsx:403`). There is no queue, no worker and no lease. In Replit mode the operator posts `html` or `schema` to `/phases/:phase/replit`.

**Bake-off** (`scripts/src/bakeoff/`) is a separate offline harness:
- It loads prompt text from `fixtures/*.txt`, not Mission Control's runtime prompts.
- It runs models in parallel (`run.ts:614`) and scores with `mc-core` `runCheckers` plus `score.ts`.
- It writes `results.json`, transcripts, screenshots, and history snapshots plus a manifest.

## Failure boundaries

**Mission Control** (all verified in code):

| Stage | Failure | How it's represented | Lost or hidden |
|---|---|---|---|
| Create | Bad URL, no city/state, SerpAPI missing or erroring | 400, no row created | Visible |
| Create | Page probe network error | Silently classified `NEW_BUILD` | Wrong classification, not flagged |
| Create | DataForSEO error | Swallowed; `sources` just lacks it | Hidden |
| Research | Perplexity, SerpAPI or synthesis hangs | No timeout; request hangs; phase stays `running` | Permanent stall |
| Research | Synthesis truncated or wrapped in prose | "malformed JSON" thrown; phase `failed` | Paid Perplexity output discarded, re-bought on retry |
| Engine setup | Missing key for main model | Phase `failed` (`mc.ts:143-156`) | Visible |
| Engine setup | Missing key for default backup | `logger.warn` only; runs main-only | Logs only |
| Generation | Error, timeout, invalid output | Retries, then "Routed X failed loud" | **`attempts` not saved on failure** (`mc.ts:268-272`); SDK-internal retries invisible |
| Generation | Truncated output (Claude, Gemini) | Accepted as valid | Surfaces later as checker or verify failure |
| Audit verify | No ✅ verdict after corrections | Throws | Paid audit output not persisted |
| Checkers | Errors on build/audit/schema | Phase still goes to `review` | Operator can approve; blocked only at publish |
| Publish | Blocking checker errors | Phase `failed`, "Publish blocked: N…" | Schema and word-floor errors are not overridable |
| Publish | Stub publisher | `review`; approving it sets the run to `approved` | Looks finished, but isn't published |
| Publish | Joomla wrote the page but the response was lost | Error; retry writes again | No idempotency key; `articleId` never stored |
| Post-publish | Work-log, QC, Sheets | Fire-and-forget | Logs only |
| Process | Restart or deploy mid-phase | `running` forever | Not runnable; endless UI spinner |
| Client/proxy | HTTP timeout | Toast on the client; server keeps running | A second click can run the phase twice |
| Concurrency | Chat or manual edit during a phase | Whole row rewritten from a stale snapshot (`mc.ts:219-237`) | The edit is silently lost |

**Bake-off.** Items marked ✓ I re-read myself; the rest come from a read-only sub-audit.

| Location | Failure |
|---|---|
| `providers.ts:1499` ✓ | The DeepSeek adapter throws on every web-search turn, so DeepSeek can never be scored |
| Latest run ✓ | Gemini 3.1 Pro low and medium failed the same web-search gate |
| `providers.ts:321` ✓ | The Claude adapter ignores the abort signal |
| `history.ts:33-41`, `102-108` ✓ | Manifest is read-modify-write with a plain `writeFile`, and a read error becomes `[]` |
| `resume.ts:119-125`, `run.ts:578` | Resume treats errored or partial records as done |
| `run.ts:653-655`, `visual.ts:149-151` | A failed visual pass falls back to the token proxy, so models in one run can be scored on different formulas |

## Evidence

### Cause 1: the prompts contradict the checkers (high)

- **Locations link.** The Page Builder prompt contains `<a href="https://www.stselectronicrecyclinginc.com/our-locations?view=map">` (`fixtures/master-page-builder.txt:409`, also in `lib/mc-core/src/prompts/pageBuilder.ts`).
  - The registry only lists `/our-locations` (`registry.ts:79`).
  - `normalizeUrl` keeps query strings (`registry.ts:290-292`), so the two never match.
  - `checkUrlRegistry` reports an error for any unknown internal link (`checkers/index.ts:215-250`).
- **No-GMB schema.** The Schema Generator's `<PARENTORGANIZATION>` block requires HQ `streetAddress "1653 N Bolton Street"` and `postalCode` (`master-schema-generator.txt:543-560`; the same HQ string is in `schemaGenerator.ts`).
  - The No-GMB branch of `checkSchemaRules` flags `streetaddress`, `postalcode` or `telephone` anywhere in the tree (`checkers/index.ts:754-778`, using the recursive `walkSchema` at 675-693).
- **GMB schema.**
  - `toRunContext` never sets `gmb` (`mc-runtime.ts:461-479`), and `mc_runs` has no column for it.
  - `describeContext` omits `verifiedCid` (`engine/context.ts:39-69`).
  - But when `verifiedCid` is set, `checkSchemaRules` requires that exact CID (`checkers/index.ts:731-752`).
- **The gate.** Only link checks can be overridden (`blockingErrorCount`, `checkers/index.ts:887-897`). The only edit route is `PUT /html`; there is no schema edit route.
- **Observed.** In `history/2026-10-18T21-58-01-714Z.json`, all 7 scored pages fail:
  - `url-registry` (detail: `/our-locations?view=map`);
  - `word-floor` (for example 1,200 of 2,000 words, and 1,647 of 2,000);
  - `schema-rules` ("contains telephone", "contains streetAddress").

  Some pages also fail `facility-language` and `sacred-links`.
- **Corrupted sacred URL.** `.../secure data destruction-certified-data-destruction` (with spaces in the path) appears in:
  - Mission Control's runtime `seoAudit.ts`;
  - the bake-off fixture;
  - the golden reference `reference/billings-mt.html:431,515`;
  - the TechnoCycle prompt;
  - archived model pages.

  It is not in the registry.

### Cause 2: execution is tied to the request and never recovers (high mechanics, unknown frequency)

- **Phases are awaited inside the request handlers:** create (`mc.ts:357`), run (`:492`) and approve (`:659`).
- **`running` is a dead end.**
  - The "running" write is at `mc.ts:161-169`.
  - The runnable set is ready, review and failed (`mc.ts:480`, `528`).
  - Startup does no reconciliation (`index.ts:22-33`), and no code anywhere clears `running`.
- **Time budgets:**

  | Phase | Max provider calls | Worst case at 600 s per call |
  |---|---|---|
  | Build | 4 (2 attempts × main + backup) | about 40 min |
  | Audit | 12 (4 audit + 2 verify turns × 4) | about 2 h |
  | Schema | 4 | about 40 min |

  Sources: 600 s timeout, 2 attempts and 1 correction (`transport.ts:18-33`); main plus backup (`mc-runtime.ts:174-178`).
- **Research has no timeouts.**
  - The Perplexity `fetch` has no abort signal (`perplexity.ts:46-63`). Neither do the SerpAPI and DataForSEO clients.
  - Synthesis calls `messages.create` without `withTimeout` (`mc-runtime.ts:347-352`).
  - The Anthropic client uses SDK defaults (`lib/integrations-anthropic-ai/src/client.ts`). I believe those are a 10-minute timeout and 2 retries, but that is from general SDK knowledge and needs local verification.
- **UI.** `busy` is true while `status === "running"`, Run only appears for `ready`, and Retry only for `failed` (`run-detail.tsx:807-816`). A dead phase spins forever.
- **Double execution.** Nothing claims the phase atomically between `loadRun` and the "running" write, so two quick requests can both run it.

### Cause 3: truncation and extraction (medium)

- Claude uses `MAX_TOKENS = 16000`, non-streaming, and never checks `stop_reason` (`claude.ts:8, 39-56`).
- Gemini never checks `finishReason` (`gemini.ts:33-44`).
- OpenAI does reject incomplete responses (`openai.ts:75-81`).
- A search finds no `stop_reason` or `finishReason` handling anywhere in `mc-core` or `api-server`.
- `extractContent` takes the first fence, or slices to the end of the response when `</html>` is missing (`base.ts:27-39`). The HTML validity check only looks for a doctype or `<html` tag (`transport.ts:101-103`), so a cut-off page counts as valid.
- The audit phase sends a roughly 126 KB system prompt plus the full page, and expects a report plus the whole page back. That is where output-budget pressure is highest.
- Supporting evidence: June page word counts were 1,289 to 1,438 against the 2,000 floor. Truncation and under-writing look the same here because no stop reason is recorded.

### Other verified defects

- **Research is mostly unused.** Only `researchBrief.summary` reaches the prompts (`context.ts:40-42`). Entities, sources and flags are never sent to the model.
- **Publish loses its receipt.** The publisher returns `articleId` and `url` (`joomla.ts:130-140`), but the orchestrator drops them (`orchestrator.ts:248-254`).
- **Unused fallback and a stale comment.** The deterministic schema generator exists but is never called (`schema/generator.ts:9-29`). The comment at `checkers/index.ts:713-715` still says it is used.
- **Broken TechnoCycle tool.** `artifacts/page-terminal/public/tools/technocycle/hub-spoke.html:832,945,949` contains `p.certified processing`, which is a JavaScript syntax error, so that tool's script cannot parse.
- **Thin test coverage.** `orchestrator.test.ts` has only 4 tests, all about publish. Nothing covers a stuck `running` phase, truncation, or the prompt/checker contract.

### Answers to the brief's questions

**Q1. Why `structure` is exactly 50**

- *Verified here:* All 19 scored rows in the three June 23 snapshots score exactly 50 (5, 6 and 8 rows). September and October runs score 39, 55 or 75, so "always 50" is a June result only. Signal by signal on the June pages:

  | Signal | Fires? | Points |
  |---|---|---|
  | `rootCss` | Yes, on all 13 pages | 25 |
  | `sacredUrls` | Yes, and maxes out: 3 points per unique STS link, capped at 25 (9+ links); pages have 19 to 41 lines with STS links | 25 |
  | `sectionSequence` | Never: no page has `<section class=…>` or `<!-- SECTION -->` | 0 |
  | `equipmentTitles` | Never: no page has a class containing "equipment", and neither does the golden reference | 0 |

- The reference page itself would only score 75.
- *Verdict:* In June this was dead weight, adding a constant 7.5 points to everyone. Today its one live signal rewards emitting `SECTION` comments, which is formatting, not quality. It is not valid at 0.15.
- `schema` (0.15) was also a constant 100 in June, because the No-GMB schema was deterministic with no AI turn (`exports/bakeoff-dossier.md:9349`). So **30% of the June composite carried no model signal.**
- *Reported:* "50 in six rows" matches the 4-model snapshot.

**Q2. What `htmlMatch` and `visualMatch` reward**

- *Verified here:*
  - `htmlMatch` is half cosine similarity of tag counts and half overlap of visible words (3+ characters) against `billings-mt.html` (`score.ts:99-103`).
  - `visualMatch` is a screenshot pixel diff, plus an optional vision-model rating, against the reference screenshot. Without a verdict it falls back to design-token overlap (`score.ts:185`).
- Both are **reference-similarity metrics, not quality metrics.** A better page with different wording, structure or palette scores lower. Copying the reference's defects scores higher; the reference even contains the space-corrupted URL.

**Q3. Whether the score/cost spread discriminates**

- *Verified figures* (from `exports/bakeoff-dossier.md`; costs are `cost.ts` estimates, not invoices):

  | Model | Composite | Time | Est. cost | Dossier lines |
  |---|---|---|---|---|
  | Claude Opus 4.8 | 76 | 579.4 s | $2.03 | 9352-9358 |
  | GPT-5.4 | 76 | 250.6 s | $1.19 | 9369-9375 |
  | GPT-5.5-pro | 73 | 793.9 s | $12.09 | 9421-9427 |
  | Grok 4.3 | 72 | 165.3 s | $0.42 | 9438-9444 |

  **The brief's "Opus at $1.19 in 250s" is actually GPT-5.4's row.** The other figures match.
- The archived composites don't reproduce under the current weights (Grok computes to 69, not 72; Opus to 77, not 76). The rubric has changed since that run.
- Same model, same task, different runs:
  - grok-4-20-reasoning: 59, 58, 59, 59, 50, 49
  - gpt-terra: 59, 62, 59, 63, 62, 64
  - gemini-3-7-flash-medium: 62, 58, 57, 60, 57, 61

  Three different models each led a run.
- *Verdict:* A 4-point spread with one run per model is inside the observed noise. The rubric does not currently discriminate between models; only the cost axis is real. It needs rebuilding before it's used to pick anything.

**Q4. `mc_runs` completion and stalls**

- *Cannot verify from this workspace.* The permission mode denied `psql`, and I did not estimate.
- *Verified context for reading the number:* a run can only become `published` when `JOOMLA_PUBLISH_URL` is set. With the stub, publish stays in `review`, and approving it sets the run to `approved`. Count those separately. SQL for Mark to run:

```sql
select status, count(*) from mc_runs group by 1 order by 2 desc;
select p->>'phase' phase, p->>'status' st, count(*)
  from mc_runs, jsonb_array_elements(phases) p group by 1,2 order by 1,2;
select id, engine, status, updated_at from mc_runs, jsonb_array_elements(phases) p
  where p->>'status'='running' and updated_at < now() - interval '3 hours';
select count(*) from mc_work_log where source='mission-control';
```

**Q5. Can Mission Control start from an external brief?**

- *Verified here:* Not through the API.
  - Creating a run requires a URL with a parseable city and state, plus a SerpAPI key.
  - Research always calls the provider (`mc.ts:183`), and no route writes `researchBrief`.
  - Approval requires research to have actually run (`mc.ts:621-632`).
- The seam already exists in the library (`PipelineDeps.research`, `orchestrator.ts:73-74, 96-98`) but isn't exposed.
- Replit mode can inject HTML and schema, but only for `engine=replit` runs, and only after provider research.

**Q6. Can a failed phase be rerun on its own?**

- *Verified here:* Yes for schema. A failed phase is runnable and reuses the persisted brief and HTML (`mc.ts:176-178`), and the failure path keeps them (`mc.ts:273-276`).
- Limits:
  - An approved phase can't be reopened.
  - Rerunning an audit that is in review re-audits the already-audited HTML.
  - A phase stuck in `running` forces a whole new run.
  - Rerunning schema won't fix `schema-rules` errors that the prompt itself causes.

**Q7. Shape compared with the lean runner and the factory**

| | Mission Control (verified) | Lean runner (reported) | Factory (reported) |
|---|---|---|---|
| Stage state | Persisted per phase on the DB row | One file per stage | Postgres manifest |
| Retry | Failed or review phases only; no rewind; `running` is unrecoverable | Rerun a stage | Resume |
| Entry point | Coupled to a URL and live SERP | Structured input | Preflight + probe |
| Execution | Synchronous HTTP, human approval at every phase | One command | Pipeline |
| Schema | LLM output plus checks; deterministic generator unused | Deterministic, exact counts | LLM |

- *Verdict:* Structurally it is closer to the lean runner. In practice it behaves all-or-nothing at publish, because of the contract conflicts and the unrecoverable `running` state. It is repairable; nothing here justifies a rewrite.

**Q8. Prompt versions and drift**

- *Verified here:*
  - Mission Control sends hard-coded Page Builder v3.12, SEO Audit v10.13.3 and Schema Generator v1.4.3, rewritten when the module loads by `editorialReview.ts`.
  - The bake-off fixtures carry the same labels but different text (for example `editorialReview.ts:144,162` against the fixture wording).
  - The TechnoCycle copies are v3.5 / v10.12.1 / v1.4.1; the dossier is v3.6 / v10.12.4 / v1.4.1.
  - Hub+Spoke is v8.5 in both tools, with identical text.
  - `page-terminal.html` does not embed the master prompts; operators upload them.
- *Proven drift:* Content changed while version labels stayed the same. A repo-wide term scrub (commit `c7721f8`, per the sub-audit's git check) left behind "200,000 vs 200,000", circular rules, the corrupted URL, and the broken TechnoCycle JavaScript.
- *Reported:* The brief's v3.7 / v10.12.4 / v1.4.1 / v8.2 are not what Mission Control sends.
- *Cannot verify:* the canonical Drive copies, the DB `prompts` rows, or the framework repo.

## Reproduction plan

All of these are offline and deterministic:

1. **Contract conflict** (`mc-core` unit test).
   - `runCheckers` on a page containing the prompt's locations anchor, using `buildRegistry()`, should report a `url-registry` error.
   - `checkSchemaRules` on the prompt's parent-organization JSON with no CID should report an error.
   - `schemaPrompt` with `verifiedCid:"123"` should produce user text without "123", and `checkSchemaRules(schemaWithoutCid, "123")` should then report an error.
   - Run the checkers over the archived `pages/no-gmb/*.html` pages.
2. **Stuck `running`.** Seed a run whose build phase is `running`, then call `POST /phases/build/run`; it should return 409. Separately, use a fake engine that never resolves and abort the request; the row should stay `running`.
3. **Double run.** Send two concurrent `/run` requests on a failed phase, with a fake engine that resolves after 500 ms and counts calls. Expect 2 calls.
4. **Truncation.** Have a fake Anthropic client return text without `</html>` and `stop_reason:"max_tokens"`. The page should be accepted. Separately, a response with a JSON fence before the HTML fence should make `extractContent` return the JSON.
5. **Research hang.** `createPerplexityResearch(key, () => new Promise(() => {}))` under fake timers never settles.
6. **Lost attempts.** A `RoutedEngine` whose engines always throw, run through `executePhase`, leaves a failed ladder entry with no `attempts`.
7. **Duplicate publish.** A fake Joomla fetch that records the call and then rejects; rerunning publish produces 2 writes.
8. **Scoring.** `structureScore` on the reference page returns 75 and on the archived pages returns 50. Rerun one model 5 times on the same grounding and report the range.

## Minimal remediation plan

In dependency order; no rewrite needed:

1. **Observability.**
   - Save `attempts` on failure.
   - Record stop/finish reason, token usage and a hash of the raw output per attempt.
   - Save the publisher's `articleId` and `url`.
2. **State-machine safety.**
   - Claim a phase with a conditional `UPDATE … WHERE status IN (…) RETURNING`.
   - Add a lease timestamp to the ladder entry.
   - Treat an expired `running` phase as `failed: interrupted` at startup and on read, and show Retry for it.
3. **Get phases off the HTTP request.** Return 202 after the claim and run in the background (the UI already polls). Depends on step 2.
4. **Resolve the prompt/checker contract.** This is the highest-value step and needs Mark's policy decisions:
   - Either add `/our-locations?view=map` to the registry or change the prompt.
   - Scope the No-GMB schema rule to the page's own business entry, or remove the HQ address from the prompt.
   - Pass `verifiedCid` and the GMB profile into the run context.
   - Fix the corrupted URL in every copy, including the reference page.
   - Reconcile the 2,000-word floor with the prompt's targets.
   - Add a test that runs the checkers against the prompt's own template snippets.
5. **Truncation guards.** Reject Claude `max_tokens` and Gemini `MAX_TOKENS` stops, require `</html>`, and prefer the last ```` ```html ```` fence.
6. **Timeouts.** Add timeouts to every research and publish fetch, and wrap synthesis in `withTimeout`. Set the Anthropic `maxRetries` explicitly.
7. **Cut repeat spend.**
   - A route that accepts an external brief, using the existing seam.
   - A "reopen phase" action.
   - Cache the Perplexity output on the run row.
8. **Joomla idempotency key**, built from the run id plus a hash of the HTML.
9. **Bake-off rubric**, if the bake-off is kept:
   - Remove `structure`.
   - Report reference similarity separately from quality.
   - Score `schema` only when a model generated it.
   - Run each model at least 3 times.
   - Store the weights version with the results.
   - Make manifest writes atomic.

## Missing observability

- A correlation ID (run, phase, attempt) attached to logs and provider request metadata. Today `runId` is only logged on errors.
- Per attempt: model, stop/finish reason, input/output tokens, estimated cost, latency, and raw output (or its hash plus a storage pointer).
- `attempts` saved on the failure path, not just on success.
- A heartbeat or lease on running phases, and a count of stuck runs.
- Research sub-step timings, plus which sub-call failed (Perplexity, SerpAPI or synthesis).
- The prompt version and content hash in each phase's provenance.
- The checker report saved with each page version. Today only the latest report survives, on the run row.
- Publish request ID, Joomla `articleId`, and the confirmed live URL.
- Metrics for phase duration and failures by phase and error class.
- For the bake-off: rubric version and weights stored with each result, and variance across repeat runs.

**Questions that need information outside this repo:**
1. The actual `mc_runs` distribution from the production database, and from the dev database if it differs.
2. Is `JOOMLA_PUBLISH_URL` set in production? If not, no run can ever reach `published`.
3. What request timeout does the deployment proxy enforce, and do instances restart or scale to zero during long requests?
4. Which production values are set for `MC_REQUEST_TIMEOUT_MS`, `MC_MAX_ATTEMPTS`, `MC_ROUTE_*` and `MC_RESEARCH_PROVIDER`, and which keys are present?
5. What `stop_reason` and token counts do real Claude build and audit calls return?
6. What is the correct URL behind `secure data destruction-certified-data-destruction`, and is `/our-locations?view=map` an approved link?
7. Should a No-GMB schema include the HQ parent-organization address?
8. Do the DB `mc_url_registry` rows include extra allowlist entries?
9. Which prompt versions are canonical (Drive reportedly holds 3.26.3 and 10.16.3)?
10. Everything the brief says about the factory, the lean runner and the hand method remains reported only.
