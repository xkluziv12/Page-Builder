# Claude Code Handoff: STS Bake-Off Audit

Mark asked for an independent inspection of the complete Bake-Off record and a check of the recommendation that **Gemini 3.7 Flash is the best cost-conscious default**.

## Critical fact to preserve

**Gemini 3.7 Flash used the direct Google Gemini API adapter with the project's `GEMINI_API_KEY`. It did not use Claude Code CLI, Claude web, a Replit LLM integration, or OpenRouter.**

Claude Code CLI is only a possible reviewer/implementation worker after the Bake-Off. It is not a hidden model provider in any saved result.

## Evidence and method used

The report was assembled from saved JSON results, historical snapshots, provider adapters, scoring/cost code, screenshot scores, the blind judge panel, and four model-generated harness reviews. The latest decision points are:

- Current pinned run: `artifacts/bake-off/src/data/results.json`
- Newest same-day rerun: `artifacts/bake-off/src/data/history/2026-08-31T19-36-26-170Z.json`
- Full report: `docs/bakeoff-audit-report-2026-08-31.md`

The current run used the No-GMB Billings, MT scenario. Models shared the same stateful prompt sequence, fixtures, and grounding. Provider adapters were direct:

- Anthropic SDK for Claude.
- Google Gen AI SDK for Gemini.
- OpenAI SDK for GPT.
- xAI-compatible API for Grok.
- DeepSeek-compatible API for DeepSeek.

Current model-token costs are provider-reported and labeled measured. Web-search fees are excluded. Older archives with no cost field are not recorded, not zero.

## Inspect these files first

### Harness

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

### Current and historical data

- `artifacts/bake-off/src/data/results.json`
- `artifacts/bake-off/src/data/history/2026-08-31T19-36-25-511Z.json`
- `artifacts/bake-off/src/data/history/2026-08-31T19-36-26-170Z.json`
- `artifacts/bake-off/src/data/history/manifest.json`
- `artifacts/bake-off/src/data/old-bakeoff.json`
- `scripts/src/bakeoff/archive/2026-06-23-full-adherence/`

### Existing qualitative audits

- `scripts/src/bakeoff/output/reviews/claude.md`
- `scripts/src/bakeoff/output/reviews/gemini.md`
- `scripts/src/bakeoff/output/reviews/grok.md`
- `scripts/src/bakeoff/output/reviews/openai-std.md`
- `scripts/src/bakeoff/output/judge-panel/`
- `docs/seo-aio-geo-judging-master-findings.md`

## Questions to verify

1. Confirm Gemini Flash is direct Google API usage and not Claude CLI.
2. Confirm measured cost values agree with normalized provider usage.
3. Confirm cached-input and hidden-reasoning accounting is not silently omitted.
4. Confirm web-search fees are excluded from the displayed model-token cost.
5. Confirm the composite weights match the current source and speed is not blended into quality.
6. Confirm missing live-search evidence and empty model responses fail loudly.
7. Confirm current source and current result files agree about schema generation.
8. Check whether structure/schema scores are too compressed to be decision-useful.
9. Check whether visual scores are screenshot-based and comparable across the latest rows.
10. Check for any incorrect provider or execution-source attribution.

## Current interpretation to challenge

- Claude Sonnet 4.6 is the pinned current quality winner: composite 67, measured $2.7226.
- Gemini 3.7 Flash is the pinned current value leader: composite 64, measured $0.5318, visual 89.
- In the newest same-day rerun, Gemini Flash scored 67 at $0.3848 and tied Claude's 67 at $2.7226.
- Grok is cheap and successful, but lower quality in the pinned run.
- Gemini 3.1 Pro and both DeepSeek tiers should not count as winners because the latest attempts failed the live-search/output contract.

The recommendation is **Gemini Flash as the cost-conscious default with deterministic and human gates, Claude Sonnet as the quality escalation/reference**. Treat this as medium-confidence because the score spread is narrow and the newest tie is not repeated enough to establish statistical stability.

## Known methodology caveats

Do not erase these caveats from the review:

- Native search tools differ by provider.
- Shared grounding improves control but is not independent live research.
- The prompt corpus is large and includes Claude-specific workflow language.
- The No-GMB HQ-phone rule differs from the reference page.
- Transport paths differ and influence latency.
- Screenshot similarity can reward copying and is sensitive to rendering conditions.
- Historical archives use different instrumentation and must not be pooled as one experiment.

## Diagnosis-only commands

Use the repository's existing conventions and do not mutate code during the first audit:

```bash
pnpm run typecheck
pnpm --filter @workspace/scripts run test
pnpm --filter @workspace/mc-core run test
pnpm --filter @workspace/bake-off run typecheck
```

Do not print or inspect secret values. Do not add Replit-managed LLM connectors. If a code change is warranted, return a bounded diagnosis first, then perform implementation as a separate scoped pass.

## Required final review format

Return:

1. Confirmed facts.
2. Claims that are stale, unsupported, or inconsistent.
3. Cost-accounting findings.
4. Fairness and reproducibility findings.
5. Ranking confidence.
6. Must-fix items.
7. Nice-to-have items.
8. Whether Gemini Flash should remain the default recommendation.
