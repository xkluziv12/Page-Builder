---
name: Blind judge panel
description: LLM-jury that blind-scores completed bake-off pages; how it works and how to read its verdicts.
---

# Blind judge panel (`scripts/src/bakeoff/judge-panel.ts`, `pnpm --filter @workspace/scripts run bakeoff:judge`)

Packages every completed page (rendered HTML + JSON-LD) from the current + archived
runs, anonymizes them (Candidate A..G via a seeded shuffle; the letter->model mapping is
written to `output/judge-panel/mapping.json` and never shown to judges), and asks the
NEWEST frontier models to score all candidates on code/css/design/schema/seo with a strict
JSON output contract. Judges resolved via `buildModelsForIds` (routing.ts). Resumable
(`JUDGE_FORCE`), per-judge fail-loud via `Promise.allSettled`, output in
`output/judge-panel/<judge>.json` (+ `.raw.txt`, `.ERROR.txt`).

**How to read the results — the durable lessons:**
- **Schema richness is the decider.** A polished page with a flat `LocalBusiness` schema
  loses to a plainer page with a real `@graph` (WebSite+LocalBusiness+Service OfferCatalog+
  HowTo+FAQPage+BreadcrumbList). This is the single biggest score differentiator.
- **Judges can self-favor** (a model may crown its own blind entry). Trust CROSS-model
  agreement, not any single judge — a winner that judges *other than its own maker* also
  rank #1 is the real signal.
- Judges flag integrity issues unprompted (invented phone numbers, "HIPAA-Certified"
  overclaims, fabricated headlines) and penalize them heavily — NAP/claim honesty matters.

**Use direct STS provider keys, never the Replit integration proxy** (Mark's hard rule for
this harness) — the adapters in `providers.ts` already call providers directly.
