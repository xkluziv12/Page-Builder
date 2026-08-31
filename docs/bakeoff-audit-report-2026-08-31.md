# STS Multi-LLM Bake-Off: Complete Audit Report

**Report date:** 2026-08-31  
**Target:** `https://www.stselectronicrecyclinginc.com/billings-mt`  
**Scenario covered:** No-GMB production-context page build  
**Prepared for:** Mark and the Claude Code review workflow

---

## 1. Executive summary

### The direct answer about Gemini

**Gemini 3.7 Flash was run through Google's direct Gemini API adapter using the project's existing `GEMINI_API_KEY`. It was not run through Claude Code CLI, Claude web, a Replit LLM integration, or OpenRouter.**

The same rule applies to the other Bake-Off participants:

| Provider/model family | Run path |
|---|---|
| Anthropic / Claude | Direct Anthropic SDK with the project's Anthropic key |
| Google / Gemini | Direct Google Gen AI SDK with `GEMINI_API_KEY` |
| OpenAI / GPT | Direct OpenAI SDK with `OPENAI_API_KEY` |
| xAI / Grok | Direct xAI-compatible API with `XAI_API_KEY` |
| DeepSeek | Direct DeepSeek-compatible API with the project's DeepSeek secret |
| Claude Code CLI | **Not a Bake-Off participant**. It is an optional implementation/review worker only. |

### Bottom-line model recommendation

There are two valid ways to state the result:

1. **Pinned current dataset:** Claude Sonnet 4.6 is the quality winner at composite **67**, but Gemini 3.7 Flash is only three points behind at **64** and costs **$0.53 versus $2.72**.
2. **Newest same-day rerun:** Gemini 3.7 Flash reached composite **67**, tied Claude for the best score, at **$0.38**. It was also the fastest successful result.

For a production default where cost matters, **Gemini 3.7 Flash is the best value candidate**. For maximum confidence on the strongest single page from the pinned run, **Claude Sonnet 4.6 remains the quality reference**. Grok is the cheapest successful alternative, but it scored lower and should not be preferred over Gemini unless latency is the primary constraint.

DeepSeek should not be called the cheapest usable model in this experiment. Its partial failed attempts were inexpensive, but it did not complete a valid page under the live-search gate.

---

## 2. What was audited

This report combines the following evidence already committed in the repository:

- Current and historical Bake-Off result JSON files.
- Per-model timing, scores, token usage, cost basis, errors, HTML, schemas, and screenshots.
- The direct provider adapters and orchestration code.
- The deterministic checker and visual scoring implementation.
- The blind judge-panel outputs and anonymized mapping.
- Four independent model-generated harness reviews:
  - Claude Opus 4.8
  - Gemini 3.1 Pro
  - Grok 4.3
  - OpenAI GPT-5.5
- Existing test and typecheck results recorded for the completed provenance work.

The primary current result is:

```text
artifacts/bake-off/src/data/results.json
```

The newest same-day archived rerun is:

```text
artifacts/bake-off/src/data/history/2026-08-31T19-36-26-170Z.json
```

The older blind judging round is not a fresh judge of the 2026-08-31 pages. It judged older saved pages and must be interpreted separately.

---

## 3. Experiment design

### Target and input

All current and historical records in this report target the same Billings, Montana electronics-recycling spoke page:

- City: Billings
- State: MT
- Niche: electronics recycling
- Page type: SPOKE
- Classification: NEW_BUILD
- Competition: MEDIUM
- Reference page: the live Billings page listed above

### No-GMB workflow

The main comparison used one continuous stateful conversation per model. The intended sequence was:

1. Intro and model-handshake turn.
2. Page build.
3. Deterministic design gate.
4. Bounded rebuild when the design gate requires it.
5. SEO audit.
6. SEO verification with the provider's native search tool enabled for that turn.
7. Schema generation.
8. Link verification.
9. Extraction, checker pass, screenshot render, and scoring.

The same master fixtures, mini-prompts, target context, and shared grounding were passed to each model. API-specific artifact/file instructions were translated through uniform shims so the headless APIs could perform a workflow originally designed around a chat UI.

### GMB comparison

The June full-adherence archive also contains a separate GMB-enriched scenario. That scenario supplied the same illustrative business-profile block to all models. It is not directly comparable to the No-GMB scenario because the input contract is intentionally different.

### Fairness interpretation

The comparison is controlled at the prompt and orchestration level, but it is not a laboratory-equivalent model test. The following differences remain material:

- Native web-search products differ by provider.
- Claude streams, Gemini uses `generateContent`, OpenAI uses background Responses polling, and Grok changes transport for web-search turns.
- Search was enabled on the SEO verification turn, not every research-like instruction in the source fixtures.
- Shared grounding reduces research variance but is model-authored rather than a neutral source ledger.
- The No-GMB flow includes the HQ phone instruction to prevent a refusal mode. This is uniformly applied, but it is not identical to the reference page's visible content.
- The intro contains Claude-specific language because the source workflow was originally a Claude chat workflow.

Therefore the results are useful for choosing an operating model for this exact pipeline, but they should not be presented as a universal ranking of model intelligence.

---

## 4. Provider and provenance audit

### Direct API paths

The adapter source explicitly documents that the Bake-Off calls providers directly with project-owned keys. The relevant implementation is `scripts/src/bakeoff/providers.ts`.

| Adapter | SDK/transport | Search behavior | Effort record in latest run |
|---|---|---|---|
| Claude Sonnet 4.6 | Anthropic SDK, streaming message completion | Anthropic native `web_search` on SEO verification | Historical current row did not record effort |
| Gemini 3.7 Flash | Google Gen AI SDK, `generateContent` | Google Search grounding on the flagged turn | `provider-default` |
| GPT-5.6 Luna | OpenAI SDK, Responses API/background polling | OpenAI Responses web search | `high` |
| Grok 4.20 Reasoning | xAI OpenAI-compatible endpoint; streaming for long turns | xAI Responses web search on flagged turn | `not-supported` |
| DeepSeek v4 Pro/Flash | DeepSeek-compatible endpoint | No native web-search capability in this adapter | `not-supported` |

### What Claude Code did and did not do

Claude Code CLI is not a hidden provider in the saved Bake-Off data. It did not generate Gemini's page, proxy Gemini's request, or provide Gemini's search. If Claude Code is used to inspect this report, that is a separate audit/review activity after the experiment.

No Replit-managed LLM connector was added or used for the Bake-Off. The report does not contain any secret values.

---

## 5. Scoring method

The current composite excludes speed from the quality score. Speed remains a separate reported axis.

| Axis | Weight | What it measures |
|---|---:|---|
| Audit | 25% | Checker quality after the pipeline |
| Structure | 15% | Design skeleton and required structural signals |
| Schema | 15% | JSON-LD validity and schema rules |
| Links | 10% | Sacred links, allowlist, and link safety |
| Word count | 10% | Content floor and page-length fit |
| HTML match | 12.5% | Tag-structure and visible-text closeness to the reference |
| Visual match | 12.5% | Rendered screenshot closeness |
| Speed | 0% | Reported independently, not blended into quality |

The visual score in the current run is screenshot-based. Earlier archives may also contain the older visual-token proxy and optional vision-LLM score. Those historical numbers are not perfectly comparable to the newest visual implementation.

### Cost calculation

For current runs, the result files record provider-reported token usage:

- Full input token count.
- Cached input subset.
- Visible output tokens.
- Hidden reasoning tokens where the provider reports them.
- Provider list-price tier used by the calculator.

The current dollar values are marked **Measured** because real usage was returned by the provider. They exclude provider-side web-search fees, which are billed separately and were not returned in the normalized usage record. Older archives without recorded usage are **Not recorded**, not free.

---

## 6. Latest pinned current run

Source: `artifacts/bake-off/src/data/results.json`  
Run timestamp: `2026-08-31T19:36:25.508Z`

### Successful results

| Rank | Model | Provider | Composite | Audit | Structure | Schema | Links | Words | Speed | HTML | Visual | Time | Measured cost |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | Claude Sonnet 4.6 | Anthropic | **67** | 52 | 50 | 55 | 100 | 90 | 12 | 73 | 84 | 21m 31s | **$2.7226** |
| 2 | GPT-5.6 Luna | OpenAI | **66** | 64 | 55 | 55 | 80 | 69 | 24 | 67 | 83 | 10m 16s | **$2.1047** |
| 3 | Gemini 3.7 Flash | Google | **64** | 52 | 55 | 55 | 80 | 68 | 100 | 69 | **89** | 2m 30s | **$0.5318** |
| 4 | Grok 4.20 Reasoning | xAI | **62** | 52 | 55 | 55 | 80 | 58 | 34 | 68 | 79 | 7m 20s | **$0.3827** |

### Failed results and partial charges

| Model | Status | Recorded partial cost | Failure reason |
|---|---|---:|---|
| Gemini 3.1 Pro | Error | $0.8989 | Failed after two attempts because the required live web-search evidence was absent on the SEO verification turn |
| DeepSeek v4 Pro | Error | $0.1322 | Failed after two attempts because the required live web-search evidence was absent |
| DeepSeek v4 Flash | Error | Not recorded | Returned an empty response after two attempts |

