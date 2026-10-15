I have what I need. No files were modified.

---

# Factory Reliability Audit

Mark, up front: I could not run tests or query the database in this session. `Bash` execution and all file writes were denied by the permission mode, so `pnpm test`, `psql`, and `node -e` probes all returned permission errors. Everything below is derived from reading source and from the committed run artifacts, which turned out to be enough to prove most of the important claims. Where I could not verify, I say so.

## Executive diagnosis

**1. The composite score is roughly 85% constant. The rubric cannot discriminate between models, and it is measuring harness bugs, not model quality.**
In the most recent run (`2026-09-18`, Bakersfield), `schema` and `links` are literally identical for all five scored cells, `structure` is identical for four of five, and `htmlMatch` varies by 2 points. The decisive control is inside the data: **GPT-5.6 Luna at `medium` and at `high` effort both scored exactly 61**, at $0.0954/263s versus $0.1564/598s. Same model, 1.6x the cost, 2.3x the wall clock, zero score difference. That is the rubric failing to resolve a difference that definitely exists.

**2. Two prompt-versus-checker contradictions fail every model identically, and are pure wrapper bugs.**
- `scripts/src/bakeoff/fixtures/master-page-builder.txt:409` instructs the model to emit `our-locations?view=map`. `lib/mc-core/src/registry.ts:79` allowlists only `.../our-locations`, and `normalizeUrl` (`registry.ts:290`) strips trailing slashes and lowercases but **does not strip query strings**. Every model obeys the prompt and is docked an `error` on `url-registry` plus a link-audit error for it.
- Every model also fails `schema-rules` with "contains telephone" on a No-GMB page.
These two account for 2 of the 3 checker errors on every single cell. `audit` is 0.25 of the composite and is mostly measuring this.

**3. Mission Control has no phase timeout, no stale-run reaper, and runs phases synchronously inside the HTTP request. A run that stalls is permanently unrecoverable through the API.**
`executePhase` (`artifacts/api-server/src/routes/mc.ts:115`) sets the phase to `"running"`, awaits the LLM work, then writes the result. The runnable gate (`mc.ts:480`) is `["ready","review","failed"]`. `"running"` is not in that set. If the process dies or is redeployed mid-phase, the row is stuck at `"running"` forever and both `/run` and `/replit` return 409. Worst-case phase duration is 2 candidates x 2 attempts x `MC_REQUEST_TIMEOUT_MS` (600s default, `lib/mc-core/src/engine/transport.ts:19`) = **40 minutes** held open in one HTTP request. No proxy will hold that.

## System map

Two separate factories live here. They share `lib/mc-core` but are otherwise independent.

**A. Bake-off harness** (`scripts/src/bakeoff/`, a CLI, not deployed)

```
run.ts main()
 ├─ resolveTarget()                 env-driven target (default Billings, MT)
 ├─ loadDesignFixtures()            fixtures.ts, fail-loud on missing/empty
 ├─ loadPrior()                     resume.ts, target-keyed resume from results.json
 ├─ loadReferenceHtml()             target.ts: fixture → LIVE FETCH → "" (silent)
 ├─ loadOrAuthorGrounding()         grounding.ts, one shared brief for all models
 ├─ per scenario (no-gmb, gmb), models CONCURRENT via Promise.allSettled
 │    └─ runOneModel()
 │         conversation.ts turn chain: intro → build → designGate loop
 │          → seo-audit → seo-verify (web search REQUIRED) → schema → verify-links
 │         providers.ts guarded(): withTimeout + MAX_ATTEMPTS retry
 │         extract.ts: extractHtmlDocument / extractSchemaJson (fail loud)
 │         mc-core runCheckers()
 │         persist after EVERY model via serialized chain → writeJsonAtomic()
 ├─ judgeVisual()                   visual.ts: headless Chromium → pixelmatch + vision LLM
 ├─ scoreModels()                   score.ts WEIGHTS
 └─ archiveSnapshot()               history.ts → artifacts/bake-off/src/data/history/
```

Output is consumed by `artifacts/bake-off`, a static Vite viewer. No DB.

**B. Mission Control** (`artifacts/mission-control` + `artifacts/api-server` + `lib/mc-core`)

