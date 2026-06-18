---
name: Page Terminal (M.A.R.K.) architecture
description: How the Page Terminal artifact is structured and why it hosts static HTML tools via iframe instead of a React rewrite.
---

# Page Terminal / M.A.R.K. rebuild

Rebuild of a GitHub Pages site (`xkluziv12/Page-Builder`). The original was a thin HTML wrapper that iframed standalone, fully self-contained HTML tool pages.

**Decision:** preserve the wrapper-and-iframe architecture. The React artifact (`artifacts/page-terminal`) is ONLY a navigation shell; the actual tools live as static files in `public/tools/*.html` and load into an iframe.

**Why:** the tool pages are large (100-185KB each), self-contained (inline CSS/JS), and not cross-linked. Rewriting them into React would be high-risk, high-effort, and add nothing. The user asked to "rebuild this system here" = host it on Replit, not re-architect it.

**How to apply:**
- Nav items are the 7 from the original wrapper only (Page Rebuild, Hub+Spoke, New Pages, Marketing, Service Pages, Blogs, A.I. Pages) — defined in `src/App.tsx` `TOOLS`. The original wrapper exposed exactly these; do not add the extra dashboard/ops modules to the nav unless the user asks.
- Extra standalone tools (`DCD-grading`, `SALES-grading`, `WIW-data`, `admin`, `ops`, `it`, `symptoms`) are hosted in `public/tools/` and reachable by direct URL, matching the original (they were never in the wrapper nav).
- Dashboard tools fetch from external n8n webhooks at `stsrecycling.app.n8n.cloud` — external dependency, not hosted here.
- iframe is intentionally NOT sandboxed: tools are trusted first-party, same-origin, and need localStorage, clipboard, popups (Claude links), and downloads.
- To update tool source from upstream: pull raw files from `raw.githubusercontent.com/xkluziv12/Page-Builder/main/<file>` and re-copy into `public/tools/` (rename `Hub+spoke.html` → `hub-spoke.html`).
