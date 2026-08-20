# Bake-Off harness review — OpenAI GPT-5.5

- **Provider:** OpenAI
- **Model:** `gpt-5.5`
- **Generated:** 2026-06-26T20:04:29.366Z (132s)

---

## 1. Overall assessment

This is a serious, well-instrumented multi-LLM page-generation harness, but it is **not yet a faithful apples-to-apples reproduction of the manual No-GMB workflow**. It is closer to: “run several models through a headless, API-adapted approximation of the VA checklist using shared fixtures, then score their final HTML against a Billings reference page.”

The architecture in `scripts/src/bakeoff/conversation.ts` gets the broad shape right: one growing conversation per model, fixed turn order, real master fixtures inlined, deterministic design gate, bounded rebuild/fix loops, checker pass, and persisted results. That is valuable.

The problem is the claims are stronger than the implementation supports:

- The dossier says the workflow is “byte-for-byte faithful,” but the harness adds substantial prompt shims (`ARTIFACT_TO_INLINE`, `SCHEMA_TO_INLINE`), a hardcoded No-GMB HQ phone, a shared model-authored research brief, and disables web tools on phases whose master prompts explicitly call for research.
- The run results are internally inconsistent with the current source: the latest results claim “deterministic schema” with 0.0s schema turns, while `conversation.ts` now runs schema as an AI turn with `master-schema-generator.txt`. That makes the reported leaderboard stale relative to the reviewed code.
- The scoring composite is useful for a dashboard, but it can easily mis-rank actual production quality because it over-rewards resemblance to the reference and under-validates factuality, schema semantics, and link correctness.
- Several “fail loud” gates are weaker than advertised: missing verification verdicts pass through, routed verification refusals do not trigger backup, the design gate is shallow, and link verification partly depends on model self-report.

**Headline verdict:** strong prototype and good engineering intent, but the methodology is not rigorous enough to support model-ranking conclusions yet. Treat current scores as exploratory, not as a defensible bake-off result.

---

## 2. Strengths

### Stateful conversation reproduction is a good core design

`runConversation()` in `conversation.ts` preserves a single growing `messages` history across intro → build → SEO → verify → schema → links. That is the right direction if the real VA workflow is a single Claude chat with accumulated context.

### Fixtures are centralized and fail-loud

`fixtures.ts` loads the master page builder, design file, SEO audit, schema generator, and SEO data sheet from committed fixtures and throws on missing/empty files. That is much better than ad hoc local paths or silent fallback.

### Extraction logic is more robust than typical LLM harnesses

`extract.ts` handles:

- raw `<!DOCTYPE html>…</html>`
- markdown chatter before/after
- JSON-escaped `create_file` wrappers
- schema script extraction with JSON parse validation

The tests in `extract.test.ts` cover real failure modes, especially models echoing `PAGE_BUILDER_V3` before the actual document.

### Uniform medium shims are at least explicitly documented

The artifact-to-inline shims in `miniPrompts.ts` are unavoidable in an API environment. The code documents that these are medium translations, not model-specific patches. That transparency is good.

### Resumability and persistence are practical

`run.ts` loads prior results and skips completed model/scenario pairs. It persists after each model and serializes writes through `persistChain`, which is important for long, expensive runs.

### Provider adapters isolate API differences reasonably well

`providers.ts` cleanly abstracts Claude, Gemini, OpenAI, and Grok behind `CompleteFn`. The adapters include timeouts, retries, web-search toggles, and output-token controls without contaminating the orchestration layer.

### The routed production mode is separated from the comparison path

`produce.ts` / `routed.ts` are clearly additive production modes and do not mutate the main comparison pipeline. That separation is healthy, even though routed mode itself has issues.

---

## 3. Fairness / methodology

### The comparison is not fully apples-to-apples

The system is closer than many bake-offs, but several choices bias results.

#### “One shared grounding” improves fairness but reduces fidelity

`generateSharedGrounding()` in `grounding.ts` authors a single brief using one model, then gives it to every model. That removes per-model research variance, which is good for isolating build/audit behavior.

But it also introduces bias:

