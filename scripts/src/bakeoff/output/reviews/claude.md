# Bake-Off harness review — Claude Opus 4.8

- **Provider:** Anthropic
- **Model:** `claude-opus-4-8`
- **Generated:** 2026-06-26T20:04:04.202Z (107s)

---

# Design Review: Multi-LLM Bake-Off Harness

## 1. Overall Assessment

**What it is:** A purpose-built, out-of-tree harness that re-implements STS's manual "No-GMB" page-build workflow as a stateful, multi-turn conversation driven across 6 frontier model configurations, then scores each model's output page against a real published reference on a weighted composite.

**Does it achieve its stated goal?** *Mostly, but with a meaningful gap between the claim and the reality.* The architecture is genuinely thoughtful — the single shared grounding, the verbatim prompt port, the inlined fixtures, the stateful-history design, and the fail-loud discipline are all real engineering, not theater. The dossier is unusually honest about its own seams (the `ARTIFACT_TO_INLINE` shim, the cost-estimate caveats, the "EXPERIMENTAL" GMB labeling). That honesty is the best thing about this system.

**Headline verdict:** **A strong, well-documented harness with a fairness problem it has not fully reckoned with.** The phrase "apples-to-apples" is repeated like an incantation, but several transport-layer and prompt-layer differences are quietly *not* apples-to-apples, and at least one is doing real work in the results. The scoring composite has structural weaknesses that make the headline number (76 vs 76 vs 75 vs 73…) far less meaningful than it looks — the models are clustered inside the noise floor of the rubric. The single biggest credibility issue: **the dossier's own results section contradicts its own prompt/source code** (deterministic schema in results vs. AI schema turn in the source), which means the results shown were produced by an *older* version of the harness than the one being reviewed.

I'd ship this as an internal decision aid with explicit caveats, but I would **not** present these composite scores to anyone as a rigorous model ranking without the fixes in §7.

---

## 2. Strengths

- **The faithfulness instinct is correct and well-executed.** One stateful conversation per model (`conversation.ts`), full history re-sent every turn, real fixtures inlined (`fixtures.ts`, fail-loud on missing/empty), one shared grounding (`grounding.ts`) — this is the right shape for reproducing a chat workflow.

