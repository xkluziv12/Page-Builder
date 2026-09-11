I've finished the audit. Bash is locked down to a near-empty allowlist in this session (`.replit` line: `--allowed-tools Read Glob Grep "Bash(git status)"`), so no tests were run and no database was queried — I say so explicitly wherever it matters.

---

# Factory Reliability Audit — STS monorepo

**Evidence tags used throughout:** `[V]` verified from this workspace · `[R]` reported in the attached brief, not verified here · `[X]` cannot verify from this workspace.

---

## Executive diagnosis

**1. The composite score is ~40% dead weight, and the dead part is dead for harness reasons, not model reasons.** `[V]`
In the most recent run (`artifacts/bake-off/src/data/history/2026-09-11T21-10-36-549Z.json`), `schema` is **55 for all six** successful models and `links` is **80 for all six**. That is 0.25 of the composite weight producing literally zero variance. Both constants trace to fixed harness/registry facts, not model output: `schema-rules` fails identically for every model ("No-GMB page: schema contains forbidden Google Business Profile signals … contains streetAddress, contains postalCode, contains telephone"), and `linkAudit` fails with exactly one offender on every page — the same URL, `https://www.stselectronicrecyclinginc.com/our-locations?view=map`, which is simply absent from `mc_url_registry`. Add the constant 50-point floor inside `structure` (below) and roughly 40% of the weight is a constant. Observed composite spread: **61, 61, 61, 59, 59, 56** across an **18.6× cost range** ($0.0952 → $1.7696).

**2. The reference page that 0.25 of the score is measured against is fetched live at run time, for a city that has no fixture, and is never recorded.** `[V]`
The `.replit` "Bake-Off Run" workflow targets **Bakersfield, CA**. The only checked-in reference is `scripts/src/bakeoff/reference/billings-mt.html`. `loadReferenceHtml` (`scripts/src/bakeoff/target.ts:203`) therefore falls through to a live `fetch(target.url)` of the production Bakersfield page — full Joomla chrome, nav, third-party scripts — or, on failure, to `html: ""`, which silently zeroes `htmlMatch` for everyone. The `source` field it returns (`"fixture" | "live-fetch" | "none"`) is computed and then **discarded** at `run.ts:384-385`; nothing in `results.json` records which of the three happened. Corroborating signal: `visualTokens` is **2/100 for all six models** — near-zero design-token overlap, exactly what you'd expect when comparing a standalone generated page against a live CMS-rendered page.

**3. Mission Control has no recovery path for a phase stuck in `running`, and the default publisher can never mark a run published.** `[V]`
`executePhase` (`artifacts/api-server/src/routes/mc.ts:161-169`) writes `status: "running"` to `mc_runs`, then awaits `runPhase`. There is no heartbeat, no timeout at this layer, and no reaper anywhere in `artifacts/api-server/src`. The phase-gate at `mc.ts:480` only allows a re-run when status is `ready | review | failed` — **`running` is not runnable**. So any process restart, autoscale recycle, or redeploy mid-phase wedges that run permanently; the UI (`run-detail.tsx:810`) disables every button in that state and polls every 4s forever. Separately, if `JOOMLA_PUBLISH_URL` is unset, `StubJoomlaPublisher` returns `published: false` by design, so `publishConfirmed` is never true and no run can reach `status: "published"` — the run parks at `publish/review` and a VA approval flips it to `"approved"` with nothing live.

---

## System map

Two independent factories share `lib/mc-core`.

**A. Bake-off harness** (`scripts/src/bakeoff/`, entry `run.ts`, invoked by the `.replit` "Bake-Off Run" workflow) `[V]`

```
resolveTarget()            target.ts      env → {url,city,state,niche,pageType,…}; enum fields fail loud
loadDesignFixtures()       fixtures.ts    5 files read from disk; missing/empty = hard stop
loadPrior()                resume.ts      results.json reused only if target block matches on all 7 fields
loadReferenceHtml()        target.ts      fixture → live fetch → "" (no timeout on the fetch)
loadOrAuthorGrounding()    run.ts:703     ONE shared research brief, reused from prior results.json if present
resolveVariants()          variants.ts    matrix from BAKEOFF_VARIANTS; duplicate/unsupported-effort = fail loud
  ↓ per scenario, models run CONCURRENTLY (Promise.allSettled)
runOneModel()              run.ts:745     one try/catch per cell; never aborts siblings
  runConversation()        conversation.ts
     intro → build → designGate/rebuild loop (cap 2) → seo
          → seo-verify (web-search MANDATORY, gated on ✅/❌) → schema → verify-links (gated)
     each turn → guarded() → provider adapter (providers.ts)
                 timeout WALL_CLOCK = REQUEST_TIMEOUT_MS + 30s; MAX_ATTEMPTS retries
  runCheckers() + parseSchema()          → checkerReport, schemaValid
  costFromUsage() / estimateCost()       → measured or estimated
persist()                  resume.ts      writeJsonAtomic (tmp + rename), serialized chain
judgeVisual()              visual.ts      headless Chromium → PNG 1280×2400 → pixelmatch + optional vision-LLM
scoreModels()              score.ts       7 weighted axes → composite
archiveSnapshot()          history.ts     dated JSON + namespaced screenshot copies + manifest.json
```

**B. Mission Control pipeline** (`artifacts/api-server` + `lib/mc-core` + `artifacts/mission-control`) `[V]`

