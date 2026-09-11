# Precision E-Cycle target-adapter proof

Proves one thing: a model, given the Precision E-Cycle prompt pack, can return a single JSON object that conforms to the `CityData` contract and passes deterministic validation, without emitting any HTML or JSX.

The pack is `prompt-pack/fact-layer.json` (canonical business facts, Zod-checked by `factLayer.schema.ts`) plus `prompt-pack/gate.config.json` (hard counts, editorial rules, credential phrasing tiers as machine-checkable data). `cityDataSchema.ts` mirrors the contract interface field for field. `validate.ts` gates a candidate in code with no model calls: Zod parse, exact counts, length windows, the 1500-word visible floor, banned dashes and emoji, sentence length, prices, operational thresholds, forbidden credential phrasings, and planning-market language. `buildRecord.ts` asks one Claude model for one planning-market record (Milwaukee, WI, which is neither St. Louis nor a confirmed metro), then feeds any validation errors back for up to 3 repair turns.

Run from the repo root:

```
npx tsx scripts/src/precision-adapter/run.ts
```

Requires `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` in the environment; the adapter uses whichever is set and throws if neither is, with no fallback to another provider and no Replit-managed connector.

What it deliberately does not do yet: no model routing or backup-model failover, no write-back into the precision-ecycle-platform repo, no template or page rendering, and no wiring into the existing bake-off CLI. It builds one city, once, and reports pass or fail.
