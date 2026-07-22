# How to Adapt Page Terminal (M.A.R.K.) to a New Vertical

> **Handoff doc for another Replit agent reviewing this project.**
> Target: a different industry vertical (e.g. plumbing, dental, legal, etc.)
> Source: `artifacts/page-terminal/` — the navy/gold M.A.R.K. nav shell + self-contained HTML tools.

---

## What This Is

Page Terminal is a **React navigation shell** that hosts a suite of **self-contained
static HTML tools** via iframe. Each tool is a single file with inline CSS/JS —
they are NOT React components and should NOT be rewritten into React.

The tools orchestrate AI-assisted page-building workflows for virtual assistants.
A VA opens a tool, fills in a target URL + business data, clicks through phases,
and copies prompts into Claude to generate SEO landing pages.

---

## Architecture Overview

```
artifacts/page-terminal/
  src/App.tsx              — React shell: brand switcher, sidebar nav, iframe loader
  src/terminal.css         — Shell styling (navy/gold theme)
  public/tools/*.html      — Self-contained tool pages (the actual VA workflows)
  public/tools/technocycle/*.html — TechnoCycle brand variant of core tools
```

**Key rule:** The shell is a dumb iframe wrapper. The intelligence lives entirely
in the HTML tools. The shell only knows: which file to load, which brand is active,
and which nav item is selected.

---

## Tool Inventory (17 tools)

| # | Tool | File | What It Does |
|---|------|------|--------------|
| 1 | **Page Rebuild** | `index.html` | Full GMB-page rebuild — extracts NAP from Google Maps paste, runs 9 phases (target data → content → map → SEO → social → schema → HTML → render → QA). The flagship tool. |
| 2 | **Page Rebuild (No GMB)** | `no-gmb.html` | Same 9-phase flow but for locations WITHOUT a Google My Business profile. Uses business-name fallback for schema. |
| 3 | **Hub + Spoke** | `hub-spoke.html` | Internal linking strategy: builds tiered page clusters (hub city + spoke subpages) with canonical/cross-link logic. |
| 4 | **Service Pages** | `page-terminal.html` | Streamlined terminal for building service-specific subpages (shorter than full rebuild). |
| 5 | **Blogs** | `blog-terminal.html` | SEO blog content orchestrator — fetches external research data from n8n webhook. |
| 6 | **A.I. Pages** | `ai-pages.html` | Rapid AI-driven content generation (lightweight / fast-turn prompts). |
| 7 | **Marketing** | `marketing.html` | Marketing copy + meta assets (social descriptions, ad copy). |
| 8 | **New Pages** | `new-pages.html` | Fresh page creation template (blank-slate workflow). |
| 9 | **IT** | `it.html` | IT department workflow prompts (internal-use). |
| 10 | **Ops** | `ops.html` | Operations workflow prompts (internal-use). |
| 11 | **Symptoms** | `symptoms.html` | Diagnostic/troubleshooting workflow (internal-use). |
| 12 | **Admin** | `admin.html` | Admin tooling (internal-use). |
| 13 | **WIW Data** | `WIW-data.html` | "Who Is Where" data extraction/lookup (fetches n8n webhook). |
| 14 | **SALES Grading** | `SALES-grading.html` | QC tool: grades sales pages against a rubric. |
| 15 | **DCD Grading** | `DCD-grading.html` | QC tool: grades Data Center Destruction pages. |
| 16 | **TechnoCycle Page Rebuild** | `technocycle/index.html` | TC-brand version of #1 with TC-specific assets/rules. |
| 17 | **TechnoCycle No GMB** | `technocycle/no-gmb.html` | TC-brand version of #2. |

