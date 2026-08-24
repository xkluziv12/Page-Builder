# TechnoCycle Brand Mode — Status & Handoff

**Status: ON HOLD** (paused June 29, 2026 at user request)
**Scope:** Convert the TechnoCycle (TC) tool *copies* under
`artifacts/page-terminal/public/tools/technocycle/` from the inherited Joomla
workflow to TC's real **WordPress + Beaver Builder** workflow, with
WordPress-correct embedded prompts.

---

## 1. Current status at a glance

| TC copy | Converted to WordPress/Beaver? | Notes |
|---|---|---|
| `page-terminal.html` | ✅ Done | Full Joomla→WordPress rewrite, validated, renders |
| `no-gmb.html` | ✅ Done | Full Joomla→WordPress rewrite, validated, renders |
| `blog-terminal.html` | ✅ Done | Full Joomla→WordPress rewrite, validated, renders |
| `index.html` | ❌ **Not converted** | Still Joomla/Elementor; TC-branded but old workflow |
| `hub-spoke.html` | ❌ **Not converted** | Still Joomla/Elementor; TC-branded but old workflow |

3 of 5 TC copies are fully converted. **2 remain on the inherited Joomla
workflow** and must be converted before TC goes live.

---

## 2. What was done

- **Joomla → WordPress/Beaver Builder rewrite** of the 3 converted copies:
  - build / rebuild / SEO-verify prompts now emit an **H2-start body fragment**
    wrapped in `<div class="tc-custom-content">` (the Beaver Themer banner supplies
    the page `<h1>`).
  - Schema slimmed to **gaps only** (Yoast emits WebPage / BreadcrumbList / WebSite).
  - Final sweep: **zero residual Joomla / Elementor / Divi terms** in the 3 files.
  - `tc-contamination` validation passed; tool renders in the shell.
- **Hard constraints honored:**
  - Original STS tool HTML was never touched — TC copies only.
  - No TC fact was invented — unknowns use the literal placeholder
    `TECHNOCYCLE_TBD:` (see §4).
  - Certifications phrased as **"inherited via STS parent"** where applicable.
- **Git boundary verified and confirmed** (see §5).
- **Rebase onto latest main completed**; all three workflows running clean.
- **Memory updated** (`.agents/memory/technocycle-wordpress-stack.md` and index).

---

## 3. What still needs to be done

### A. Convert the 2 remaining TC copies (highest priority)
`index.html` and `hub-spoke.html` still emit the inherited Joomla/Elementor
workflow (verified: Joomla/Elementor/Divi residue present, 0 WordPress/Beaver
mentions). Convert them using the **same pattern** as the 3 completed files:
- prompts emit an H2-start fragment wrapped in `<div class="tc-custom-content">`
- Beaver Themer banner owns the `<h1>`
- schema slimmed to gaps (Yoast owns WebPage/BreadcrumbList/WebSite)
- then re-run the `tc-contamination` validation and confirm zero Joomla terms.

### B. Fill the open `TECHNOCYCLE_TBD` placeholders
Find them all with:
```
rg "TECHNOCYCLE_TBD" artifacts/page-terminal/public/tools/technocycle/
```
Outstanding facts to confirm **with the user** (never invent these):
1. **TC Claude Project URL/ID** — placeholder `claude.ai/project/TECHNOCYCLE_TBD`
   (appears in page-terminal, index, no-gmb, hub-spoke, blog-terminal).
2. **Founding year** — `founded TECHNOCYCLE_TBD`.
3. **Employee count** — `TECHNOCYCLE_TBD employees (unverified)`.
4. **ISO 14001 / 9001 / 45001 status** — currently `TECHNOCYCLE_TBD (unverified)`;
   confirm whether TC actually holds these certifications.
5. **LinkedIn company slug** — `linkedin.com/company/TECHNOCYCLE_TBD`.
6. **Blog creator/author entity name** — for meta-author injection in the SEO step.

### C. Verified TC facts already embedded (for reference)
- Houston-based ITAD + e-waste recycler; `technocycle.com`; phone **713-895-7409**
- Address: **6600 Long Point Rd, Ste 103, Houston, TX 77055**; 60,000 sq ft facility
- Tagline: *"Stewards of Yesterday's Technology for a Better Tomorrow"*
- Services: ITAD, e-waste recycling, hard drive shredding, data erasure, asset remarketing
- Certifications: **certified processing, secure data destruction (inherited via STS parent)**
- Email: `recycle@technocycle.com`; Facebook: `facebook.com/TechnocycleITAD`

---

## 4. Conventions / constraints (carry forward when resuming)

- **TC copies only.** Never edit the original STS tool HTML.
- **Never invent a TC fact.** Use the literal `TECHNOCYCLE_TBD:` placeholder for
  any unknown; fill only with user-verified data.
- **Certs** that come from the STS parent must be phrased *"inherited via STS parent"*.
- WordPress/Beaver pattern: body fragment starts at `<h2>`, wrapped in
  `<div class="tc-custom-content">`; banner supplies the `<h1>`; schema is gaps-only.

---

## 5. Git boundary (agreed — do not cross)

- **Never** touch `xkluziv12/master-prompts` or `xkluziv12/framework`.
- **Never** use the `solve-my-ai-bot` identity or `SOLVE_MY_AI_BOT_TOKEN`.
- Verified: this project's git remotes are **Replit-internal only**
  (`gitsafe-backup`, `main-repl`, `subrepl`) — no external GitHub remotes, and no
  code references those repos or that identity.
- The only GitHub relation is a **read-only** raw fetch from
  `xkluziv12/Page-Builder` (the original site this project was rebuilt from — a
  distinct repo, never written to).
- A GitHub connection and a Google Drive connection exist in the workspace but are
  **unused by any code**.
- If a prompt DB backup is ever added, it must target a repo **the user owns** —
  never `master-prompts` / `framework`.

---

## 6. Deferred / separate work

- **Prompt Manager** (prompt storage + database + optional git backup) is a
  separate effort, explicitly deferred by the user ("won't be done for a while").
  For now prompts remain **DB-only, no git backup**.

---

## 7. How to resume

1. Restart the `page-terminal` workflow (or view the preview) to confirm the tool renders.
2. Convert `index.html` + `hub-spoke.html` using the §4 WordPress/Beaver pattern.
3. Collect verified facts from the user and fill the `TECHNOCYCLE_TBD` placeholders (§3B).
4. Re-run the `tc-contamination` validation; confirm zero Joomla/Elementor/Divi terms across all 5 copies.