```
POST /api/mc/runs {vaName, url}              mc.ts:289, admin-gated
 └─ deriveRunInputs(url)                     SerpAPI/DataForSEO, 400 on failure
 └─ INSERT mc_runs, phases=[research ready, rest locked]
 └─ executePhase(run,"research")             SYNCHRONOUS, inside the request

runPhase(phase, ctx, prior, deps)            lib/mc-core/pipeline/orchestrator.ts:85
  research → researchProvider.research() + runEntityQualityGate()
  build    → engine.buildPage()   + runCheckers(afterAudit:false)
  audit    → engine.auditPage()   + runCheckers(afterAudit:true)
  schema   → engine.generateSchema() + parseSchema() THROWS if invalid
  publish  → blockingErrorCount()>0 THROWS; else publisher.publish()

engineFor() → RoutedEngine (mc-runtime.ts:210): per-phase main+backup,
              MC_MAX_ATTEMPTS=2, MC_REQUEST_TIMEOUT_MS=600_000

POST /phases/:phase/run      retry gate: status ∈ {ready, review, failed}
POST /phases/:phase/replit   inject operator HTML/schema (build/audit/schema only)
POST /phases/:phase/approve  requires status=="review", auto-runs next (non-replit)

UI: run-detail.tsx polls GET /runs/:id every 4000ms
```

State is a single `mc_runs` row, with the phase ladder as a JSONB array.

## Failure boundaries

Every point a run can die, and how the error is represented.

| # | Boundary | Location | Error representation |
|---|---|---|---|
| 1 | URL cannot be derived (SerpAPI down, unparseable) | `mc.ts:311` | 400, run never created. Loud, correct. |
| 2 | Research provider failure | `orchestrator.ts:104` | Phase `failed`, run `failed`. Recoverable. |
| 3 | Engine construction (missing key) | `mc.ts:142` | Phase `failed` + message. Loud. |
| 4 | **Phase in flight when process dies** | `mc.ts:161` | **Phase stuck `"running"` forever. Not in the runnable set. No reaper. Unrecoverable via API.** |
| 5 | **HTTP request exceeds proxy timeout** | `mc.ts:492` | Client sees a network error; server keeps billing. UI shows `running` indefinitely. |
| 6 | **Concurrent writes to the same run** | `mc.ts:115-279` | **No transaction, no row lock, no optimistic version. Read-modify-write on `phases` JSONB. Last writer wins.** |
| 7 | Schema not valid JSON-LD | `orchestrator.ts:169` | Throws, phase `failed`. Loud and correct. |
| 8 | Publish blocked by checker errors | `orchestrator.ts:209` | Throws. Correct, but see "effectively unreachable" below. |
| 9 | `JOOMLA_PUBLISH_URL` unset | `joomla.ts:46` | `published:false`, run stays `review`. **No run can ever reach `published`.** |
| 10 | Blog-log webhook failure | `orchestrator.ts:243` | Swallowed into a `WARNING:` string in the summary. Intentional. |
| 11 | Post-publish QC failure | `mc.ts:256` | `void ... .catch(log)`. Fire and forget. |
| 12 | Work-log recording failure | `mc.ts:250` | Same. Best effort. |
| 13 | **Bake-off: live-fetch reference fails** | `target.ts:218` | **Returns `html: ""`. `htmlMatch` and `visualTokens` silently become 0 for every model. The `source` field is computed but never persisted.** |
| 14 | **Bake-off: vision LLM fails** | `visual.ts:149` | **Bare `catch { return null }`. `visualMatch` silently degrades from `(pixel+llm)/2` to `pixel`. No log, no error field.** |
| 15 | Bake-off: page render fails | `visual.ts:68` | `.catch(() => {})`. Screenshots and scores a blank page. |
| 16 | Bake-off: scoring throws | `run.ts:517` | Caught, results persisted unscored. Correct. |
| 17 | **Bake-off: model errors once** | `resume.ts:124` | **Recorded as `status:"error"` and treated as DONE on resume. Never retried unless `BAKEOFF_FORCE` names it.** |
| 18 | Bake-off: live-fetch gate | `providers.ts:286` | Hard throw. Dominant failure class, 117+ occurrences. |

## Evidence

### E1. `structure` is 2 dead signals and 2 saturated constants. Confidence: very high, proven.

`structureScore` (`score.ts:13`) awards four 25-point signals from `extractStructuralSignals` (`lib/mc-core/src/checkers/structural-hash.ts:31`). I counted each signal's regex across every generated page in the repo:

