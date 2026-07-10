---
name: Multi-LLM Bake-Off harness
description: How the out-of-tree bake-off runs the faithful human No-GMB checklist across models in ONE stateful conversation, plus gotchas (Anthropic streaming guard, artifact→inline output contract, Joomla loadposition design gate).
---

# Multi-LLM Bake-Off harness

Out-of-tree (`scripts/src/bakeoff`) runner that drives the EXACT human No-GMB
checklist across multiple LLMs on a fixed target (Billings, MT) as ONE
continuous STATEFUL conversation per (scenario,model): intro (real design files
uploaded inline + NO-GMB rules + model check) → build → design gate / force-
rebuild loop → SEO audit → SEO verification → schema (now a REAL AI turn driving
the Master Schema Generator fixture; the older deterministic gmb.ts path is
demo/test-only) → link verification, **stopping before Joomla publish**. Adapters live here, NOT
in mc-core (prod stays Claude-only). The prompt text is the tool's VERBATIM
`copyPrompt()`, so the model is the only controlled variable.

## The conversation is STATEFUL — full growing history re-sent every turn
Each turn re-sends the entire accumulated message history (~120KB of inlined
fixtures + the ~83KB SEO-audit file + each prior HTML doc), so turns are SLOW
(intro alone ~4 min; a full no-gmb run ~18 min for one model). This supersedes
the older "stateless one-shot per phase, RULES repeated every step" design — the
intro rules are stated ONCE and carried forward by history.
**How to apply:** always run as a resumable console workflow, never bash; budget
~15-20 min per model per scenario when polling.

## Fixtures are REAL committed files, not the master prompt's inline rules
The Master Page Builder, Master Design (Tier 2), STS SEO data, and Master SEO
Audit are committed under `scripts/src/bakeoff/fixtures/` and loaded fail-loud by
`fixtures.ts` (throws if any are missing/empty), then inlined into the intro/seo
turns exactly as a VA uploads them. This resolves the old "Master Design file is
NOT in this repo" gap — design fidelity is now bounded by the real Tier-2 file.

## Rule: keep it apples-to-apples — never special-case a model's prompt
**Why:** the whole point is the model is the only independent variable. Coaxing
one model with extra inputs the others didn't get makes the comparison
dishonest.
**How to apply:** all models go through the same `conversation.ts` turn path
(post-rebuild; the old `engine.ts`/`GenericLlmEngine` is deleted). A model that
refuses/fails is recorded as a genuine ERROR result, isolated per model
(try/catch in `runOneModel`, which returns an error result rather than throwing)
so it never aborts the others — that refusal IS the finding.

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
**Fix (uniform, apples-to-apples):** the headless "chat-UI rule → API intent"
translation is appended to every HTML-yielding turn for ALL models/scenarios.
NOTE (reconciled): the old `engine.ts` `HEADLESS_DELIVERY_CONTRACT` no longer
exists — the verbatim-mini-prompt rebuild superseded it; the live shim is
`ARTIFACT_TO_INLINE` (and the verify-turn variant `ARTIFACT_TO_INLINE_OPTIONAL`)
in `miniPrompts.ts`, applied per turn in `conversation.ts`. Still uniform, still
NOT per-model coaxing.
**Why not edit the prompt:** `seoAuditPrompt`/`pageBuilderPrompt` are shared
mc-core prod prompts used by the shipped ClaudeEngine; neutralize the chat-UI
directives at the harness boundary, never in mc-core.

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
**Fix:** the mini prompts live VERBATIM in `scripts/src/bakeoff/miniPrompts.ts`
and `conversation.ts` sends each one as its own turn in the stateful chat. The
only adaptations are UNIFORM (applied identically to every model, no special-
casing): the artifact→inline output contract (below) and the model-check is kept
but non-fatal.
**Why it matters:** forcing these flipped outcomes vs. the old generic "Build the
page" path — the comparison now measures models *under the rules the real tool
forces*. **Open gap:** production `mc-core` engines still don't force these mini
prompts; only the bake-off does.