```
POST /api/mc/runs          mc.ts:289
  deriveRunInputs(url)     mc-runtime.ts:515
     normalizeTargetUrl → isPrivateHostname → parseCityState → SERPAPI required (fail loud)
     probeTargetPage (never throws) → deriveClassification
     live-page state cross-check → fetchSeoIntel
  INSERT mc_runs (status running|queued, phases ladder: research=ready, rest=locked)
  executePhase("research")                        ← auto-run for non-replit engines
executePhase()             mc.ts:115
  engineFor() → RoutedEngine (per-phase main+backup, MC_MAX_ATTEMPTS=2, MC_REQUEST_TIMEOUT_MS=600s)
  UPDATE phases[phase].status = "running"
  runPhase()               orchestrator.ts:85     pure: (phase, ctx, priorState) → newState
     research → ResearchProvider (direct: Perplexity + SerpAPI + synthesis LLM | n8n webhook)
                + runEntityQualityGate
     build    → engine.buildPage   → runCheckers(afterAudit:false)
     audit    → engine.auditPage   → RoutedEngine runs corrective-verify loop → runCheckers(afterAudit:true)
     schema   → engine.generateSchema → parseSchema; INVALID = throw (halt) → deriveJoomlaMeta
     publish  → blockingErrorCount gate → publisher.publish (HTTP or stub)
  UPDATE mc_runs (phases, researchBrief, pageHtml, generatedSchema, joomlaMeta, checkerReport, status)
  INSERT mc_page_versions when html changed
  on publishConfirmed: background work-log upsert + QC (GTmetrix + JSON-LD)
POST …/approve             mc.ts:609   phase→approved, next→ready, then SYNCHRONOUSLY runs the next phase
UI                         run-detail.tsx:403  refetchInterval 4000 on run + chat + qc
```

Everything else (Page Terminal, Canvas) is front-of-house with no backend coupling `[V]`.

---

## Failure boundaries

Ordered by pipeline position. **Loud** = surfaces as a recorded error; **Silent** = degrades without a record.

### 1. Input validation / location resolution
| Boundary | Behavior | Representation |
|---|---|---|
| `deriveRunInputs` unparseable URL / private host / no city-state | throws → 400, run not created | **Loud, good** `[V]` |
| `SERPAPI_API_KEY` unset | throws before insert | **Loud, good** `[V]` |
| `probeTargetPage` network failure | never throws; treated as "no live page" → `NEW_BUILD` | **Silent** — a transient timeout silently reclassifies a REVAMP as a NEW_BUILD `[V]` `mc-runtime.ts:543` |
| Bake-off `resolveTarget` enums | fail loud on bad value | **Loud, good** `[V]` |

### 2. Research / external APIs
| Boundary | Behavior | Representation |
|---|---|---|
| Perplexity call (`research/perplexity.ts:46`) | **bare `fetch`, no AbortSignal, no timeout** | **Unbounded hang** `[V]` |
| n8n `mark-ai-brain` (`research/n8n.ts:66`) | **bare `fetch`, no timeout** | **Unbounded hang** `[V]` |
| `synthesizeBrief` on an OpenAI reasoning model | `max_output_tokens: 8192` covers reasoning too; reasoning can eat the whole budget → `output_text: ""` | Caught by `parseBriefJson` → **Loud**, but the *cause* is invisible `[V]` `mc-runtime.ts:312,360` — this is structurally the same bug the brief reports for the precision repo `[R]` |
| Shared grounding reuse (bake-off) | reused verbatim from prior `results.json` whenever the target matches | **Silent staleness** — a months-old brief is reused with no age recorded `[V]` `run.ts:703` |

### 3. Provider / model selection
| Boundary | Behavior | Representation |
|---|---|---|
| Missing credential | built inside the cell's try/catch → that cell errors, siblings survive | **Loud, well-designed** `[V]` `run.ts:76` |
| `BAKEOFF_MAX_ATTEMPTS='1'` in the live workflow | **retries disabled** — one 403/402/timeout kills the whole cell | **Loud but fatal** `[V]` `.replit` |
| xAI 403, DeepSeek 402 | recorded per cell | **Loud** `[V]` — 4 of 11 cells lost this way in the last run |
| `enforceLiveFetch` (`providers.ts:279`) | model didn't call web search on the seo-verify turn → throw | **Loud, but discards the entire paid run** `[V]` |
| Prompt-cache keys, thinking budgets | per-provider transport differences | Documented, not scored `[V]` |

### 4. Generation / parsing / structured-output validation
| Boundary | Behavior | Representation |
|---|---|---|
| `extractHtmlDocument` finds no `<!DOCTYPE>/<html>` | throws with first 200 chars | **Loud, good** `[V]` |
| `extractSchemaJson` no `<script type="application/ld+json">` or bad JSON | throws | **Loud, good** `[V]` |
| Design gate never passes after `cap` rebuilds | throws | **Loud, good** `[V]` |
| Verification turn never reaches ✅ after `cap` fixes | throws; null verdict never counts as pass | **Loud, good** `[V]` `conversation.ts:402` |
| **Whole-cell atomicity** | a failure at turn 5 discards turns 1-4 | **No mid-conversation resume** — `gemini-3-1-pro-low` burned **60,627 output tokens** across intro+build+seo then died at seo-verify `[V]` |
| MC schema phase invalid JSON-LD | throws, halts, no placeholder | **Loud, good** `[V]` `orchestrator.ts:169` |
| `looksLikeHtmlDocument` = regex for `<!doctype html|<html` | a truncated page that has an opening `<html` passes validation | **Silent** — truncation is not detected `[V]` `transport.ts:101` |

### 5. Template / file generation
| Boundary | Behavior | Representation |
|---|---|---|
| `editorialReview.ts` literal `replaceAll` patches | ~50 exact-string substitutions against the raw master prompts | **Silent no-op on any prompt edit** — the garbled source text ships to the model unchanged. Partially guarded by `builders.test.ts:126` `[V]` |
| `visual.ts` `page.setContent(...).catch(() => {})` | render failure swallowed; a blank page is screenshotted and scored | **Silent** `[V]` `visual.ts:68` |
| `visionRating` bare `catch { return null }` | any failure → `visualLlm: null` → `visualMatch` becomes pixel-only | **Silent metric redefinition** — null for **all six** models in the last run `[V]` `visual.ts:149` |
| Screenshot clip 1280×2400 | only the top ~2400px of a multi-screen SEO page is compared | **Silent scope limit** `[V]` `visual.ts:23,72` |