| Signal | Rule | Observed | Points |
|---|---|---|---|
| `rootCss` | `:root {` present | **15 of 15 files, exactly 1 each** | 25, constant |
| `sectionSequence` | `<section class=...>` or `<!-- SECTION` | **0 in all archived pages; exactly 1 per model in Sept** | 0 or 5 |
| `equipmentTitles` | `class="...equipment..."` | **0 occurrences in every file, including the golden reference** | 0, dead |
| `sacredUrls` | `stselectronicrecyclinginc.com/...` hrefs, 3 pts each, cap 25 | **19 to 41 per page** (needs only 9) | 25, saturated |

25 + 0 + 0 + 25 = **50**, which is what all 19 scored rows in the three archives record. 25 + 5 + 0 + 25 = **55**, which is 208 of the 260 rows across the full history. The `equipment` signal has never fired on any page ever produced, including `reference/billings-mt.html`, which uses `<!-- SECTION: EQUIPMENT -->` comments and prose, never a class name.

**Verdict on the 0.15 weight: dead weight.** It contributes a near-constant +7.5 to +8.25 to every composite. It inflates everyone equally and compresses the visible spread. Not inconclusive. Proven constant across 260 recorded rows.

### E2. `htmlMatch` and `visualMatch` are similarity metrics, and currently similarity to a broken live page. Confidence: very high, proven.

`htmlMatchScore` (`score.ts:99`) = 50% cosine similarity of HTML tag-name frequency vectors + 50% Jaccard overlap of visible word tokens, against `referenceHtml`. `visualMatch` (`visual.ts:202`) = pixel diff of a rendered screenshot against the same reference. Neither consults a quality standard. Both are pure reference-similarity.

Worse: `loadReferenceHtml` (`target.ts:203`) tries `reference/<city>-<state>.html`, then **live-fetches the target URL**, then returns `""`. Only `billings-mt.html` exists. Every September run targeted `bakersfield-ca` (44 of 58 recorded runs), so every one of them scored against a live fetch. I rendered the committed reference screenshot to see what that actually was:

`artifacts/bake-off/public/screenshots/no-gmb/reference.png` is the live Bakersfield page, captured **with a cookie-consent banner covering the bottom, a reCAPTCHA error box reading "ERROR for site owner: Invalid domain for site key", and a video player still showing a loading spinner.**

So 0.25 of the composite is currently rewarding resemblance to a thin template page plus a consent banner plus a broken captcha widget. The fingerprint is in the data: `visualTokens` collapsed from 85 to 97 (Billings fixture era) to **1 or 2** in the September runs, and `htmlMatch` fell from 68 to 80 down to 47 to 49.

**Answer: these are similarity metrics, not quality metrics, and yes, a better-but-different page is penalized.** The target is `classification: NEW_BUILD`, meaning the model is asked to build the rich page that replaces the thin one. It is then scored on how closely it resembles the thin one. The weight comment at `score.ts:134` claims the cap exists "so closely copying the reference template can't outweigh a model that builds a genuinely better page." The cap limits the damage but does not change the direction of the incentive.

Three compounding defects in the same metric: `visualLlm` is `null` for every cell in the latest run (swallowed by the bare catch at `visual.ts:149`, so `visualMatch` silently became pixel-only); the screenshot is clipped to the top 1280x2400 px (`visual.ts:23`), so only the first screen or two is judged; and rendering uses a fixed `waitForTimeout(800)` with external assets that may or may not resolve, making the pixel score nondeterministic between runs of identical HTML.

### E3. The cost/score spread does not discriminate. Confidence: high.

Latest run, five scored cells:

| Cell | Effort | Composite | Cost | Time |
|---|---|---|---|---|
| gpt-5.6-luna | medium | **61** | $0.0954 | 263s |
| gpt-5.6-luna | high | **61** | $0.1564 | 598s |
| gpt-5.6-terra | n/a | 60 | $1.1444 | 560s |
| gemini-3.7-flash | low | 59 | $0.4902 | 161s |
| gemini-3.7-flash | medium | 57 | $0.5778 | 194s |

Four points of composite across a 12x cost range. The same model at two effort tiers is a dead heat. Six further cells (grok-4.6, grok-4.20-reasoning, deepseek-v4-pro, deepseek-v4-flash, gemini-3.1-pro) have `scores: null` and `totalMs: 0`, so **more cells failed than were scored.**

