---
name: M.A.R.K. canonical prompt set (Drive)
description: Which Google Drive files are the current/authoritative M.A.R.K. build prompts, and the STS page-build model they describe.
---

# Canonical M.A.R.K. prompt set

The user's current/authoritative STS SEO audit is the uploaded **MASTER SEO AUDIT v10.13.3**, replacing the older `(4.7)` / `(5.0)` SEO audit copies in the Google Drive workflow. The Google Doc named **"(5.0) SEO MASTER AUDIT"** is intended to hold this same content.

**Why:** the Drive folder mixes many versions and the operator explicitly selected v10.13.3 as the replacement; title or modified date alone is not a safe source-of-truth signal.

**How to apply:** when grounding any build/SEO/schema/blog workflow, read the `(4.7)`-prefixed doc for that role. Map:
- Landing pages → `(4.7) Page Builder` (internal version says "MASTER PAGE BUILDER v3.6")
- SEO audit → uploaded `MASTER SEO AUDIT v10.13.3` / the `(5.0) SEO MASTER AUDIT` Google Doc after its body is successfully replaced
- Schema → `(4.7) Schema Generator`
- Hub+Spoke → `(4.7) HUb+Spoke Framework`
- Blogs → `(4.7) STS BLOG BUILDER`, `(4.7) DCD BLOG BUILDER`, `(4.7) BLOG SEO AUDIT`
- Job titles → `(4.7) JOB TITLE SEO`, `(4.7) k-12 job titles seo`
- Performance data → `STS SEO DATA 2026` (spreadsheet, newest copy)
- Page template → `2 (landing page) Design Bible CODE` (there is NO `(4.7)` design bible; bibles are separately versioned + tiered: TIER 1 / Tier 2 / Tier 3-4 service bible)

# What the Page Builder prompt declares

`(4.7) Page Builder` top block: `[REQUIRED_INPUTS]` = Master Design Bible CODE (.docx) + STS SEO DATA 2026 (.xlsx) + optional Handoff Document (.md). User also supplies page_url, gmb_url, gmb_data. Output = ONE `final-html.html`.

# STS landing-page model (relevant to Joomla->WordPress port)

- Pages are FULL custom-coded HTML pasted into the CMS, not CMS-builder-native layouts.
- The page's single **H1 lives in the hero** (city in H1, lead form on the RIGHT).
- On Joomla they HIDE the CMS title band via CSS (`.page-header{display:none!important}`, plus item-page/contentheading resets) so only the hero H1 shows — see the Design Bible CODE's "JOOMLA RESETS" block.
- Images must be **absolute HTTPS URLs** on the STS server (`https://www.stselectronicrecyclinginc.com/images/2017/compressed/<file>_1920.jpg`); root-relative paths silently fail in Joomla. Verified image set is enumerated in the prompt — do NOT construct new image URLs (prompt HALTs with `IMAGE_NOT_VERIFIED`).
- Output rules: no em dashes in generated copy; 12+ entities/page; FAQ answers 35-45 words; certification scope language is constrained (NAID AAA = data destruction only, R2v3 = recycling only, NIST 800-88 = standard, not a held cert).

# SEO audit current version

The SEO audit family is now **v10.13.3** (Aug 2026): the Drive doc "(5.0) SEO MASTER AUDIT", the mc-core inline `seoAuditPrompt`, and the bake-off `master-seo-audit.txt` fixture were all replaced with the same uploaded v10.13.3 text. The `(4.7)`/older SEO audit docs are superseded. Historical bake-off outputs/snapshots were deliberately left on their old versions.

# Editing user's Google Docs from this repl

The google-docs connector can READ docs but its `:batchUpdate` write returns 403 here. Working write path: **google-drive** connector `PATCH /upload/drive/v3/files/{id}?uploadType=media` with `text/plain` body — Drive converts and replaces the Doc body in place (same file id/link preserved). Verify by re-exporting `?mimeType=text/plain`.

# Drive API access

`listConnections('google-drive')[0].settings.access_token`; Drive v3 REST. Export gdocs via `files/{id}/export?mimeType=text/plain` (or `text/html`). The `(4.7) Page Builder` doc has NO meaningful hyperlinks — it names required files by name, not by link. NEVER print the token.