### 6. Persistence
| Boundary | Behavior | Representation |
|---|---|---|
| `writeJsonAtomic` | full serialize → tmp → rename; persists serialized through one chain | **Correct** `[V]` `resume.ts:175` |
| `history.ts` `manifest.json` | **read-modify-write, plain `writeFile`, no lock, no atomic rename**; `loadManifest` catches parse errors and returns `[]` | **Silent total history-index loss** on a crash mid-write or two concurrent archives `[V]` `history.ts:33-41,108` |
| `copyIntoHistory` failure | `catch { return null }` → screenshot rendered "unavailable" | Deliberate and correct `[V]` |
| Error cells in `results.json` | kept by `loadPrior`; **not retried on re-run** unless `BAKEOFF_FORCE` | **Silent staleness** — a fixed transient failure stays an error row forever `[V]` `resume.ts:124` |
| `mc_runs` writes | no transaction wrapping the started/completed pair; each `UPDATE` is standalone | A crash between them leaves `running` `[V]` |
| No optimistic locking on `mc_runs` | two concurrent `executePhase` calls on one run last-writer-wins on the whole phases JSONB | **Silent** `[V]` |

### 7. Checkers / publishing / deployment
| Boundary | Behavior | Representation |
|---|---|---|
| `blockingErrorCount` gate before publish | throws with count | **Loud, good** `[V]` `orchestrator.ts:209` |
| `HttpJoomlaPublisher.publish` | **bare `fetch`, no timeout/AbortSignal** | **Unbounded hang inside the approve request** `[V]` `joomla.ts:87` |
| Non-OK / non-JSON / unconfirmed write | throws | **Loud, good** `[V]` |
| Stub publisher (no `JOOMLA_PUBLISH_URL`) | `published: false`, run stays `review` | **Loud in the message, invisible in the status column** — the run can still be approved to `"approved"` `[V]` |
| `logBlogEntry` failure | appended as a WARNING to the summary, publish not rolled back | Correct and explicit `[V]` `orchestrator.ts:243` |

### 8. UI polling / retries / queues / background work
| Boundary | Behavior | Representation |
|---|---|---|
| `POST /approve` | runs the **entire next phase synchronously** before responding | Worst case audit phase ≈ (2 candidates × 2 attempts) + (1+1 verify turns × 4 calls) = **16 calls × 600s ≈ 160 minutes in one HTTP request** `[V]` |
| Browser/proxy timeout on that request | React Query surfaces an error, the server keeps working | **Divergence** — UI says failed, backend succeeds later `[V]` |
| 4s polling | shows `running` indefinitely with no elapsed-time or attempt display | **Hides the stall** `[V]` `run-detail.tsx:403` |
| Post-publish QC + work-log | `void …catch(log)` fire-and-forget; nothing is persisted on failure | **Silent** — QC that never ran is indistinguishable from QC not yet run `[V]` `mc.ts:250-257` |
| Phase stuck `running` | no reaper, not runnable, not retryable | **Terminal wedge** `[V]` |

---

## Evidence

### E1 — `structure` is arithmetically pinned. **Confidence: high** `[V]`

`structureScore` (`scripts/src/bakeoff/score.ts:13-21`) sums four signals from `extractStructuralSignals` (`lib/mc-core/src/checkers/structural-hash.ts:31`). Measured across the 13 archived generated pages:

| Signal | Points | Grep result |
|---|---|---|
| `rootCss` present | +25 | `:root\s*\{` → **13/13 files, 1 match each** |
| `sectionSequence.length × 5`, cap 25 | 0-25 | `<section` → **0 matches across all 13 files**; `<!-- SECTION` → 1 file only |
| `equipmentTitles.length > 0` | +25 | `class="…equipment…"` → **0 matches across all 13 files** |
| `sacredUrls.length × 3`, cap 25 | +25 | STS hrefs → **19-41 per file** (≥9 unique saturates the cap) |

25 + 0 + 0 + 25 = **exactly 50**. That is the value in every June 2026 archive (`2026-06-23-*.json`, 5-8 rows each, all 50). The brief's premise is correct for those runs.

The current harness produces **55** almost universally (one `<!-- SECTION -->`-style marker × 5 points), with occasional 75 and one historical 100. Across all 38 history files the metric has taken only **four distinct values ever: 50, 55, 75, 100**.

**The decisive proof:** the golden reference itself scores **75**, not 100. `reference/billings-mt.html` has `:root {` (+25), 12 `<!-- SECTION: … -->` markers (+25 capped), 42 STS hrefs (+25 capped), and **no `equipment`-classed element** (0). The page the metric is supposed to reward cannot score full marks on it.

**Root cause:** `extractStructuralSignals` was written as a *drift fingerprint* — its own doc comment says "The actual bible values are NOT committed to this repo … Instead we hash the page's own structure so a later audit can detect DRIFT." `score.ts` repurposes that fingerprint as an absolute quality score with no reference to compare against. Confirmed by the checker output in the same run: `"bible-hash": "No design-bible hash configured; skipped."`

### E2 — `htmlMatch` and `visualMatch` are similarity metrics, and their reference is unstable. **Confidence: high** `[V]`

`htmlMatchScore` (`score.ts:99`) = 0.5 × cosine similarity of **HTML tag-name frequency vectors** + 0.5 × **Jaccard overlap of visible word tokens**, against the reference. `visualMatch` = mean of a **pixelmatch pixel-diff** of two 1280×2400 screenshots and an optional vision-LLM rating whose system prompt asks "how visually similar they are … 100 means visually indistinguishable."

There is no quality term anywhere in either. Both reward *resemblance*.

Observed in the last run: `htmlMatch` = 49, 49, 49, 48, 48, 47 — a **2-point spread across six frontier models**. `visualTokens` = **2 for all six**. `visualLlm` = **null for all six** (the vision half silently did not run). The reference for that run was a live fetch of the Bakersfield production page, because no `bakersfield-ca.html` fixture exists.

### E3 — Composite discrimination is ~5 points; three axes are constant. **Confidence: high** `[V]`

Full score table, run `2026-09-11T21-10-36-549Z`, scenario `no-gmb`:

| model | audit | structure | schema | links | wordCount | htmlMatch | visualMatch | **composite** | cost | s |
|---|---|---|---|---|---|---|---|---|---|---|
| gemini-3.7-flash low | 64 | 55 | 55 | 80 | 71 | 49 | 60 | **61** | $0.602 | 160 |
| gpt-5.6-terra | 64 | **75** | 55 | 80 | **46** | 49 | 58 | **61** | $0.848 | 247 |
| gpt-5.6-luna high | 64 | 55 | 55 | 80 | 68 | 49 | 60 | **61** | $0.126 | 549 |
| gemini-3.7-flash med | 52 | 55 | 55 | 80 | 75 | 48 | 63 | **59** | $0.513 | 145 |
| gpt-5.6-luna medium | 64 | 55 | 55 | 80 | 45 | 48 | 61 | **59** | $0.095 | 269 |
| gemini-3.1-pro medium | 52 | 55 | 55 | 80 | 58 | 47 | 56 | **56** | $1.770 | 528 |

Weight accounting: `schema` (0.15) and `links` (0.10) contributed **zero variance**. `structure` (0.15) varied for one model of six. `audit` (0.25) took only two values, 12 points apart — it is quantized by `100 − 12×errors − 2×warnings`, and every page had either 3 or 4 errors. Maximum variance any axis contributed to the composite: audit 3.0 pts, structure 3.0, wordCount 3.0, visualMatch 0.9, htmlMatch 0.25.

gpt-terra is the clearest illustration: **+20 on structure and −25 on wordCount, landing on the identical composite** as a model 20 points behind it on structure.

### E4 — The last run lost 5 of 11 cells, all to infrastructure, with retries disabled. **Confidence: high** `[V]`

Recorded errors:
- `grok-4.6` — `HTTP 403 … stream open FAILED after 225ms [http=403 connectMs=194 firstByteMs=none rawBytes=0]`
- `grok-4.20-0309-reasoning` — same 403
- `deepseek-v4-pro` — `402 Insufficient Balance`
- `deepseek-v4-flash` — `402 Insufficient Balance`
- `gemini-3.1-pro-preview` (low) — `was told to perform a live web search on this turn but produced NO evidence of calling its web-search tool`

All five report `"failed after 1 attempt(s)"` because `.replit` sets `BAKEOFF_MAX_ATTEMPTS='1'`. The Gemini case is a genuine nondeterministic-provider failure: **the same model at `medium` effort completed the identical prompt sequence and scored 56**; at `low` it declined to call its search tool and the run was thrown away after 60,627 paid output tokens.

Every errored cell also records `"totalMs": 0` — `base.totalMs` is only assigned inside the try block (`run.ts:807`), so a failed run's elapsed time is structurally unrecoverable.

### E5 — Unbounded network calls on three critical paths. **Confidence: high** `[V]`

`lib/mc-core/src/publisher/joomla.ts:87`, `lib/mc-core/src/research/n8n.ts:66`, `lib/mc-core/src/research/perplexity.ts:46`, and `scripts/src/bakeoff/target.ts:212` all call `fetch` with no `AbortSignal` and no timeout. Contrast `lib/mc-core/src/seo/url.ts:267-320`, which does this correctly (timeout + size cap + abort). The pattern exists in the codebase; it just wasn't applied to these four.

The publisher one is the worst: it sits inside `executePhase`, which sits inside the synchronous `POST /approve` handler, which is the request whose DB row was already set to `running`.

### E6 — Phase state machine has no `running` exit. **Confidence: high** `[V]`

`mc.ts:161-169` sets `running`; `mc.ts:480` and `mc.ts:528` gate re-runs on `["ready","review","failed"]`; `run-detail.tsx:810` disables the UI on `running`; there is no scheduler, cron, or startup sweep touching stale runs anywhere in `artifacts/api-server/src`. The only recovery is a manual `UPDATE` or `DELETE /mc/runs/:id`.

### E7 — Prompt-version drift, provable inside this workspace. **Confidence: high** `[V]`

| Artifact | Version it carries | Source |
|---|---|---|
| Page Builder fixture | **v3.12** | `scripts/src/bakeoff/fixtures/master-page-builder.txt:1` |
| Page Builder (MC runtime) | **v3.12** | `lib/mc-core/src/prompts/pageBuilder.ts:2` |
| SEO Audit fixture | **v10.13.3** | `scripts/src/bakeoff/fixtures/master-seo-audit.txt:1` |
| SEO Audit (MC runtime) | **v10.13.3** | `lib/mc-core/src/prompts/seoAudit.ts:2` |
| Schema Generator fixture | **v1.4.3** | `scripts/src/bakeoff/fixtures/master-schema-generator.txt:1` |
| Schema Generator (MC runtime) | **v1.4.3** | `lib/mc-core/src/prompts/schemaGenerator.ts:2` |
| Hub+Spoke (Page Terminal tool) | **v8.5** | `artifacts/page-terminal/public/tools/hub-spoke.html:471` |

Three provable drifts **inside this repo**:
1. `scripts/src/bakeoff/run.ts:141` and `:186` tell every viewer of every run that schema used **"Master Schema Generator (v1.4.1)"**; the file actually inlined is **v1.4.3**. The same stale claim is in `scripts/src/bakeoff/fixtures.ts:17`. This false version string is serialized into `results.json` `notes[]` and every archived history snapshot.
2. The June 2026 archived pages self-report `seo_audit: v10.12.4` in their own HTML comments (`archive/*/pages/*/grok.html:123`) while the current fixture is **v10.13.3** — so the archived leaderboard rows and the current rows were produced against different prompts and are scored on the same axis.
3. `lib/mc-core/src/prompts/editorialReview.ts` applies ~50 literal `replaceAll` patches on top of the raw master prompts before MC uses them. MC's effective prompt is therefore **not** the fixture the bake-off uses, even at matching version headers. `builders.test.ts:148` only asserts three individual directive strings match between the two copies — it is not a parity test.

The Page Terminal tools contain no version header at all `[V]`, so their lineage can't be pinned from this workspace `[X]`.

---