- The grounding is **model-authored**, not live researched, and explicitly has no citations.
- It is likely authored by Claude in `run.ts` via `loadOrAuthorGrounding(prior.grounding, claudeComplete)`, so Claude’s style, assumptions, and entity choices become the base context for every model.
- The Master SEO Audit in `master-seo-audit.txt` expects a source-ledger research phase. The shared grounding does not satisfy that standard.
- The representative output contains unverified or stale factual claims, e.g. UN Global E-waste Monitor 17.4%, EPA 2.7M tons, IBM $4.88M, etc. Some are plausible, but the harness is not proving them.

This is fairer than letting each model research independently, but it is not faithful to a workflow whose prompts demand research and source verification.

#### Web search is only enabled on SEO-verify, despite master prompts needing search earlier

The dossier says native web search is attached only for the SEO-verify turn. In `conversation.ts`, only `runVerification(..., webSearch=true)` for `seo-verify` gets the provider tool.

But `master-page-builder.txt` and especially `master-seo-audit.txt` contain explicit web research / web_fetch / competitor research instructions:

- Page Builder Gate 8: competitor research
- Gate 11: city research
- SEO Audit Phase 0B: entity research, geography research, statistics research, competitor research

With web search disabled on build and SEO audit, the models can only:

1. use the shared grounding,
2. rely on prior knowledge,
3. hallucinate compliance with the research phases.

So the harness is not actually executing the master fixtures as written. This matters because SEO output quality is being judged after a “full SEO audit” that cannot perform much of its required evidence-gathering.

#### Provider web-search tools are not equivalent

Even on the SEO-verify turn, web search is not apples-to-apples in capability:

- Claude uses `web_search_20250305`.
- Gemini uses `googleSearch`.
- OpenAI uses Responses `web_search`.
- Grok uses xAI Responses `web_search` only on flagged turns.

These differ in retrieval corpus, citation availability, freshness, ranking, and tool-call behavior. The prompt says “search Google Search Central, Reddit…” but the adapters do not normalize sources or require citation output. One provider may search deeply, another may summarize from model memory.

A fairer approach would externalize search: run a deterministic SERP/retrieval step once, store the source snippets/citations, and hand the same evidence packet to every model.

#### Transport differences bias speed and maybe output quality

Speed is included in the score, but the transport paths are very different:

- Claude streams because non-streaming requests may exceed server limits.
- OpenAI uses background Responses polling.
- Grok uses chat completions except web-search turns, which use Responses.
- Gemini uses `generateContent`.

These are not just wrappers. Background polling, server-side job scheduling, hidden reasoning, streaming finalization, tool latency, and SDK retry behavior all affect wall-clock time. `speed` is therefore a provider transport metric as much as a model quality metric.

The run also defaults to concurrent model execution in `run.ts`. That is operationally efficient but can introduce uneven rate-limit/backpressure effects across providers. If speed is scored, runs should be sequential or repeated with randomized order.

#### Refusal handling is inconsistent

The stated rule is that refusals are recorded faithfully as errors. In build phases this is mostly true: no HTML means `extractHtmlDocument()` throws.

But verification phases are softer:

```ts
if (verdict === "failed") { ... }
if (verdict === "failed") throw ...
```

A `null` verdict is logged and treated as non-blocking pass-through. That contradicts the prompt’s explicit requirement to end with ✅/❌. If a model refuses, omits a verdict, or gives a vague report, it may pass.

In `routed.ts`, verification phase validation is `() => {}`. The comment says backup takes over on “error/refusal/invalid output,” but a refusal text is not detected unless the provider throws. That is a correctness gap.

#### Scenario comparison is contaminated by prompt-level changes

The No-GMB scenario now hardcodes the HQ phone in `miniPrompts.ts`:

```ts
export const HQ_PHONE = "844-699-2913";
```

This is explicitly described as a bake-off-only change to avoid model refusal. That is understandable operationally, but it means No-GMB is no longer “the exact production context.” The reference Billings page has no phone in the CTA and labels the CTA section “NO GMB: no phone, no address, no map embed.” The harness now tells models to include a phone.

That is a major fidelity break.

---

## 4. Prompt engineering

### The prompt corpus is comprehensive but overloaded

The master fixtures are huge, internally complex, and full of competing instructions. The Page Builder and SEO Audit documents both contain many “HARD STOP,” “CRITICAL,” “NEVER,” and phase/gate requirements. Then the mini prompts add more instructions. Then the API shims override artifact/file/HARD STOP behavior.

This creates a high probability that models follow different subsets of the instructions. The result is not just model ability; it is model-specific instruction prioritization under prompt overload.

