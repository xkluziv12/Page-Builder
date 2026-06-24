---
name: No-GMB meta/schema source of truth
description: Where the canonical Page Title / Meta Description / Keywords / JSON-LD for No-GMB pages come from, and the rule that any feature emitting them must reuse it.
---

# No-GMB page meta + schema are deterministic — reuse the generator, never improvise

For STS No-GMB city pages, the Page Title, Meta Description, Keywords, and JSON-LD
schema are **deterministic, research-backed templates**, not free-form copy. The
canonical patterns were confirmed from a live page and are documented in
`.local/tasks/meta-schema-generator.md`. They are implemented in the No-GMB tool's
`buildNoGmbPayloads()` (the "Generate Meta + Schema" button → `generateMetaSchema()`),
which is the single source of truth. Signature strings include R2 Certified, NAID AAA
data destruction, and ITAD — these are deliberate SEO/trust signals.

**Rule:** any feature that emits or instructs someone to enter No-GMB meta/schema
(agent-handoff prompts, exports, a future Playwright runner, the GMB-toggle follow-up
when it does its own variant) MUST pull from the deterministic generator, not invent
its own wording.

**Why:** an agent-handoff prompt was first written with ad-hoc meta text that dropped
the R2/NAID/ITAD signals and didn't match what Human mode produces — inconsistent and
SEO-weaker. Meta is a high-value signal; divergent copy across modes is a real defect.

**How to apply:** compute values via `buildNoGmbPayloads({ city, st, stateFull, county })`
(uppercase the state abbrev; strip a trailing "County" from the county before passing)
and embed/paste them verbatim. Note the GMB variant is different (CID, street address,
phone allowed) — do not reuse No-GMB payloads for GMB pages.
