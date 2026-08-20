---
name: Meta research location resolution
description: Why the No-GMB meta engine trusts the model's page-read city/state over the URL slug.
---

# Meta engine location resolution

In the `researchMeta` engine (`lib/mc-core/src/meta/`), the city/state the **model reads from the page body** is the authoritative location source. The URL slug parse (`parseCityState`) and the regex address scrape (`extractLocations`) are only fallbacks.

**Why:** two compounding traps on real STS No-GMB pages:
- `parseCityState` anchors on USPS state tokens, so a slug like `secure-data-destruction-in-sacramento-...` makes the English word **"in" parse as Indiana** (same risk: "or"→OR, "me"→ME, "hi"→HI, etc.). It then treats the surrounding words as the "city" → garbage like `Secure Sacramento Sts`.
- `extractLocations` tends to grab the **STS headquarters address in the footer (Indiana)**, which then "corroborates" the bogus URL state. The net result was a SerpAPI 400 on an unsupported `Secure Sacramento Sts, Indiana` location.

**How to apply:** the niche-detection LLM call returns `city` + 2-letter `state` (the locality the page *targets*, explicitly NOT the HQ). `resolveLocation` returns those first when both are present; only if the model fails to extract a location does it fall back to URL parse, then page regex, then throws (fail-loud). This matches the project's "pages are sneaky — read the real content, not the slug" principle. Normalize model state via `normalizeStateToAbbr` (handles "California"→"CA").