Decomposition of why: of the 7 weighted axes, `schema` (0.15) and `links` (0.10) are identical across all five cells, `structure` (0.15) is identical across four of five, and `htmlMatch` (0.125) spans 2 points. `audit` (0.25) takes only two values (64 or 52), and 2 of its 3 driving errors are the identical harness contradictions from E4. The only axis doing real work is `wordCount`, and it is **double counted**: a page under the floor is docked once by the `word-floor` checker error inside `auditScore` (`score.ts:9`) and again by `wordCountScore` (`score.ts:45`).

Net: roughly 0.40 to 0.55 of the weight is mathematically constant within a run, and the residual ranking is essentially one signal counted twice.

**On the brief's specific figures** (Opus 4.8 at 76/$1.19/250s, GPT-5.5-PRO at 73/$12.09/794s, Grok 4.3 at 72/$0.42/165s): *cannot verify from this workspace.* No committed run matches those numbers. The closest archive (`2026-06-23-full-adherence`) records claude-sonnet-4-6 at 76 with `totalMs: 1163181` (1163s, not 250s), gpt-5.5 at 75, gemini-3.1-pro at 73, grok at 66. Those are reported, not local.

### E4. The prompt and the checker contradict each other, and every model loses the same points. Confidence: very high, proven.

Every scored cell in the latest run fails exactly three error-severity checks:

1. `url-registry`: `https://www.stselectronicrecyclinginc.com/our-locations?view=map` "not in the approved registry". The page-builder fixture tells the model to emit this exact string (`master-page-builder.txt:409`). The allowlist has the bare path (`registry.ts:79`), and `normalizeUrl` (`registry.ts:290`) does not strip query strings. **Identical for all five models.** This also drives `links` to a constant 80 (100 minus 1x20) and produces the link-audit error.
2. `word-floor`: 915 and 1433 words against a 2000 floor. The only genuinely model-varying failure.
3. `schema-rules`: "No-GMB page: schema contains forbidden Google Business Profile signals: contains telephone". **Identical for all five models.**

Separately, a dimensional mismatch in the word-count ceiling: the prompt keys the target on **competition** ("MEDIUM competition = ~2,400-2,800 words", `master-page-builder.txt:262`, ceiling 2,800 at line 420), while `WORD_COUNT_CEILINGS` (`registry.ts:15`) keys it on **pageType** (`SPOKE: 2400`). A model that follows the prompt exactly and writes 2,600 words is penalized by the scorer for obeying.

### E5. Mission Control's publish gate is effectively unreachable, for reasons unrelated to model quality. Confidence: high.

`blockingErrorCount` (`lib/mc-core/src/checkers/index.ts:887`) counts every failed error-severity check. The link-audit override (`mc.ts:700`) exempts only link checks. So `word-floor` and `schema-rules` are hard blockers with no escape hatch. Given E4, every frontier model trips at least two of them on every run.

This is independently corroborated by a prior verification pass committed in this repo, `docs/mission-control-drift-report.md:146`: *"a tracked follow-up notes that Dashboard-mode auto-Build currently under-produces, so a fully automatic run can't clear the publish checker gate without manual chat-edits."* Same document, line 39: `JOOMLA_PUBLISH_URL` is *"genuinely unset"*, which means `StubJoomlaPublisher` (`joomla.ts:46`) returns `published:false` and the run is pinned at `review` by design (`mc.ts:191`).

Two independent structural ceilings on completion, both configuration and wrapper issues, neither a model issue.

### E6. Resume treats errors as completed work. Confidence: very high, proven.

`readPrior` (`resume.ts:119-126`) adds every recorded model to the `done` map with no status check. The comment at `run.ts:284` confirms the intent: force-rerun exists *"even when a prior (ok OR error) result exists"*. Consequence: a transient 403 or a 120s stream stall is baked permanently into `results.json`, skipped by every subsequent run, and published on the leaderboard as a model that failed. The six `scores: null` cells in the latest run will persist until someone names them in `BAKEOFF_FORCE`.

Compounding this, `ModelResult` (`types.ts:78`) carries **no per-cell timestamp and no fixture/prompt version hash**. `BakeoffResults.ranAt` is a single top-level field rewritten on every persist (`run.ts:531`). A `results.json` assembled across several resume passes, potentially with different prompt fixtures on disk, presents every cell as having run at one moment under one configuration. There is no way to detect that from the artifact.

### E7. Environment differences change behavior silently between runs. Confidence: high.

The committed error log shows `"failed after 1 attempt(s)"` and `"failed after 2 attempt(s)"` for the same error classes. That string interpolates `MAX_ATTEMPTS` (`providers.ts:248`), which reads `BAKEOFF_MAX_ATTEMPTS` (default 2). So retry depth varied between runs via environment, unrecorded in the artifact.