**Brand variants (#16-17):** These are copies of #1-2 with logo swaps, color
changes, and business-specific defaults. Adding a new vertical = create a similar
subdirectory (`public/tools/<brand>/`).

---

## What Each Tool Is Made Of

Every HTML tool follows the same pattern. Open any `.html` file and you'll see:

1. **Inline CSS** — "Luxury AI" aesthetic: dark gradients, animated neural-network
   nodes, data-stream lines, breathing glows. Tailwind-like utility classes.
2. **Mission Control section** — VA inputs: name, target URL, raw GMB data paste.
3. **Data Extraction Engine** — JS regex functions (`extractData()`, `parseVerify()`)
   that pull phone, address, CID, hours, etc. from a Google Maps copy-paste.
4. **Phase workflow** — 1-9 numbered phases with checkboxes, sticky progress bar,
   "copy prompt" buttons. Each phase has:
   - A system instruction block (the prompt template)
   - User inputs injected via JS string replacement
   - A `copyPrompt(type)` function that assembles and copies to clipboard
5. **localStorage persistence** — `saveState()` / `loadState()` so refresh doesn't
   lose progress.

---

## The Shell (App.tsx) — What You Change

```typescript
// artifacts/page-terminal/src/App.tsx

const TOOLS: Tool[] = [
  { label: "Page Rebuild", icon: "fas fa-sync-alt", file: "index.html", tcFile: "technocycle/index.html" },
  { label: "Page Rebuild (No GMB)", icon: "fas fa-store-slash", file: "no-gmb.html", tcFile: "technocycle/no-gmb.html" },
  // ... each tool maps label → file path → optional brand-variant path
];
```

**Brand switcher logic:** `resolveFile(tool, brand)` — if brand is `tc` and `tcFile`
exists, load the TC variant; otherwise load the default `file`.

---

## Adaptation Checklist (New Vertical)

### 1. Clone the architecture (don't rewrite)
- Copy the nav shell (`App.tsx`, `terminal.css`, build config) as-is.
- Create a new brand key (e.g. `plb` for "Plumbing Business") in the shell.
- Keep the iframe pattern — do NOT convert HTML tools to React.

### 2. Brand identity
- Replace the navy/gold color scheme in `terminal.css` — or create a brand-specific
  CSS override (same pattern as `technocycle/` variant directory).
- Replace the logo image references in the shell.
- Add a new brand toggle in `App.tsx` alongside the existing STS/TC switcher.

### 3. Tool selection (pick what applies)
For a new vertical, you probably need a **subset** of the 17 tools:

| Vertical type | Likely needed |
|---------------|---------------|
| Local service (plumber, dentist, roofer) | Page Rebuild, No GMB, Hub + Spoke, Service Pages |
| Multi-location chain | All of the above + Blog terminal |
| SaaS / national | New Pages, Marketing, A.I. Pages |
| Internal operations only | IT, Ops, Admin, WIW Data |

**Rule:** Only port the tools your vertical actually needs. The `TOOLS` array in
`App.tsx` controls which nav items appear.

### 4. Content adaptation (the heavy lift)
For each ported tool, adapt these content sections:

**a. Business data extraction rules**
- In `extractData()` / `parseVerify()`: update regex patterns to match the new
  vertical's data formats. The current patterns are tuned for:
  - Electronic recycling (NAP + GMB CID)
  - "City, ST ZIP" address parsing
  - Phone formats with recycling-specific extensions
- For a new vertical, you'll need: their address format, phone format, any
  industry-specific identifiers.

**b. Prompt templates (system instructions)**
- Each phase has a big block of text — the "system instruction" that gets copied
  to Claude. These are hardcoded in the HTML as string templates.
- **Must adapt:**
  - Business context ("we are an electronic recycling company" → new vertical)
  - SEO keywords and niche terms
  - Schema.org types (currently `LocalBusiness` + `RecyclingService` → e.g. `Plumber`, `Dentist`)
  - Service area logic (county-level vs city-level)
  - Content tone (technical/formal → friendly/professional for new vertical)
- **Can keep as-is:**
  - Phase structure (target → content → map → SEO → social → schema → HTML → render → QA)
  - The build/audit workflow pattern
  - The copy-to-clipboard UX

**c. Default values and fallbacks**
- `buildNoGmbPayloads()` (in `no-gmb.html`) — the No-GMB schema fallback uses
  business-name-driven defaults. Update:
  - Default page titles, meta descriptions, OG tags
  - Default schema fields when no GMB data exists
  - Backup phone (currently falls back to HQ phone → new HQ phone)

**d. External data sources**
- Some tools (`blog-terminal.html`, `WIW-data.html`) fetch from n8n webhooks at
  `stsrecycling.app.n8n.cloud`. For a new vertical:
  - Either repoint to your own n8n instance
  - Or strip the external-fetch phases and replace with static data inputs

### 5. Testing the adaptation
For each adapted tool, verify:
1. **Data extraction:** Paste a real Google Maps listing for a business in the new
   vertical → all fields populate correctly.
2. **Prompt compilation:** Click through all phases → "copy prompt" → paste into
   Claude → the prompt reads correctly for the new vertical.
3. **No-GMB fallback:** Test with a location that has no GMB profile → schema
   and meta still generate valid output.
4. **localStorage:** Refresh mid-workflow → state restores.
5. **Brand switch:** Toggle between default and new brand → correct files load,
   correct theme applies.

---

## What NOT to Touch

- **The iframe architecture** — the shell loads tools via iframe; keep it that way.
- **The phase/checkbox UX pattern** — every tool uses the same 9-phase flow with
  sticky progress bar; this is the signature M.A.R.K. experience.
- **localStorage keys** — unless you're making the new brand completely separate.
- **The Mission Control integration** — that's a separate artifact (`artifacts/mission-control/`)
  with its own backend and database; it's NOT part of Page Terminal adaptation.

---

## Quick-Start: Files to Open First

```
# Understand the shell
artifacts/page-terminal/src/App.tsx          — nav, brand switcher, iframe loader
artifacts/page-terminal/src/terminal.css     — shell styling

# Understand a complete tool
artifacts/page-terminal/public/tools/index.html          — the flagship Page Rebuild
artifacts/page-terminal/public/tools/no-gmb.html         — No-GMB variant
artifacts/page-terminal/public/tools/technocycle/index.html — brand variant example

# Understand the data extraction engine
# Search within any .html file for: extractData, parseVerify, copyPrompt, saveState
```

---

## Decision: Clone vs. Extend

| Path | When to use |
|------|-------------|
| **Extend in-place** (add brand to existing shell) | New vertical is a separate brand within the same VA team/ecosystem. e.g. "STS Recycling" + "PlumberCo" managed by the same people. |
| **Clone to new repo** | New vertical is a completely different client/team with no shared tooling. Copy the shell + adapted tools into a fresh repo. |

For a clone: use this repo as a template — keep `artifacts/page-terminal/`, strip
Mission Control and Bake-Off (unless needed), adapt the tools.

---

## File Count & Size

- **Shell:** ~200 lines of React + 1 CSS file
- **Each tool:** 1 self-contained HTML file, ~500-2000 lines
- **Total tools to potentially adapt:** 17 (but you'll likely only need 4-6)
- **No backend required** for Page Terminal alone — it's all static files
