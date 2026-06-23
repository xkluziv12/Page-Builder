---
name: Multi-LLM Bake-Off harness
description: How the out-of-tree bake-off runs the faithful Mission Control pipeline across models, plus two non-obvious gotchas (Anthropic streaming guard, GPT-5.4 strict refusal).
---

# Multi-LLM Bake-Off harness

Out-of-tree (`scripts/src/bakeoff`) runner that drives the REAL Mission Control
pipeline across multiple LLMs on a fixed target (Billings, MT) through the OLD
"No-GMB" checklist: Build → SEO Audit → deterministic Schema → checker/link
verify, **stopping before Joomla publish**. Adapters live here, NOT in mc-core
(prod stays Claude-only); they reuse the exact production prompts +
`describeContext` so the prompt is the controlled variable.

## Rule: keep it apples-to-apples — never special-case a model's prompt
**Why:** the whole point is the model is the only independent variable. Coaxing
one model with extra inputs the others didn't get makes the comparison
dishonest.
**How to apply:** all models go through the same `GenericLlmEngine` prompt path.
A model that refuses/fails is recorded as a genuine ERROR result, isolated per
model (try/catch) so it never aborts the others — that refusal IS the finding.

## Gotcha: Anthropic SDK refuses long non-streaming requests
With a high `max_tokens` budget (we use 32000 for full SEO pages) the SDK throws
`AnthropicError: Streaming is required for operations that may take longer than
10 minutes` from `calculateNonstreamingTimeout` — before any network call.
**Fix:** use `client.messages.stream({...})` then `await stream.finalMessage()`.
**How to apply:** any Anthropic call with a large token budget must stream.

## Finding: which model "refuses/fails" No-GMB is NOT stable — re-run, don't assume
Production `describeContext` (in mc-core, shared by the shipped ClaudeEngine)
deliberately omits an explicit `page_url`/GMB block — it derives the page from
city + base domain. WHICH model balks under this identical No-GMB context shifts
with the model version AND the credential set, so treat any past leaderboard as
stale and re-run:
- On the OLD shared/proxy keys: both GPT-5.4 and GPT-5.5 refused No-GMB with a
  "⛔ Build blocked / required inputs missing" stub, while Claude/Gemini/Grok built.
- On the user's OWN direct keys: that same OpenAI model instead BUILT No-GMB,
  while **Gemini became the ERROR** — its AUDIT phase returned an XML-comment +
  markdown "EXECUTION CHECKLIST" narration instead of an HTML document, so the
  harness failed loudly at HTML extraction. Who balks flipped purely from the
  credential set, with the same prompts.
WHO balks is real model behavior — never "fix" it by injecting inputs or coaxing
one model. But the Gemini AUDIT narration specifically is root-caused below
(chat-UI delivery directives in the shared master prompt) and DOES have a
legitimate uniform fix — see "Root cause: audit narration" — because it neutralizes
a headless-incompatible directive for ALL models equally, not for one model.

## Root cause: audit narration = master prompt's chat-UI delivery directives, not a model defect
The shared production `seoAuditPrompt`'s `<PHASE_3_OUTPUT>` was authored for
Claude's chat + artifacts UI: it mandates "display an EXECUTION CHECKLIST in chat
BEFORE presenting files" and "Use present_files to deliver HTML". The bake-off is
a headless API call with NO `present_files` tool and NO chat surface, so a model
that follows the SYSTEM prompt literally emits the checklist as its whole reply
and never inlines `<!DOCTYPE html>` → `extractHtmlDocument` throws. This is what
"Gemini narrated instead of returning HTML" actually was — and it is
**non-deterministic**: the same Gemini call sometimes inlines a full doc,
sometimes emits the checklist/HARD-STOP text bare (verified live — repeated runs
flip between ✓ HTML and ✗ narration on the identical prompt). Models weight
system-vs-user instructions differently, so the mini-prompt's own "output only
HTML" user rule does NOT reliably beat the system prompt.
**Fix (uniform, apples-to-apples):** a `HEADLESS_DELIVERY_CONTRACT` appended to
every build+audit user message in `engine.ts` for ALL models/scenarios — the
SAME faithful "chat-UI rule → API intent" translation already used for the
"CREATE AS ARTIFACT" rule. This is NOT per-model coaxing and NOT injecting
inputs, so it stays a fair comparison.
**Why not edit the prompt:** `seoAuditPrompt`/`pageBuilderPrompt` are shared
mc-core prod prompts used by the shipped ClaudeEngine; neutralize the chat-UI
directives at the harness boundary, never in mc-core.
**Re-run note:** the recorded `results.json` snapshot was generated WITHOUT the
contract; keep snapshots internally consistent — a full re-run with the contract
applies it to every model at once, never mix contracted + non-contracted results.

