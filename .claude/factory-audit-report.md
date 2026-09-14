# Factory Reliability Audit

Scope note: this session ran under the `Claude Code Factory Audit` workflow (`.replit:60-62`), which grants only `Read`, `Glob`, `Grep`, and `Bash(git status)`. Several read-only shell probes I attempted (`node -e`, `psql`, `env`, piped `grep | wc`) were denied by that allowlist. Everything below is evidence from files I could read plus `jq` reads of the committed result JSON that were permitted. No project files were modified.

---

## Executive diagnosis

**1. The Mission Control phase state machine has no way out of `running`, and the deployment target guarantees it will be entered and abandoned.**
`executePhase` (`artifacts/api-server/src/routes/mc.ts:161-169`) sets the phase to `"running"` and the run to `"running"`, then does the LLM work inline inside the HTTP request. The only transitions out of `"running"` are the success path (`:192-198`) and the catch path (`:268-272`) of that *same in-process await*. There is no heartbeat, no lease, no startup sweep, no timeout reaper: `grep '"running"'` across `artifacts/api-server/src` returns five writes and zero readers that reset it. If the process dies mid-phase, the row is permanently wedged, because both escape hatches reject it: `/phases/:phase/run` requires `["ready","review","failed"].includes(entry.status)` (`:480`) and `/phases/:phase/approve` requires `entry.status === "review"` (`:626`). Both return 409 forever. `.replit:5` sets `deploymentTarget = "autoscale"`, so the process is explicitly not long-lived, while a Claude build turn legitimately takes minutes. This is the highest-probability cause of "intermittently succeeds and fails" on the Mission Control side.

**2. The bake-off harness is configured to disable both of its resilience mechanisms.**
`.replit:40` sets `BAKEOFF_MAX_ATTEMPTS='1'` (the code default is 2, `providers.ts:130`) **and** `BAKEOFF_FORCE='<every one of the 11 model ids>'`. The first turns every transient provider hiccup into a recorded terminal error; the second discards all prior results so every run re-pays for every model from scratch (`resume.ts:124` drops forced ids from `prior.done`). The most recent archived run bears this out exactly: 7 of 11 cells errored, every message ends `failed after 1 attempt(s)`, and two of the seven failures (`402 Insufficient Balance`, `403 ... used all available credits`) are provider-billing states that a retry would not have fixed but that a resume would have made survivable.

**3. Three of the seven scoring axes are constant by construction, so the composite cannot discriminate.**
`structure` is exactly 50 for all five models in the June run and exactly 55 for all four surviving models in the September run. `schema` is 100 for all five in June and 55 for all four in September; `links` is 100 for four of five in June and 80 for all four in September; `audit` is 64 for all four in September. That is 0.40-0.65 of the composite weight frozen per run. The remaining movement comes mostly from `htmlMatch` + `visualMatch`, which measure similarity to one published reference page, not quality. The rubric is measuring the harness.

---

## System map

Verified from `SYSTEM-MAP.md`, `pnpm-workspace.yaml`, `.replit`, and the source.

**Two independent "factories" live here, not one.**

### A. Bake-off harness (`scripts/src/bakeoff/`) — the thing that actually runs on a schedule

```
.replit "Bake-Off Run" workflow (11 model variants, env-injected)
  └─ run.ts main()
       resolveTarget()                     target.ts    (env: BAKEOFF_TARGET_URL/CITY/STATE/...)
       resolveGmbProfile()                 gmb.ts       (dropped when no BAKEOFF_GMB_JSON)
       loadDesignFixtures()                fixtures.ts  (4 files, fail-loud if missing/empty)
       loadPrior(results.json, TARGET)     resume.ts    (target-keyed resume; gutted by BAKEOFF_FORCE)
       loadOrAuthorGrounding()             grounding.ts (ONE shared brief, model-authored)
       resolveVariants()                   variants.ts  (fail-loud on unsupported effort)
       ── per scenario, models run CONCURRENTLY (Promise.allSettled) ──
          runOneModel() ─ runConversation()  conversation.ts
              intro → build → design-gate/rebuild(≤cap) → seo
                    → seo-verify(+web search, gated on ✅) → schema → verify-links(gated on ✅)
              each turn: providers.ts guarded() → withTimeout(WALL_CLOCK) → SDK
          parseSchema + runCheckers   (from @workspace/mc-core)
          costFromUsage | estimateCost                    cost.ts
          persist() → scoreModels() → writeJsonAtomic(results.json)
          transcript → public/transcripts/<scenario>/<id>.json   ← FIXED PATH, overwritten
       judgeVisual()                        visual.ts    (Playwright render + pixelmatch + vision LLM)
       archiveSnapshot()                    history.ts   (namespaces screenshots, NOT transcripts)
  └─ (in parallel, same workflow) judge-panel.ts reads the SAME results.json
```

Presentation layer: `artifacts/bake-off` (static Vite/React). `datasets.ts` eagerly bundles `./history/*.json` and cross-references `manifest.json`.

### B. Mission Control (`lib/mc-core` + `artifacts/api-server` + `artifacts/mission-control`) — the thing with the VA UI

```
POST /api/mc/runs {vaName, url, engine}          mc.ts:289
  └─ deriveRunInputs(url)                        mc-runtime.ts  (SerpAPI/DataForSEO; 400 on failure)
  └─ INSERT mc_runs {status: running|queued, currentPhase: research,
                     phases: initialPhases()}     mc-runtime.ts:592  research=ready, rest=LOCKED
  └─ engine==="claude" → await executePhase(row, "research")   ← inline, in-request

executePhase(run, phase, engineOverride?)        mc.ts:~110-280
  gate  → phases[phase].status ∈ {ready, review, failed}
  write → status "running"                       :161-169
  work  → runPhase(phase, ctx, priorStateFromRow, {engine, publisher, researchProvider})
                                                  lib/mc-core/src/pipeline/orchestrator.ts:85
  write → status "review" | "approved"(publish confirmed) | "failed"
          + mc_page_versions row when html changed
  publish confirmed → recordPublishToWorkLog() + runQcForRun()  (both fire-and-forget)

POST /phases/:phase/approve  → marks approved, unlocks next, and for non-replit
                                AWAITS executePhase(next) in the same request  :658-661
Frontend: run-detail.tsx refetchInterval 4000ms; dashboard.tsx 5000ms
```