The four successful pages consumed **$5.7418** in measured model usage. Including the recorded partial failed attempts, the run consumed at least **$6.7729**, excluding unmeasured search fees and any unrecorded DeepSeek Flash charge.

### Token usage in the pinned run

| Model | Input tokens | Cached input | Output tokens | Hidden reasoning | Price basis |
|---|---:|---:|---:|---:|---|
| Claude Sonnet 4.6 | 819,060 | 399,302 | 89,571 | 0 | $3 / $15 per million input/output |
| GPT-5.6 Luna | 682,112 | 310,454 | 73,194 | 27,402 | $2.50 / $15 per million input/output |
| Gemini 3.7 Flash | 713,469 | 458,465 | 81,641 | 4,080 | $0.75 / $3.75 per million input/output |
| Grok 4.20 Reasoning | 606,360 | 414,080 | 36,243 | 9,098 | $1.25 / $2.50 per million input/output |
| Gemini 3.1 Pro | 207,775 | 139,207 | 61,164 | 8,626 | $2 / $12 per million input/output |
| DeepSeek v4 Pro | 180,373 | 139,904 | 48,601 | 29,066 | $0.66 / $1.98 per million input/output |

### Reading the pinned scores

- Claude won by building the strongest overall balanced page under the current composite.
- GPT-5.6 Luna was close behind and had the strongest automated audit score in the successful set.
- Gemini Flash had the best rendered visual score and was approximately five times cheaper than Claude.
- Grok was approximately seven times cheaper than Claude, but its word-count and visual scores were lower.
- The `structure` and `schema` scores were identical across all four successful outputs, which reduces the practical discriminating power of those axes in this run.

---

## 7. Newest same-day rerun

Source: `artifacts/bake-off/src/data/history/2026-08-31T19-36-26-170Z.json`  
Run timestamp: `2026-08-31T19:36:26.170Z`

This archive is the newest saved rerun and is the strongest evidence for the cost/value decision.

| Rank | Model | Status | Composite | Audit | Words | Speed | HTML | Visual | Time | Cost |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | Gemini 3.7 Flash | OK | **67** | 64 | 74 | 100 | 70 | 84 | 2m 06s | **$0.3848** |
| 1 | Claude Sonnet 4.6 | OK | **67** | 52 | 90 | 10 | 73 | 84 | 21m 31s | **$2.7226** |
| 3 | Grok 4.20 Reasoning | OK | **66** | 64 | 68 | 30 | 70 | 83 | 6m 54s | **$0.4805** |
| 4 | GPT-5.6 Luna | OK | **65** | 64 | 60 | 22 | 65 | 86 | 9m 41s | **$1.7515** |

The same three models that failed in the pinned run failed again for the same live-search or output reasons. The four successful pages consumed **$5.3394**. Including recorded failed attempts, the total was at least **$6.4563**, excluding web-search fees.

### Value calculation

| Model | Cost per composite point | Comment |
|---|---:|---|
| Gemini 3.7 Flash | ~$0.0057 | Best observed quality/cost result |
| Grok 4.20 Reasoning | ~$0.0073 | Very inexpensive, but lower composite |
| GPT-5.6 Luna | ~$0.0270 | More expensive without a quality lead |
| Claude Sonnet 4.6 | ~$0.0406 | Quality reference, but expensive and slow |

Cost per point is only a decision aid. It is not a claim that the composite score is linear utility.

---

## 8. Every model: detailed assessment

### Claude Sonnet 4.6

**Role:** Quality reference and current pinned-run winner.

**Observed performance:**

- Composite 67 in the pinned run.
- Tied Gemini Flash at 67 in the newest rerun.
- Highest word-count score in the current successful group: 90.
- Perfect links score: 100.
- Visual score: 84.
- Slowest successful model by a wide margin: about 21.5 minutes.
- Measured cost: $2.7226.

**Strengths:**

- Consistently produces a complete page.
- Strong content depth and page completeness.
- Strong sacred-link compliance.
- Blind judge round selected the older Sonnet page as the consensus winner.

**Weaknesses:**

- High cost and long wall-clock time.
- Current automated audit score was only 52, tied with Gemini and Grok.
- The blind judge's own review found risk of named-entity overreach and heavy inline-style sprawl.
- The result is not a universal proof that Sonnet is better; the older judge round was on a different dataset and source state.

**Recommendation:** Keep as the quality benchmark and fallback for high-value pages, but do not make it the default without a business reason to pay the premium.

### GPT-5.6 Luna

**Role:** Strong but expensive OpenAI contender with explicit high reasoning effort.

**Observed performance:**

