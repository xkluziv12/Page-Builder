---
name: Mission Control location verification
description: Safety rules for cross-checking URL-parsed city/state against fetched page content.
---

Mission Control derives a run's city/state from the target URL slug, then fetches the page
and extracts location signals (JSON-LD PostalAddress + "City, ST ZIP" text) to verify/correct it.

**Rule 1 — never block.** Verification only confirms or corrects; a mismatch never fails run creation.

**Rule 2 — correct STATE only, never CITY.** When a page-extracted location has the *same city*
but a *different state*, adopt the page's state. Never switch to a *different city*.
**Why:** business pages often carry a single HQ PostalAddress in JSON-LD; substituting the page's
city would override every local page to the HQ city. Same-city/different-state is the real
"shared city name" case (Portland OR vs ME) we want to catch.

**Rule 3 — equivalence-only city matching, no substrings.** `cityNamesEquivalent` tolerates case,
punctuation and abbreviations (St↔Saint, Ft↔Fort, Mt↔Mount) but must NOT substring-match.
**Why:** substring matching made "York" match "New York" and "Port" match "Portland", which would
wrongly trigger a state correction. Caught in code review.

**How to apply:** logic lives in `deriveRunInputs` (api-server mc-runtime.ts); extraction +
`cityNamesEquivalent` live in `lib/mc-core/src/seo/location.ts`. Real pages frequently expose no
parseable address, so `locationVerified:false` + slug fallback is the common, safe path.