`runPhase` phases: `research` (provider seam + `runEntityQualityGate`), `build` (engine + checkers), `audit` (engine + checkers), `schema` (engine + `parseSchema`, throws on invalid JSON-LD, `deriveJoomlaMeta`), `publish` (`blockingErrorCount` gate + `publisher.publish`, `published:false` from the stub keeps the run in review).

---

## Failure boundaries

### Bake-off

| # | Boundary | Code | How the error is represented |
|---|---|---|---|
| B1 | Fixture load | `fixtures.ts:60-63` | Throws before any API call. Aborts the whole run. Loud, correct. |
| B2 | Variant resolution | `run.ts:445` | Throws on unknown slot / unsupported effort / duplicate id. Aborts whole run. |
| B3 | Prior-results target mismatch | `resume.ts:94-101` | Logged as `rejectedReason`, backed up, then everything is re-run. Visible. |
| B4 | Grounding authoring | `run.ts:390` | Throws → whole run dies. Single point of failure for all 11 cells. |
| B5 | Credential missing | `providers.ts:134-140` inside `spec.makeComplete()` inside the cell try/catch (`run.ts:784`) | Becomes THAT cell's error. Correctly isolated. |
| B6 | Provider transport | `guarded()` `providers.ts:208-252` | Retried `MAX_ATTEMPTS` times, then a labelled throw. **Config sets this to 1.** |
| B7 | Wall clock | `withTimeout` `providers.ts:149-167` | Aborts the signal and rejects. Grok/OpenAI poll loops honour it. Well built. |
| B8 | Live-fetch gate | `enforceLiveFetch` `providers.ts:279-294` | Throws when a `webSearch:true` turn shows no tool-call evidence. **Nondeterministic across identical models.** |
| B9 | Intro refusal gate | `assertNotRefusal` `conversation.ts:199-219` | `REFUSAL_RE` includes `(will not\|won't) (proceed\|build\|continue\|create)`. A model that writes "I won't create fake data" fails the run. |
| B10 | HTML extraction | `extractHtmlDocument` `conversation.ts:334,346,358` | Throws. Kills the cell after paid turns. |
| B11 | Design gate | `conversation.ts:349-353` | Throws after `cap` (default 2) rebuilds. Paid turns discarded. |
| B12 | Verdict gates | `conversation.ts:402-407` | Requires literal `SEO VERIFICATION PASSED` / `LINKS VERIFIED` text after `cap` corrective turns, else throws. |
| B13 | Schema extraction | `conversation.ts:433` | Throws. Everything before it is discarded. |
| B14 | Cell-level catch | `run.ts:872-881` | Converts all of B8-B13 to `status:"error"` + partial usage + partial cost. Sibling cells survive. Good. |
| B15 | Scoring | `run.ts:509-523` | **Swallowed.** Logged, results persisted unscored. |
| B16 | Persist chain | `run.ts:559-564, 595-603` | `.then(persist, persist)` plus `.catch(()=>undefined)`. **Swallowed** by design so one bad write can't poison the chain. |
| B17 | Visual judge | `run.ts:638-655` | **Swallowed.** Silently falls back to `visualTokens`, and `ModelScores.visualMatch` then means something different from other runs. |
| B18 | Transcript write | `run.ts:910-914` | **Swallowed.** |
| B19 | History archive | `run.ts:685-687` | **Swallowed.** A run that cost real money can vanish from the leaderboard with one log line. |
| B20 | `copyIntoHistory` | `history.ts:63-65` | **Swallowed**, returns `null`. Screenshot renders as "unavailable". |
| B21 | Manifest read-modify-write | `history.ts:102-108` | Not atomic, not locked. Concurrent archives lose entries. |
| B22 | Viewer manifest join | `datasets.ts:38-39` | `if (!mod) return null` — a manifest entry whose file is missing **silently disappears from the UI**. |

### Mission Control

| # | Boundary | Code | How the error is represented |
|---|---|---|---|
| M1 | Input validation | `mc.ts:293-296` | 400 on missing `vaName`/`url`. Fine. |
| M2 | `deriveRunInputs` (SerpAPI/DataForSEO) | `mc.ts:309-317` | 400, no run created. Loud. External-API dependent. |
| M3 | Engine resolution | `mc.ts:143-155` | Phase `failed`, run `failed`. Recoverable. |
| M4 | **Phase in flight** | `mc.ts:161-169` | **Unrecoverable if the process dies. See root cause 1.** |
| M5 | Research provider absent | `orchestrator.ts:99-103` | Throws → phase `failed`. Recoverable. |
| M6 | Build/audit engine | `orchestrator.ts:126,144` | Throws → phase `failed`. Recoverable. |
| M7 | Schema parse | `orchestrator.ts:169-173` | Throws deliberately rather than substituting a placeholder. Phase `failed`, prior `researchBrief`/`pageHtml` untouched. Correct and rerunnable. |
| M8 | Publish gate | `orchestrator.ts:209-213` | Throws with the blocking-error count. |
| M9 | Publish stub | `orchestrator.ts:252`, `mc.ts:191` | `published:false` → run stays `review`. Never a false "published". Correct. |
| M10 | Blog log after publish | `orchestrator.ts:243-246` | Caught, appended to the summary as a WARNING. Not rolled back. Correct. |
| M11 | Post-publish work-log + QC | `mc.ts:250-258` | `void ... .catch(log)`. Fire-and-forget. Failure is log-only, invisible to the VA. |
| M12 | Approve auto-advance | `mc.ts:658-661` | The approve request awaits the *next* phase's full LLM work. Same M4 exposure, plus the VA's click blocks for minutes. |
| M13 | Frontend | `run-detail.tsx:403` | 4s poll of `GET /runs/:id`. It renders whatever the row says. A row wedged at `running` renders as a spinner forever, with no client-side staleness threshold. |

---

## Evidence

### E1. Mission Control phases can wedge at `running` with no recovery path
**Confidence: high (code-verified); frequency in production: cannot verify.**

