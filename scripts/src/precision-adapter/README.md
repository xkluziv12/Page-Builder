# Precision E-Cycle target-adapter proof

Proves one thing: a model, given the Precision E-Cycle prompt pack, can return a single JSON object that conforms to the `CityData` contract and passes deterministic validation, without emitting any HTML or JSX.

The pack is `prompt-pack/fact-layer.json` (canonical business facts, Zod-checked by `factLayer.schema.ts`) plus `prompt-pack/gate.config.json` (hard counts, editorial rules, credential phrasing tiers as machine-checkable data). `cityDataSchema.ts` mirrors the contract interface field for field. `validate.ts` gates a candidate in code with no model calls: Zod parse, exact counts, length windows, the 1500-word visible floor, banned dashes and emoji, sentence length, prices, operational thresholds, forbidden credential phrasings, and planning-market language. `buildRecord.ts` asks one Gemini model for one planning-market record (Milwaukee, WI, which is neither St. Louis nor a confirmed metro), then feeds any validation errors back for up to 3 repair turns.

Run from the repo root:

```
npx tsx scripts/src/precision-adapter/run.ts
```

Requires `GEMINI_API_KEY` in the environment; the adapter calls Google's `@google/genai` client directly with it and throws if it is missing, with no fallback to another provider and no Replit-managed connector. `PRECISION_ADAPTER_MODEL` pins a different Gemini tag.

What it deliberately does not do yet: no model routing or backup-model failover, no write-back into the precision-ecycle-platform repo, no template or page rendering, and no wiring into the existing bake-off CLI. It builds one city, once, and reports pass or fail. It also only knows how to build PLANNING-market records: `buildInitialPrompt()` always sets `availabilityConfirmationRequired: true` and omits the address/listing fields, even for a target city that is one of the seven confirmed service metros in `fact-layer.json`. See `docs/precision-adapter-task-109-results.md` for the multi-city + repair-loop verification and this gap.

`multiCityTrial.ts` is a one-off evidence runner (not the CLI) that calls `buildRecord()` against several cities plus one deliberately-sabotaged first attempt, to prove the repair-turn loop recovers from a real validation failure and not just a hand-built one.