- Composite 66 in the pinned run and 65 in the newest rerun.
- Highest current automated audit score among successful models: 64.
- Visual score 83 in the pinned run and 86 in the newest rerun.
- Measured cost: $2.1047 in the pinned run and $1.7515 in the rerun.
- Hidden reasoning tokens were material.

**Strengths:**

- Good checker/audit performance.
- Strong visual closeness.
- Reliable successful completion in the latest two runs.

**Weaknesses:**

- Costs roughly four times Gemini Flash.
- Does not beat Gemini or Claude on the composite.
- Background Responses polling distorts latency and can create rate-limit or timeout exposure.
- Historical GPT-5.5 Pro runs were particularly expensive and included an effort-setting failure in an earlier snapshot.

**Recommendation:** Keep as a useful comparison and possible quality option, but current evidence does not justify it as the default.

### Gemini 3.7 Flash

**Role:** Best value candidate and fastest successful model.

**Observed performance:**

- Composite 64 in the pinned current dataset.
- Composite 67 in the newest same-day rerun, tied for first.
- Best visual score in the pinned run: 89.
- Fastest successful result in the rerun: about 2 minutes.
- Measured cost: $0.5318 in the pinned run and $0.3848 in the rerun.
- Effort recorded as `provider-default`.

**Strengths:**

- Produces a valid page reliably in the latest successful runs.
- Excellent visual closeness.
- Very low cost relative to Claude and OpenAI.
- Fast enough for repeated generation or a multi-pass workflow.

**Weaknesses:**

- The pinned run's audit score was 52 and link score 80.
- Schema and structure scores were not better than the other successful models.
- Gemini 3.1 Pro repeatedly failed live-search evidence, so Google-model success is not uniform across tiers.
- Search grounding behavior must remain observable; a model response without tool evidence must continue to fail loudly.

**Recommendation:** Use Gemini 3.7 Flash as the default cost-conscious builder candidate, subject to a human or deterministic quality gate. Preserve Claude Sonnet as the escalation benchmark.

### Grok 4.20 Reasoning

**Role:** Cheapest successful model in the pinned run; fast low-cost alternative.

**Observed performance:**

- Composite 62 in the pinned run and 66 in the newest rerun.
- Cost: $0.3827 in the pinned run and $0.4805 in the rerun.
- Faster than Claude and OpenAI, but slower than Gemini Flash.
- Effort is `not-supported`.

**Strengths:**

- Very low cost.
- Successful completion after the streaming reliability fix.
- Reasonable visual and checker performance.

**Weaknesses:**

- Lower word-count score in the pinned run.
- Lower visual score than Gemini, Claude, and GPT.
- Earlier `grok-4.6` records show timeouts.
- xAI search and normal completion use different transports.

**Recommendation:** Keep as a budget or latency option, but Gemini Flash is the better current value because it achieved a higher score at similar cost.

### Gemini 3.1 Pro

**Role:** Historical high-quality candidate that is currently operationally disqualified.

**Observed performance:**

- Composite 73 in the June full-adherence No-GMB archive.
- Repeated current failures after two attempts.
- Latest recorded partial charge: $0.8989.

**Failure:** The model was instructed to perform a live web search but produced no evidence that its search tool was called. The harness correctly rejected the result rather than accepting unsupported training-recall content.

**Recommendation:** Do not count it as a winner until the Google Search grounding/tool-call behavior is fixed and a fresh run succeeds under the same gate.

### DeepSeek v4 Pro

**Role:** Experimental low-cost provider with hidden reasoning.

**Observed performance:**

- Composite 64 in the successful 2026-08-28 runs.
- Current runs fail the live-search evidence gate.
- Latest partial charge: $0.1322.
- Hidden reasoning tokens were large relative to visible output.

**Failure:** DeepSeek does not expose the native web-search capability expected by the shared SEO verification turn. The model therefore produced no qualifying live-search evidence.

**Recommendation:** Either give DeepSeek a deterministic external evidence packet or run it in a clearly labeled no-live-search arm. Do not compare its failed current result directly to successful browsing models.

### DeepSeek v4 Flash

**Role:** Fast experimental tier.

**Observed performance:**

- Current run failed with an empty response.
- Historical runs also show empty-response or live-search-evidence failures.
- One archived attempt recorded $0.0858; the pinned current result did not record a cost.

**Recommendation:** Keep out of the production winner set until empty-response handling and the research contract are resolved.

---

## 9. Historical result ledger

The repository contains older snapshots with different model lineups, prompts, scoring revisions, and in some cases no recorded cost. They are useful for trend analysis, not as one pooled leaderboard.

### Composite leaders by saved run