## Reproduction plan

Smallest deterministic tests. All are network-free unless noted.

**R1 — `structure` is pinned (no LLM, no network).**
```
Input:  scripts/src/bakeoff/reference/billings-mt.html
        scripts/src/bakeoff/archive/2026-06-23-full-adherence/pages/no-gmb/*.html
Call:   structureScore(html)          // export it from score.ts for the test
Assert: reference        → 75         // the golden page cannot reach 100
        all 4 archive pages → 50      // identical across four different models
        the only varying term is sectionSequence
```

**R2 — `htmlMatch` penalizes a better page.**
```
Fixture: take reference/billings-mt.html; produce variant A = reference with
         3 paragraphs of correct, city-accurate new copy added;
         variant B = reference with 3 paragraphs of lorem ipsum added.
Assert:  htmlMatchScore(A, ref) < htmlMatchScore(ref, ref)  === 100
         htmlMatchScore(A, ref) ≈ htmlMatchScore(B, ref)
         // token-Jaccard cannot distinguish correct new content from noise
```

**R3 — Reference-source collapse.**
```
Call:   scoreModels(models, floor, ceiling, referenceHtml = "")
Assert: every model's htmlMatch === 0
        composite drops by exactly 0.125 × prior htmlMatch for every model
        nothing in the emitted BakeoffResults records that the reference was empty
```

**R4 — Visual fallback cliff.**
```
Run:    scoreModels(models, …, visualVerdicts = undefined)   // browser unavailable
Assert: visualMatch === visualTokens === 2 for every model (matching the last run)
        composite drops ~7.25 points uniformly, with no error and no flag
```

**R5 — `running` wedge (integration, DB required).**
```
1. Create a run with an engine whose credential is valid.
2. Trigger a phase; kill the process while the provider call is in flight.
3. Restart. SELECT status, phases FROM mc_runs WHERE id = <id>.
Assert: phases[n].status === "running"
        POST /mc/runs/<id>/phases/<phase>/run  → 409
        no path in the API returns the run to a runnable state
```

**R6 — Publisher hang.**
```
Inject fetchImpl = () => new Promise(() => {})   // never settles
Call:   new HttpJoomlaPublisher({endpoint, fetchImpl}).publish(validInput)
Assert: the promise never settles — no timeout fires
        (an existing seam: HttpJoomlaPublisherConfig.fetchImpl is already injectable)
```

**R7 — `editorialReview` silent no-op.**
```
Mutate a single character inside one of the ~50 `from` strings in a copy of the raw prompt.
Assert: the corresponding replaceAll silently matches nothing
        the exported prompt still contains the original garbled text
        builders.test.ts:126 catches only the 5 phrases it enumerates
```

**R8 — Manifest loss.**
```
Truncate artifacts/bake-off/src/data/history/manifest.json to invalid JSON.
Call:   archiveSnapshot(results, {runId: "x", …})
Assert: loadManifest() returns []; the new manifest contains exactly one entry
        all 38 prior history entries are silently unlinked from the viewer
```

**R9 — Prompt version drift (pure string assertion, no network).**
```
Assert: fixtures/master-schema-generator.txt starts with "MASTER SCHEMA GENERATOR v1.4.3"
        run.ts scenario notes contain "v1.4.1"
        → a version-parity test would fail today
```

---

## Minimal remediation plan

In dependency order. No rewrite is warranted — the architecture is sound; the defects are localized.

**Tier 0 — stop losing runs (hours)**