Failure distribution across all committed history:

| Class | Count | Nature |
|---|---|---|
| Live-fetch gate: "produced NO evidence of calling its web-search tool" | ~117 | Harness gate on nondeterministic model tool-choice |
| DeepSeek `402 Insufficient Balance` | 61 | Billing |
| Grok `HTTP 403` on stream open | ~15 | Entitlement |
| Provider schema/JSON errors (gemini) | 48 | Provider response handling |
| Timeouts / "stream went silent for 120s" / "terminated" | ~12 | Transport |
| Empty response / `finish_reason` | ~12 | Reasoning budget consumed the output budget |
| `400 Unsupported value: 'low' is not supported with 'gpt-5.5-pro'` | 2 | Harness sent an effort the provider rejects |
| Model refused: "the supplied Master Page Builder requires GMB data" | 3 | Prompt/scenario contradiction |

Not one of these is a page-quality failure. The single largest class, `enforceLiveFetch` (`providers.ts:279`), converts a model's nondeterministic decision about whether to call its search tool into a hard run failure, and then retries it, which rarely helps and doubles the spend.

### E8. No concurrency control anywhere in the run state machine. Confidence: high.

I searched `artifacts/api-server/src` for `db.transaction`, `FOR UPDATE`, advisory locks, mutexes, and version columns. The only mutex in the artifact guards the GitHub mirror (`github-mirror-scheduler.ts:70`). `executePhase` performs three sequential unguarded read-modify-write cycles on the `phases` JSONB array (`mc.ts:161`, `mc.ts:219`, `mc.ts:268`). Two concurrent POSTs to the same phase both read `status:"failed"`, both pass the gate at `mc.ts:480`, both execute, both bill, and the second write silently overwrites the first. The approve endpoint (`mc.ts:638`) is a second independent writer on the same row.

## Reproduction plan

Smallest deterministic test per finding. All are offline except R7.

**R1, dead structure signals.** Pure function, no network.
```
assert structureScore(readFile("scripts/src/bakeoff/reference/billings-mt.html")) === 75
assert extractStructuralSignals(<any archived page>).equipmentTitles.length === 0
for each file in archive/*/pages/**/*.html: assert structureScore(file) === 50
```
The reference assertion is the clincher: the golden page cannot score the equipment signal it was written to define.

**R2, reference fallback is silent.** Set `BAKEOFF_CITY=Nowhere BAKEOFF_STATE=ZZ BAKEOFF_TARGET_URL=http://127.0.0.1:1/x`. `loadReferenceHtml` returns `{html:"", source:"none"}`. Then assert `scoreModels([okModel], 2000, 2400, "")` yields `htmlMatch === 0` and `visualTokens === 0`, and that nothing in the written `BakeoffResults` records `source`.

**R3, prompt/registry contradiction.** Pure, two lines:
```
assert master-page-builder.txt includes "our-locations?view=map"
assert checkUrlRegistry('<a href="https://www.stselectronicrecyclinginc.com/our-locations?view=map">x</a>', buildRegistry()).passed === false
```

**R4, word-count double counting.** Build a `CheckerReport` with `wordCount: 915`, floor 2000. Assert `auditScore` is docked by the `word-floor` error **and** `wordCountScore` returns ~46. One deficiency, two penalties.

**R5, errored cells are skipped on resume.** Feed `readPrior` a fixture `results.json` containing one `{id:"grok", status:"error"}` row with a matching target and an empty force set. Assert `prior.done.get("no-gmb").has("grok") === true`. Already unit-testable; `resume.test.ts` exists and does not cover this case.

**R6, stuck-running is unrecoverable.** Integration test against the real router: insert an `mc_runs` row with `phases:[{phase:"build",status:"running"}]`, then `POST /mc/runs/:id/phases/build/run`. Assert 409 and that no endpoint can transition it. This is the highest-value test to add.

**R7, concurrent phase execution.** Two simultaneous `POST /phases/schema/run` against one run in `failed`. Assert the engine is invoked twice and that the final `phases` array lost one writer's `attempts` log. Needs a DB.

**R8, vision judge silently degrades.** Unset `ANTHROPIC_API_KEY`, call `judgeVisual`. Assert every verdict has `llm === null`, `combined === pixel`, and that **nothing** was logged or recorded to distinguish this from a run where the judge agreed with the pixel score.

## Minimal remediation plan