| Snapshot | Scenario | Highest successful composite | Leader(s) |
|---|---|---:|---|
| 2026-06-23 full adherence | No-GMB | 76 | Claude Sonnet 4.6 |
| 2026-06-23 full adherence | GMB | 69 | Grok |
| 2026-06-23 Opus-tier 4-model | No-GMB | 76 | Claude Opus 4.8 |
| 2026-06-23 Opus-tier 4-model | GMB | 70 | Claude Opus 4.8 |
| 2026-06-24 Opus-tier 5-model | No-GMB | 76 | Claude Opus 4.8 |
| 2026-06-26 prior | No-GMB | 71 | GPT-5.5 |
| 2026-07-10 prior | No-GMB | 68 | GPT-5.6 Terra |
| 2026-08-28 15:29 | No-GMB | 67 | Gemini 3.7 Flash, Claude Sonnet 4.6 |
| 2026-08-28 15:45 | No-GMB | 67 | Gemini 3.7 Flash, Claude Sonnet 4.6 |
| 2026-08-28 15:54 | No-GMB | 67 | Gemini 3.7 Flash, Claude Sonnet 4.6 |
| 2026-08-28 16:08 | No-GMB | 67 | Gemini 3.7 Flash, Claude Sonnet 4.6 |
| 2026-08-28 16:15 | No-GMB | 67 | Claude Sonnet 4.6, Gemini 3.5 Flash |
| 2026-08-28 16:21 | No-GMB | 67 | Claude Sonnet 4.6 |
| 2026-08-31 17:36 | No-GMB | 67 | Claude Sonnet 4.6 |
| 2026-08-31 19:36:25 | No-GMB | 67 | Claude Sonnet 4.6 |
| 2026-08-31 19:36:26 | No-GMB | 67 | Gemini 3.7 Flash, Claude Sonnet 4.6 |

### Recorded cost ledger

Values below are the costs present in the saved result files. A blank or `N/R` means the historical record did not retain a cost estimate. It does not mean the API call was free.