## Gotcha: "create as artifact / never paste code in chat" yields NO HTML on the API
The verbatim build/seo prompts tell the model to CREATE AN ARTIFACT and NEVER
paste code in chat. Over the API there is no artifact/canvas surface, so a model
that obeys literally replies with a stub like "the artifact is being created now"
and emits zero HTML → the harness fails loud at extraction (seen: Claude returned
190 chars on the build turn).
**Fix/rule:** append ONE uniform note (`ARTIFACT_TO_INLINE` in `miniPrompts.ts`)
to every HTML-yielding turn (build, each rebuild, seo, seo-verify, verify-links)
translating "artifact" → "output the COMPLETE HTML inline in a ```html block, no
commentary, do not say an artifact is being created." This is a medium shim for
the API, NOT per-model special-casing — apply it identically to all models. With
it, Claude's build turn went from 190 chars to a full ~54KB document.

## Gotcha: STS hero form is a Joomla `{loadposition}` token, not a literal `<form>`
The reference STS pages render the hero contact form via the Joomla module token
`{loadposition city-hero-form}` — there is NO literal `<form>` element in the
saved HTML. A design gate that requires `<form>` falsely fails every faithful
build.
**Fix:** `designGate.ts` accepts either a real `<form>` OR a `{loadposition…form…}`
token as satisfying the hero-form requirement.

## Design: two scenarios, ONE shared grounding, enrichment is the only variable
The harness runs the same models twice as `scenarios` (`no-gmb`, `gmb`). The GMB
scenario appends an experimental page_url + GMB block (`gmb.ts`) to the SAME
`describeContext` via an in-harness engine suffix (never the prod path); the
schema turn (a real AI turn) gets the GMB-aware variant. Both scenarios reuse ONE shared
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
`results.json`, skips any already-recorded (scenario,model) pair, and persists
after EVERY model — so a reaped or restarted run continues instead of starting
over.

