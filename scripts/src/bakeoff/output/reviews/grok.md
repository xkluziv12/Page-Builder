# Bake-Off harness review — Grok (xAI)

- **Provider:** xAI
- **Model:** `grok-4.3`
- **Generated:** 2026-06-26T20:02:48.392Z (31s)

---

**Overall assessment**  
The harness is a high-fidelity, stateful reproduction of the exact VA "No-GMB" checklist workflow (verbatim `copyPrompt()` turns + the three real uploaded master files + one shared grounding brief). It drives every model through the identical sequence—intro handshake → build → deterministic design gate + bounded rebuild loop → SEO audit → SEO-verify (live web search) → schema (now a real AI turn with the Schema Generator file) → link verification—while applying the same medium shims (`ARTIFACT_TO_INLINE*`, `SCHEMA_TO_INLINE`) uniformly.  

It largely achieves its stated goal. The comparison is apples-to-apples within each scenario; the only material deviation from the human workflow is the transport layer (API vs. Claude.ai chat) and the optional GMB enrichment arm (only present when a verified block is supplied). Headline verdict: production-grade and methodologically sound, with the remaining fairness gaps being explicit and bounded rather than hidden.

**Strengths**  
- Prompt and fixture fidelity is byte-perfect (`miniPrompts.ts`, `fixtures.ts`).  
- Fail-loud + gated verification loops with bounded corrective retries (`conversation.ts:240-270`).  
- Shared grounding authored once and reused identically (`grounding.ts`).  
- Cost estimation replays the actual recorded turn sequence rather than guessing (`cost.ts`).  
- Screenshot-based visual scoring (pixelmatch + optional vision-LLM) replaces the old design-token proxy for the headline metric (`visual.ts`).  
- Resumable + per-model persistence (`run.ts`).

**Fairness / methodology**  
The single shared grounding and uniform per-turn web-search knob (only on seo-verify) are correctly implemented. Streaming/background differences are accepted rather than papered over. Refusal handling is strict and correct—no per-model special-casing.  

The only real bias vector is scenario coverage: the GMB arm is only available for the Billings target (illustrative block) or when `BAKEOFF_GMB_JSON` is supplied. For any other city the GMB scenario silently disappears unless explicitly requested, which breaks symmetry. The routed production mode (`produce.ts`) is additive and does not contaminate the comparison results.

**Prompt engineering**  
The `ARTIFACT_TO_INLINE*` and `SCHEMA_TO_INLINE` shims are the correct, uniform translation of the master fixtures' "create artifact / output schema.txt / HARD STOP on CID" directives. The only remaining surface is that the schema turn still trusts the model to emit exactly one `<script type="application/ld+json">` block; any prose before it causes `extractSchemaJson` to fail loudly (intentional and correct).

**Scoring rubric**  
The eight weighted dimensions are the right ones. The visual component is now sound. The composite can still mislead when a model produces a visually close but semantically wrong page (e.g., facility-language violations that the checker only partially catches). Retaining the design-token proxy as a secondary signal is good transparency.

**Correctness, bugs & risks**  
No race conditions; the persist chain is serialized. `extractHtmlDocument` correctly prefers real `<!DOCTYPE>` markers over the `PAGE_BUILDER_V3` comment. Cost estimation is honest about its assumptions. The only latent risk is that a model can emit valid JSON-LD that is semantically wrong (wrong `@type`, missing `telephone`, etc.); the schema checker will flag it but the harness still records "valid JSON-LD emitted."

**What's missing / what to do better** (highest-impact first)  
1. Add an explicit pre-run GMB-block validation step that fails loud if `BAKEOFF_SCENARIOS` requests "gmb" but no verified block is available (prevents silent loss of the GMB arm on new cities).  
2. Capture and persist real token counts from the provider responses instead of the 4-char heuristic (removes the largest remaining cost-estimate uncertainty).  
3. Make the visual judge mandatory (currently best-effort if Chromium is absent).  
4. Add a refusal-taxonomy field on error results so you can quantify "demanded page_url/GMB" vs. other refusal reasons.  
5. Store the full raw conversation history (not just timings) for post-hoc audit of any model's exact prompt sequence.
