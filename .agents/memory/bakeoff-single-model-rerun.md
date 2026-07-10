---
name: Bake-off single-model rerun / filter safety
description: How to rerun ONE model in the bake-off without wiping the others, and the seed bug that caused it.
---

# Rerunning a single model in the bake-off

`scripts/src/bakeoff/run.ts` writes ONE shared `results.json`. To rerun a single model
in place (e.g. swap the Claude slot to a different Sonnet revision and re-score it
apples-to-apples against the rest), use the general env knobs — never special-case:

- `BAKEOFF_MODELS=<id>` — which models RUN this pass.
- `BAKEOFF_FORCE=<id>` (or `all`) — force-rerun ids even if a prior ok/error result exists.
- `BAKEOFF_MODEL_OVERRIDES='{"claude":{"model":"<tag>","label":"..."}}'` — swap provider
  tag+label per model id (fail-loud on bad JSON / non-string fields).
- Keep the SAME scenario (e.g. `BAKEOFF_SCENARIOS=no-gmb`) so it REUSES the recorded
  shared grounding — that is what makes the rerun apples-to-apples.

**Why this file exists — the seed bug:** the scenario seed used to re-include prior
results only for the *filtered* models. So `BAKEOFF_MODELS=claude` seeded the scenario
with just claude and the next `persist()` WIPED grok/gemini/openai out of results.json.
Fixed: seed from ALL prior results (`prior.done.get(spec.id).values()`); the filter now
only decides which models execute, not which survive. Forced ids are dropped from
`prior.done` in `loadPrior` so they rerun while everything else is preserved.

**Recovery if a dataset gets clobbered:** the good entries are in git — restore
`artifacts/bake-off/src/data/results.json` from HEAD and merge the new entry in with a
script (replace the one model, re-sort ok-by-composite-desc then errors last). No need to
re-run the surviving models; scoring is deterministic against the same reference.

**Long runs:** must run as a console WORKFLOW, not inline/detached bash (reaping). Each
Sonnet-4.6 phase is slow (~3-7 min); a full No-GMB run is ~20 min.
