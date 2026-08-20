# Bake-Off harness review — Gemini 3.1 Pro

- **Provider:** Google
- **Model:** `gemini-3.1-pro-preview`
- **Generated:** 2026-06-26T20:03:40.585Z (84s)

---

Here is a thorough, principal-level design review of the multi-LLM bake-off harness.

### 1. Overall Assessment
This is a highly engineered, production-grade evaluation framework. You have successfully solved one of the hardest problems in LLM benchmarking: faithfully evaluating a multi-step, stateful, UI-bound human workflow across different models without contaminating the test via model-specific prompt hacking. 

The architecture is sound, the abstraction boundaries (like the provider implementations) are clean, and the fail-loud philosophy is consistently applied. **Headline verdict**: This is an exceptionally rigorous testing harness. It achieves its goal of an apples-to-apples comparison. However, there are minor flaws in the scoring rubric (particularly visual diffing and speed), a hidden memory leak in the OpenAI polling loop, and an inaccurate cost-estimation proxy that need to be addressed to make it bulletproof.

### 2. Strengths
*   **The "Medium Shims" (`ARTIFACT_TO_INLINE`, `SCHEMA_TO_INLINE`)**: This is brilliant. Translating UI-bound instructions (e.g., "create an artifact", "wait for a human to verify the CID in the chat box") into headless API equivalents uniformly across all models preserves the structural integrity of the prompt without breaking the headless execution.
*   **One Shared Grounding**: Running the research phase once and passing the exact same prose to all models isolates the *instruction-following* and *generation* capabilities. You aren't testing who has better pre-training data for Billings, MT; you are testing who builds the best page.
*   **The Conflict-Precedence Ladder**: Found in `master-page-builder.txt`, this is top-tier prompt engineering. Explicitly defining a resolution order for colliding rules prevents unpredictable LLM behavior when constraints (word count vs. mandatory links) conflict.
*   **GMB / No-GMB Bifurcation**: Rather than altering OpenAI's prompt when it refused to build without a `page_url`, testing it in a parallel GMB scenario validates the model's behavior cleanly.

### 3. Fairness & Methodology
While generally excellent, there are a few areas where the comparison methodology slightly skews:

*   **Native Web Search Latency Penalty**: On the `seo-verify` turn, web search is toggled on. Claude handles this internally, but OpenAI (`responses` API) and Grok handle it through different native tools. Because `totalMs` tracks wall-clock time, models with slower native search implementations (or those penalized by the harness's own 5-second polling interval for OpenAI) are disproportionately punished in the speed score.
*   **OpenAI Polling Interval**: In `providers.ts`, OpenAI runs via the background Responses API and polls every `5_000` ms. Grok finished its `seo-verify` turn in 8.6s. OpenAI took 58.1s. It is highly likely the 5-second sleep interval artificially inflated OpenAI's execution time, directly hurting its `speed` score.
*   **OpenAI Reasoning Effort**: Hardcoded to `medium` (`OPENAI_REASONING_EFFORT`). While practical for preventing timeouts, pinning this prevents you from comparing the actual "frontier" capabilities of the `gpt-5.5-pro` model against Claude Opus. 
*   **Verdict Extraction Looseness**: `readVerdict` uses `/seo verification passed/i`. Because LLMs are prone to repeating prompt instructions, if a model writes *"I checked if the SEO VERIFICATION PASSED and it did not, therefore ❌ SEO VERIFICATION FAILED"*, your `lastMatchIndex` logic might correctly catch the failure, but the regexes are loose enough to invite false positives if the model gets chatty.

### 4. Prompt Engineering
*   **Master Fixtures**: Unusually rigorous. The strict formatting rules, explicit negative constraints ("DO NOT use em dashes"), and clear XML-like tags represent best-in-class context framing.
*   **Untrusted Input Exposure**: In `conversation.ts`, `hubSpoke` is injected directly into the `buildPrompt` without escaping. If the handoff text contains markdown formatting, code fences (`` ``` ``), or text that mimics prompt instructions, it could induce prompt injection / context confusion. 
*   **Lack of XML Wrapping for Inlined Files**: In `miniPrompts.ts`, `fileBlock()` injects files using simple text dividers (`══════════════════`). Given the massive size of the fixtures (~47k chars for the Design Bible), wrapping these in `<document name="...">...</document>` tags would significantly improve attention for Claude and Gemini, who are natively trained to parse XML blocks.

### 5. Scoring Rubric
The composite score has a few mathematical blind spots that could mislead you:

*   **Pixelmatch Brittleness (`visualMatch`)**: Rendering the page to a 1280x2400 PNG and using `pixelmatch` is incredibly strict. A single 2px shift in line-height or font rendering at the top of the page will cascade, causing every subsequent pixel to mismatch. A model could generate a structurally perfect page that scores a 20% pixel match simply because it used a slightly different margin. The vision-LLM fallback helps, but the average of the two is dangerous. **Recommendation**: Use structural DOM diffing, or apply heavy anti-aliasing/shift tolerance to the pixel diff.
*   **Speed Score Skew**: `clamp((fastestMs / m.totalMs) * 100)`. Because Grok is freakishly fast (165s total) compared to Claude Opus (579s) and GPT-5.5-Pro (793s), Grok gets 100 and the frontier models are mathematically crushed (Opus gets 29, Pro gets 21). Speed shouldn't linearly dominate quality. **Recommendation**: Use a logarithmic scale or set a reasonable baseline threshold (e.g., anything under 5 minutes gets 100).
*   **Word Count Ceiling Ignored**: `wordCountScore` uses `clamp((report.wordCount / floor) * 100)`. It penalizes falling under the floor, but ignores the hard ceiling. A model that hallucinates 6,000 words gets a perfect 100 for word count, even though `master-page-builder.txt` explicitly commands a ceiling of 2400/2800/3200 words.

### 6. Correctness, Bugs & Risks

*   **Memory / Handle Leak in OpenAI Polling (`providers.ts`)**:
    ```typescript
    while (resp.status === "queued" || resp.status === "in_progress") {
      await new Promise((r) => setTimeout(r, 5_000));
      resp = await client.responses.retrieve(resp.id);
    }
    ```
    This loop is wrapped in `withTimeout`. If the `withTimeout` 600s timer fires, the outer promise rejects, but **the `while` loop continues running in the background forever** because no `AbortSignal` is passed to the loop or the `client` to cancel the HTTP requests. This will silently leak memory and burn API quotas.
*   **Inaccurate Cost Proxy (`cost.ts`)**:
    You estimate output tokens using `assistantCharsForPhase`, which blindly assumes the `build`, `rebuild`, and `seo` phases output exactly `htmlChars` (the length of the *final* HTML document). This is false. A failed rebuild or the initial build might output significantly more or less text.
    *Fix*: You already track `PhaseTiming`. Add `rawChars: number` to `PhaseTiming` in `run.ts` (`t.rawChars = res.raw.length`) and use the actual character count for the cost estimate.
*   **Fragile JSON Unescaping (`extract.ts`)**:
    ```typescript
    const match = text.match(/"content"\s*:\s*"((?:\\.|[^"\\])*)"/);
    ```
    This regex attempts to unescape the Gemini `create_file` JSON block. If Gemini outputs a slightly different JSON structure (e.g., formatting newlines, adding other keys, or placing `content` at the end with a trailing brace), this regex will fail or heavily backtrack. You should slice from the first `{` to the last `}` and use `JSON.parse` directly.

### 7. Prioritized Improvements

1.  **Fix the OpenAI Polling Leak (High Impact)**
    *Rationale*: Prevents silent memory leaks and runaway API billing when the SDK times out. Pass an `AbortController` signal to the `while` loop and abort it in `withTimeout`.
2.  **Fix the Word Count Scoring (High Impact)**
    *Rationale*: The current rubric rewards runaway hallucination. Update `score.ts` to penalize word counts that exceed the `HARD_CEILING` specified in the audit rules.
3.  **Track Exact Turn Lengths for Cost Estimation (Medium Impact)**
    *Rationale*: Using the final HTML length as a proxy for all prior builds/rebuilds skews the cost estimate. Add `rawChars` to the `PhaseTiming` interface and use it in `cost.ts`.
4.  **Flatten the Speed Scoring Curve (Medium Impact)**
    *Rationale*: Grok's outlier speed mathematically ruins the composite score for deeper reasoning models; cap the penalty or use a logarithmic scale so quality isn't overshadowed by generation speed.
5.  **Wrap Inlined Fixtures in XML Tags (Medium Impact)**
    *Rationale*: Injecting 50k+ characters of text separated only by `══════` lines degrades LLM attention. Wrap them in `<fixture name="...">` to match native Claude/Gemini parsing optimizations.
6.  **Reduce OpenAI Polling Interval (Low Impact)**
    *Rationale*: Polling every 5,000ms artificially inflates OpenAI's `totalMs` and hurts its speed score. Reduce to 1,000ms or 2,000ms with exponential backoff.