| Snapshot | Model | Status | Recorded cost |
|---|---|---|---:|
| Pinned old dataset, 2026-06-23 | Claude Sonnet 4.6 | OK | $1.3700 |
| Pinned old dataset, 2026-06-23 | GPT-5.5 | OK | $2.0600 |
| Pinned old dataset, 2026-06-23 | Gemini 3.1 Pro | OK | $0.8100 |
| Pinned old dataset, 2026-06-23 | Grok 4.3 | OK | $0.4200 |
| 2026-06-26 prior | GPT-5.5 | OK | $2.6100 |
| 2026-06-26 prior | Claude Opus 4.8 | OK | $2.5500 |
| 2026-06-26 prior | GPT-5.5 Pro | OK | $16.0400 |
| 2026-06-26 prior | Grok 4.3 | OK | $0.5400 |
| 2026-07-10 prior | GPT-5.6 Terra | OK | $1.2600 |
| 2026-07-10 prior | Gemini 3.5 Flash | OK | $1.0600 |
| 2026-08-28 15:29 | Gemini 3.7 Flash | OK | $1.5418 |
| 2026-08-28 15:29 | Claude Sonnet 4.6 | OK | $2.7226 |
| 2026-08-28 15:29 | DeepSeek v4 Pro | OK | $1.6125 |
| 2026-08-28 15:29 | GPT-5.6 Luna medium | OK | $1.1305 |
| 2026-08-28 15:29 | Gemini 3.1 Pro | Error | $0.8989 |
| 2026-08-28 15:45 | Gemini 3.7 Flash | OK | $1.5418 |
| 2026-08-28 15:45 | Claude Sonnet 4.6 | OK | $2.7226 |
| 2026-08-28 15:45 | DeepSeek v4 Pro | OK | $1.6125 |
| 2026-08-28 15:45 | Gemini 3.1 Pro | Error | $0.8989 |
| 2026-08-28 15:45 | GPT-5.6 Luna xhigh | Error | $1.7101 |
| 2026-08-28 15:54 | Gemini 3.7 Flash | OK | $1.5418 |
| 2026-08-28 15:54 | Claude Sonnet 4.6 | OK | $2.7226 |
| 2026-08-28 15:54 | GPT-5.6 Terra | OK | $1.4460 |
| 2026-08-28 15:54 | DeepSeek v4 Pro | OK | $1.6125 |
| 2026-08-28 15:54 | Gemini 3.1 Pro | Error | $0.8989 |
| 2026-08-28 16:08 | Gemini 3.7 Flash | OK | $1.5418 |
| 2026-08-28 16:08 | Claude Sonnet 4.6 | OK | $2.7226 |
| 2026-08-28 16:08 | GPT-5.6 Terra | OK | $1.4460 |
| 2026-08-28 16:08 | Gemini 3.1 Pro | Error | $0.8989 |
| 2026-08-28 16:08 | DeepSeek v4 Pro | Error | $0.1322 |
| 2026-08-28 16:15 | Gemini 3.5 Flash | OK | $0.5935 |
| 2026-08-28 16:15 | Claude Sonnet 4.6 | OK | $2.7226 |
| 2026-08-28 16:15 | GPT-5.6 Terra | OK | $1.4460 |
| 2026-08-28 16:15 | Gemini 3.1 Pro | Error | $0.8989 |
| 2026-08-28 16:15 | DeepSeek v4 Pro | Error | $0.1322 |
| 2026-08-28 16:21 | Claude Sonnet 4.6 | OK | $2.7226 |
| 2026-08-28 16:21 | GPT-5.6 Terra | OK | $1.4460 |
| 2026-08-28 16:21 | Gemini 3.7 Flash | OK | $0.5868 |
| 2026-08-28 16:21 | Gemini 3.1 Pro | Error | $0.8989 |
| 2026-08-28 16:21 | DeepSeek v4 Pro | Error | $0.1322 |
| 2026-08-31 17:36 | Claude Sonnet 4.6 | OK | $2.7226 |
| 2026-08-31 17:36 | GPT-5.6 Luna | OK | $1.6949 |
| 2026-08-31 17:36 | Grok 4.20 Reasoning | OK | $0.4602 |
| 2026-08-31 17:36 | Gemini 3.1 Pro | Error | $0.8989 |
| 2026-08-31 17:36 | DeepSeek v4 Pro | Error | $0.1322 |
| 2026-08-31 17:36 | Gemini 3.7 Flash | Error | $0.2673 |
| 2026-08-31 19:36:25 | Claude Sonnet 4.6 | OK | $2.7226 |
| 2026-08-31 19:36:25 | GPT-5.6 Luna | OK | $2.1047 |
| 2026-08-31 19:36:25 | Gemini 3.7 Flash | OK | $0.5318 |
| 2026-08-31 19:36:25 | Grok 4.20 Reasoning | OK | $0.3827 |
| 2026-08-31 19:36:25 | Gemini 3.1 Pro | Error | $0.8989 |
| 2026-08-31 19:36:25 | DeepSeek v4 Pro | Error | $0.1322 |
| 2026-08-31 19:36:26 | Gemini 3.7 Flash | OK | $0.3848 |
| 2026-08-31 19:36:26 | Claude Sonnet 4.6 | OK | $2.7226 |
| 2026-08-31 19:36:26 | Grok 4.20 Reasoning | OK | $0.4805 |
| 2026-08-31 19:36:26 | GPT-5.6 Luna | OK | $1.7515 |
| 2026-08-31 19:36:26 | Gemini 3.1 Pro | Error | $0.8989 |
| 2026-08-31 19:36:26 | DeepSeek v4 Pro | Error | $0.1322 |
| 2026-08-31 19:36:26 | DeepSeek v4 Flash | Error | $0.0858 |

The immutable June full-adherence, June Opus-tier, and June 24 five-model archive copies do not retain cost values. The separately pinned `old-bakeoff.json` has later cost estimates for four June 23 No-GMB rows, listed above. Those estimates should not be mixed with current provider-measured costs as if they were equally instrumented.

---

## 10. Blind judge-panel audit

There are two related qualitative judging records:

1. `scripts/src/bakeoff/output/judge-panel/` contains a July blind panel comparing four then-current pages with four archived pages. It does not judge the newest 2026-08-31 outputs.
2. `docs/seo-aio-geo-judging-master-findings.md` documents an earlier three-page SEO/AIO/GEO judging round.

The saved eight-candidate judge-panel mapping was:

| Blind candidate | Actual source |
|---|---|
| A | Then-current Claude Sonnet 4.6 |
| B | Then-current GPT-5.6 Terra |
| C | Then-current Gemini 3.7 Flash |
| D | Then-current Grok 4.5 |
| E | Archived GPT-5.5 |
| F | Archived Claude Sonnet 4.6 |
| G | Archived Grok 4.3 |
| H | Archived Gemini 3.1 Pro |

The separate three-page master-findings round records five completed judges and one rate-limited judge:

- Consensus winner: **Page A, Claude Sonnet 4.6**
- Average rank: 1.20
- First-place votes: 4 of 5
- GPT page: average rank 2.20
- Gemini page: average rank 2.60

### What the judges rewarded

- Deep local entity coverage.
- Question-shaped H2 headings.
- Extractable answer blocks and HowTo structure.
- Sourced statistics and attributable claims.
- Rich, valid schema when schema was part of that older comparison.
- Neighborhood-level specificity.
- Accurate, non-overclaiming compliance language.

