# Bake-Off snapshot — 2026-06-23 — "Full adherence to checklist"

## What changed vs. the previous version

**This version's note: FULL ADHERENCE to the human No-GMB checklist.**

- Every model now runs the EXACT human checklist as ONE continuous stateful
  conversation using the tool's VERBATIM `copyPrompt()` prompts + the REAL
  uploaded design fixtures (Master Page Builder, Master Design Tier 2, STS SEO
  data, Master SEO Audit). No per-model special-casing.
- The intro readiness handshake is now validated (fail loud on a wrong-model
  STOP / refusal; readiness otherwise confirmed by the build turn).
- The `seo-verify` and `verify-links` PASSED/FAILED verdicts are now ACTED ON:
  a FAILED verdict drives a bounded corrective re-verify loop, then fails loud.
- Screenshots are rendered per-scenario into `screenshots/<scenario>/` (an
  earlier path bug overwrote them at the top level — fixed this run).

> Previous version (the "old system"): the harness sent only the master prompt
> as a system message + a generic "Build the page" user message — it dropped the
> per-phase mini-prompts, didn't validate the intro handshake, and ignored the
> verify verdicts. If an older snapshot exists in this folder it is labelled with
> its own date; if not, this is the first archived run.

## The two scenarios (what each one tests)

These are NOT duplicates — they test the with/without-GMB difference directly:

- **no-gmb** = you do NOT have / do NOT provide a Google Business Profile.
  City + state targeting only, no explicit `page_url`, no GMB block. This is the
  faithful reproduction of the production context (`describeContext`), which
  deliberately omits GMB because STS spoke pages target a service-area city, not
  a verified storefront.
- **gmb** = you DO provide a GMB location. Every model receives the identical
  enriched block: business name, street address, ZIP, county, phone,
  neighborhoods, landmark, lat/lng, CID, and an explicit `page_url`. The
  deterministic schema also upgrades to a full LocalBusiness (PostalAddress +
  geo + CID + hasMap). This measures whether handing a model a well-formed GMB
  block changes/improves the page it builds.

> NOTE: the GMB values in this run are ILLUSTRATIVE placeholders (reserved
> 555-01xx phone, placeholder street/CID), NOT STS's verified location. The GMB
> scenario measures build BEHAVIOUR given a well-formed block; it does not assert
> these are real. Swap in real values before a run if you want a true-data test.

## Leaderboard (composite /100) — this run

| Scenario | Model              | Score |
|----------|--------------------|-------|
| no-gmb   | Claude Sonnet 4.6  | 76    |
| no-gmb   | OpenAI GPT-5.5     | 75    |
| no-gmb   | Gemini 3.1 Pro     | 73    |
| no-gmb   | Grok (xAI)         | 66    |
| gmb      | Grok (xAI)         | 69    |
| gmb      | Claude Sonnet 4.6  | 67    |
| gmb      | OpenAI GPT-5.5     | 66    |
| gmb      | Gemini 3.1 Pro     | 66    |

Models (each provider's current flagship, peer to Sonnet 4.6):
Anthropic `claude-sonnet-4-6` · Google `gemini-3.1-pro-preview` ·
OpenAI `gpt-5.5` · xAI `grok-4.3` (auto-discovered newest tag at runtime).

## What's in this folder

- `results.json` — full run record (HTML, schema, checker reports, link audits,
  timings, scores) for every (scenario, model).
- `pages/<scenario>/<model>.html` — each built page as a standalone file you can
  open directly in a browser.
- `screenshots/<scenario>/<model>.png` — rendered screenshot of each page, plus
  `reference.png` (the real STS Billings page used for closeness scoring).