1. **Add `AbortSignal.timeout(ms)` to the four bare `fetch` calls**: `publisher/joomla.ts:87`, `research/n8n.ts:66`, `research/perplexity.ts:46`, `bakeoff/target.ts:212`. `seo/url.ts:267` is the in-repo pattern to copy. *Depends on nothing.*
2. **Restore `BAKEOFF_MAX_ATTEMPTS` to ≥2** in the `.replit` workflow (needs Mark's explicit go-ahead — `.replit` is a protected path). A 403/402 at attempt 1 currently discards a whole cell. *Depends on nothing.*
3. **Move `base.totalMs = outcome.totalMs` assignment so errored cells record elapsed time** (`run.ts:807`) — thread the transcript's summed `ms` into the catch block. *Depends on nothing.*

**Tier 1 — make the score honest (half a day)**

4. **Record `reference.source` and `reference.html.length` in `BakeoffResults`.** One field, set at `run.ts:384`. Until this exists no cross-run score comparison is defensible. *Depends on nothing.*
5. **Record why `visualLlm` was null** — replace `catch { return null }` in `visionRating` (`visual.ts:149`) with a returned `{score, skippedReason}`; persist `skippedReason` on `ModelScores`. *Depends on nothing.*
6. **Add a checked-in reference fixture for every target you actually run** (`reference/bakersfield-ca.html`), or make a missing fixture **fail loud** instead of live-fetching. Live-fetching a CMS-rendered page as the golden reference for a standalone-HTML generator is not a defensible comparison. *Depends on 4.*
7. **Drop `structure` to weight 0 and report it separately, or fix its signals.** As built it contributes a constant 50 to every page and its best signal has a 5-point quantum. If you want it to mean something, the fix is to compare `computeStructuralHash(page)` against a **committed** bible hash — the mechanism already exists (`ctx.designBibleHash`, checker `bible-hash`) and is simply never populated. *Depends on nothing; reweighting requires redistributing 0.15.*
8. **Fix the two constants before reweighting**: add `our-locations?view=map` to `mc_url_registry` (kind `allowlist`) so `links` can vary; and investigate why every frontier model puts `streetAddress`/`postalCode`/`telephone` into a No-GMB schema — that is a prompt defect the scorer is currently flattening into a constant 55. *Depends on nothing. Do this before 7, or you'll reweight around noise.*

**Tier 2 — make MC unstickable (1-2 days)**

9. **Add a `startedAt`-based stale-run sweep.** On server start, and on a timer, flip any `mc_runs` phase in `running` with `startedAt` older than `MC_REQUEST_TIMEOUT_MS × maxAttempts × 2` to `failed` with an explicit `error: "phase did not complete; the server restarted or the phase exceeded its budget"`. This alone converts the terminal wedge into a one-click retry. *Depends on 1 (otherwise a hung fetch outlives the sweep window).*
10. **Make `POST /approve` and `POST …/run` return immediately** (202 + the run row with the phase marked `running`) and execute the phase in the background. The UI already polls at 4s; it does not need the synchronous response, and today a single click can hold an HTTP request for up to ~160 minutes. *Depends on 9 — background execution without a sweep makes the wedge worse.*
11. **Surface `attempts[]` and elapsed time in the run-detail UI.** `PhaseLadderEntry.attempts` is already persisted (`mc-runtime.ts:138`) and already populated (`mc.ts:123-133`); it is simply never rendered. Free observability. *Depends on nothing.*
12. **Distinguish "publish attempted, nothing written" from "publish pending."** When `published === false` from the stub, set a distinct phase status or a `publishBlockedReason` so the dashboard cannot show a run as `approved` when nothing went live. *Depends on nothing.*

**Tier 3 — durability (half a day)**

13. **Make `manifest.json` writes atomic** — reuse `writeJsonAtomic` from `resume.ts:175`, and make `loadManifest` distinguish "missing" from "corrupt" (refuse to overwrite on corrupt). *Depends on nothing.*
14. **Add a prompt-version parity test** asserting the header line of each `fixtures/master-*.txt` equals the header line inside the corresponding `lib/mc-core/src/prompts/*.ts`, and that no source file claims a version string that doesn't match. Would catch the v1.4.1/v1.4.3 drift today. *Depends on nothing.*
15. **Make `editorialReview.ts` fail loud on a no-op replacement** — assert each `from` string was actually found, or convert the whole layer into a committed post-edit prompt file. Today a prompt bump silently ships garbled compliance text. *Depends on 14.*

**Explicitly not recommended:** rewriting the orchestrator. `runPhase` is already a pure `(phase, ctx, priorState) → newState` function with persistence cleanly separated in `executePhase`. That is the right shape; the gaps are around it, not in it.

---

## Missing observability

What would make the next failure explainable, roughly in order of value:

1. **A run/correlation ID threaded through everything.** There is none. The bake-off has no run identifier until `archiveSnapshot` mints one from a timestamp at the very end (`run.ts:668`) — so console output, transcript files, and the archived snapshot cannot be joined. MC has `run.id` but it never reaches the provider call.
2. **Elapsed time on failed runs.** Currently structurally 0 (E4). A failure with no duration cannot be classified as a timeout vs. an immediate rejection.
3. **Reference provenance on every scored run** — which of `fixture | live-fetch | none`, what URL, what byte length, what fetch timestamp. Without it, `htmlMatch`/`visualMatch` across runs are not comparable and nobody can tell.
4. **A record of degraded scoring modes.** Three silent degradations exist: no vision-LLM, no browser, empty reference. Each changes what the composite means by 7-13 points and none is recorded.
5. **Per-turn cost and elapsed time on the *failed* turn.** The transcript captures `error` per turn, which is good; it does not capture how much of the 60k tokens was spent before the failure at a turn level.
6. **MC phase heartbeats.** `startedAt` exists; nothing updates it while a phase runs. A `lastHeartbeatAt` column would let a sweep distinguish "genuinely working" from "the process is gone."
7. **`attempts[]` rendered in the UI.** Persisted, populated, invisible. A VA currently sees `running` and has no idea a main→backup fallback fired twice.
8. **QC outcome persistence on failure.** `void runQcForRun(...).catch(log)` writes a row only on success. A run where QC crashed looks identical to one where QC hasn't started.
9. **Metrics worth counting:** phase completion rate by phase; time-in-`running` distribution; provider error class (4xx auth / 402 balance / timeout / gate-refusal) by model; bake-off cells lost per run and at which turn.
10. **A prompt-version stamp in every artifact.** The archived pages that self-report `seo_audit: v10.12.4` are the only reason the June/September drift was provable. That should be systematic, not accidental.

---

## Attached-brief answers

**1. Why `structure` is exactly 50; which signals fire.** `[V]` — Answered in full at **E1**. Firing: `rootCss` (+25, every page) and `sacredUrls` (+25, saturated on every page, 19-41 links where 9 suffice). Never firing in the archived runs: `sectionSequence` (0 `<section>` tags in 13/13 pages) and `equipmentTitles` (0 matches in 13/13). 25+25 = 50, invariant. Note one correction to the premise: 50 is the *June 2026* value; the current harness produces **55** (one section marker) with an occasional 75/100. Across all 38 recorded runs the metric has taken four values total.

**Verdict on the 0.15 weight: currently dead weight, not merely inconclusive.** Half of it (the rootCss + sacredUrls 50) is a constant added to every model. The remaining half is dominated by a single signal with a 5-point quantum. And the metric is unfixable as designed, because `extractStructuralSignals` was built as a *drift fingerprint* to be compared against a stored hash — the bible values are explicitly not in the repo (`structural-hash.ts:12-16`), and the checker that would use them reports `"No design-bible hash configured; skipped"` in every run. The clincher: **the golden reference page scores 75, not 100.**

**2. What `htmlMatch` and `visualMatch` reward.** `[V]` — Answered at **E2**. They are **similarity metrics, unambiguously**. `htmlMatch` = tag-frequency cosine + visible-word Jaccard against one reference. `visualMatch` = pixel-diff of two screenshots plus a vision-LLM explicitly asked "how visually similar." Neither contains a quality term.

**Yes, a better-but-different page is penalized, and the penalty is symmetric with a worse-but-different page** — `textTokens` is a *set*, so adding accurate new copy and adding lorem ipsum move the Jaccard score identically (test R2). Three aggravating factors here: the reference for the live workflow is a **live-fetched CMS page**, not a fixture; the screenshot compares only the **top 1280×2400 px**; and the vision half **did not run at all** in the last run (`visualLlm: null` × 6), so `visualMatch` was pure pixel-diff without that being recorded anywhere.

**3. Can the spread discriminate between models?** `[V]` for the local numbers, `[R]` for the Opus 4.8 / GPT-5.5-PRO / Grok 4.3 figures in the brief, which do not appear in any file here.

From what this workspace proves: **no, not at present, and the reason is mechanical rather than statistical.** The observed spread is 5 composite points across 18.6× cost (E3), with `schema` and `links` — 0.25 of the weight — literally constant, and `structure` constant for 5 of 6. But I want to be careful not to overstate: n=6 from a single run is not evidence that frontier models are equivalent at this task. It is evidence that **this rubric cannot detect a difference if one exists**. Those are different claims. The rubric's three constants are traceable to a registry gap and a prompt defect (E3), not to model parity — which is itself the more interesting finding, and the scorer currently erases it.

Two further comparability problems specific to your numbers: cost is `costFromUsage` when providers report usage and a character-based estimate otherwise, and the two are mixed in the same table; and every cell shares **one grounding brief** that is reused verbatim from the prior `results.json`, so research quality is held constant by construction and contributes nothing to the spread.

**4. `mc_runs` completion/stall distribution by phase.** **I could not query the database.** `[X]`

Stated precisely: this session runs as the `.replit` "Claude Code Factory Audit" workflow, launched with `--permission-mode dontAsk --allowed-tools Read Glob Grep "Bash(git status)"`. Every attempt to run a command beyond that allowlist — a `psql`/`node` query, a `printenv` presence check, `pnpm test` — was refused by the harness. I also did not attempt to read env values, since printing a `DATABASE_URL` would violate the no-secret-output rule regardless.

What I can say from files: `.replit` declares a `postgresql-16` module, so a database is provisioned in this workspace `[V]`. The schema exists at `lib/db/src/schema`. The number you most want is unavailable to me, and I'd rather say that than model it.

Two structural facts that will shape whatever that query returns, both verified here:
- If `JOOMLA_PUBLISH_URL` is unset in the environment that ran those runs, **no run can be `published`** — the stub returns `published: false`, so `publishConfirmed` is never true (`mc.ts:191`). Expect a pile at `publish/review`.
- Runs whose process died mid-phase are stuck at `status: "running"` with no recovery path (E6). Expect a second pile there, and note it will be spread across phases, not concentrated.

Suggested query when someone with DB access runs it:
```sql
SELECT p->>'phase' AS phase, p->>'status' AS status, count(*)
FROM mc_runs r, jsonb_array_elements(r.phases) p
GROUP BY 1, 2 ORDER BY 1, 2;

SELECT status, count(*), min(created_at), max(updated_at) FROM mc_runs GROUP BY 1;
```

**5. Can MC accept an external brief and start at build?** **No — research is mandatory and coupled to the URL.** `[V]`

Four independent locks, all verified:
- `POST /mc/runs` (`mc.ts:293`) requires `url` and returns 400 without it.
- `deriveRunInputs` (`mc-runtime.ts:515`) hard-fails on an unparseable URL, a private host, a URL with no city+state slug, and a missing `SERPAPI_API_KEY`. There is no bypass.
- `initialPhases()` (`mc-runtime.ts:592`) sets `research: "ready"` and **every other phase `"locked"`**. The gate at `mc.ts:480` refuses any phase not in `ready | review | failed`, so `build` cannot run first.
- Even the Replit escape hatch doesn't help: `POST …/phases/research/replit` accepts no brief in the body — the handler comment at `mc.ts:538` states research "reuses the shared research provider (parity with Dashboard)."

There is no `researchBrief` input on any route. The closest seam is `PipelineDeps.research` (`orchestrator.ts:74`), an in-process function override documented "e.g. for tests" and never wired to HTTP.

**Smallest change that would unlock it:** accept an optional `researchBrief` on `POST /mc/runs`; when present, insert it onto the row, mark `research` as `approved` with a provenance of `operator-input`, and mark `build` as `ready`. The orchestrator needs no change — `runPhase("build")` already reads `state.researchBrief` from the prior state (`orchestrator.ts:125`).

**6. Can a failed schema phase be rerun alone, reusing paid research and build?** **Yes — this part works.** `[V]`

`executePhase` reconstructs `PhaseState` from the `mc_runs` row on every call (`mc.ts:175-182`), and the failure path preserves the row's `pageHtml`, `researchBrief`, and `generatedSchema` — it only patches `phases[schema] = failed`. A `failed` phase is explicitly runnable (`mc.ts:480`), so `POST /mc/runs/:id/phases/schema/run` re-executes **only** the schema phase against the already-paid research and build. The orchestrator's schema guard throws before assigning `state.schema` (`orchestrator.ts:169-174`), so a bad JSON-LD response cannot corrupt the stored schema either.

Two caveats:
- This only holds if the phase reached `failed`. If the process died mid-phase it is stuck at `running` and **nothing** can be rerun (E6). That's the real rerun-cost risk, not the schema logic.
- The bake-off harness has the **opposite** property: resume granularity is one whole model cell. A failure at turn 5 of 7 discards turns 1-4 (E4: 60,627 output tokens lost). If you standardize on the bake-off shape, you inherit that.

**7. MC orchestrator vs. the reported lean-runner and production-factory shapes.** Code evidence, `[V]` for MC, `[R]` for the two comparison systems.

| Property | MC (verified here) | Lean runner `[R]` | Production factory `[R]` |
|---|---|---|---|
| Stage boundary | `runPhase(phase, ctx, priorState) → PhaseOutput` — a **pure function**, no I/O, no concrete engine import (`orchestrator.ts:85`) | stage in, file out | monolith |
| State handoff | JSONB columns on one `mc_runs` row | a file per stage | Postgres manifest |
| Resumable | **Yes**, per phase, from the DB row (see Q6) | yes | resume exists, never reached review-ready |
| Retry cost | one phase | one stage | full run |
| Failure isolation | per phase; `executePhase` never throws | per stage | all-or-nothing |
| Schema generation | **LLM call** (`engine.generateSchema`) with a fail-loud parse gate | **deterministic code** with exact-count contracts that halt | LLM |
| Halting contracts | `blockingErrorCount` before publish; invalid JSON-LD halts; null verify verdict halts | 11 gates | 13 gates |
| Output | HTML + JSON-LD to a publish seam | HTML | typed React data file, no HTML |

**MC's shape is much closer to the lean runner than to the production factory**, and the evidence is `orchestrator.ts` itself: it takes prior state and returns new state, it imports no concrete engine (only the `AIEngine`, `JoomlaPublisher`, and `ResearchProvider` interfaces), and `executePhase` owns all persistence. That is the stage-in/state-out property, implemented with a DB row instead of a file.

Two places MC is **not** lean-runner-shaped, both worth naming plainly:
- **Schema is an LLM call, not deterministic code.** The brief reports the lean runner's deterministic generator with hard exact-count contracts as a decisive advantage `[R]`. MC has the fail-loud guard but not the determinism — and the local evidence supports the concern: `schema-rules` fails on **100% of bake-off pages** for putting a street address on a No-GMB page (E3). That is exactly the class of error a deterministic generator makes impossible.
- **`POST /approve` runs the next phase synchronously**, so the *operational* experience is monolithic even though the *code* is staged. One click can hold a request for up to ~160 minutes.

**8. Prompt versions carried here and provable drift.** `[V]` — full table and three proven drifts at **E7**. Summary: this workspace carries **Page Builder v3.12, SEO Audit v10.13.3, Schema Generator v1.4.3, Hub+Spoke v8.5** — every one *newer* than the versions named in the brief (v3.7 / v10.12.4 / v1.4.1 / v8.2) `[R]`. The bake-off fixtures and the MC runtime prompts share version headers, but MC applies ~50 literal string patches on top (`editorialReview.ts`), so they are **not** the same text at runtime. Three drifts are provable locally: the v1.4.1 claim in `run.ts` and `fixtures.ts` versus the v1.4.3 file; the archived June pages self-reporting `seo_audit: v10.12.4` against today's v10.13.3; and the `editorialReview` patch layer itself. The Page Terminal tools carry no version header, so their lineage cannot be pinned from here `[X]`. And I cannot see the framework repo's `lib/prompts/prompts/` at all `[X]`.

One live drift vector worth flagging: `.replit` sets `GITHUB_SOURCE_REPO = "xkluziv12/master-prompts"`, and `gitSync.ts` polls it on a timer — so the prompt library can change under a running server between two runs of the same pipeline, with no version recorded in either run's output.

**On the brief's Part 3 questions, briefly, since they were asked directly:**

- *Is the rubric trustworthy?* **No. It needs rebuilding before it decides anything.** You asked to hear it plainly, so: 40% of the weight was constant in the last run, 0.25 of it measures resemblance to a live-fetched production page that isn't recorded, and 0.15 of it is a drift fingerprint used as an absolute score against nothing. Remediation items 4-8 are the repair; they are a day's work, not a rewrite.
- *The one change with the most leverage.* Not on the bake-off. **Fix the `running` wedge and the four unbounded fetches** (Tier 0 + item 9). Those are the things that turn a recoverable failure into a dead run, and they're a few hours of work. The scoring fixes matter for making a decision; these matter for the factory producing anything at all.
- *Is a bake-off the right tool?* On the local evidence, **model choice is not where this system is losing.** Of 11 cells in the last run, 5 died — two to a 403, two to an unpaid balance, one to a search tool a model declined to call — and **zero** to a model writing a bad page. The three surviving score constants trace to a registry gap and a prompt defect. The brief reports the same pattern in the other repos `[R]`. I'd read that as converging evidence that the bottleneck is wrapper code, credentials, and harness contracts, and I'd fix those before running another comparison. That said, the Gemini low-vs-medium result is a genuine, reproducible *effort*-tier difference worth keeping — an effort/cost sweep on one model is a much cheaper and sharper instrument than a five-model leaderboard.

---

## Questions requiring information outside this repository

1. **The `mc_runs` distribution.** Can someone with DB access run the two queries in answer 4? Completion rate and stall-by-phase is the number that decides whether MC is a candidate at all, and I could not obtain it.
2. **Is `JOOMLA_PUBLISH_URL` set in the environment that has been running MC?** If not, no run has ever been able to reach `published`, and every "stall at publish" is explained by configuration rather than by the pipeline.
3. **Have any MC runs been manually unstuck from `running`** by a direct `UPDATE` or `DELETE`? If so, the DB distribution understates the wedge rate.
4. **The xAI 403 and DeepSeek 402** — is `XAI_API_KEY` valid and entitled to `grok-4.6` / `grok-4.20-0309-reasoning`, and is the DeepSeek account funded? Both are account state I cannot see, and together they cost 4 of 11 cells.
5. **Is `ANTHROPIC_API_KEY` present in the bake-off workflow's environment?** `visualLlm` was null for all six models; `visionRating` returns null silently on both a missing key and an API error, so I cannot tell which happened.
6. **Production logs for a stalled MC run** — specifically whether the process was restarted (autoscale recycle, redeploy) during the phase, or whether the phase was genuinely still awaiting a provider. Both leave the identical DB state.
7. **Was `BAKEOFF_MAX_ATTEMPTS='1'` deliberate?** It disables the bounded retry in the live workflow and is the direct reason 4 of 5 failed cells got exactly one shot.
8. **Live reference page stability** — has `https://www.stselectronicrecyclinginc.com/bakersfield-ca` changed between the runs being compared? Since the reference is live-fetched and its source is never recorded, `htmlMatch`/`visualMatch` may not be comparable across the September runs at all.
9. **The framework repo's `lib/prompts/prompts/`** — I cannot see it, so the claimed three-way drift is only verifiable for the two copies that live here.
10. **The Master Design Bible values.** `structural-hash.ts` says the bible is an uncontrolled `.docx` a VA uploads. Without a committed bible hash, `ctx.designBibleHash` is always null and the entire drift-detection mechanism is inert — is there a canonical version that could be committed?
