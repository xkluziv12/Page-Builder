---
name: Mission Control post-publish QC
description: How dashboard QC is universal across tracks/page types, and the rule for deriving the live URL.
---

# Mission Control post-publish QC

The dashboard runs two automated checks against a published page's LIVE URL: GTmetrix
speed (fail if performance score < 85 or LCP > 2500ms) and a JSON-LD duplicate/integrity
scan. These run from the dashboard (Replit) only — never through the Joomla task agent.

## Live-URL derivation is the single source of universality

QC keys off each run's own published live URL, derived uniformly as
base domain + "/" + the run's published alias. The alias is generated the same
way for every run regardless of variant.

**Why this matters:** QC therefore needs NO branching on track/page-type/GMB. It is
automatically correct for:
- GMB vs non-GMB — "GMB" is just the `verifiedCid` flag on a run; it changes generated
  *content*, not the URL. Same alias-based URL either way.
- track `page` vs `blog` — both publish to `baseDomain/alias`.
- pageType `HUB` / `SPOKE` / `NATIONAL` — all publish to `baseDomain/alias`.

**How to apply:** If you extend QC, derive the target from the run's published alias (or
an explicit `url` override in the request body); do not special-case blog/hub/gmb URL
shapes — there are no `blogs/`, `hub/`, or `gmb/` subdirectories.

## QC failure semantics

QC fails loudly: overall `passed` requires BOTH checks ran AND passed. A missing
GTMETRIX_API_KEY or an unreachable live page → that check `ran: false` and overall FAIL,
never a silent skip. JSON-LD duplicate detection only flags SINGLETON schema @types
(LocalBusiness/Organization/WebSite/WebPage/BreadcrumbList/FAQPage/Article/BlogPosting…)
to avoid false positives on legitimately repeatable types (e.g. Service); conflicting-@id
only counts typed definition nodes, not reference-only `{ "@id": … }` pointers.