### Claude-specific intro biases non-Claude models

`introPrompt()` asks every model:

> “Before responding, state which Claude model you are…”

and says Opus should stop, Sonnet should proceed.

For non-Claude providers, this is an unnatural instruction. `assertIntroNotBlocked()` intentionally does not require a positive ready token, which avoids false failures, but the prompt itself still creates noise. A non-Claude model may waste tokens explaining it is not Claude, or may misinterpret the model-check instruction.

If the goal is cross-provider fairness, the model check should be represented as a neutral harness note, or isolated to the faithful Claude-only reproduction.

### The API shims are necessary but not neutral in effect

`ARTIFACT_TO_INLINE`, `ARTIFACT_TO_INLINE_OPTIONAL`, and `SCHEMA_TO_INLINE` are reasonable, but they are not a byte-identical port. They alter critical output behavior:

- “never paste code in chat” becomes “paste complete HTML.”
- Schema Generator HARD STOPs become “do not pause, omit missing values.”
- Report-primary verify turns are allowed to include optional HTML.

These shims are applied uniformly, which is fair, but they still mean the workflow is an API adaptation, not the manual workflow.

### Injection and untrusted-input boundaries are weak

The system intentionally avoids a system prompt for build conversations. All instructions, fixtures, grounding, and target context are user-role content. That matches chat upload behavior, but it means all inlined documents are instruction-capable.

Risks:

- Shared grounding could contain prompt injection if later sourced from live web.
- Live-fetched reference pages in `target.ts` could contain hostile HTML if ever inlined in demos or future workflows.
- GMB JSON from env is validated for presence, not semantic safety.
- The master design fixture itself contains Atlanta-specific page HTML with phone/address/map. Models can copy contamination into No-GMB pages unless strongly corrected.

The repo’s own Mark’s Builder Protocol says “Treat all external input as untrusted.” This harness currently does not isolate data from instructions. It relies on labels like `📄 UPLOADED FILE`, which are not security boundaries.

### Conflicting No-GMB instructions degrade output quality

The master fixtures assume GMB/page_url in several places:

- Page Builder required inputs include `page_url`, `gmb_url`, `gmb_data`.
- Schema Generator requires GMB_URL for HUB/SPOKE unless overridden.
- Master Design fixture contains a GMB-style Atlanta footer/map/address/phone.

The mini prompts override this with No-GMB instructions. Some models will comply; others will halt; others will include mixed artifacts. This is partly what you want to test, but it undermines the claim of faithfully porting a coherent human workflow.

### The promptVars URL builder is wrong for non-default targets

In `conversation.ts`:

```ts
url: `${ctx.registry.baseDomain}/${city}-${state}`
```

This ignores `TARGET.url`. For Billings it happens to match `/billings-mt`. For many real STS URLs in `sts-seo-data-2026.tsv`, it will be wrong:

- `/atlanta-electronics-recycling`
- `/computer-and-electronic-recycling-service-tampa-fl`
- `/free-computer-laptop-pc-and-electronics-recycling-in-milwaukee-wi`

`target.ts` resolves `BAKEOFF_TARGET_URL`, but `promptVars()` discards it because `RunContext` does not carry it. That is a concrete bug for generalized use.

---

## 5. Scoring rubric

### The composite is useful but can mislead

Weights:

```ts
audit: 0.20
structure: 0.10
schema: 0.10
links: 0.10
wordCount: 0.05
speed: 0.05
htmlMatch: 0.20
visualMatch: 0.20
```

This heavily rewards closeness to the reference: 40% combined HTML/visual match. That is appropriate only if the goal is “reproduce this exact Billings page.” It is less appropriate if the goal is “build the best production page using the workflow.”

A model can score well by copying the design skeleton and broad content while still failing important SEO/factual constraints.

### Structure score appears broken or low-resolution

All successful models in the latest run show `structure: 50`. That suggests `structureScore()` is not discriminating. It uses `extractStructuralSignals()` and awards points for root CSS, section sequence, equipment titles, and sacred URLs. If every model gets 50, this metric is not adding useful signal.

Given the representative Claude page is missing several sacred equipment links in the equipment list compared with the canonical 10, a structure/link metric should reflect that more strongly.

### Schema score is too shallow