- **Fail-loud is real, not aspirational.** `extractHtmlDocument` throws rather than storing chatter as a page; `extractSchemaJson` validates JSON before accepting; `loadDesignFixtures` refuses to run on empty fixtures; `assertIntroNotBlocked` surfaces refusals. The `extract.test.ts` suite specifically guards the nastiest real-world case (Claude echoing `<!-- PAGE_BUILDER_V3` before the real doc; Gemini's `create_file` JSON-escaped wrapper). This is the kind of defensive parsing that earns trust.

- **Resumability is production-grade.** `run.ts` persists after every model through a serialized `persistChain`, skips already-recorded results, and survives process reaping. The concurrent-with-serialized-writes design is correct.

- **Honesty about estimates.** `cost.ts` documents every assumption (4 chars/token, list prices, no caching discount, reasoning tokens excluded, web-search fees excluded). This is exactly how to present a fuzzy number.

- **The visual judge is a genuine upgrade** over CSS-token diffing — real headless render + pixelmatch + vision-LLM, fixed viewport so diffs are comparable (`visual.ts`).

- **The GMB scenario design is principled** — sibling scenarios rather than patching one model's prompt is the right way to preserve comparability when a model refuses.

---

## 3. Fairness / Methodology — The Core Problem

This is where the "apples-to-apples" claim breaks down under scrutiny.

### 3.1 The per-turn web-search knob is NOT apples-to-apples

Each provider attaches its *native* web-search tool on the seo-verify turn (`providers.ts`): Claude `web_search_20250305`, Gemini `googleSearch`, OpenAI/Grok `web_search` via Responses. These are **not equivalent capabilities**. They differ in:
- recall, freshness, and number of results,
- whether the model actually searches or no-ops,
- latency and cost (acknowledged but not measured),
- how results fold into the answer.

You've held the *prompt* identical, but the *capability* is heterogeneous. A model with a stronger search tool produces a better seo-verify pass, which affects the verdict gate and (via corrective loops) the final HTML. Calling this "the capability analogue of `ARTIFACT_TO_INLINE`" is a category error: `ARTIFACT_TO_INLINE` is a uniform text shim; the web-search tools are *different products*. This is a real confound and it is unmeasured.

### 3.2 The streaming/background transport differences are larger than admitted

`providers.ts` runs four genuinely different transport paths:
- Claude: streaming `.finalMessage()`
- Gemini: single `generateContent`
- OpenAI: **background job + 5s poll loop**, with `reasoning.effort` pinned to `medium` for pro tiers
- Grok: chat/completions normally, but **Responses+poll on the web-search turn only**

The comment says "transport change only… stays apples-to-apples." But pinning **OpenAI pro reasoning effort to `medium`** while Claude/Gemini run at their defaults is **not** a transport change — it's a capability throttle applied to one vendor. GPT-5.5-PRO is being run at reduced reasoning, then scored against Claude/Gemini at full effort, and it lands at composite 73 (lowest of the OpenAI tier) and the worst speed score. You've handicapped the model and then ranked it. That needs to be stated loudly or removed.

### 3.3 The intro gate's asymmetry favors non-Claude models

`assertIntroNotBlocked` only hard-fails on a refusal/STOP; it does **not** require the Claude-specific readiness token, with an explicit rationale that non-Claude models honestly saying "I'm not Claude, I can't rename the chat" is benign. That's a reasonable accommodation — but it means **Claude is being run against a checklist literally written for Claude** ("state which Claude model you are," "If you are Sonnet 4.6, reply…"). The intro prompt names Claude, names Opus, names Sonnet 4.6. Every non-Claude model gets a prompt that is, at the intro, slightly nonsensical for it. This is a home-field advantage baked into the verbatim port. Faithful? Yes. Apples-to-apples? No.

### 3.4 The HQ phone shim quietly rewrites the task for one failure mode

`HQ_PHONE` (844-699-2913) is documented as existing because "the absent phone/address… pushed at least one model to treat the absent phone/address as 'required inputs missing' and refuse to build." So the harness *did* special-case around a model's refusal — by changing the prompt for **everyone**. That's defensible as uniform, but it's the opposite of the "never patch away a refusal" principle stated in §1. The dossier should reconcile these: you patched a refusal at the prompt level, you just did it uniformly. Fine — but say so.

### 3.5 The grounding author is Claude

`run.ts` authors the shared grounding via `claudeComplete`. The grounding is identical across models (good), but it is *Claude's* prose, in *Claude's* voice, which Claude then consumes. Slight stylistic affinity advantage to Claude. Low-severity, but worth a one-line disclosure, and trivially mitigated by authoring grounding with a neutral/cheap model or rotating.

### 3.6 Schema turn: results contradict source

This is the most serious methodological issue. The **source** (`conversation.ts`, `miniPrompts.ts`, `schema-demo.ts`) drives schema as a *real AI turn* with `SCHEMA_TO_INLINE` and `extractSchemaJson`. The **results section** says schema is *deterministic* ("Deterministic schema (No-GMB: no CID, no street address)… generated deterministically with no AI turn") and shows `schema: 0.0s`. **The results were produced by a different (older) harness than the code under review.** Any reviewer relying on these results to validate this code is being misled. Re-run before publishing, or label the results as stale.

---

## 4. Prompt Engineering

**Strengths:** The verbatim port is faithful, the shims (`ARTIFACT_TO_INLINE`, `..._OPTIONAL`, `SCHEMA_TO_INLINE`) are each well-reasoned and uniformly applied, and the verdict-parsing (`readVerdict` using *last* match so a quoted rubric doesn't override the final line) is a sharp, correct detail.

**Problems:**

- **Massive untrusted-input surface, zero sanitization.** The master fixtures (~212K chars) are concatenated raw into every turn. `master-seo-audit.txt` and `master-page-builder.txt` contain HARD STOP directives, "HALT" instructions, and imperative system-style language ("CRITICAL SYSTEM INSTRUCTION… Execute ALL steps"). These are effectively a giant instruction-injection payload that the harness *trusts implicitly* — directly violating the repo's own "Treat all external input as untrusted" protocol in `replit.md`. The fixtures are first-party today, but the architecture has no boundary; a future edit to a fixture is an unreviewed prompt change to all models. There is no validation that fixtures haven't drifted.

- **Prompt overload / contradiction.** The Master SEO Audit alone is 83K chars with 16 mandatory techniques, conflict-precedence ladders, and self-referential version-change logs (`v10.12.4` HARDENING notes about fixing a paraphrase-in-quotes bug). Stuffing this into a single turn and expecting faithful execution across models with different context-handling is optimistic. Models that summarize vs. execute will diverge for reasons unrelated to capability. The reference page itself only places 4 entities and hits "competition: LOW" — the prompt's elaborate machinery is largely unexercised.

- **The intro `MODEL CHECK` is actively harmful for non-Claude models** (see §3.3). It should be neutralized in the harness port (a uniform "state your model" with no Claude-specific branch).

- **Ambiguity in the HQ-phone contract** creates a scoring trap: the build prompt says use `844-699-2913` as a `tel:` link, but the *reference page itself has no phone at all* (it's a No-GMB page with no call buttons). So every model is instructed to add a phone the gold page omits — which can only *hurt* HTML/visual closeness. The instruction and the reference are inconsistent.

---

## 5. Scoring Rubric

The weighting is `audit .2 / htmlMatch .2 / visualMatch .2 / structure .1 / schema .1 / links .1 / wordCount .05 / speed .05`. Several problems:

- **The composite is inside its own noise floor.** Final spread is 72–76 across six very different models. `htmlMatch` (cosine over *tag-name frequency* + Jaccard over text tokens) and `visualMatch` are both rewarding **template adherence**, and every model is filling the *same* design fixture — so they all converge. `structure` is hardcoded at **50 for every single model**. When 10% of the weight is a constant and 40% rewards copying a shared template, the composite mostly measures "did you follow the inlined CSS," not "which model is better." The ranking is not robust.

- **`htmlMatch` rewards the wrong thing and double-counts with `visualMatch`.** Tag-frequency cosine is gameable and largely redundant with the perceptual visual score. Two of the eight metrics (40% of weight) are near-duplicate "did it look like the template" signals. A model that produced a *better* page than the reference would be *penalized*.

- **`auditScore` (−12/error, −2/warning) is brittle and miscalibrated.** Grok shows audit=52 (4 schema errors) but Grok's schema validated fine and scored 100 on the schema axis — the audit and schema axes are double-penalizing the same schema check, and the −12 cliff makes audit swing wildly on a single checker disagreement.

- **`schemaScore`** awards 55 for an error-severity schema check even when `schemaValid` is true — arbitrary constants (55/80/100) with no documented basis.

- **`wordCountScore`** is `(wordCount/floor)*100` clamped — but the *schema turn's* word count is being reflected onto the page (`schemaTiming.wordCount = report.wordCount`), and the values shown (1057–1438) look like they're measuring the wrong thing. This metric is muddled.

- **Visual scoring soundness is moderate.** Pixelmatch over a fixed 1280×2400 clip is reasonable, but: external images/fonts "may or may not resolve" (`render` swallows load failures), so two pages can differ on whether a CDN font loaded, not on design. The vision-LLM judge is **Claude judging pages, including Claude's own page** — a conflict of interest. The `combined = mean(pixel, llm)` averaging two weakly-correlated signals of different reliability is crude. And the LLM rating is non-deterministic (no temperature pin, single sample).

- **Speed at 5% but `htmlMatch`+`visualMatch` at 40%** means a 13-minute GPT-5.5-PRO run barely pays for being slow while a template-copy dominates. Whether that's the right business weighting is undefended.

---

## 6. Correctness, Bugs & Risks

- **Results/source mismatch (critical, §3.6).** Re-run or relabel.

- **`scoreModels` reads `report.wordCount` from the schema turn but real page word count isn't measured cleanly.** The "wordCount" axis appears to conflate schema JSON size with page content. Verify what's actually being counted.

- **`htmlMatch`/`visualMatch` degrade silently to 0 when the reference is unavailable** (`loadReferenceHtml` returns `""`, `source: "none"`). A run against a new city with no fixture and a failed fetch would produce a 0 on 40% of the composite for *every* model and still emit a confident ranking. This should hard-skip closeness scoring, not zero it.

- **Verdict gate can pass on a null verdict.** `readVerdict` returns null when no marker is found, and the verification loop treats null as pass-through. A model that simply never emits `✅ SEO VERIFICATION PASSED` (and never fails either) sails through ungated. Faithful-ish, but it means "passed" in the results doesn't mean what it appears to.

- **Background poll loops have no max-iteration cap** beyond the wall-clock race in `withTimeout` — but the poll loop itself (`while queued|in_progress`) is only bounded by `WALL_CLOCK_MS` via the outer `guarded`/`withTimeout` wrapper for OpenAI; the Grok web-search poll loop in `makeGrokComplete` is **not** wrapped in `guarded`'s timeout the same way for the responses branch… actually it is inside `guarded`, but the inner `client.responses.retrieve` calls each carry their own SDK timeout while the loop can spin. Worth confirming a stuck `in_progress` can't burn budget for 10 minutes per turn × retries.

- **Cost trap:** GPT-5.5-PRO at $12.09 for one page (and the full sweep is 12 model-runs × 2 scenarios). The `maxOutputTokens` 64K + reasoning means a runaway pro turn is expensive. No per-run cost ceiling / circuit breaker exists.

- **Concurrency vs. provider rate limits.** `Promise.all` fans out all 6 models per scenario simultaneously, each re-sending ~200K-char histories every turn. That's a lot of TPM pressure; one model 429ing mid-conversation surfaces as a model error (acceptable) but inflates that model's failure rate for reasons unrelated to capability.

- **`unfence` only strips a fence if the *entire* response is one fenced block** (`^```…```$`). Partial/leading fences fall through to `extract`, which is fine for HTML but means `res.content` (vs `res.raw`) is unreliable; thankfully the conversation uses `res.raw`.

- **Design gate `{loadposition ...form}` acceptance** is correct for faithfulness but means "form on RIGHT" is never actually verified — the gate accepts a Joomla tag and can't see layout. The gate's "mobile responsive" check is just "has `@media`," trivially satisfied by the inlined CSS, so it gates on essentially nothing for these template builds.

---

## 7. What's Missing / What To Do Better (prioritized)

1. **Re-run the harness so results match the source, or label the results stale.** *Right now the dossier reviews code that didn't produce its own numbers.*

2. **Stop pinning OpenAI pro reasoning to `medium` while others run default — or disclose it as a handicap on every chart.** *You are ranking a throttled model against full-effort models.*

3. **Measure and disclose the web-search asymmetry; ideally run seo-verify both with and without search, or with one shared search provider.** *Different native tools are different capabilities, not a uniform shim.*

4. **Fix the composite: drop `htmlMatch` OR `visualMatch` (they double-count template adherence), make `structure` actually vary (it's a constant 50), and report per-axis scores as the headline instead of a composite inside its noise floor.** *The current ranking is not statistically meaningful.*

5. **Replace the Claude vision-judge for Claude's own pages (and pin temperature + take ≥3 samples).** *Self-judging is a conflict of interest; single non-deterministic sample is unreliable.*

6. **Neutralize the Claude-specific intro `MODEL CHECK` in the port.** *It's home-field advantage; a uniform "identify yourself" removes it without losing the STOP semantics.*

7. **Add a fixture-integrity gate (hash + size check) and treat fixtures as untrusted per your own protocol.** *212K chars of imperative text injected unguarded into every model violates `replit.md`'s stated rule.*

8. **Hard-skip closeness scoring (don't 0 it) when no reference is available, and never emit a composite that silently includes a 0-from-missing-reference.** *Prevents confidently-wrong rankings on new cities.*

9. **Reconcile the HQ-phone contract with the reference page** (the gold page has no phone; you instruct models to add one). *Either add the phone to the reference or stop scoring closeness against a page that intentionally omits it.*

10. **Add a per-run cost ceiling / circuit breaker.** *A $12 pro run with no cap is a budget hazard at scale.*

11. **Treat the null-verdict case explicitly** — log it distinctly from "passed" so a model that never emits a verdict isn't recorded as having passed the gate.

12. **Increase sample size to N>1 per model.** *One run per model with non-deterministic models and a 4-point composite spread is not enough signal to rank anything. Report means ± variance.*

The bones are good and the discipline is real. The fixes above are mostly about *honesty in presentation* and *removing confounds you've already half-noticed* — not rearchitecting.
