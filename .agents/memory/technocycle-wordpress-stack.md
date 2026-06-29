---
name: TechnoCycle (TC) WordPress CMS stack
description: The real CMS stack/workflow the TC page-building tools target, and the decisions that shape generated output. Use when editing any tool under public/tools/technocycle/.
---

# TechnoCycle WordPress stack (vs STS Joomla)

The STS tools were built for a Joomla CMS. The TC copies under
`artifacts/page-terminal/public/tools/technocycle/` target TC's **real** stack
(established by a live-site audit, captured in `attached_assets/Pasted--TechnoCycle-WordPress-CMS-Workflow-Audit-*.txt`):

- **WordPress** on **Kinsta** hosting. NO Joomla, NO Divi, NO Elementor.
- Page builder: **Beaver Builder Pro** + **Beaver Themer**. Content is pasted into a
  Beaver Builder **HTML module** (Classic Editor plugin is active; pages have a
  "Text Editor" / "Beaver Builder" tab → "Launch Beaver Builder").
- New service/landing pages: apply **Inner Page Template (id=1256)** via the BB
  Templates panel, or use the "Duplicate Page" row action.
- SEO: **Yoast SEO** owns `<title>` + meta description. VA fills SEO title, Slug,
  Meta description, Focus keyphrase in the Yoast box below the editor.
- Caching: **two layers** — WP Rocket *and* Kinsta server cache. The admin-bar
  "Clear Caches" button clears both; otherwise Kinsta Cache → "Clear Site Cache".
  **Cloudflare is OFF.**

## Decisions that shape generated page output

- **Themer banner = the page H1.** The green title banner is a Beaver Themer layout
  that emits the single `<h1>` from the WordPress page title.
  **Why:** so generated landing-page HTML must NOT contain its own H1 — it is a
  **body fragment that starts at `<h2>`**, wrapped in `<div class="tc-custom-content">`,
  with no `<!DOCTYPE>/<html>/<head>/<body>` or global header/nav/footer chrome
  (the WebVitality child theme + Themer supply those). The global footer is a
  sitewide Themer layout, so per-page NAP goes in an in-content block, not a footer.
- **Schema = SLIM TO GAPS.** Yoast already emits WebPage + BreadcrumbList + WebSite.
  Generated JSON-LD must only add the gap types (LocalBusiness/RecyclingCenter,
  Service, FAQPage) — never re-emit Yoast's types — and is pasted into a BB HTML
  module at the bottom of the page.

## Hard constraints (carried from the brand-mode task)

- Only ever edit the TC copies, never the STS originals.
- Never invent a TC fact: use a literal `TECHNOCYCLE_TBD: <what>` placeholder.
- Certs are phrased "inherited via STS parent", not TBD.

## Status (June 29, 2026): ON HOLD — partial

- Only **3 of 5** TC copies were converted (`page-terminal`, `no-gmb`,
  `blog-terminal`). **`index.html` and `hub-spoke.html` are still on Joomla** and
  must be converted with the same pattern before TC goes live.
- Open facts still using `TECHNOCYCLE_TBD` (grep to list): Claude Project URL,
  founding year, employee count, ISO 14001/9001/45001 status, LinkedIn slug,
  blog author/creator name.
- Full handoff: `artifacts/page-terminal/TECHNOCYCLE_HANDOFF.md`.