In dependency order. No rewrite is warranted. The architecture is sound; `runPhase` is already a clean stage-in/state-out function and the seams are real. The defects are localized.

**Tier 1, stops silent corruption. Do these first.**

1. `registry.ts:290`, make `normalizeUrl` strip the query string and fragment, or add the `?view=map` variant to `DEFAULT_URL_ALLOWLIST`. One line. Removes one error from every page in both systems. Decide which side is canonical by checking whether the live URL actually needs the parameter.
2. `visual.ts:149` and `visual.ts:68`, replace the bare catches with a recorded reason. Add `visualLlmError: string | null` and `renderError: string | null` to `ModelScores`. A metric that silently changes definition mid-dataset is worse than a missing metric.
3. `target.ts` plus `run.ts:530`, persist `referenceSource` and a hash of the reference HTML into `BakeoffResults`. Make `source: "none"` a hard abort unless `BAKEOFF_ALLOW_NO_REFERENCE=1`. Scoring 0.25 of the composite against an empty string should never be silent.
4. `resume.ts:124`, skip `status === "error"` rows unless an explicit `BAKEOFF_RESUME_ERRORS=1` is set. Transient infrastructure failures should not become permanent published results.

**Tier 2, makes stalls recoverable. This is the Mission Control fix.**

5. Add `"running"` to the runnable set at `mc.ts:480` **only** when the phase's `startedAt` is older than a staleness threshold, and surface it as "stalled, retry" in the UI. Smallest change that unwedges a stuck run without a schema migration.
6. Make `executePhase` asynchronous: return 202 immediately with the run state, and let the existing 4s poll in `run-detail.tsx:403` drive the UI. The orchestrator already supports this because `runPhase` is pure in and out. This removes the 40-minute-HTTP-request class entirely.
7. Add a run-scoped guard so one run cannot execute two phases at once. A Postgres advisory lock keyed on `run.id` around `executePhase` is sufficient and needs no schema change.

**Tier 3, makes the rubric honest. Only if you keep the bake-off.**

8. Delete the `equipmentTitles` signal or rewrite it to match how pages are actually authored (`<!-- SECTION: EQUIPMENT -->` comments). Reweight `structure` from 0.15 down, and move the weight onto axes that vary.
9. Remove the `word-floor` checker error from `auditScore`'s input, or drop the `wordCount` axis. Not both.
10. Key `WORD_COUNT_CEILINGS` on competition, matching the prompt, not on pageType.
11. Split the composite into two reported numbers: a **compliance** score (checkers, schema validity, links) and a **fidelity** score (`htmlMatch`, `visualMatch`). Do not blend them. They answer different questions, and blending is what lets a similarity metric quietly veto a quality judgment.

**On the question of whether a bake-off is the right tool at all.** Based on the local evidence: no, not right now. In the latest run, 6 of 11 cells failed before producing a page, and of the 5 that scored, 2 were the same model at different effort and tied exactly. The three checker errors that drive the only varying axis include two that are harness contradictions. You would be spending model budget to re-measure your own wrapper. Fix tiers 1 and 2 first; if after that the spread is still 4 points, model choice is confirmed not to be the bottleneck and the bake-off has given you its answer.

## Missing observability

What would make the next failure explainable. Ordered by value.

1. **A per-cell record in `ModelResult`**: `startedAt`, `completedAt`, and a **hash of every fixture used** (`pageBuilder`, `seoAudit`, `schemaGenerator`, `designTier2`). Today a `results.json` assembled across resume passes with different prompts on disk is indistinguishable from a single clean run. This is the one gap that makes prompt drift undetectable after the fact.
2. **A correlation ID threaded from run creation through every phase, engine attempt, and provider call.** `executePhase` already builds a run-scoped `attempts` array (`mc.ts:123`), which is good, but it is discarded on the failure path: the catch at `mc.ts:268` writes `error` and drops `attempts` entirely. So the retry and fallback history survives only on success, which is exactly backwards.
3. **Persisted `referenceSource` and reference hash** in bake-off results, per Tier 1 item 3. Without it you cannot tell a fixture run from a live-fetch run from a zero-reference run, and all three produce plausible-looking scores.
4. **A `phase_started_at` heartbeat** on `mc_runs`, plus a periodic log of runs in `"running"` older than the threshold. Right now a wedged run is invisible until a human opens it.
5. **Structured per-check metrics** rather than a scalar `errorCount`. You want "`url-registry` failed on 100% of pages for 3 months" to be a visible number. It is currently buried in nested JSONB and I only found it by grepping artifacts.
6. **Distinguish harness-gate failures from model failures in the error field.** `enforceLiveFetch` throwing is categorically different from a 402 billing error, which is different again from a model producing a bad page. All three currently land in the same `error: string` and all three render identically on the leaderboard.
7. **Record the effective environment** (`BAKEOFF_MAX_ATTEMPTS`, `BAKEOFF_REQUEST_TIMEOUT_MS`, `MC_ROUTE_*`, which keys were present) into the run artifact. The "1 attempt vs 2 attempts" discrepancy in the committed logs is unexplainable today.