## Concurrency: models run in PARALLEL per scenario; safe because of two invariants
`run.ts` runs all not-yet-recorded models for a scenario via `Promise.all`
(scenarios stay sequential, so peak concurrency = #models). The bottleneck is
per-model LLM API latency, so this cuts a full sweep from ~2h to ~25-30 min.
**Why it's safe (do not break either invariant if editing the loop):**
1. The ONE shared grounding is authored ONCE *above* the model loop — a cold
   parallel start must never let each model author its own grounding (would fork
   the only-difference-is-the-model guarantee).
2. All `results.json` writes go through a single serialized promise chain
   (`persistChain = persistChain.then(persist)`), so concurrent finishers never
   interleave/clobber the shared file. Per-model resumability is preserved.
`BAKEOFF_SEQUENTIAL=1` forces the old one-at-a-time path. `runOneModel` catches
its own errors so one failure never rejects the `Promise.all`.

## Finding: with the faithful verbatim flow, all 4 models can build BOTH scenarios
With the verbatim mini-prompt flow + `ARTIFACT_TO_INLINE` + the corrected intro
gate, a full sweep recorded all 8 (scenario,model) cells with NO refusals, all
schema-valid, 0 forced rebuilds, only content-checker warnings. The earlier
"OpenAI refuses No-GMB" finding did NOT reproduce — reinforcing that WHO balks is
unstable across model version/credentials.
**Do NOT record exact leaderboard scores here** — they are volatile per run
(visual-judge perceptual scoring + model nondeterminism shift them every sweep).
Read the live numbers from `artifacts/bake-off/src/data/results.json`; never
treat a past leaderboard as authoritative — re-run.

## Intro handshake gate: fail loud ONLY on a STOP/refusal, never require a positive ack
The intro's readiness phrasing ("Sonnet 4.6 confirmed. Ready.") is Claude-
specific, and the tool's ONLY hard stop is the wrong-model case (Opus → "🚫 WRONG
MODEL … STOP"). So `assertIntroNotBlocked` (in `conversation.ts`) throws only on a
wrong-model STOP or an explicit refusal-to-proceed/build; a missing positive ack
is logged, non-blocking.
**Why:** requiring an ack token converts honestly-caveating but buildable models
into FALSE errors — observed live: GPT-5.5's GMB intro replied "I'm not Claude /
I can't rename the chat or verify uploads" (a benign caveat, not a refusal) and
was wrongly failed by an ack-required gate, even though it builds the GMB page
fine. That breaks apples-to-apples.
**How to apply:** readiness is confirmed FUNCTIONALLY by the build turn (no HTML →
fail loud at extraction). Keep the gate's regex about *proceeding/building*, not
about chat-UI actions like "rename"/"upload" (those words must NOT trip refusal).

## Gotcha: OpenAI top-tier ("pro") needs the Responses API + reasoning floor + BACKGROUND mode
The gpt-5.x "pro" tier is served ONLY by the **Responses API** — `chat/completions`
404s "not a chat model". Three non-obvious facts cost several attempts; the adapter
is `makeOpenAIComplete` in `providers.ts` (history → `input` items, system →
`instructions`, budget → `max_output_tokens` which also covers hidden reasoning):
1. **Pro rejects `reasoning.effort:"low"`** — valid values are `medium|high|xhigh`
   and it defaults to the slow `high`. Pin it to a floor (`medium`, via
   `BAKEOFF_OPENAI_REASONING`), and apply `reasoning` ONLY to pro tags (plain
   `gpt-5.x` chat tags run at the API default; passing effort can be wrong for them).
2. **The SYNCHRONOUS Responses endpoint has a server-side processing cap (~minutes)**
   that pro exceeds on the full page-build turn — it returns "Request timed out"
   **regardless of how high our own client timeout is** (confirmed: failed in ~3-4
   min even with a 45-min client cap). Raising `BAKEOFF_REQUEST_TIMEOUT_MS` does
   NOT help.
3. **Fix = background mode:** submit with `background:true`, then poll
   `responses.retrieve(id)` until `status==="completed"`. This lifts the server-side
   cap; our `WALL_CLOCK` still bounds the poll loop. With it the pro build turn that
   used to time out finished in ~5 min, full pro run ~13 min.
**Why uniform, not per-model:** background mode is a transport change only (same
prompt/input/turn order), applied to EVERY OpenAI tag — it is NOT special-casing.
Do NOT instead chunk the page build into sections to dodge the cap: every other
model builds the whole page in one build turn, so chunking only pro would break
apples-to-apples.
**Finding (volatile, don't trust as authoritative):** in one No-GMB sweep the pro
tier did NOT win — standard `gpt-5.5` edged `gpt-5.5-pro` despite ~6× the wall time.

## Cost is RECONSTRUCTED, not captured — providers' token usage is discarded
The harness never records the LLM `usage` object, so per-run cost is a documented
ESTIMATE (`scripts/src/bakeoff/cost.ts`, `estimateCost`): it replays each model's
recorded turn sequence, re-bills the FULL growing history every turn (the chat is
stateful — see above), sizes prompts from the verbatim mini-prompts + real inlined
fixtures (~4 chars/token), prices by model-family list tiers. NOTE: schema is now
a real AI turn, so newer runs DO bill it — older estimates that skipped schema as
"deterministic" under-count; re-run cost after a fresh sweep.
**Why it reads high for "pro":** hidden reasoning tokens aren't observable, so
reasoning-heavy tiers are UNDER-counted on output; no prompt-caching discount is
applied (realistic upper bound). Keep these caveats in the `basis` string the UI
shows — never present the number as exact.
**How to apply:** live runs fill `costEstimate` in `runOneModel`; backfill existing
`results.json`/`old-bakeoff.json` with `pnpm --filter @workspace/scripts run
bakeoff:cost` (resolves repo root from `import.meta.url`, NOT cwd, because
`--filter` runs in the package dir). Sanity anchor: Claude Opus no-gmb ≈ $6.

## Prompt caching is wired on EVERY provider (transport-only, stays apples-to-apples)
Because the chat is stateful (the ~180K-char fixtures + growing history are re-sent
verbatim every turn), each provider adapter in `providers.ts` now enables prompt
caching so that repeated prefix is read from cache instead of re-billed at full
input price:
- **Anthropic (Claude):** EXPLICIT — `cache_control:{type:"ephemeral"}` breakpoints
  on the first message (pins the huge fixtures block) and the last message
  (incrementally caches the whole conversation for the next turn). Requires
  converting those messages' `content` from a string to a `[{type:"text",…}]` block.
- **OpenAI:** AUTOMATIC for prefixes >1024 tokens; we add a stable per-model
  `prompt_cache_key` (`bakeoff-<model>`) on the Responses call to route turns to
  the same cache. (Grok's OpenAI-compatible surface REJECTS unknown fields, so do
  NOT send `prompt_cache_key` there — xAI auto-caches without any flag.)
- **Gemini:** IMPLICIT context caching is on by default for 2.5+/3.x — no flag.
- **xAI (Grok):** AUTOMATIC cached-token billing — no flag.
**Why it's still fair:** caching is a billing/transport optimization only — the
text each model reads is byte-identical and turn order is unchanged, exactly like
the `background`/`webSearch` knobs. Never treat it as per-model coaxing.
**Gotcha:** editing `providers.ts` does NOT affect an already-running `tsx` sweep
(modules are loaded at start); caching only applies to the NEXT run or a resume.

## Viewer is multi-dataset — current run + archived "Old Bake-Off" side by side
`artifacts/bake-off` switches between datasets via `src/data/datasets.ts` +
`DatasetProvider` (`current` = live `results.json`, `old` = `old-bakeoff.json`
built from `archive/.../full-adherence`, no-gmb only, screenshots copied to
`public/old-screenshots/`). Model routes are `/model/:datasetId/:scenarioId/:id`;
the detail page treats the URL's datasetId as source of truth and syncs the shared
switcher. Both ModelResult types (harness + viewer) carry `costEstimate`.

## Live web search is switched on for the seo-verify turn ONLY (native per-provider tools)
The seo-verify prompt's Part 2 says "search the web for current 2025-2026 SEO
best practices"; that turn now actually fetches live results. A per-turn
`webSearch` flag rides on the `CompleteFn` (`CompleteOptions` in `providers.ts`),
threaded through `send`/`runVerification` in `conversation.ts` and turned on for
the seo-verify turn + its corrective re-verify turns ONLY — every other turn
(intro/build/rebuild/seo-audit/verify-links) stays search-free. It's the
capability analogue of `ARTIFACT_TO_INLINE`: uniform across all four models, same
flag, same turn, so the comparison stays apples-to-apples (only each provider's
own search impl differs).
**Native tool per provider:** Claude `web_search_20250305` (stream; still read
text blocks only), Gemini `tools:[{googleSearch:{}}]`, OpenAI Responses
`tools:[{type:"web_search"}]` (coexists with background poll). 
**Gotcha (Grok):** xAI's old Live Search (`search_parameters`) is DEPRECATED →
410 "switch to the Agent Tools API". `chat/completions` rejects the web_search
tool (422: only `function`/`live_search`). The working path is xAI's
OpenAI-compatible **Responses** endpoint with `tools:[{type:"web_search"}]`, so
the Grok adapter routes the flagged turn through `responses` and keeps plain
`chat/completions` for every other turn.
**Cost caveat:** provider per-search fees are billed separately and are NOT in
the token-based `estimateCost` (noted in its `basis` string).
**Cheap verification:** `pnpm --filter @workspace/scripts run bakeoff:seo-verify-demo`
(`SEO_DEMO_MODEL=claude|gemini|openai|grok`, `SEO_DEMO_HTML=…`) runs JUST the
seo-verify turn against an existing HTML file — proves live search without a full
sweep. Confirmed live: models cite fresh 2026-dated facts, not training recall.

## Live fetch is ENFORCED (fail-loud), not just offered — and WHO complies is unstable
When a turn requests `webSearch`, the adapter no longer merely attaches the tool —
it asserts the model ACTUALLY searched and throws if there's no evidence
(`enforceLiveFetch` in `providers.ts`; logs `🔎 <model> live web search: N
request(s)` on success). Evidence per provider: Claude `server_tool_use` blocks /
`usage.server_tool_use.web_search_requests`; Gemini `groundingMetadata`
(queries/chunks/supports); OpenAI Responses `web_search_call` items; Grok shared
`responsesSearchCount()` (web_search_call items + `url_citation` annotations).
**Why:** a model that's TOLD to fetch but answers from training recall silently
poisons "live-grounded" SEO verdicts — fail loud so non-compliance is a visible
ERROR, matching the repo's fail-loud convention.
**How to apply:** this is uniform (same assertion, all four providers) so it stays
apples-to-apples; never relax it for one model to "rescue" its cell.
**Finding (volatile — re-run, don't trust):** under the FULL stateful chat, fetch
compliance differs from the single-turn demo. In one enforced No-GMB sweep Claude,
GPT-5.5, GPT-5.5-pro, and Grok searched and passed, while **GPT-5.4 and Gemini
declined to call the tool on both attempts → recorded as honest ERRORs** — even
though Gemini DID search in the single-turn `seo-verify-demo` (proves detection is
correct, not a false negative; the growing history changes the model's behavior).
WHO complies is real model behavior — that refusal IS the finding, never coax it.

## Two ADDITIVE production modes layered on the comparison harness (single / routed)
Beyond the 6-model comparison (`run.ts`, the operator's "all of them"), the tool
now PRODUCES one real page two ways, driven by plain-language requests:
- "run this through 1 llm" → SINGLE engine: one chosen model runs every phase via
  the faithful continuous-chat `runConversation` (no new engine — reuse).
- "run this through the multi llm" → ROUTED: a MAIN model per phase + an
  auto-failover BACKUP (OpenAI GPT-5.4 everywhere) in `routed.ts`. Routing table
  in `routing.ts` (`ROUTING_TABLE`): build/seo/grounding→Claude, seo-verify→Gemini
  (web search), schema/verify-links→Grok. Backup steps in when the main throws,
  refuses, or emits invalid output (no HTML / invalid JSON-LD).
**Why routed differs from single's chat:** different models can't share one chat,
so routed is STORE-AND-HANDOFF — each phase is a fresh call to its model seeded
with the shared grounding + build context + current HTML; intro is folded into
the build turn. Single keeps the stateful growing-history chat.
**Invariants to preserve (do NOT break):** (1) the existing `run.ts` comparison is
untouched; (2) NEVER import `run.ts` — it runs `main()` on import, so model
constants are intentionally duplicated in `routing.ts`; (3) no per-model coaxing —
fallback is structural (error/refusal/invalid), not prompt hacks; (4) GPT-5.4 (the
build backup) historically REFUSES No-GMB builds, so under No-GMB a Claude-build
failure that falls to 5.4 can fail loud — that's correct, not a bug.
**Where it surfaces:** `produce.ts` (env-driven entry: `BAKEOFF_PRODUCE_MODE`,
`BAKEOFF_MODEL`, `BAKEOFF_SCENARIO`, target + `BAKEOFF_GMB_JSON`) writes a SEPARATE
`artifacts/bake-off/src/data/produce.json` (never clobbers `results.json`), shown
in the viewer as the "Produced Page" dataset. Scores are null (arbitrary target,
no reference to compare); the city-aware checker report is the quality signal.
Scripts: `bakeoff:single` / `bakeoff:multi`. A NEW GMB page MUST supply its
verified GMB block via `BAKEOFF_GMB_JSON` (fail loud — never invent CID/address).

## Verify-turn gating: a verify turn must end on an explicit ✅ PASS, never silently
seo-verify and verify-links turns parse the model's ✅/❌ verdict (`readVerdict`,
later match wins so an echoed rubric doesn't false-positive). The loop condition is
`while (verdict !== "passed" && fixes < cap)` (cap `BAKEOFF_REBUILD_CAP`, default 2)
in BOTH `conversation.ts` (single/stateful) and `routed.ts` (handoff) — so a FAILED
**and** a null/absent verdict both drive a bounded corrective re-verify, and if it
never reaches an explicit PASS it FAILS LOUD.
**Why:** a null verdict (no ✅/❌ line) used to count as a silent non-blocking pass —
that let a verify turn "succeed" having verified nothing. A verification with no
verdict is not a pass.
**Gotcha:** verify turns must use `ARTIFACT_TO_INLINE_OPTIONAL`, not the mandatory
`ARTIFACT_TO_INLINE` — the latter forbids commentary and so SUPPRESSES the verdict
line the gate parses. seo *audit* still uses mandatory `ARTIFACT_TO_INLINE`.

## Dead-simple input contract: a target URL + a verified GMB block
The PRIMARY input is now just a page URL + the page's verified Google Business
Profile. `bakeoff:compare` (`BAKEOFF_SCENARIOS=gmb` default) reads `BAKEOFF_TARGET_URL`
+ `BAKEOFF_GMB_JSON`; the faithful No-GMB VA reproduction stays reachable via
`BAKEOFF_SCENARIOS=no-gmb` but is no longer primary.
**Two hard invariants (do NOT break):** (1) the real target URL is threaded verbatim
through `promptVars(ctx, pageUrl?, gmb?)` — which is DUPLICATED in `conversation.ts`
and `cost.ts` and must stay in lockstep; when `pageUrl` is empty it falls back to the
derived `${baseDomain}/${city}-${state}` slug. (2) The No-GMB prompt text stays
BYTE-IDENTICAL: GMB-awareness is added ONLY as `v.gmb ? <gmb text> : <verbatim old
No-GMB text>` ternaries in the build/seo/verify mini-prompts — the else branch must
remain the exact prior string (HQ_PHONE backup language lives only there).
**Fail loud:** a real (non-Billings-sample) GMB target with no `BAKEOFF_GMB_JSON`, or
a block missing any required field, throws with the exact JSON shape to supply —
never invent a CID/address/phone for a real page.

## Poll loops abort on wall-clock timeout (no billing leak)
`withTimeout` in `providers.ts` owns an `AbortController` and aborts on timeout; the
OpenAI background-poll loop and the Grok web-search poll loop thread that signal into
`responses.create`/`responses.retrieve` and sleep via `abortableSleep`, so a timed-out
turn stops polling/billing instead of leaking an in-flight poll. Success path is
unchanged; Claude/Gemini adapters ignore the optional `signal`. Uniform, not per-model.

## GMB sample = a REAL parsed Maps listing, never fabricated NAP
The built-in GMB sample target is now the **Regus – Portland – Liberty Centre**
listing (stand-in for STS `/portland-or`), built by running a committed Maps paste
through the reusable parser `maps-paste.ts` (`parseGoogleMapsPaste`: place URL +
raw info dump → CID hex→decimal + `?cid=` URL, `!3d/!4d` geo, street/city/state/zip,
phone, 7-day hours incl. 24h, plus code). This replaced the older fictional
`BILLINGS_GMB` (555-01xx phone / placeholder CID).
**Why:** the sample must exercise the SAME parser a real run uses and carry sourced
NAP, not invented data — fail-loud on any missing required field.
**How to apply:** the sample's real phone/address/hours/geo/CID are kept as-is; ONLY
`website` is forced to the STS domain (`STS_WEBSITE`). `resolveGmbProfile` defaults to
`PORTLAND_GMB` only for the Portland, OR target; any other city still needs a verified
`BAKEOFF_GMB_JSON`. `GmbProfile` gained optional `openingHours: DayHours[]`/`plusCode`
and a required `website`.

## GMB schema completeness is a SEPARATE checker from the CID/identity rule
`checkSchemaCompleteness` (mc-core checkers) fires ONLY when `verifiedCid` is present
(a GMB page) and errors if the schema lacks `telephone`, a street address, or opening
hours (`openingHoursSpecification` OR a bare `openingHours`). It mirrors
`checkSchemaRules`' No-GMB skip, so No-GMB pages are untouched.
**Why:** `checkSchemaRules` guards identity (exact CID + No-GMB leak ban); completeness
guards the local-business fields a GMB page needs. Both the deterministic
`generateGmbSchema` and the AI `gmbSchemaPrompt` now emit `@type:["RecyclingCenter",
"LocalBusiness"]` + `openingHoursSpecification` (closed days omitted; 24h→00:00/23:59),
so the live AI schema turn passes the gate.
