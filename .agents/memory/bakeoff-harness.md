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

## Finding: OpenAI refuses the No-GMB production context; the others build it
Production `describeContext` (in mc-core, shared by the shipped ClaudeEngine)
deliberately omits an explicit `page_url`/GMB block — it derives the page from
city + base domain. Under that identical No-GMB context BOTH GPT-5.4 and the
newer GPT-5.5 refuse to build, returning a "⛔ Build blocked / required inputs
missing" stub that lists page_url + GMB data as blockers, while Claude, Gemini,
and Grok all produce full pages. This is a real model-behavior difference, not a
harness bug; do not "fix" it by injecting inputs only OpenAI wants.

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
