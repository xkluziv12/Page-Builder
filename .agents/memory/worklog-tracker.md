---
name: Unified work-log tracker
description: Canonical page-tracking work-log that every path feeds, surfaced as the MC Master Grid and synced to Sheets/GSC behind gated seams.
---

# Unified work-log tracker

One canonical work-log in the MC DB (`mc_work_log`, dated snapshots in `mc_seo_snapshot`) is the single source of truth for page tracking across STS. Three write paths feed it: the old static VA HTML tools, the Mission Control publish pipeline, and a one-time historical import. It surfaces as the **Master Grid** page in Mission Control and mirrors one-way to Google Sheets.

**Natural key = normalized URL.** Upserts collapse `www.` and trailing slashes so the same page from any path dedupes to one row. Never introduce a second identity for a page — always upsert by normalized URL.

**Why:** the whole point of the task was to stop having parallel, divergent trackers; every path must converge on the same row or the grid/Sheet drifts.

**How to apply:**
- Static tools POST to `/api/mc/work-log` (root-relative; routes through the shared proxy to the API server regardless of the page-terminal base path). They keep their existing clipboard report / n8n log as the primary action and the tracker POST is additive and fail-loud (toast on error), never blocking the original flow.
- External syncs are **gated and fail loud, never silently degrade**: Google Sheets sync needs the Google Sheets connector + `WORKLOG_SHEET_ID`; GSC monthly pull needs `GSC_SITE_URL` + `GSC_API_KEY` (there is **no** Replit GSC integration — it's secrets/OAuth only). When unset, the endpoints return a clear "not configured" error.
- `sitemap-reconcile` is a **GET** (read-only); pass `persist=true` to write the in-sitemap flag back onto rows.