- `artifacts/api-server/src/routes/mc.ts:161-169` writes `status: "running"` before the await.
- `mc.ts:480` and `mc.ts:626` both exclude `"running"` from their allowed states.
- `grep -n '"running"' artifacts/api-server/src` returns only `mc.ts:162,168,321,343,643` and the type union at `mc-runtime.ts:109`. No reaper, no `startedAt` age check, no sweep in `src/index.ts` schedulers (work-log, git sync, GitHub mirror only).
- `.replit:5` `deploymentTarget = "autoscale"`.
- `mc.ts:658-661`: approve awaits the next phase inline, doubling the exposure window.

### E2. Bake-off retries and resume are both disabled by the workflow
**Confidence: high (verified end to end).**

- Code defaults: `providers.ts:130` `MAX_ATTEMPTS = max(1, BAKEOFF_MAX_ATTEMPTS ?? 2)`.
- `.replit:40` sets `BAKEOFF_MAX_ATTEMPTS='1'` and `BAKEOFF_FORCE='grok-4-6,grok-4-20-reasoning,gemini-3-1-pro-low,gemini-3-1-pro-medium,gemini-3-7-flash-low,gemini-3-7-flash-medium,gpt-luna-medium,gpt-luna-high,gpt-terra,deepseek-v4-flash,deepseek-v4-pro'` — the complete matrix.
- `resume.ts:124` `if (isForcedId(force, model)) continue;` drops every forced id from `prior.done`.
- Observed in `artifacts/bake-off/src/data/history/2026-09-14T02-17-42-132Z.json`:

| model | status | error class |
|---|---|---|
| gemini-3-7-flash-low / -medium | ok | |
| gpt-luna-high | ok | |
| gpt-terra | ok | |
| grok-4-6, grok-4-20-reasoning | error | `HTTP 403 ... used all available credits or reached its monthly spending limit` |
| deepseek-v4-pro, deepseek-v4-flash | error | `402 Insufficient Balance` |
| gpt-luna-medium | error | live-web-search evidence gate, `costEstimate.totalUsd = 0.0681` **spent then discarded** |
| gemini-3-1-pro-low | error | same gate, `0.8042` spent then discarded |
| gemini-3-1-pro-medium | error | same gate, `0.9708` spent then discarded |

Every message ends `failed after 1 attempt(s)`. Roughly $1.84 of measured spend produced nothing on those three cells alone, and because `BAKEOFF_FORCE` names them, tomorrow's run will pay it again.

### E3. `enforceLiveFetch` is a nondeterministic gate applied to a nondeterministic behaviour
**Confidence: high.**

`providers.ts:279-294` throws when a turn requested web search and the provider returned no tool-call evidence. `conversation.ts:415-423` flags exactly one turn (`seo-verify`) plus its corrective retries. In the 2026-09-14 run this gate killed `gpt-luna-medium` while `gpt-luna-high` (same model tag `gpt-5.6-luna`, different effort) passed, and killed both `gemini-3-1-pro` variants while both `gemini-3-7-flash` variants passed. Whether a model elects to call its search tool is not deterministic, so a pass/fail on this gate is partly a coin flip. With `MAX_ATTEMPTS=1` there is not even one re-roll.

The design intent (`providers.ts:262-278`) is defensible: do not accept training recall as live research. The problem is the interaction with retries=1, and the fact that the failure destroys six preceding paid turns.

### E4. `structure` is a harness constant, not a model signal
**Confidence: high (arithmetically proven plus direct measurement).**

`score.ts:13-21`:
```
rootCss present            → +25
min(25, sections × 5)      → sections
equipmentTitles.length > 0 → +25
min(25, sacredUrls × 3)    → links
```
Signals come from `extractStructuralSignals` (`lib/mc-core/src/checkers/structural-hash.ts:31-41`).

Measured on the June `opus-tier-5model` pages (`scripts/src/bakeoff/archive/.../pages/no-gmb/*.html`, all five files):

| signal | grep | result |
|---|---|---|
| `:root\s*\{` | 5 files, 1 hit each | **fires, +25** |
| `<section` (any) | **0 matches in any file** | dead, +0 |
| `<!--\s*SECTION` | **0 matches in any file** | dead, +0 |
| `class="…equipment…"` | **0 matches in any file** | dead, +0 (the word "equipment" appears 55 times, never in a class attribute) |
| sacred hrefs | 23-43 lines per file | saturates, **+25** |

25 + 0 + 0 + 25 = **50**, exactly the recorded value for all five models.

The September pages score 55. Measured from the HTML embedded in `2026-09-14T02-17-42-132Z.json`: every one of the four surviving models has `SECTIONTAG=1, SECTIONCOMMENT=0, EQUIPCLASS=0, ROOTCSS=1, SACRED=14..34`. So 25 + 5 + 0 + 25 = 55. And the single `<section>` is byte-identical across all four models:

```
<section class="sts-hq-callout" style="padding:64px 20px;background:transparent;font-family:inherit">
```

`sts-hq-callout` is defined in `scripts/src/bakeoff/fixtures/master-page-builder.txt`. The +5 is mandated boilerplate copied out of the prompt, not model behaviour.

Decisive supporting fact: **the golden reference page cannot score 100 either.** `scripts/src/bakeoff/reference/billings-mt.html` has `:root{` (1), twelve `<!-- SECTION: … -->` markers, 42 sacred hrefs, and **zero** `class="…equipment…"`. Reference ceiling = 25 + 25 + 0 + 25 = 75. The `equipmentTitles` signal is unreachable by the ground truth itself.

**Verdict on the 0.15 weight: dead weight.** It contributes a constant to every model in a run, so it cannot change any ranking, and it inflates every composite by roughly 7.5-8.25 points. It is not "inconclusive" — the constancy is structural, not a sampling artifact.

The two dead signals are dead for different, fixable reasons:
- `sectionSequence` requires `<section class="…">` or `<!-- SECTION … -->`. The reference uses the comment form; the prompt does not require models to emit either. The regex at `structural-hash.ts:54` also excludes `-` inside comment bodies (`[^>-]*?`), so hyphenated section names would silently not match.
- `equipmentTitles` requires the literal substring `equipment` inside a `class` attribute (`structural-hash.ts:64`). Nothing in the prompt or the reference produces that class name. It has almost certainly never fired.

### E5. `htmlMatch` and `visualMatch` are similarity metrics, in both halves
**Confidence: high.**