---

## Answers to the brief's eight questions

**1. Why `structure` is exactly 50.** *Verified from this workspace.* `rootCss` fires for 100% of pages (constant +25). `sacredUrls` saturates its cap at 9 links while pages carry 19 to 41 (constant +25). `sectionSequence` scores 0 in every archived page and 5 in the September pages (one `<section class>` each). `equipmentTitles` has **never fired on any page in this repo, including the golden reference**. 25+0+0+25 = 50. Verified in all 19 archived rows; the 208 rows at 55 are the same decomposition with one section marker. **The 0.15 weight is dead weight**, not inconclusive. It adds a near-constant 7.5 to 8.25 points to every model.

**2. What `htmlMatch` and `visualMatch` reward.** *Verified.* **Reference-similarity metrics, not quality metrics.** `htmlMatch` is tag-frequency cosine plus word-token Jaccard against one page; `visualMatch` is a screenshot pixel diff against the same page. **Yes, a better-but-different page is penalized**, and currently the reference is a live-fetched page carrying a cookie banner, a broken reCAPTCHA, and a loading spinner, which I confirmed by rendering the committed `reference.png`.

**3. Can the spread discriminate.** *Verified, with a caveat.* No. The strongest local proof is the internal control: GPT-5.6 Luna at medium and high both scored 61 at 1.6x cost and 2.3x time. Roughly 0.40 to 0.55 of the weight is constant within a run, and the residual is word count counted twice. **The brief's specific 76/73/72 and $1.19/$12.09/$0.42 figures: cannot verify from this workspace.** No committed run matches them.

**4. `mc_runs` completion and stall distribution by phase.** **Cannot query the database from this workspace.** `psql` is installed, but Bash execution was denied in this session, including a presence-only env check. I am not estimating. What I *can* state from code and from a committed prior verification: completion is structurally capped at zero while `JOOMLA_PUBLISH_URL` is unset (`joomla.ts:46` returns `published:false`, and `mc.ts:191` only marks `published` on `true`), and `docs/mission-control-drift-report.md:39` records that variable as "genuinely unset". The same document, line 146, records that auto-Build under-produces and cannot clear the publish checker gate without manual edits. Those are two independent structural ceilings. The exact per-phase stall counts require the DB.

**5. Can MC accept an external brief and start at build.** *Verified: no.* `POST /mc/runs` requires `url` and hard-fails on `deriveRunInputs` (`mc.ts:293`, `mc.ts:311`). The ladder starts with research `ready` and everything else `locked` (`mc-runtime.ts:595`). `build` only becomes runnable after `research` is approved, and approval requires status `review`, which requires research to have actually executed (`mc.ts:626`). There is **no endpoint that seeds `researchBrief`**; I enumerated all 21 routes in `mc.ts`. The Replit endpoint accepts operator-produced `html` and `schema` for build/audit/schema only, and explicitly notes research "reuses the shared research provider" (`mc.ts:537`). **URL-derived research is mandatory and coupled to the run.**

**6. Can a failed phase be rerun independently, reusing paid outputs.** *Verified: yes, with one serious exception.* `runPhase(phase, ctx, prior, deps)` takes prior state and returns new state; `executePhase` rehydrates `researchBrief`, `pageHtml`, `generatedSchema` from the row (`mc.ts:176-182`). `POST /phases/schema/run` is runnable when the phase is `ready`, `review`, or `failed` (`mc.ts:480`). So a failed schema rerun reuses paid research and build. **The exception: if a phase is stuck in `"running"`, it is not in the runnable set, there is no timeout or reaper, and the run cannot be retried through the API at all.** That is the real rerun-cost risk, not the designed path.