### What the judges criticized

- Invented or misleading legal claims.
- Overclaiming certifications.
- Incorrect phone numbers.
- Thin or flat schema.
- Missing phone or conversion path where the business rule expected one.
- Generic corporate copy.
- Inline-style sprawl and maintainability issues.

### Important limitation

The judge panel was not a replacement for the current deterministic result. It used older page outputs, a blind mapping, and a different judging purpose. It is strongest as a qualitative audit of what human-quality reviewers notice after the automated score.

---

## 11. Independent harness reviews

Four model-generated code/design reviews were saved under `scripts/src/bakeoff/output/reviews/`.

### Agreement across the reviews

The reviewers consistently praised:

- Stateful per-model conversations.
- Shared grounding.
- Uniform fixture and artifact shims.
- Fail-loud HTML/schema extraction.
- Resumable persistence.
- Screenshot-based visual scoring.
- Explicit cost assumptions.

They also repeatedly raised:

- Native web-search tools are not equivalent.
- Transport differences affect speed and possibly output.
- Shared grounding is not a neutral research ledger.
- The prompt corpus is very large and contains conflicting instructions.
- Claude-specific intro language is awkward for non-Claude models.
- The No-GMB HQ phone rule differs from the reference page.
- Visual pixel scoring is sensitive to fonts, images, and small layout shifts.
- Speed should be separate from quality, which the current score now does.
- A valid JSON-LD parse is not the same as semantically correct schema.
- DeepSeek needs a separate evidence strategy because it cannot satisfy the live-search turn.
- The current score can hide the fact that structure/schema values cluster at identical levels.

### Historical findings that require date awareness

The older reviews flagged a results/source mismatch and approximate costs. The current saved results now contain measured provider usage and current schema-turn data, so those findings should be treated as historical issues that motivated later work, not automatically as current failures. Claude should still inspect the source and result contract before relying on any score.

---

## 12. Safety and reliability audit

### What is working

- Empty model output fails loudly.
- Explanatory chatter is not silently saved as page HTML.
- Schema extraction requires parseable JSON-LD.
- Provider retries are bounded.
- Long-running calls have timeout/backstop behavior.
- Search evidence is required for the guarded live-search turn.
- Results persist after model completion for resumability.
- Grok streaming and DeepSeek empty-response diagnostics were added after observed failures.
- Current provenance fields distinguish direct API, CLI/operator, deterministic, imported, and unknown sources in the broader system.

### What remains a real risk

1. **Search capability is heterogeneous.** The prompt is the same, but the search products are not.
2. **A null or weak verification verdict must never be silently interpreted as a clean pass.** Claude should verify the current implementation rather than assume the documented intent is enough.
3. **Search fees are outside the normalized cost number.** The dollar figures are measured model-token charges, not all-in API invoices.
4. **Historical cost blanks are unknown, not zero.**
5. **The model score is close to the noise floor.** A one- to three-point difference should not be treated as decisive without repetition.
6. **Reference similarity can reward copying.** A production page that improves on the reference could lose HTML/visual points.
7. **The shared grounding is a controlled input, not proof of live independent research.**
8. **Failed attempts can still incur charges.** A failure rate must be considered alongside successful-page cost.

---

## 13. My assessment and operating recommendation

### Recommended default

Use **Gemini 3.7 Flash** as the default page builder for cost-sensitive production runs, with:

- The current deterministic checker suite.
- A hard valid-HTML gate.
- A hard schema gate.
- A hard live-search-evidence gate where search is required.
- Link verification.
- Human review for factual claims and final conversion quality.

### Recommended escalation

Escalate to **Claude Sonnet 4.6** when:

- The page is commercially important.
- Gemini fails a gate or produces weak content.
- The page needs unusually deep local/entity writing.
- The operator wants the quality reference output for comparison.

### What not to do

- Do not choose DeepSeek because a failed attempt was cheap.
- Do not describe Gemini Flash as Claude CLI output.
- Do not pool June no-cost archives with current measured-cost runs without labeling the instrumentation difference.
- Do not treat a one-point tie as a statistically proven winner.
- Do not add provider-specific prompt patches that change the task without recording them.

### Best next benchmark

The next decisive experiment should run Gemini Flash and Claude Sonnet multiple times with:

- Identical immutable prompt/fixture hashes.
- A precomputed, cited research packet supplied to every model.
- Search-tool fees and model-token costs tracked separately.
- The same number of repetitions per model.
- Quality, speed, successful-completion rate, and total cost reported as separate axes.
- A semantic schema audit rather than JSON syntax alone.

That would answer whether Gemini's 67 was a repeatable quality result or a favorable single-run draw.

