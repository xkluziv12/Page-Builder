---
name: STS prompt source hierarchy
description: How to distinguish active STS and generic master prompts from stale local and legacy Google Drive copies.
---

# Prompt source hierarchy

Google Drive contains multiple competing prompt trees. The active STS-specific tree is `PROMPTS/STS-DCD`; the active reusable generic tree is `PROMPTS/Universal-Master`. The legacy `M.A.R.K. Prompts` folder and local Mission Control/Bake-Off prompt snapshots can lag behind both. Do not treat a title, version label, or modified timestamp alone as proof that a copy is canonical.

**Why:** an audit found meaningful version drift: active STS-DCD documents included Page Builder `(3.26.3)` and SEO Master Audit `(10.16.3)`, while the legacy folder had older Page Builder `v3.6` and SEO Audit `v10.12.4`, and local snapshots were also behind. Older memory incorrectly identified the `(4.7)` folder and v10.13.3 as current.

**How to apply:** before changing or describing a canonical prompt, verify its current contents in the correct Drive tree and compare any runtime/local copies that consume it. Keep Universal-Master generic; apply STS-specific CMS rules through STS materials or configuration, not as universal behavior.

# STS landing-page model

- Pages are full custom-coded HTML pasted into the CMS, not CMS-builder-native layouts.
- The page's single H1 lives in the hero (city in H1, lead form on the right).
- On Joomla, the CMS title band is hidden with CSS so only the hero H1 shows.
- Images use verified absolute HTTPS URLs on the STS server; do not construct unverified image URLs.
- Preserve the prompt's copy, certification-scope, entity-count, and FAQ constraints rather than substituting generic SEO assumptions.

# Google Drive access notes

The Google Drive integration can read/export current prompt documents. Do not assume legacy prompt-publishing UI or a local snapshot is the live source. When reading a Google Doc, export its current body and verify the content rather than relying on Drive full-text search hits alone.