**7. MC's shape versus the reported lean runner and production factory.** *Code evidence.* MC is **structurally much closer to the lean runner**. `orchestrator.ts:85` is a pure stage function with no cross-phase coupling; each phase persists its output to the `mc_runs` row and the next phase reads it; any phase is individually invocable; there is a durable manifest with resume, which is exactly the shape attributed to the production factory's Postgres manifest but with phase-level reentry that actually works. It is **not** a monolith, and a failure does not force a full rerun. Two places where it behaves like the all-or-nothing factory: publish requires **zero** checker errors with an override for link checks only (`checkers/index.ts:887`), so one unfixable error voids the whole run; and the `"running"` dead end above. The reported characteristics of the other two repos are **reported, not verified**, and I am not treating them as evidence.

**8. Prompt versions carried here, and provable drift.** *Verified.*

| Location | Page Builder | SEO Audit | Schema Generator |
|---|---|---|---|
| `scripts/src/bakeoff/fixtures/` | **v3.12** | **v10.13.3** | **v1.4.3** |
| `lib/mc-core/src/prompts/` | **v3.12** | **v10.13.3** | **v1.4.3** |
| `artifacts/page-terminal/public/prompts/technocycle/` | v3.5 (TechnoCycle brand) | v10.12.1 | v1.4.1 |

Drift I can prove locally:

- **The bake-off narration misreports its own prompt version.** `run.ts:141` and `run.ts:186` hard-code the string "Master Schema Generator (v1.4.1)", which is copied verbatim into every `results.json` and into the viewer. The fixture actually loaded is **v1.4.3**. Every committed run artifact carries this wrong claim.
- **The dossier is stale.** `exports/bakeoff-dossier.md` embeds Page Builder **v3.6**, SEO Audit **v10.12.4**, Schema **v1.4.1**. All three are behind the current fixtures.
- **Page Terminal is two brands and several revisions adrift**, and only ships a TechnoCycle set, not an STS set.
- **The manual VA tool does not carry the prompts at all.** `page-terminal.html` links out to Google Docs (eight `docs.google.com/document/...` links, e.g. lines 1368 to 1520). The version a VA actually pastes is uncontrolled, unversioned, and outside this repo. If the hand method built the 44 live pages, **the prompts that built them are not in version control.**
- mc-core and the bake-off fixtures agree on version headers and differ in size only by amounts consistent with JS string escaping (83,838 vs 81,964 bytes etc.). **Byte-identity: cannot verify**, since that needs code execution, which was blocked.
- The brief's versions (Page Builder v3.7, SEO Audit v10.12.4, Schema v1.4.1, Hub+Spoke v8.2) match **none** of the current local copies. Local Hub+Spoke is **v8.5** (`artifacts/page-terminal/public/tools/hub-spoke.html:471`). Those brief versions are reported, not verified.

---

## Questions requiring information outside this repository

1. **Can you run the `mc_runs` query, or grant DB access?** This is your question 4 and the one number I could not get. The query you want is a group-by on `status` plus a count of runs whose latest non-approved ladder entry sits at each phase, split by `status = 'running'` versus `'failed'`. The `"running"` count specifically tells you how many runs are wedged by the no-reaper bug.
2. **Is `JOOMLA_PUBLISH_URL` set in production today?** The in-repo drift report says unset as of 2026-06-21. If it is still unset, your publish completion rate is zero by construction and no amount of model or prompt work changes it.
3. **Does the live `our-locations` URL require `?view=map`?** This decides whether the fix is to the prompt fixture or to the registry allowlist. I can see the contradiction but not which side is correct.
4. **Why does the schema prompt produce a `telephone` on No-GMB pages?** Either the Schema Generator fixture mandates it and the checker is wrong, or the checker is right and the fixture needs a No-GMB branch. I can prove the contradiction exists; I cannot tell which is intended policy.
5. **What `BAKEOFF_MAX_ATTEMPTS` was set to for each historical run?** The committed artifacts show both 1 and 2 and do not record which. Without this, the historical failure counts are not comparable to each other.
6. **Production logs for a stalled Mission Control run**, specifically whether the server process was restarted or the request was proxy-terminated. That distinguishes "phase died with the process" from "phase completed after the client gave up," which look identical in the DB.
7. **The DeepSeek account state.** 61 `402 Insufficient Balance` failures are recorded. If that is still true, those cells will keep failing and, because of the resume bug, will keep appearing as model failures on the leaderboard.
8. **Whether the Google Docs that `page-terminal.html` links to are the real source of truth for the 44 live pages.** If so, the drift question cannot be fully answered from any repo, and the first move is pulling those into version control.
