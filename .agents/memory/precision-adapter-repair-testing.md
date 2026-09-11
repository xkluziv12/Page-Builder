---
name: Precision-adapter repair-loop testing
description: How to genuinely exercise buildRecord.ts's repair loop, and a known gap in what it can build.
---

## Testing the repair loop for real

`buildRecord()` in `scripts/src/precision-adapter/buildRecord.ts` takes an optional
`options.sabotageInitialPrompt` string (default unset, so normal runs are unaffected).
When set, it is appended to the FIRST prompt only, instructing the model to deliberately
break one specific rule on that one reply. This lets a test drive a real repair-turn
cycle — real model call, real `validate.ts` rejection, real repair prompt, real corrected
reply — instead of hand-building a fixture and calling internal functions directly.

**Why:** the repair loop had never actually run (the first proof city passed cold), so a
hand-built fixture would prove the loop's plumbing but not that a real model reply can
trigger and recover from it.

**How to apply:** reuse this hook (`scripts/src/precision-adapter/multiCityTrial.ts` is a
worked example) for any future adapter testing that needs to prove recovery behavior
rather than just first-attempt success.

## Known gap: no confirmed-metro record type yet

`buildInitialPrompt()` unconditionally builds a PLANNING-market record for whatever city
it's given — `availabilityConfirmationRequired: true`, address/listing fields omitted —
even when the target is one of the seven confirmed service metros listed in
`prompt-pack/fact-layer.json`. There is no branch for a confirmed-metro record (real
address/listing block, `availabilityConfirmationRequired: false`). Tracked as a follow-up
task; do not assume Kansas City/Omaha/etc. runs through this adapter produce a
metro-shaped record just because the city name matches the confirmed list.
