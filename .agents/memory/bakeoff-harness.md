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

## Finding: GPT-5.4 refuses the production context; Claude/Gemini/Grok don't
Production `describeContext` (in mc-core, shared by the shipped ClaudeEngine)
deliberately omits an explicit `page_url`/GMB block — it derives the page from
city + base domain. Under that identical context, GPT-5.4 refused to build,
listing page_url/gmb_url/gmb-data as "critical blockers", while Claude, Gemini,
and Grok all produced full pages. This is a real model-behavior difference, not
a harness bug; do not "fix" it by injecting inputs only OpenAI wants.

## Operational note: run as a one-shot console workflow, not bash
The full 4-model run takes ~11 min (Claude streaming alone ~660s), well past the
2-min bash cap and the ~10-min code_execution sandbox cap. Run via a temporary
`configureWorkflow({outputType:"console"})`, poll `getWorkflowStatus`, then
`removeWorkflow` when finished.