`schemaScore()` returns 100 if JSON parses and the checker’s schema check passes. But the current source now asks models to produce full JSON-LD via `master-schema-generator.txt`; that should be validated semantically:

- required graph objects present,
- correct @ids,
- no streetAddress/CID in No-GMB,
- telephone policy,
- FAQ count,
- HowTo steps,
- Breadcrumb `item` fields,
- no competitor mentions,
- no aggregateRating unless sourced,
- no placeholders,
- no invented coordinates/neighborhoods.

`extractSchemaJson()` only validates JSON syntax. `parseSchema()` is likely not enough for the schema generator’s 17-point contract.

Also, the latest run results show `schema: 100` while the schema timing line reports 2–4 checker errors. That should be investigated. Either schema errors are not schema-check errors, or the score is masking real page errors.

### Link score is not enough

`linksScore()` uses `report.linkAudit`, but the harness also asks the model to self-verify links in `verifyLinksPrompt()`. Model self-verification is not a reliable audit.

Concrete gaps:

- No actual HTTP HEAD/GET validation.
- No canonical allowlist enforcement surfaced in score.
- No explicit penalty for missing sacred equipment links if link audit passes.
- No robust detection of invented city URLs beyond checker internals.

The representative Claude page appears to include fewer than the 10 sacred equipment links in the visible equipment section, yet link score in results can be 100 for some models. That is a red flag.

### Word-count floor is a crude metric

`wordCountScore()` rewards reaching a floor. It does not penalize:

- bloat,
- duplicate content,
- keyword stuffing,
- unverifiable claims,
- exceeding Page Builder ceiling,
- poor section balance.

A 2,800-word page with hallucinated facts can beat a tighter 1,900-word page with cleaner compliance.

### Speed should not be in the quality composite

Speed is operationally important, but combining it with quality can distort model ranking. In the run, Grok gets `speed: 100` and low audit quality; OpenAI Pro gets penalized heavily for time. That is useful cost/performance information, but it should be a separate axis, not blended into a quality score.

### HTML match rewards lexical overlap, not semantic correctness

`htmlMatchScore()` combines tag frequency cosine and visible-text Jaccard. This can reward:

- copying the reference’s words,
- preserving boilerplate,
- matching common STS vocabulary,

while missing actual production issues. It can also penalize legitimate improvements or target-specific variations.

### Visual scoring is better than token proxy but still fragile

`visual.ts` is a good start, but the current method has limitations:

- Fixed 1280×2400 screenshot captures only the top slice of a long page. Much of the Billings reference is below 2400px.
- `page.setContent(html, { waitUntil: "load" })` plus 800ms wait may not load external fonts/images consistently.
- External assets may fail in the environment, making pixel scores partly network-dependent.
- Pixelmatch is very sensitive to small vertical shifts, font rendering, missing images, or dynamic form placeholders.
- The optional vision judge uses Claude, which introduces provider bias into a cross-model comparison.
- The vision prompt asks for a score but not calibrated examples; scores may drift run-to-run.
- Combining pixel and LLM as a simple mean is arbitrary.

The `visualTokens` fallback is transparent, but very weak: class/color overlap can be high even when the rendered page is visibly wrong.

---

## 6. Correctness, bugs & risks

### Major: latest results are stale relative to current source

The dossier’s “latest run” says:

- schema phase is deterministic,
- schema turn takes 0.0s,
- notes say “Auto-Generate Schema” / deterministic schema.

But `conversation.ts` now runs schema as a model turn:

```ts
const schemaRaw = await send("schema", schemaUser, ...)
const schema = extractSchemaJson(schemaRaw, "schema");
```

and `run.ts` notes now say schema is a real AI turn.

This invalidates the included leaderboard as evidence for the current harness. You cannot review current methodology using old results without clearly labeling them as archived.

### Major: No-GMB HQ phone breaks production fidelity

`miniPrompts.ts` explicitly changes No-GMB behavior by injecting `HQ_PHONE` into build, SEO, SEO-verify, verify-links, and schema prompts. The comment admits this is bake-off-only and production is untouched.

That may reduce refusals, but it is not “the exact production context.” It also diverges from the Billings reference page, which intentionally has no phone/address/map in the No-GMB CTA.

### Major: URL generation ignores target URL

`promptVars()` in both `conversation.ts` and `cost.ts` constructs URL from city/state instead of using `TARGET.url`. This will produce wrong prompts, canonical expectations, schema URLs, and scoring context for many real pages.

