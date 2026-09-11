# Task #109: precision-adapter multi-city + repair-loop evidence

Date: 2026-09-11
Model: `gemini-3.1-pro-preview` (default `MODEL` in `buildRecord.ts`)
Script: `scripts/src/precision-adapter/multiCityTrial.ts` (one-off evidence runner, calls the real `buildRecord()`, not a fixture)
Full log: `/tmp/tucsonOnly.log` (captured run; not committed, environment-local)

## Results

| City | Type | Result | Repair turns used | Visible words |
|---|---|---|---|---|
| Milwaukee, WI (original proof) | planning market | PASS | 0 | (prior run, not re-run here) |
| Columbus, OH | planning market | PASS | 0 | 2111 |
| Nashville, TN | planning market | PASS | 0 | 1937 |
| Kansas City, MO | listed in `fact-layer.json` as a confirmed service metro | PASS | 0 | 1952 |
| Tucson, AZ | planning market, **deliberately sabotaged first attempt** | PASS | 1 | 2074 |

All four new cities pass `validate.ts` on their own merits (three clean first-attempt passes, one recovered pass). Milwaukee was not a fluke: three more planning-market/metro-labeled cities in a row cleared every hard count, length window, editorial rule, credential-phrasing tier, and planning-market phrasing check with zero repairs.

## Finding: no confirmed-metro code path exists yet

The task asked for a mix of confirmed-metro and planning-market test cities. `fact-layer.json` lists seven confirmed service metros (Lincoln, Omaha, Kansas City, Overland Park, Des Moines, Chicago, Denver), so Kansas City, MO was run as the confirmed-metro case. However, `buildInitialPrompt()` in `buildRecord.ts` unconditionally emits planning-market instructions for every target — `availabilityConfirmationRequired: true`, `hasDropoff: false`, and the address/listing/mapQuery/futureAddress/futureMapQuery fields omitted — regardless of whether the target city is one of the seven. There is no branch that would build a confirmed-metro record (with a real address/listing block and `availabilityConfirmationRequired: false`).

This is a genuine gap in the proof-of-concept, not a defect in this task's scope: the adapter currently only knows how to build planning-market records. The Kansas City run above is evidence that the pipeline stays stable and produces a valid record even for a city that happens to share a name with a confirmed metro; it is not evidence that a confirmed-metro record type has ever been generated. Building that second record type (or explicitly deciding it's out of scope for the proof) is follow-up work, not something this task's plan asked to fix.

## Repair-loop verification (induced failure)

To exercise `buildRecord.ts`'s repair loop against a real model reply — not a hand-built fixture — `buildRecord()` gained an optional `options.sabotageInitialPrompt` parameter (default unset, so normal runs, including `run.ts`, are byte-identical to before). When set, it appends a one-time instruction to the FIRST prompt only, telling the model to deliberately violate one specific rule on that first reply.

For the Tucson, AZ case, the sabotage instruction told the model to emit exactly 5 `faqs` entries instead of the gate-configured required count, on the first reply only.

Observed behavior, from the real run:

```
[buildRecord] gemini-3.1-pro-preview: initial attempt...
[buildRecord] 1 failure(s) on initial attempt.
[buildRecord] gemini-3.1-pro-preview: repair turn 1...
[buildRecord] passed after 1 repair turn(s).
validation:   PASS
repair turns: 1 of 3 allowed
visible words: 2074
```

This confirms, against a live model:
1. `validate.ts` caught the induced `count:` failure on the first attempt (as designed, it did not throw — it returned `{ ok: false, errors: [...] }`).
2. `buildRecord.ts` built a `buildRepairPrompt()` message from those exact errors and sent it back to the model.
3. The model corrected the flagged field and left the rest of the record intact, and the corrected candidate passed `validate.ts` on repair turn 1 — well within the 3-turn budget.

The repair loop was previously unexercised (Milwaukee passed cold); it now has a real, reproducible pass under injected failure.

## How to reproduce

```
GEMINI_API_KEY=... npx tsx scripts/src/precision-adapter/multiCityTrial.ts
```

Runs Columbus, Nashville, Kansas City (clean attempts) and Tucson (induced failure) in sequence and prints a pass/fail summary. Takes several minutes; run it as a background task, not a synchronous one, since a single record generation call can run past a minute per city.