---

## 14. Claude Code handoff

### Mission

Review the Bake-Off evidence and determine whether the recommendation of Gemini 3.7 Flash as the cost-conscious default is supported by the saved artifacts, without changing production code during the first pass.

### Start here

1. Read this report.
2. Read `CLAUDE.md` and the Bake-Off artifact rules.
3. Inspect:
   - `scripts/src/bakeoff/providers.ts`
   - `scripts/src/bakeoff/conversation.ts`
   - `scripts/src/bakeoff/run.ts`
   - `scripts/src/bakeoff/cost.ts`
   - `scripts/src/bakeoff/score.ts`
   - `scripts/src/bakeoff/visual.ts`
   - `scripts/src/bakeoff/extract.ts`
   - `scripts/src/bakeoff/target.ts`
   - `scripts/src/bakeoff/miniPrompts.ts`
   - `scripts/src/bakeoff/types.ts`
4. Inspect current data:
   - `artifacts/bake-off/src/data/results.json`
   - `artifacts/bake-off/src/data/history/2026-08-31T19-36-25-511Z.json`
   - `artifacts/bake-off/src/data/history/2026-08-31T19-36-26-170Z.json`
   - `artifacts/bake-off/src/data/history/manifest.json`
5. Inspect qualitative evidence:
   - `scripts/src/bakeoff/output/reviews/*.md`
   - `scripts/src/bakeoff/output/judge-panel/*.json`
   - `scripts/src/bakeoff/output/judge-panel/mapping.json`
   - `docs/seo-aio-geo-judging-master-findings.md`

### Questions to answer

- Can you confirm Gemini Flash uses the direct Google adapter and `GEMINI_API_KEY`, not Claude CLI?
- Do the current result files' cost bases match the provider-reported token usage?
- Are web-search fees clearly excluded from the recorded model-token costs?
- Does the current composite use the weights documented in this report?
- Is speed excluded from the composite in the current source?
- Are errors with missing search evidence and empty output still fail-loud?
- Do the current result files and current source describe the same schema-generation path?
- Are structure/schema scores too compressed to decide a winner?
- Are current visual scores screenshot-based and directly comparable?
- Does any current output attribution incorrectly label Gemini as CLI or as a different provider?

### Verification expectations

Run the relevant non-mutating checks after diagnosis:

```bash
pnpm run typecheck
pnpm --filter @workspace/scripts run test
pnpm --filter @workspace/mc-core run test
pnpm --filter @workspace/bake-off run typecheck
```

If a source problem is found, do not fix it in the diagnosis pass. Report the exact file and recommended bounded change first. Do not read, print, or write secret values. Do not add any Replit-managed LLM integration.

### Expected handoff output

Return a concise review with:

1. Confirmed facts.
2. Disputed or stale claims in this report.
3. Reproducibility concerns.
4. Cost-accounting concerns.
5. Ranking confidence: high, medium, or low, with reasons.
6. Prioritized fixes, separated into must-fix and nice-to-have.
7. Whether Gemini Flash should remain the default recommendation.

---

## 15. Source index

### Primary data

- `artifacts/bake-off/src/data/results.json`
- `artifacts/bake-off/src/data/history/2026-08-31T19-36-26-170Z.json`
- `artifacts/bake-off/src/data/history/manifest.json`
- `artifacts/bake-off/src/data/old-bakeoff.json`
- `scripts/src/bakeoff/archive/2026-06-23-full-adherence/`

### Harness

- `scripts/src/bakeoff/providers.ts`
- `scripts/src/bakeoff/conversation.ts`
- `scripts/src/bakeoff/run.ts`
- `scripts/src/bakeoff/cost.ts`
- `scripts/src/bakeoff/score.ts`
- `scripts/src/bakeoff/visual.ts`
- `scripts/src/bakeoff/extract.ts`
- `scripts/src/bakeoff/miniPrompts.ts`
- `scripts/src/bakeoff/types.ts`

### Qualitative audits

- `scripts/src/bakeoff/output/reviews/claude.md`
- `scripts/src/bakeoff/output/reviews/gemini.md`
- `scripts/src/bakeoff/output/reviews/grok.md`
- `scripts/src/bakeoff/output/reviews/openai-std.md`
- `scripts/src/bakeoff/output/judge-panel/`
- `docs/seo-aio-geo-judging-master-findings.md`

### Verification record

The related provenance implementation was previously verified with full workspace typecheck, mc-core tests, API tests, scripts/Bake-Off tests, Page Terminal inventory tests, schema reconciliation, workflow restarts, and browser checks. That verification belongs to the provenance work; Claude should independently verify any new claim about the current Bake-Off source before changing code.