Fix requires adding `url` to `RunContext` or passing `BakeoffTarget` into prompt var generation.

### Major: missing verdict is treated as success

`runVerification()` treats `verdict === null` as non-blocking. For a gated prompt requiring an explicit final verdict, this should fail or retry. Otherwise a model can skip the required audit and proceed.

### Major: routed backup does not actually catch refusals on verification

In `routed.ts`, verification `runPhase()` uses `validate: () => {}`. A textual refusal or missing verdict succeeds. This contradicts `routing.ts`/`routed.ts` comments that backup takes over on refusal/invalid output.

### Major: SEO audit claims research but has no search tool

The SEO audit file instructs the model to do web research and source-ledger work. The `seo` turn in `conversation.ts` does not enable web search. This is a large semantic mismatch.

### Race / persistence risk: concurrent runs mutate shared scenario arrays

`run.ts` runs pending models concurrently and each `runModel` pushes into `scenario.models`, then queues persistence. The serialized write chain avoids interleaved file writes, but the array can be mutated by multiple async completions before a queued persist executes. In practice JS is single-threaded, so it will not memory-corrupt, but persisted intermediate states may include models that finished after the persist was queued. That is probably acceptable, but it makes “persisted immediately after every model” not strictly true.

### Retry/cost trap: background jobs may continue after timeout

`guarded()` retries thrown provider calls. For OpenAI background jobs, if polling times out or the harness throws after job creation, the server-side job may continue and still bill. Retrying can duplicate expensive long-running generations. There is no cancellation call.

### Cost estimates are too approximate for reporting dollars

`cost.ts` estimates tokens by characters/4 and does not use provider-reported usage. It excludes hidden reasoning tokens and web-search fees. For OpenAI Pro, this can be materially wrong. The reported `$12.09` etc. should not be presented as actual cost.

### Model discovery hurts reproducibility

`discoverNewestGrok()` chooses the latest general Grok tag at runtime. That makes reruns non-reproducible unless the model tag is pinned. Results persist the tag, but methodology changes silently when xAI releases a new model.

### Schema helper/test drift

`gmb.ts` still contains deterministic `generateNoGmbSchema()` and `generateGmbSchema()` functions with tests in `gmb.test.ts`, but `run.ts` no longer uses them for schema. Tests now lock behavior of dead or demo-only code while the real AI schema path has little semantic test coverage.

### `schema-demo.ts` and comments are out of sync with model lineup

`schema-demo.ts` says the line-up is GPT-5.4, Sonnet 4.6, Grok, Gemini, while `run.ts` uses Opus 4.8, Gemini 3.1, GPT-5.5 Pro, GPT-5.5, GPT-5.4, Grok. This is minor but contributes to confusion.

### Design gate is very shallow

`evaluateDesignGate()` checks:

- one H1 containing city,
- some form marker,
- viewport,
- any `@media`.

It does not check:

- form is on the right,
- master design CSS unchanged,
- absolute image URLs,
- required sections,
- no GMB address/map,
- real mobile rendering,
- visual match,
- sacred links,
- metadata comment.

The “design gate” is mostly a syntactic preflight.

### Extraction can concatenate multiple documents

`sliceDocument()` starts at the earliest doctype/html and ends at the last `</html>`. If a model includes two complete HTML documents, extraction returns everything from first start to last end. Better to extract the first complete document or the largest valid fenced block, then validate single-document structure.

### Schema extraction does not enforce “exactly one script”

`SCHEMA_TO_INLINE` says entire reply must be exactly one script block. `extractSchemaJson()` accepts the last script block and ignores extra prose or earlier scripts. That is forgiving but not fail-loud.

### GMB illustrative data is dangerous if surfaced

`BILLINGS_GMB` uses fake CID/address/phone. The context labels it illustrative, but the GMB schema prompt says:

> “verified Google Business Profile data for this page”

That is internally contradictory. For a bake-off experiment, okay; for any production path, dangerous. `produce.ts` does require `BAKEOFF_GMB_JSON` for non-Billings, but Billings default can still generate fake GMB-looking output.

### Reference fixture and master design fixture conflict