`htmlMatchScore` (`score.ts:99-103`) = 0.5 × cosine of HTML tag-name frequency vectors + 0.5 × Jaccard of visible-word token sets, both against `referenceHtml`.

`visualMatch` (`score.ts:185`) = `verdict.combined`, which is `mean(pixel, llm)` (`visual.ts:164-166`), where `pixel` is `pixelmatch` similarity against the rendered reference (`visual.ts:100`) and `llm` is a vision model rating closeness to the reference (`visual.ts:226`). When the browser pass fails, it silently degrades to `visualTokensScore`, a Jaccard over colours/CSS vars/fonts/**class names** against the reference (`score.ts:106-126`).

**Both are reference-similarity, not quality.** Nothing in either function can reward correctness, readability, accessibility, conversion structure, or SEO strength. Concretely:

- Word-token Jaccard punishes a model for using better wording. Rewriting a paragraph with different vocabulary lowers the score even if the copy is superior.
- Class-name Jaccard (the fallback) rewards copying the reference's CSS class vocabulary. A model that writes a cleaner design system scores worse.
- Tag-frequency cosine rewards matching the reference's *counts* of `<div>`, `<p>`, `<li>`. A model that uses semantic `<section>`/`<article>` where the reference used `<div>` is penalised twice: once here and, ironically, nowhere on `structure`, because the reference uses comment markers rather than `<section>` tags.

**Yes, a better-but-different page is penalised**, on 0.25 of the composite. The `WEIGHTS` doc comment (`score.ts:128-139`) claims the 0.25 cap prevents copying from outweighing genuine quality. That is only true if the remaining 0.75 actually varies. It does not: `structure` (0.15) is constant, and in both examined runs `schema` (0.15) and `links` (0.10) are constant or near-constant too. Removing the constants, `htmlMatch + visualMatch` are 0.25 out of an effective ~0.35-0.60 of moving weight, so similarity is the **dominant** live signal, not a capped one.

### E6. The score/cost spread does not discriminate
**Confidence: high for the claim "the local evidence cannot separate these models"; the causal claim "the models are equivalent" is not something this data can support either way.**

June `opus-tier-5model` (`artifacts/bake-off/src/data/history/2026-06-23-opus-tier-5model.json`):

| id | label | composite | audit | structure | schema | links | wordCount | htmlMatch | visualMatch | $ | s |
|---|---|---|---|---|---|---|---|---|---|---|---|
| claude | Claude Opus 4.8 | **76** | 76 | 50 | 100 | 100 | 67 | 77 | 76 | 3.00 | 579 |
| openai-std | GPT-5.5 | 75 | 76 | 50 | 100 | 100 | 64 | 70 | 79 | 3.05 | 402 |
| gemini | Gemini 3.1 Pro | 73 | 64 | 50 | 100 | 100 | 72 | 72 | 76 | 1.26 | 428 |
| openai | GPT-5.5-PRO | 73 | 76 | 50 | 100 | 100 | 66 | 69 | 74 | 17.81 | 793 |
| grok | Grok | 72 | 52 | 50 | 100 | 80 | 65 | 79 | 75 | 0.66 | 165 |

Note: **the brief's figures do not match this workspace.** The brief reports 76 at $1.19/250s, 73 at $12.09/794s, 72 at $0.42/165s. The recorded values here are $3.00/579s, $17.81/793s, $0.66/165s. Times align for Grok and GPT-5.5-PRO; costs do not. A `scripts/src/bakeoff/backfill-cost.ts` exists, so a cost re-derivation between the brief and this file is the likely explanation, but I cannot verify which is current. Treat the brief's dollar figures as reported, not verified here.

September `2026-09-14T02-17-42-132Z`, four survivors:

| id | composite | audit | structure | schema | links | wordCount | htmlMatch | visualMatch | $ |
|---|---|---|---|---|---|---|---|---|---|
| gemini-3-7-flash-low | 61 | 64 | 55 | 55 | 80 | 68 | 49 | 60 | 0.43 |
| gemini-3-7-flash-medium | 61 | 64 | 55 | 55 | 72 | 48 | 60 | 0.43 |
| gpt-luna-high | 61 | 64 | 55 | 55 | 80 | 65 | 49 | 60 | 0.13 |
| gpt-terra | 59 | 64 | 55 | 55 | 80 | 54 | 49 | 57 | 0.84 |

Four of seven axes are byte-identical across all four models. The composite spread is **2 points across 6.5x cost**.

What the local evidence proves: the rubric assigns near-identical composites to models with materially different cost and latency, and it does so largely because most of its axes are pinned. What it does **not** prove: that the models are equally good at this task. You cannot conclude "all five models are equivalent" from an instrument whose live dynamic range is roughly 0.35 of its nominal weight. The honest statement is: **this rubric is not sensitive enough to be used for model selection, so the current ranking should be treated as noise, and the underlying question is still open.**

### E7. Archived history points at mutable, overwritten transcripts
**Confidence: high.**

`history.ts:82-96` deliberately deep-copies each `screenshot` into `screenshots/history/<runId>/…` and sets it to `null` rather than leave a live path, with an explicit comment explaining why. **It does not do the same for `transcriptPath`.** `run.ts:887-888` writes transcripts to the fixed path `transcripts/<scenario>/<modelId>.json`, overwritten on every run. So every archived snapshot's `transcriptPath` resolves to the newest run's transcript.

Direct corroboration from `git status` at session start: eleven files under `artifacts/bake-off/public/transcripts/no-gmb/` are modified in the working tree, while two new history snapshots (`2026-09-13T02-54-55-073Z.json`, `2026-09-14T02-17-42-132Z.json`) were added. Both snapshots, and the 44 before them, now link to the same eleven files.

### E8. The history manifest and the history data directory have desynchronised
**Confidence: high.**

- `manifest.json` contains 46 entries.
- The directory contains 46 snapshot files.
- `manifest.json` references `2026-08-31T18-01-29-127Z.json`, which **does not exist** (`ls` → No such file).
- `2026-08-31T17-36-20-896Z.json` and `2026-08-31T19-36-25-511Z.json` **exist but are not in the manifest**.

`datasets.ts:38-39` silently drops the dangling entry (`if (!mod) return null`), so the UI shows a run count one short with no error. The two orphans are still eagerly bundled by `import.meta.glob("./history/*.json")` (`datasets.ts:26`), so they inflate the JS bundle while being unreachable.

The 19:36:25.511 / 19:36:26.170 pair is 659 ms apart. `archiveSnapshot` does `loadManifest()` → mutate → `writeFile` with no lock and no atomic rename (`history.ts:102-108`), unlike `writeJsonAtomic` used for results. Two archives that close within one read-modify-write window lose one entry. That matches the orphan exactly. The dangling entry has the opposite shape (manifest wrote, data file absent) and I could not determine its cause from `git log` (the command was denied).

### E9. The judge panel races the run it is judging
**Confidence: high (code + config); observed impact: not directly measured.**

`.replit:14-25` declares the `Project` workflow `mode = "parallel"` with `Bake-Off Run` and `Bake-Off Judge Panel` as concurrent tasks. `judge-panel.ts:113,122` reads `results.json`. `run.ts:501-542` rewrites that same file after **every** model completes. `writeJsonAtomic` guarantees the judge never sees a torn file, but it does not guarantee the judge sees a *complete* run. Depending on scheduling, the panel judges the previous run's data, a partially-populated current run, or a run whose visual verdicts have not landed yet. `scripts/src/bakeoff/output/judge-panel/mapping.json` is modified in the working tree, consistent with a panel that ran against whatever was on disk.

### E10. The bake-off's "research" is not research
**Confidence: high.**

The grounding block persisted in `2026-09-14T02-17-42-132Z.json` opens with the harness's own disclaimer:

> `[MODEL-KNOWLEDGE GROUNDING — Perplexity/SerpAPI keys are not configured in this environment, so this is NOT a live web search. It is one model-authored local-market brief, generated ONCE and shared identically across every model…]`

It then names specific employers (Kern Medical, Grimmway Farms, CSUB) as if verified. `run.ts:798-804` records that same text as each model's `research.summary`. So every bake-off page is built on model-recalled entity claims, and the one turn that *is* supposed to fetch live (`seo-verify`) is the turn whose fetch gate keeps killing cells. This is an environment/secret configuration difference from Mission Control, which does have SerpAPI/DataForSEO wired (`mc.ts:311`).

### E11. Mission Control cannot start from an external brief
**Confidence: high.**

- `POST /mc/runs` (`mc.ts:289-347`) accepts `vaName, url, engine, track, pageType, existingUrls, handoff, verifiedCid, designBibleHash, blogTopic`. **There is no `researchBrief` or `pageBrief` field.**
- `deriveRunInputs(url)` (`mc.ts:311`) is unconditional and fatal on failure (400, no row created). City, state, niche, classification, competition, and `seoIntel` all come from the URL.
- `initialPhases()` (`mc-runtime.ts:592-595`) sets `research` to `ready` and everything else to `locked`.
- `runnable = ["ready","review","failed"].includes(status)` (`mc.ts:480`, `:528`). `locked` is not runnable, so `build` returns 409 until `research` has run **and** been approved.
- The Replit-mode escape hatch accepts `{html, schema}` for build/audit/schema (`mc.ts:540-550`), but for `research` it explicitly "reuses the shared research provider" (`mc.ts:537-539`). There is no path to inject a finished brief.

**Answer: URL-derived research is mandatory and coupled to the run.** The nearest available workaround with no code change is a Replit-mode run where you let research execute, approve it, and then submit your own HTML at build via `/phases/build/replit` — but you still pay for and wait on the research phase, and your external brief never reaches the run row.

### E12. A failed later phase *can* be rerun independently, reusing earlier paid outputs
**Confidence: high. This is the one thing that is architecturally right.**

- Prior state is read from the row on every call, not held in memory: `mc.ts:172-183` passes `{researchBrief: run.researchBrief, html: run.pageHtml, schema: run.generatedSchema, joomlaMeta, checkerReport, linkAuditOverride}` into `runPhase`.
- `failed` is in the runnable set (`mc.ts:480`), and the endpoint is explicitly documented as "the retry escape hatch" (`mc.ts:489-491`).
- The schema failure path (`orchestrator.ts:169-173`) throws before touching `state.schema`, and the catch in `executePhase` (`mc.ts:268-277`) updates only `phases` and `status`. `researchBrief` and `pageHtml` columns are untouched.

So: schema fails → `POST /runs/:id/phases/schema/run` reruns schema alone against the stored research and HTML. **One LLM call, not five.** Caveats: rerunning `build` overwrites `pageHtml` and nulls any `linkAuditOverride` (`mc.ts:228`); and this all depends on the phase reaching `failed` rather than wedging at `running` (E1).

### E13. Prompt versions carried by this workspace, and provable drift
**Confidence: high for what is here; the framework repo and precision repo are not present and I make no claim about them.**

| Artifact | Page Builder | SEO Audit | Schema Generator |
|---|---|---|---|
| `scripts/src/bakeoff/fixtures/*.txt` | **v3.12** | **v10.13.3** | **v1.4.3** |
| `lib/mc-core/src/prompts/*.ts` | **v3.12** | **v10.13.3** | **v1.4.3** |
| `artifacts/page-terminal/public/tools/page-terminal.html` | referenced by name only, **no version string** | same | not referenced |

Provable drift, all local:

1. **Documentation drift inside the harness.** `run.ts:141` and `run.ts:186` both tell the operator the schema turn runs "the uploaded Master Schema Generator (**v1.4.1**)", and `fixtures.ts:17` says the same. The file it actually loads is headed `MASTER SCHEMA GENERATOR v1.4.3 PRODUCTION`. Those run notes are persisted verbatim into every archived snapshot and rendered in the viewer, so every history entry mislabels the prompt version it used.
2. **Drift against the versions named in the brief.** The brief names v3.7 / v10.12.4 / v1.4.1. This workspace carries v3.12 / v10.13.3 / v1.4.3, all newer. Whether the other repos are behind is not something I can check.
3. **A newer SEO Audit exists outside the code paths.** `attached_assets/Pasted-MASTER-SEO-AUDIT-v10-14-FULL-POWER-GEO-AI-LOCAL-SEO-MAS_1788295554210.txt` is **v10.14**, one minor ahead of both live copies. It is not wired into anything.
4. **The page-terminal tool carries no version marker at all**, so a VA using it cannot tell which generation of the prompt they are running, and no automated check can either.

What I **cannot** verify from this workspace: whether the fixture `.txt` files and the `mc-core` `.ts` string literals are byte-identical beyond their matching version headers. Confirming that needs a diff, which requires executing code this session is not permitted to run.

### E14. `results.json` is gitignored but is a hard build dependency
**Confidence: high.**

`datasets.ts:2` does `import currentData from "@/data/results.json"`. `artifacts/bake-off/CLAUDE.md` states the file is intentionally gitignored. It is present locally, so the build works here. On any clean checkout without a prior harness run, `pnpm run build` for the bake-off artifact fails at module resolution. That is an environment-difference failure mode that will not reproduce on the machine that has been running the harness.

---

## Reproduction plan

Smallest deterministic reproductions, no provider spend, ordered by value.

**R1 — Wedged `running` phase (root cause 1).** Pure DB/state test, no LLM.
Insert an `mc_runs` row with `status='running'` and `phases` containing `{phase:'build', status:'running'}`. Then assert:
`POST /mc/runs/:id/phases/build/run` → 409;
`POST /mc/runs/:id/phases/build/approve` → 409;
`POST /mc/runs/:id/phases/audit/run` → 409.
No existing test covers this. `lib/mc-core/src/pipeline/orchestrator.test.ts` tests `runPhase` in isolation, below the state machine.

**R2 — `structure` is constant.** Unit test, no network. Feed `structureScore` three inputs: the reference (`scripts/src/bakeoff/reference/billings-mt.html`), a June archive page, and a September page extracted from the history JSON. Assert the reference scores 75 (not 100) and that `extractStructuralSignals(x).equipmentTitles` is `[]` for all three. This is the whole finding in one test.

**R3 — `htmlMatch`/`visualMatch` penalise improvement.** Unit test, no network. Take the reference HTML, produce a variant that is unambiguously better (semantic `<section>` in place of `<div>`, `alt` text added, synonyms substituted in prose), and assert `htmlMatchScore(better, ref) < htmlMatchScore(ref, ref)`. It will be dramatically lower. Same for `visualTokensScore` after renaming CSS classes.

**R4 — Manifest race.** Unit test against `archiveSnapshot` with a temp `HISTORY_DATA_DIR`: call it twice concurrently with distinct `runId`s via `Promise.all`, then assert `manifest.json` contains both. It currently will not.

**R5 — Archived transcript aliasing.** Unit/integration: archive snapshot A, overwrite `public/transcripts/no-gmb/<id>.json`, then assert snapshot A's `transcriptPath` still resolves to A's content. It will not. The existing screenshot behaviour is the passing control case in the same test.

**R6 — Retry/resume config regression.** A config assertion test over `.replit`: fail if `BAKEOFF_MAX_ATTEMPTS` is `1` or if `BAKEOFF_FORCE` names every id in `BAKEOFF_VARIANTS`. Cheap, and it is the single highest-leverage guard on the bake-off's cost.

**R7 — Live-fetch gate flake.** `providers.test.ts` already has `enforceLiveFetch` coverage (it is exported specifically for this, `providers.ts:275-278`). Extend with a harness-level test that a `webSearch` turn failing on attempt 1 and succeeding on attempt 2 yields `status:"ok"` when `MAX_ATTEMPTS=2`. That test passing while production fails is itself the proof that config, not code, is the problem.

**R8 — MC cannot accept an external brief.** API test: `POST /mc/runs` with a `researchBrief` field, assert it is ignored and `phases[0].status === 'ready'`, `phases[1].status === 'locked'`; then `POST /phases/build/run` → 409.

**R9 — MC schema rerun reuses paid work.** Integration test with a stub engine: run research + build with recording stubs, approve both, make the schema engine return invalid JSON-LD once then valid. Assert the research and build stubs are each called exactly once across both schema attempts.

**R10 — Manifest/data desync detector.** A read-only script asserting `manifest.json` entries ↔ `history/*.json` files are a bijection. It fails today, on the three files identified in E8.

---

## Minimal remediation plan

Dependency-ordered. None of this is a rewrite; the architecture is repairable and in places (the orchestrator seam, `writeJsonAtomic`, `withTimeout`, the atomic-publish gate) it is genuinely good.

**Tier 0 — config only, no code, immediate**

1. `.replit:40`: remove `BAKEOFF_MAX_ATTEMPTS='1'`. Let it fall back to the coded default of 2. Fixes E3's amplification.
2. `.replit:40`: remove `BAKEOFF_FORCE`, or reduce it to the ids you actually intend to re-run. Restores resume and stops re-paying for successful cells. Fixes E2.
3. `.replit:14-25`: make `Bake-Off Judge Panel` sequential after `Bake-Off Run`, or point it at a specific archived snapshot instead of the live `results.json`. Fixes E9.
4. Resolve the DeepSeek `402` and xAI `403` billing states, or drop those four cells from `BAKEOFF_VARIANTS` until they are funded. Four of eleven cells currently cannot succeed for reasons unrelated to anything in this repo.

**Tier 1 — small, high-value code fixes**

5. **Stale-run recovery** (`artifacts/api-server/src/routes/mc.ts` + `src/index.ts`). Add a `startedAt`-age check: on API startup, and on each `GET /runs/:id`, any phase in `running` whose `startedAt` exceeds a threshold transitions to `failed` with `error: "phase abandoned (process restart or timeout)"`. That single change turns the worst failure mode into an ordinary retryable one, and E12 already proves retry reuses the paid work. Highest value item in this report.
6. **Namespace `transcriptPath` in `archiveSnapshot`** (`history.ts:92-96`), exactly mirroring the existing screenshot handling three lines above. Roughly five lines.
7. **Make the manifest write atomic and serialized** (`history.ts:102-108`): reuse `writeJsonAtomic` from `resume.ts`, and guard the read-modify-write with the same single-chain pattern `run.ts:559-564` already uses for persists.
8. **Fail loud on manifest/data desync** in `datasets.ts:38-39`: log a build-time warning (or throw in CI) instead of returning `null`. Then repair the three files E8 identifies.

**Tier 2 — scoring rubric**

9. **Fix or drop the two dead structural signals.** Either (a) make the page-builder prompt require `<!-- SECTION: … -->` markers and an `equipment` class, matching the reference, and fix the `[^>-]` hyphen exclusion at `structural-hash.ts:54`; or (b) reduce `structureScore` to the two signals that fire and rescale. Do not leave a 0.15-weight constant in the composite.
10. **Rename `htmlMatch`/`visualMatch` to `htmlSimilarity`/`visualSimilarity` in `ModelScores` and in the viewer**, and report them alongside the composite rather than inside it. They are legitimate and useful measurements of template adherence. They are not quality, and the current naming plus the `WEIGHTS` doc comment (`score.ts:128-139`) actively misleads.
11. **Add at least one axis with real dynamic range** before using the rubric to choose anything. `audit` (52-76 in June) is the only current axis that moves; it is 0.25 of the weight. Candidates: per-check breakdown from the checker suite instead of a single docked score, entity-grounding accuracy against a verified list, or an LLM rubric judge scoring the page on its own merits with no reference.
12. **Make the `visualTokens` fallback visible.** `score.ts:185` silently substitutes a different metric when the browser pass fails (`run.ts:653-654` swallows it). Record which one was used so cross-run comparisons are honest.

**Tier 3 — structural, only if you intend to standardise on Mission Control**

13. **Move phase execution off the request thread.** `mc.ts:172` and `mc.ts:659` both await minutes of LLM work inside an HTTP handler on an autoscale target. A job row plus a worker loop, with the 4s poll the UI already does, removes the whole class of problem. This is the change item 5 works around rather than fixes.
14. **Add an optional external-brief entry point.** Accept `researchBrief` on `POST /mc/runs`, and when supplied set `phases[research] = {status: 'approved', summary: 'externally supplied'}` and `phases[build] = 'ready'`. The orchestrator already reads `researchBrief` from state and never re-derives it (`orchestrator.ts:125,143,161`), so the plumbing exists. This is the only structural gap that blocks reusing external research, and it is small.
15. **Consider a deterministic schema generator.** `generateLocalBusinessSchema` already exists (`lib/mc-core/src/schema/generator.ts:9`) but is unused by the pipeline; the schema phase is an LLM call whose failure mode (`orchestrator.ts:169`) is "unparseable JSON-LD, halt". The exact-count contracts in the Schema Generator prompt (exactly 8 FAQs, exactly 6 HowTo steps, 3-item breadcrumb, 12+ services) are all mechanically checkable and mechanically constructible. This is a real cost and reliability win, and it matches the shape reported for the lean runner. Flagging it, not prescribing it: the prompt is elaborate and porting it is a week, not an afternoon.

**Explicitly not recommended:** rewriting either system. The Mission Control orchestrator's engine/publisher/research seams, its per-phase DB persistence, its fail-loud schema guard, and its atomic-publish gate are the hard parts and they are correct. The bake-off's `withTimeout`/`abortableSleep`/streaming-stall watchdogs are more careful than most production code I read. The failures are at the edges: state recovery, archive hygiene, and a rubric whose axes are pinned.

---

## Missing observability

**Correlation and identity**
- No run-scoped correlation id spanning the bake-off. `run.ts:668` mints a `runId` only at archive time, after everything is done. Every log line, transcript, screenshot, and error is keyed by model id alone, so two runs' artifacts are indistinguishable in a log tail.
- No prompt-fixture fingerprint recorded per run. Add a SHA of each of the four fixture files to `BakeoffResults`. E13 shows the run notes already lie about the schema version; a hash makes that class of drift impossible.
- No harness git SHA in the results. You cannot tell which code produced a given snapshot.

**Persisted state, Mission Control**
- No `startedAt` age visible anywhere in the UI, and no derived staleness. `run-detail.tsx:403` polls every 4s and faithfully renders a wedged row as an active spinner. A VA cannot distinguish "thinking hard" from "dead 6 hours ago."
- No attempt/duration history per phase beyond `PhaseAttemptEvent` (routed-engine retries only, `mc.ts:120-133`). Nothing records how long a phase actually took, so there is no data to set a timeout threshold from.
- Fire-and-forget post-publish work (`recordPublishToWorkLog`, `runQcForRun`, `mc.ts:250-258`) records failure only to `logger.error`. Nothing is persisted, so a VA sees a published page with no QC and no explanation.
- No terminal-state audit trail. A run that goes `running → failed → running → review` leaves only the current status; the transitions are gone.

**Persisted state, bake-off**
- Errored cells lose everything but the message. `run.ts:872-881` keeps partial usage and cost but discards the partial HTML. The three gate-failure cells on 2026-09-14 had completed intro/build/design-gate/seo before dying; that work exists only inside the transcript, not as a resumable artifact. Persisting the last-good HTML per phase would make the whole harness resumable at turn granularity instead of cell granularity.
- No metric for which turn a cell died on. You have to open the transcript JSON and read it. A `failedPhase` field on `ModelResult` costs one line and would immediately show whether failures cluster on `seo-verify` (they do, in the run I examined).
- No record of whether `visualMatch` came from the perceptual judge or the token fallback (see remediation 12).
- No count of swallowed errors. B15-B21 are seven distinct `catch { log }` sites. A per-run `degradations: string[]` on `BakeoffResults` would make a run that "succeeded" with three silent failures legible.

**Metrics worth having**
- Bake-off: cells attempted / ok / errored, and **dollars spent on cells that errored**, per run. The 2026-09-14 run wasted roughly $1.84 on three cells and nothing surfaces that.
- Mission Control: count of runs by `(status, currentPhase)` and the age distribution of anything in `running`. This is the number the brief asks for in question 4 and the number nothing currently emits.
- Manifest/data bijection check as a CI step (R10).

---

## Answers to the brief's eight questions, by verification status

| # | Question | Answer | Status |
|---|---|---|---|
| 1 | Why is `structure` exactly 50? | `rootCss` (+25) and `sacredUrls` (+25, saturated) fire. `sectionSequence` and `equipmentTitles` never fire; measured 0 across all five June pages. The 55 in recent runs is +5 from one prompt-mandated boilerplate `<section class="sts-hq-callout">` identical in all four models. The golden reference itself caps at 75. **The 0.15 weight is dead weight**, not inconclusive. | **Verified from this workspace** |
| 2 | What do `htmlMatch`/`visualMatch` reward? | Tag-frequency cosine + word-token Jaccard vs one reference; pixel diff + vision-LLM closeness to that same reference; class-name Jaccard on fallback. **Similarity rubric, not quality.** A better-but-different page is penalised, and because three other axes are pinned, similarity is the dominant live signal despite its nominal 0.25 cap. | **Verified from this workspace** |
| 3 | Can the spread discriminate? | No. June: 4-point spread with `structure`/`schema`/`links` constant. September: 2-point spread with four of seven axes byte-identical. The instrument cannot separate these models. It does **not** follow that the models are equivalent; that question is untested. The brief's dollar figures ($1.19/$12.09/$0.42) do not match the recorded values here ($3.00/$17.81/$0.66). | **Verified from this workspace**; brief's costs **reported, and contradicted locally** |
| 4 | `mc_runs` completion/stall distribution by phase | **Cannot query the database from this session.** This session runs under `--allowed-tools Read Glob Grep "Bash(git status)"` (`.replit:62`); `psql`, `node`, and `env` were all denied. I could not confirm whether `DATABASE_URL` is even set. No committed fixture or snapshot of `mc_runs` exists in the repo. **I do not have this number and will not estimate it.** | **Cannot verify from this workspace** |
| 5 | Can MC start at build from an external brief? | **No.** `POST /mc/runs` has no brief field, `deriveRunInputs(url)` is unconditional and fatal, `initialPhases()` locks build, and the Replit endpoint explicitly routes research through the shared provider. URL-derived research is mandatory and coupled to the run. | **Verified from this workspace** |
| 6 | Can a failed phase be rerun independently? | **Yes.** `failed` is runnable, prior state is re-read from the row every call, and the schema failure path leaves `researchBrief`/`pageHtml` intact. Schema failure costs one rerun call, not five. The real risk is not rerun cost, it is a phase wedged at `running`, which is not rerunnable at all. | **Verified from this workspace** |
| 7 | MC vs lean runner vs production factory | On resumability MC is closer to the **lean runner**: per-phase execution, durable state, gated advance, cheap targeted retry, deterministic Joomla-meta derivation, and a hard fail-loud on unparseable schema instead of a placeholder. Differences: state is one JSONB row rather than stage files, the schema stage is an LLM call not deterministic code, and phase execution runs inside an HTTP request on an autoscale target, which reintroduces the all-or-nothing failure mode from the other side. Comparisons to the two absent repos rest on the brief. | **MC shape verified from this workspace**; other systems **reported in the brief** |
| 8 | Prompt versions and drift | This workspace carries Page Builder **v3.12**, SEO Audit **v10.13.3**, Schema Generator **v1.4.3**, and the bake-off fixtures and `mc-core` prompts agree on all three version headers. Provable drift: `run.ts:141,186` and `fixtures.ts:17` say v1.4.1 while loading v1.4.3, and those wrong notes are baked into all 46 archived snapshots; `attached_assets` holds an unwired SEO Audit **v10.14**; `page-terminal.html` carries no version marker at all. **I cannot confirm byte-equality** between the fixtures and the `mc-core` strings without executing a diff, which this session cannot do. I make no claim about the framework or precision repos. | **Verified**, with one stated gap |

---

## Verdict on the two judgement calls the brief asked for

**Is the scoring rubric trustworthy?** No. Rebuild it before using it to pick anything. Not because it is subtly biased, but because in the two runs I measured, between 40% and 65% of its weight was a constant, and most of what remained measured similarity to one reference page. It cannot rank what it claims to rank. The individual pieces (checker suite, pixel diff, cost measurement) are sound and worth keeping; the composite is not.

**Is a bake-off the right tool?** Not for the problem this repo actually has. Every failure I could reproduce from committed evidence is wrapper or configuration, not model output: retries disabled in `.replit`, resume disabled in `.replit`, two providers unfunded, a phase state machine with no exit from `running`, an archive that aliases mutable files, a manifest that lost two entries to a write race, a judge racing the run it judges. In the most recent run, seven of eleven cells never produced a page and **not one** of those seven failures was about page quality. Four were billing or credit exhaustion; three were a fetch-evidence gate with retries turned off. Fixing the four Tier-0 config lines would likely change that run's outcome more than swapping every model in the matrix.

---

## Questions requiring information outside this repository

1. **What is the actual `mc_runs` distribution?** `SELECT status, current_phase, count(*) FROM mc_runs GROUP BY 1,2;` plus `SELECT id, current_phase, updated_at FROM mc_runs WHERE status='running' ORDER BY updated_at;`. This is the single number the brief most wants and the one thing I could not obtain. If any rows are `running` with an `updated_at` older than an hour, root cause 1 is confirmed in production.
2. **Have any Mission Control runs ever reached `published`?** `SELECT count(*) FROM mc_runs WHERE status='published';` and whether `JOOMLA_PUBLISH_URL` is configured in the deployed environment. If it is unset, every run correctly stops at `review` and "zero published" would mean the seam was never wired, not that the pipeline is broken.
3. **API server restart history.** Deployment logs or process-restart counts for the autoscale service, correlated against the `updated_at` of any wedged rows. This distinguishes "phases die because the process is recycled" from "phases die because a provider call hangs."
4. **Which cost figures are current?** The brief's $1.19/$12.09/$0.42 versus this workspace's $3.00/$17.81/$0.66 for the same June run. Was `backfill-cost.ts` run after the brief was written, or before?
5. **Provider account state.** Are the xAI and DeepSeek accounts funded now? Four of eleven bake-off cells cannot succeed until they are, and no amount of code change alters that.
6. **Raw provider responses for the three `seo-verify` gate failures.** The transcripts in `public/transcripts/no-gmb/` have been overwritten since (E7). The question is whether those models silently declined to call their search tool or whether the provider omitted the evidence fields the gate reads.
7. **Do the framework repo's `lib/prompts/prompts/` files match the v3.12 / v10.13.3 / v1.4.3 carried here?** I can only report what is in this workspace.
8. **Who deleted `2026-08-31T18-01-29-127Z.json`, and when?** `git log` on that path was denied to me. If it was never committed, the manifest write succeeded while the data write did not, which is a different bug from the write race that explains the two orphans.
9. **Is `results.json` regenerated as part of the deploy?** It is gitignored but is a hard `import` in `datasets.ts:2`. A clean-checkout build of the bake-off artifact fails without it.
