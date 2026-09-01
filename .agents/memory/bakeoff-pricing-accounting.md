---
name: Bake-off pricing accounting
description: Provider-specific cache and long-context billing rules, plus the transcript identity guard needed for historical repricing.
---

# Bake-off pricing accounting

Measured bake-off costs must use the exact model rate card, provider-specific cache-hit rates, and per-request context bands. An aggregate token total is not enough when a provider bills an entire request at long-context rates after a threshold.

**Why:** the same transcript filename can be reused by later runs, so historical results can otherwise be paired with the wrong per-turn usage and receive incorrect long-context pricing. Cache-hit prices also differ materially across providers, so a universal discount is not honest.

**How to apply:** retain per-turn usage on new runs; when repricing an existing result, attach transcript turns only if their input, cached-input, and output totals exactly match the saved aggregate. Otherwise use aggregate standard-rate pricing and say so in the cost basis. Keep historical model aliases (for example, Claude Sonnet 4.6 versus Sonnet 5) as separate rate tiers.