`master-design-tier2.html` is Atlanta, includes phone/address/map/root-relative images. The Billings reference is No-GMB, no phone/address/map, absolute images. Models are asked to adapt the Atlanta design while No-GMB prompts prohibit local data. This is probably how the human process works, but it is a contamination vector and should be explicitly scored.

---

## 7. What’s missing / what to do better

Prioritized, highest impact first:

1. **Re-run results with the current source and label old results archived.**  
   Current leaderboard is not valid because schema methodology changed from deterministic to AI-turn.

2. **Remove or scenario-isolate the HQ phone modification.**  
   If the goal is faithful No-GMB, do not add `HQ_PHONE`; if you want “No-GMB with HQ fallback,” make it a third scenario.

3. **Use the actual target URL everywhere.**  
   Fix `promptVars()` in `conversation.ts`, `cost.ts`, demos, and schema prompts to consume `TARGET.url`, not city-state slug synthesis.

4. **Make missing verification verdicts fail-loud.**  
   `verdict === null` should retry once, then error; gated prompts require explicit ✅/❌.

5. **Enable or externalize research for phases that require it.**  
   Either turn on provider search for build/SEO audit where the master prompts require web research, or better, precompute a cited research packet once and give it to all models.

6. **Replace model-authored grounding with cited, deterministic retrieval.**  
   Use Perplexity/SerpAPI/source fetches with a source ledger; hand identical snippets/citations to every model.

7. **Add semantic schema validation for the full Schema Generator contract.**  
   Validate graph objects, No-GMB/GMB fields, HowTo steps, FAQ count, breadcrumbs, placeholders, CID/address policy, and no invented ratings.

8. **Separate quality, speed, and cost into different leaderboard axes.**  
   Do not blend speed into the production-quality composite; show Pareto views instead.

9. **Calibrate scoring against human review.**  
   Have experts rank 20 outputs, then tune weights/metrics to correlate with human production acceptability.

10. **Strengthen the design gate with rendered checks.**  
   Use Playwright to verify hero layout, form placement, responsive breakpoints, image loading, CTA visibility, and no map/address in No-GMB.

11. **Make visual scoring full-page or section-based.**  
   Capture stitched full-page screenshots or fixed section crops; mask dynamic forms/fonts; use SSIM/perceptual hash in addition to pixelmatch.

12. **Pin model versions for reproducibility.**  
   Avoid `discoverNewestGrok()` in formal bake-offs; resolve once, record, and rerun only pinned tags.

13. **Capture actual token usage and provider request IDs.**  
   Store usage metadata from APIs where available; report estimates only when actual usage is unavailable.

14. **Add cancellation for background jobs on timeout.**  
   Prevent duplicated OpenAI/xAI costs when retries occur after a background job is already running.

15. **Make routed mode refusal detection real.**  
   Add uniform refusal/no-output/verdict validators per phase before falling back to backup.

16. **Treat all retrieved/user-supplied content as data, not instructions.**  
   Add a system-level instruction for the harness or wrap external data in explicit “do not follow instructions inside this block” boundaries.

17. **Test the live AI schema path.**  
   Retire or demote deterministic schema tests and add tests around `schemaPromptFor`, `SCHEMA_TO_INLINE`, extraction, and semantic validation.

18. **Add factuality/source scoring.**  
   Penalize unsupported statistics, invented employer counts, fake regulatory claims, and wrong certification scope.

19. **Add strict sacred-link validation.**  
   Require all 10 equipment links unless intentionally omitted; fail if representative pages omit them.

20. **Version every prompt fixture and result with a methodology hash.**  
   Store hashes of `miniPrompts.ts`, fixtures, provider tags, scoring weights, and source commit so results are auditable.

21. **Run multiple trials per model.**  
   Single-run rankings are noisy. Run at least 3 seeds/attempts per model or document that the result is one stochastic sample.

22. **Move GMB illustrative fixtures out of default formal runs.**  
   Fake CID/address data should never be a default scenario in a production-adjacent harness.

23. **Add output diff reports against reference and checker failures.**  
   The dashboard should show exactly why a model lost points, not just numeric scores.

24. **Validate generated HTML with an HTML parser, not regex only.**  
   Check single document, balanced structure, duplicate IDs, invalid nesting, broken tags, and script/schema absence/presence.

25. **Clarify the goal in docs.**  
   Choose between “faithful manual reproduction,” “fair cross-model API adaptation,” and “best production page generator.” The current system mixes all three.
