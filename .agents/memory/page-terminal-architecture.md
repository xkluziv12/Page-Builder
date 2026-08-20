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

## Brand facts live inside the tools, not just the shell

Each tool bakes brand facts (domain, CID, address, certs, master-prompt references) directly into JS-generated copy/paste prompt strings — e.g. `blog-terminal.html` builds a "Master Schema Generator" TASK string with `cid:..., Jacksonville TX 75766` hardcoded. So a brand swap is NOT only a shell/palette change: every fact-bearing tool needs a brand-specific copy with those inline strings swapped.

**Master prompt docs are not served by the repo.** Tools instruct the VA to *upload* the master docs ("Master Page Builder", "Master SEO Audit", "Master Schema Generator") into a Claude Project; the repo never loads a `.txt`. The per-brand `public/prompts/<brand>/*.txt` files are standalone deliverables the user pastes into that brand's Claude Project — the parallel to how STS surfaces its docs.

**Why:** when adding a new brand mode (e.g. Technocycle), grepping the shell for facts is insufficient; the contamination hides in tool JS strings and in the (separate) master-prompt docs. The cross-contamination surface to check is brand name, domain, address, phone, facility size, CID, certs, image paths, social, competitor list.

**TC adaptation gotcha:** STS tooling is Joomla (`loadposition`, `/images/2017/...` image paths, Joomla-CSS rules); Technocycle is WordPress+Elementor (`/wp-content/uploads/...`). The STS "verified image library" filenames are STS-specific — for any other brand they are unverified and must become loud `TECHNOCYCLE_TBD` placeholders, never silently re-pointed at the new domain. Generic helpers like a 55-US-cities map (contains "Jacksonville, FL") are NOT brand facts — leave them.

**TechnoCycle is owned by STS Electronic Recycling, Inc. and is "covered by everything STS is."** Practical consequence: TechnoCycle inherits STS's certifications/compliance even when a cert is not listed on TechnoCycle's own site. Specifically NAID AAA — which is NOT on TechnoCycle's own certs page — is valid for TechnoCycle via the STS parent (data-destruction scope). Do not re-flag NAID AAA as a TBD for TechnoCycle. STS is therefore also in TechnoCycle's `COMPETITOR_EXCLUSION` list (parent, not a competitor).

**Brand-mode tool copies must namespace localStorage + cover the full nav lineup.** Each TC tool copy must use its own storage key (e.g. `stsTrackerV7`→`tcTrackerV7`, `markBlogV2`→`tcBlogV2`) or switching brands hydrates one brand's forms with the other's saved session. Every nav tool needs a `tcFile` in `App.tsx` `TOOLS` (including the "not configured yet" placeholders, which get green-themed copies under `tools/technocycle/` + their own `_placeholder.css`) — otherwise TC mode silently loads the STS file.

**`blog-terminal.html` is inherently multi-brand (STS/DCD/TC tabs), unlike the other tools.** It already shipped upstream with a TC tab whose facts were partly wrong/unverified (ISO 14001/9001/45001, employee count, founding year, a specific LinkedIn URL — all now `TECHNOCYCLE_TBD`).

**Hiding STS/DCD is NOT enough — the TC copy must be a true TC-only runtime.** Code review rejected merely defaulting to the TC tab: the hidden STS/DCD scaffolding still ran live webhook research for STS+DCD, rendered their columns, hardcoded `company:'STS'` in chat, and embedded STS facts (CID, Jacksonville, Joomla URLs, STS schema prompt) in dead-but-present branches. Reviewers treat STS facts *present in the file* as contamination regardless of reachability. Fix: strip STS/DCD entirely from the TC copy (CFG/PHASE_DEFS/state → TC only; collapse every `if(isSTS)/else if(isDCD)/else` and `company==='STS'` branch to the TC branch; remove STS-only schema case; `runResearch`/`switchTab`/`loadState`/`resetAll` TC-only; chat posts `company:'TC'`).

**Editing these tool HTMLs: the `read` tool escapes the files' emoji/box-drawing unicode (e.g. shows `\u26d4`), so `edit` exact-match on those lines is unreliable.** Do structural edits with a throwaway Node script using ASCII-only anchors + index math (slice between anchors rather than reproducing unicode bodies); to drop dead branches, replace `if(...STS...)...else{` with a bare `{ ... }` block so the kept branch's trailing `}` stays balanced. Validate with `new Function(scriptText)` (parses without executing DOM) before trusting it.

**Company profiles live in the DB.** A `company_profiles` table (Drizzle, `lib/db/src/schema/companyProfiles.ts`) holds canonical per-brand facts keyed by `slug` (`sts`, `technocycle`); re-seed/upsert via `pnpm --filter @workspace/scripts run seed:companies`. Still-unverified TC facts (GMB CID candidate, LinkedIn URL, image/logo/hero URLs, certificate page, creator attribution) are tracked under each row's `metadata.unverified`, mirroring the `TECHNOCYCLE_TBD` HALT placeholders in the prompts/tools.
>>>>>>> b49a86e (Make TechnoCycle blog-terminal copy a true TC-only runtime)