## Gotcha: HTML extraction must anchor on the REAL doc, not the page-builder comment
`extractHtmlDocument` (`scripts/src/bakeoff/extract.ts`) slices from a start
marker to the last `</html>`. Claude echoes the `<!-- PAGE_BUILDER_V3 -->`
directive at the TOP of its phase-by-phase narration, then writes ~tens-of-KB of
"## PHASE 0A…" prose BEFORE the real `<!DOCTYPE html>`. If the page-builder
comment is a primary start marker, the slice anchors on it and stores all that
narration as the "page" — the viewer iframe then renders prose, and every
content score (htmlMatch/wordCount/structure/visual) is computed on the polluted
HTML (dragged Claude's composite ~12 pts low).
**Fix/rule:** prefer real document markers (`<!doctype html`/`<html`); use the
`<!-- page_builder` comment only as a FALLBACK when no real doc marker exists.
Keep this uniform across all models (no per-model special-casing).
**Recovery without re-running the LLM:** the real document is fully contained in
the stored html, so re-slicing recovers it — but pipeline-derived scores
(audit/links/schema) come from the run, so cleanest is to delete just that
model's entry and resume (grounding is persisted + reused, so it stays
apples-to-apples), then re-run the visual rescore.

## The real VA workflow forces per-phase "mini prompts" the prod pipeline dropped
The old checklist tool (`artifacts/page-terminal/public/tools/no-gmb.html`,
`copyPrompt()`) is the source of truth for how a VA actually drives Claude: at
EACH phase the VA pastes a "mini prompt" ALONGSIDE the master prompt (which is an
uploaded FILE). The mini prompt carries (a) a forced-execution prefix
("CRITICAL SYSTEM INSTRUCTION: Execute ALL steps… Do NOT summarize… Do NOT skip"),
(b) the NO-GMB rules + hero/form/Master-Design execution instructions, and
(c) the narration-killer "CREATE AS ARTIFACT, never paste code in chat".
The production `mc-core` pipeline AND the original bake-off both DROPPED these —
they sent only the master prompt as system + a generic "Build the page…" user
msg. That omission is why models narrated and the design drifted.
**Fix:** ported the mini prompts into `scripts/src/bakeoff/miniPrompts.ts`,
forced via `EngineScenarioOptions.buildUser/auditUser` (engine falls back to the
generic msg when unset), wired to the no-gmb scenario in `run.ts`. Two faithful,
UNIFORM adaptations (no per-model special-casing): the chat-UI "create as
artifact" → API "return ONLY the complete HTML document, no commentary"; the
Claude-only model-check is dropped. The seo-verify checklist is folded into the
audit step (no extra phase). Since the harness is stateless one-shot per phase,
the intro's session RULES are repeated in every step.
**Why it matters:** forcing these flipped outcomes — Gemini went from a hard
ERROR (audit returned a markdown checklist) to a clean build, while Claude scored
LOWER (it obeys "minor tweaks only", changing less → low audit score). That's the
point: the comparison now measures models *under the rules the real tool forces*.
**Open gap:** production `mc-core` engines still don't force these mini prompts;
only the bake-off no-gmb scenario does. The Master Design (Tier 2) file the intro
uploads is NOT in this repo, so design fidelity is bounded by the page-builder
master prompt's inline design rules.

## Design: two scenarios, ONE shared grounding, enrichment is the only variable
The harness runs the same models twice as `scenarios` (`no-gmb`, `gmb`). The GMB
scenario appends an experimental page_url + GMB block (`gmb.ts`) to the SAME
`describeContext` via an in-harness engine suffix (never the prod path) and swaps
the deterministic schema for the GMB-aware one. Both scenarios reuse ONE shared
grounding so the enrichment — not research — is the only difference. Result: the
same OpenAI model that refuses No-GMB builds a full page under GMB (the "fair
re-run"). Grok is flaky here — it intermittently returns a chatty "✅ … final-
html.html" stub instead of HTML, recorded faithfully as an extraction ERROR.

## Operational note: run as a RESUMABLE one-shot console workflow, not bash
The full run takes ~11 min PER scenario (Claude streaming alone ~660s), well past
the 2-min bash cap and the code_execution sandbox cap. Detached bash processes
(`setsid`/`nohup`/`&`) are REAPED the moment the launching tool call returns — see
`background-process-reaping.md`. Run via a temporary
`configureWorkflow({outputType:"console"})`, poll `getWorkflowStatus` +
`results.json`, then `removeWorkflow`. `run.ts` is resumable: it loads prior
`results.json`, skips any already-recorded (scenario,model) pair, runs models
sequentially (low peak memory), and persists after EVERY model — so a reaped or
restarted run continues instead of starting over. It also migrates the legacy
single-`models[]` file into the `no-gmb` scenario, dropping only OpenAI so it
re-runs on the newer model.
