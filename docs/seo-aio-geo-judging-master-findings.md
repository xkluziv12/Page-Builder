# Master Findings — Cross-Model SEO / AIO / GEO Judging Round

> **Purpose of this document.** This is a complete, self-contained briefing you can paste
> into your **Page Builder prompt chat** and your **SEO Audit prompt chat** so they can see
> (a) exactly how our page-building system works today, (b) what an outside panel of six
> top AI models said about three competing versions of one page, and (c) the concrete,
> prioritized changes worth making to the prompts and the deterministic checker layer.
>
> It is written so each prompt-chat can read its own section and know what to change.
>
> _Generated 2026-06-24. Author: Replit build agent. Audited pages are the OLD bake-off
> no-GMB outputs — see the "Important caveats" section before acting on any single finding._

---

## 0. TL;DR (read this first)

- We took **three competing HTML versions of the same no-GMB local service page** — one built by **Sonnet 4.6**, one by **GPT-5.5**, one by **Gemini 3.1 Pro** — and sent them **blind** (labeled Page A / B / C) to **six judge models** with a heavy custom "master SEO/AIO/GEO professional" prompt that told each judge to **research the live web first** (Reddit, forums, Google) and then run a full ruthless audit and rank the pages.
- **Five of six judges completed** (GPT-5.5 Pro was rate-limited off our OpenAI key). **Four of those five fetched live**; Gemini's web search did not actually fire.
- **Consensus winner: Page A = Sonnet 4.6** — average rank **1.20**, with **4 of 5 first-place votes**. GPT-5.5 second (2.20). Gemini 3.1 Pro last (2.60, **zero** firsts).
- The win was decided **almost entirely on signals our deterministic checker layer does not enforce** — depth, local-entity density, sourced statistics, attributable quotes, question-style H2s, HowTo/answer-capsule structure, NAP/phone presence, and promotional-tone discipline. Our checkers are excellent at preventing *defects* (broken links, wrong images, hallucinated URLs) but say nothing about these *quality* signals.
- **The single biggest cross-page defect:** two of the three pages (the Sonnet winner and the GPT page) **had no phone number at all.** Per the clarified business rule, **every no-GMB page must surface the HQ phone** (the `+1-844-699-2913` toll-free line). That is an objective, deterministic fix.
- **You will never score 100%, and that is correct.** The judges fundamentally disagree on philosophy (depth-maximalism vs. citation/trust discipline), scores compress into a narrow band, and each model weights the rubric differently. The right target is: **eliminate the objective defects, guarantee the consensus signals, and accept the residual disagreement as taste.**

---

## 1. How our page-building system actually works (shared context for both prompt chats)

This is the system the three audited pages came out of. Both prompt chats should keep this
model in mind — most recommendations below name the exact phase/gate that owns the change.

### 1.1 The five-phase pipeline

Orchestrated in `lib/mc-core/src/pipeline/orchestrator.ts` as a sequential state machine.
Each phase is gated (often by VA review) before the next can run.

| Phase | What it does | Prompt / code |
| --- | --- | --- |
| **Research** | Fetches city/niche/competitor data via a `ResearchProvider` (Perplexity + SerpAPI + Claude synthesis, or the n8n webhook). Runs an **Entity Quality Gate** that flags estimated/low-confidence data for VA review. | `research/` + `runEntityQualityGate` |
| **Build** | Generates the page HTML with the **Page Builder prompt**. Runs the checker suite (but the word-count *floor* is not enforced yet). Leaves `<!-- AUDIT_TARGET -->` markers behind. | `prompts/pageBuilder.ts` |
| **Audit** | Runs the **SEO Audit prompt**, which **expands the `AUDIT_TARGET` markers** into geo/entity-rich content and adds AIO/GEO signals. The word-count **floor is enforced here**. | `prompts/seoAudit.ts` |
| **Schema** | Generates the JSON-LD `@graph` with the **Schema Generator**, derives Joomla meta, and runs a final entity-consistency check across body + schema + research brief. | `prompts/schemaGenerator.ts` |
| **Publish** | Final blocking-error check; if clean, atomic write to Joomla. Blog track also logs to the `mark-blog-log` webhook. | `publisher/` |

### 1.2 The Page Builder prompt (`pageBuilder.ts`)

- Organized into **14 sequential "Gates"** plus versioned change-logs (v3.1–v3.5) that layer
  on enforcement rules over time.
- Runs in **`SILENT_EXECUTION`** mode — suppress progress chatter, emit only critical errors
  or the final deliverable.
- Representative hard rules:
  - **Gate 6 — Facility language:** forbids ownership phrasing like "facility in {CITY}";
    approved phrasing is "Our secure fleet serves {CITY} from our 600,000 sq ft R2v3 certified facility."
  - **Gate 6 — Compliance/certs:** "supports compliance," never "guarantees compliance."
    NAID AAA = data destruction only; R2v3 = recycling only.
  - **Gate 12 — Images:** never construct an image URL; use the verified image library
    verbatim (root-relative paths are a confirmed Joomla silent-fail bug).
  - **Gate 13 — "Standard 12":** a 16-item mandatory checklist (no em dashes, entity density
    12+, balanced divs, etc.).
  - **AUDIT_TARGET markers:** the builder must drop **≥5 markers (≥3 for Light Touch)** into
    generic paragraphs for the audit phase to expand.

### 1.3 The SEO Audit prompt (`seoAudit.ts`)

- XML-wrapped config followed by a multi-phase execution (Phase 0A → 1P).
- **Preservation-first, replacement-preferred** architecture — optimize for
  "Traditional + Local + Technical + AI/GEO" without destroying the build.
- **Phase 1C (Tagged Replacement)** is where `AUDIT_TARGET` markers get replaced with
  optimized **"Answer Blocks"** / experience signals.
- Adds: GEO statistics, citation-attribution patterns, entity co-occurrence, fact-density tracking.
- Non-negotiables: never invent URLs; preserve the HERO message exactly; max 60 words per body paragraph.

### 1.4 The Schema Generator (`schemaGenerator.ts`) — and the GMB vs no-GMB split

Produces a JSON-LD `@graph` (WebSite, LocalBusiness, HowTo, FAQPage, BreadcrumbList, WebPage).

- **GMB pages (Hub/Spoke):** use a verified `cid:` value; include `hasMap`,
  `aggregateRating`, and `geo` coordinates. Address strategy = FULL_ADDRESS (Hub) or
  CITY_ONLY (Spoke).
- **No-GMB pages (National):** use HQ defaults; address strategy = COUNTRY_ONLY (US);
  coordinates omitted by design.
- Rules: never use `gMapsUrl` (use `hasMap` + `sameAs` with `?cid=` URLs); never use
  `@type: "Service"` as the primary business type (LocalBusiness only).

> **Important for the judge round:** schema/JSON-LD is generated by this **separate downstream
> phase and is intentionally identical across the three pages**, so the judges were explicitly
> told *not* to use inline schema presence/absence as a differentiator. The audit judged
> everything the page body itself controls.

### 1.5 The deterministic checker suite (`checkers/index.ts`)

`runCheckers` runs after every post-build phase to prevent silent failures. What it enforces
today (this is the important part for the recommendations):

- Em/en-dash ban
- Verified-image-library membership (absolute HTTPS only)
- Insecure / placeholder / dead links
- URL registry (no invented STS URLs)
- Sacred links present (page track)
- Word-count floor (after audit) + soft ceiling
- Facility/location-ownership language
- Icon set (no emoji as icons)
- Certification scope
- **Entity consistency** across body + schema + research brief (names + verified counts)
- Design-bible structural-hash drift
- Audit-target marker count
- Assert-after-replace (no half-applied edits)

**What it does NOT enforce — and this is what decided the rankings:** phone/NAP presence,
promotional-tone discipline, stray HTML comments, sourced-statistic floor, attributable
quotes, question-style H2 density, HowTo/answer-capsule presence, or unverifiable named-client claims.

---

## 2. What I actually did — the judging experiment (methodology)

### 2.1 The pages under test

- The three pages are the **OLD bake-off, no-GMB scenario** outputs — the *only* run where
  all three of these specific models (Sonnet 4.6, GPT-5.5, Gemini 3.1 Pro) built the **same
  page side-by-side under one shared research grounding**. That makes it a true
  apples-to-apples set.
- They were loaded from `artifacts/bake-off/src/data/old-bakeoff.json` and presented **blind**:

  | Blind label | Actual model |
  | --- | --- |
  | **Page A** | Sonnet 4.6 (`claude-sonnet-4-6`) |
  | **Page B** | GPT-5.5 (`gpt-5.5`) |
  | **Page C** | Gemini 3.1 Pro (`gemini-3.1-pro-preview`) |

  The label→model mapping was hidden from every judge and revealed only in the final report.

### 2.2 The six judge models + live-web wiring

Each judge got its provider's **native server-side web-search tool** turned on, because you
explicitly wanted them to research Reddit/forums before auditing. Your rule was: *"if they do
not fetch via API, skip them; if they do, go for it."* All four SDK families were probed and
confirmed able to fetch live before the run.

| Judge | Provider | Web-search tool wired | Outcome |
| --- | --- | --- | --- |
| Sonnet 4.6 | Anthropic | `web_search_20250305` (max 12 uses) | ✅ searched |
| Opus 4.8 | Anthropic | `web_search_20250305` | ✅ searched |
| GPT-5.5 | OpenAI | Responses API `web_search` (background + poll) | ✅ searched |
| GPT-5.5 Pro | OpenAI | Responses API `web_search` (reasoning: medium) | ❌ **failed — rate-limited off our key twice** |
| Gemini 3.1 Pro | Google | `googleSearch` grounding | ⚠️ completed but **grounding never fired** (verdict is from training knowledge) |
| Grok 4.3 | xAI | Responses API `web_search` | ✅ searched |

The harness is **resumable and parallel**: each judge writes its result as it finishes, a
failed/unparsed judge is simply re-run on the next pass, and disk writes are serialized so
parallel judges never clobber the shared results file. A judge whose search genuinely doesn't
fire is recorded honestly (`searchUsed=false`), not dropped.

### 2.3 The scoring contract

Every judge was required to (1) score each page **0–100 on 8 dimensions** (Technical SEO,
On-page SEO, Content/E-E-A-T, Entity & topical coverage, AIO readiness, GEO readiness, Local
SEO, UX & conversion), (2) give a weighted overall 0–100, and (3) **rank the three pages
1–3 with no ties**, ending in a single parseable JSON block. The harness parses the **last**
JSON block in each response, so the ranking is machine-aggregated.

### 2.4 The EXACT prompt sent to the third-party judge LLMs

This is the verbatim "master SEO/AIO/GEO professional" prompt. The **same prompt went to
every judge** so the comparison stays fair. `${labels}` expands to `A, B, C`, and the full
HTML of all three pages is injected inline where shown.

```text
You are a WORLD-CLASS master of SEO, AIO (AI-Overview / AI-search optimization), and GEO (Generative Engine Optimization) — operating at the very top 0.1% of the field.

You live and breathe this craft. You know, in detail, what is actually working RIGHT NOW as discussed across Reddit (r/SEO, r/bigseo, r/juststart, r/GrowthHacking, r/TechSEO), Google Search Central, X/Twitter SEO circles, Ahrefs/Semrush/Backlinko/Search Engine Journal/Search Engine Land, and the major SEO forums. You understand classic ranking signals AND the new reality of Google AI Overviews, ChatGPT/Perplexity/Gemini answer engines, and how pages get cited and surfaced by LLMs.

================================ YOUR MANDATE ================================

1. RESEARCH FIRST (use your web search tool — do it for real):
   Before judging, actively search the web to refresh yourself on the CURRENT (2025-2026) best practices and trends being discussed on Reddit, forums, and authoritative SEO sources for:
     - Classic on-page & technical SEO ranking factors
     - Local SEO / local service pages
     - AI Overview (AIO) optimization — how to get pulled into Google's AI answers
     - GEO — how to get cited/quoted by ChatGPT, Perplexity, Gemini, Grok
   Pull from the TOP 30-50 most respected, best-known ranking ideas and concepts. Lean on what practitioners actually report working in the wild, not just textbook theory.

2. AUDIT EACH PAGE — fully, thoroughly, and ruthlessly.
   You are auditing THREE competing versions (Page A, B, C) of the SAME page: a LOCAL service landing page for an electronics-recycling / IT-asset-disposition (ITAD) company targeting one specific U.S. city. They were each generated by a different AI model, but you do NOT know which model made which page — judge ONLY the page in front of you, with zero assumptions about its author.

   Note: structured data / JSON-LD schema for these pages is generated and injected by a SEPARATE downstream system and is INTENTIONALLY identical across all three, so DO NOT use the presence/absence of <script type="application/ld+json"> as a differentiator. Judge any inline schema only if it materially differs. Focus your differentiation on everything the page itself controls.

   For EACH page, evaluate across these dimensions (cite concrete evidence from the HTML — quote specific elements, headings, copy, structures):
     • Technical SEO — title tag, meta description, heading hierarchy (single H1, logical H2/H3), semantic HTML, image alt text, canonical/meta signals, crawlability, mobile/responsive signals discernible from markup, page-weight/bloat.
     • On-page SEO — keyword targeting & intent match, URL/semantics, content depth & comprehensiveness, topical coverage, keyword cannibalization or stuffing.
     • Content quality & E-E-A-T — experience, expertise, authoritativeness, trust signals; specificity vs. generic filler; originality; helpfulness.
     • Entity & topical coverage — entities, services, related concepts, NAP/local entities, semantic completeness vs. competitors.
     • AIO readiness — extractability for AI Overviews: clear question-answering, TL;DR/summary blocks, concise factual statements, scannable structure, definitional clarity, FAQ patterns.
     • GEO readiness — citation-worthiness for generative engines: statistics, named sources/quotes, authoritative claims, structured factual chunks, unique data, clarity an LLM can lift verbatim.
     • Local SEO — city/region targeting, local relevance, service-area clarity, trust/proximity signals, contact/conversion paths.
     • UX & conversion — clarity, hierarchy, CTAs, readability, trust elements, friction.

   Give each page a score 0-100 for EACH dimension above, plus a weighted OVERALL score 0-100. Be discriminating — do not bunch all three pages together; surface the real differences.

3. RANK the three pages 1 (best) to 3 (worst) by overall SEO+AIO+GEO strength, and explain the decisive factors that separated them.

================================ THE PAGES ================================
[... full HTML of Page A, then Page B, then Page C, each wrapped in
 "===== PAGE X — FULL HTML (START/END) =====" delimiters ...]

================================ OUTPUT FORMAT ================================

Write your audit as clear, well-structured Markdown:
  1. A short "Research notes" section — the current best-practice signals/trends you pulled from the web that informed your judging (mention sources).
  2. For EACH page (A, B, C): a full per-dimension audit with concrete evidence and the dimension scores, then the page's overall score and its top strengths/weaknesses.
  3. A "Head-to-head" section explaining what separated the pages.

Then, as the VERY LAST thing in your response, output a single fenced JSON code block (and nothing after it) with this EXACT shape:

```json
{
  "ranking": [
    { "page": "A", "rank": 1, "overall": 0, "verdict": "one-line why" },
    { "page": "B", "rank": 2, "overall": 0, "verdict": "one-line why" },
    { "page": "C", "rank": 3, "overall": 0, "verdict": "one-line why" }
  ],
  "winner": "A",
  "summary": "2-3 sentence overall takeaway"
}
```

The "rank" values must be a permutation of 1,2,3 (no ties). "overall" is each page's 0-100 overall score. Make the JSON valid and parseable.
```

---

## 3. What the judges found

### 3.1 The ranking matrix

| Judge | Web search | Page A (Sonnet 4.6) | Page B (GPT-5.5) | Page C (Gemini 3.1 Pro) | Winner |
| --- | :---: | :---: | :---: | :---: | :---: |
| Grok 4.3 | ✓ | 🥇 #1 (93) | 🥉 #3 (77) | 🥈 #2 (82) | Page A |
| Gemini 3.1 Pro | ✗ | 🥇 #1 (91) | 🥉 #3 (81) | 🥈 #2 (88) | Page A |
| Opus 4.8 | ✓ | 🥈 #2 (87) | 🥇 #1 (88) | 🥉 #3 (73) | **Page B** |
| GPT-5.5 | ✓ | 🥇 #1 (87) | 🥈 #2 (82) | 🥉 #3 (74) | Page A |
| Sonnet 4.6 | ✓ | 🥇 #1 (87) | 🥈 #2 (75) | 🥉 #3 (75) | Page A |
| GPT-5.5 Pro | — | ERROR (rate-limited) | ERROR | ERROR | — |

### 3.2 Consensus

| Page | Model | Avg rank | #1 votes |
| --- | --- | :---: | :---: |
| **Page A** | **Sonnet 4.6** | **1.20** | **4 / 5** |
| Page B | GPT-5.5 | 2.20 | 1 / 5 |
| Page C | Gemini 3.1 Pro | 2.60 | 0 / 5 |

### 3.3 Why Page A (Sonnet 4.6) won — the judges converged on the same reasons

Across judges, A won on the exact signals that drive 2025-26 rankings *and* AI-answer extraction:

- **Topical depth + comprehensiveness** — the fullest coverage of the three.
- **Hyper-local entity density** — 8 named Billings institutions vs. 4 on the weakest page.
- **Three sourced statistics** (EPA, UN, IBM) with attribution.
- **Question-based H2s + a HowTo / four-step process section** — highly AIO-extractable.
- **Neighborhood-level service-area granularity.**
- **A unique local regulatory hook** (Montana's EPR law) — original, citable.

Representative judge verdicts on A:

- Grok: *"Deepest local entities, extractable facts, and E-E-A-T."*
- Gemini: *"Unmatched hyper-local entity depth and highly scannable AIO structures overcome the lack of a phone number."*
- Sonnet: *"Three sourced statistics, eight named institutions, five question-based H2s, a four-step HowTo, neighborhood-level specificity, and a unique Montana EPR insight."*

### 3.4 The one dissent — Opus 4.8 picked Page B (GPT-5.5), by a single point

This is the most strategically useful finding. Opus was the **only** judge to rank B over A,
and only **88 vs 87**. Its logic was *deliberately different*: it rewarded B for being the
most **citation-safe and trust-disciplined** page:

> Opus: *"B wins by being the most citation-worthy and trust-safe — answer-first H2s, a
> verifiable quotation and sourced statistic, and disciplined non-promotional, accurately-hedged
> claims that match what AI engines and Google's 2026 enforcement now reward. A is a very close
> second on raw depth ... but louder promotional 'ABSOLUTELY FREE' tone and minor over-claims
> cost it the top spot."*

So the real debate is a **philosophy split**: depth-maximalism (Grok, Gemini, GPT, Sonnet → A)
vs. verifiable, non-promotional trust discipline (Opus → B). They pull in opposite directions.

### 3.5 What dragged each page down (also consensus)

- **Page A (Sonnet, winner):** promotional tone (*"ABSOLUTELY FREE"*), a few over-claims, and
  **no phone number / NAP** — flagged by essentially every judge.
- **Page B (GPT-5.5):** safest and cleanest, but **thinner local depth, fewer stats**, and it
  **shipped leftover HTML prompt comments in the markup** (Gemini caught this — a sloppiness tell)
  and also had **no phone number**.
- **Page C (Gemini, last):** *had* a phone CTA (a real conversion edge) and a good verbatim NIST
  quote, but **thinnest content, fewest named institutions, weakest question-H2 density**, and
  **repeated unverifiable named-client claims (ExxonMobil)** that hurt E-E-A-T → zero firsts.

### 3.6 Two things that validate the test

1. **No self-preference bias** (the blind labeling worked). GPT ranked A first, not its own B.
   Gemini ranked A first, not its own C. Opus (Anthropic sibling) ranked the *other* Anthropic
   page **second**, not first. Sonnet scored its own page **87** — the *same* number GPT and
   Opus independently gave it. No model inflated its own work.
2. **Cross-model agreement on what matters now.** Independently, every judge weighted E-E-A-T
   trust, verifiable citations, local entity coverage, and AIO-extractable structure — consistent
   with the live Reddit/forum research the four searching judges actually pulled.

### 3.7 Important caveats (be honest about these before acting)

- **The audited pages are OLD bake-off outputs.** The current pipeline may already address
  some findings. **Verify against current output before assuming a defect still exists.**
- It was a **5-judge panel, not 6** — GPT-5.5 Pro was rate-limited off our OpenAI key.
- **Gemini's web search did not fire** — its verdict reflects training knowledge, not fresh research.
- It is **one page, one city, one scenario** (no-GMB). Don't over-fit prompt changes to a single round.

---

## 4. Cross-cutting findings mapped to our system

Every recurring complaint, which model(s) it hit, whether we enforce it today, and **which
prompt/phase or checker should own the fix.**

| Finding | Hit on | Enforced today? | Owner of the fix |
| --- | --- | --- | --- |
| No phone / NAP on the page | A, B | ❌ no contact checker | **Schema + Builder + new checker** (HQ phone for no-GMB) |
| Promotional / shouty tone ("ABSOLUTELY FREE") | A, C | ❌ | **Builder prompt + new tone checker** |
| Leftover HTML prompt comments in markup | B | ❌ comments unchecked | **New deterministic checker** (cheapest win) |
| Unverifiable named-client claims (ExxonMobil) | C | ⚠️ partial (entity-consistency only checks brief entities) | **Builder/Audit rule + extend entity checker** |
| Too few sourced/attributed statistics | B, C | ❌ | **SEO Audit prompt (Phase 1C) + soft checker** |
| Missing attributable quote | A, B | ❌ | **SEO Audit prompt** |
| Weak question-H2 / HowTo answer-capsule structure | C (and partially B) | ❌ | **SEO Audit prompt + Builder** |
| Thin local-entity density | B, C | ⚠️ Builder asks for "entity density 12+" but it's not measured | **Make the entity-density rule a measured checker** |

The pattern is clear: **our deterministic layer guards against defects; the ranking was decided
on quality signals we leave to the model's discretion.** The highest-leverage move is to push a
handful of these from "model's discretion" into "system-enforced."

---

## 5. My complete and thorough recommendations (per prompt-chat)

### 5.1 The NO-GMB / GMB phone + map rule (clarified — apply this first)

This is now an explicit business rule, and two of the three judged pages violated it:

- **No-GMB pages:** we do **not** have a Google Business Profile, so there is **no local
  number and no embedded map**. The page **must display the HQ phone** — the toll-free
  **`+1-844-699-2913`** line — as the contact/conversion path, and the schema `ContactPoint`
  must carry that same HQ number (address strategy stays COUNTRY_ONLY, coordinates omitted).
- **GMB pages:** they have a verified GMB, so they carry the **local number** *and* an
  **embedded Google Map always at the bottom**, plus the `cid:`-based schema (`hasMap`,
  `aggregateRating`, `geo`). Reference example to fetch and mirror:
  **`https://www.stselectronicrecyclinginc.com/chicago-il`** — it shows the local
  `+1-847-238-8774` number, the HQ `+1-844-699-2913` toll-free, and a bottom-of-page
  `google.com/maps/embed` iframe, with a full schema graph (PostalAddress, ContactPoint,
  RecyclingCenter, FAQPage, HowTo, etc.).

**Concrete asks:**
- **Page Builder chat:** guarantee a visible phone in the contact/CTA path on **every** page —
  HQ `844-699-2913` for no-GMB, the local number for GMB. The no-GMB winner (A) and the GPT
  page (B) both shipped with **no phone at all**; that should be impossible.
- **Schema chat:** ensure the no-GMB `ContactPoint.telephone` is the HQ number, and that GMB
  pages always include the bottom map embed + `hasMap`.
- **Checker (deterministic):** add a contact-presence gate — fail if no `tel:` / phone is
  present; for GMB pages additionally require the map embed.

### 5.2 For the PAGE BUILDER prompt chat

Add/strengthen these rules (most map onto your existing Gate structure):

1. **Phone/NAP gate (Gate 6 / contact):** every page must surface the correct phone (see 5.1).
2. **Promotional-tone discipline:** ban shouty all-caps promos ("ABSOLUTELY FREE") and
   unhedged superlatives. Opus penalized exactly this; it's a real GEO/E-E-A-T risk under
   2026 enforcement. Prefer plain, hedged, factual phrasing.
3. **No fabricated client/authority claims:** never name a client/brand (e.g. "ExxonMobil")
   unless it is in the research brief. This is what sank Page C.
4. **Make "entity density 12+" measurable:** you already ask for it in Gate 13 — pair it with
   the checker in 5.4 so it's verified, not just requested.
5. **Strip your own scaffolding:** never leave HTML comments other than the `AUDIT_TARGET`
   marker in the output. Page B shipped leftover prompt comments.

### 5.3 For the SEO AUDIT prompt chat

This phase is the natural home for the *positive* AIO/GEO signals that won the round. In
**Phase 1C (Tagged Replacement)** and the GEO-signal passes, make these **floors**, not
suggestions:

1. **Sourced-statistics floor:** require **≥3 statistics, each with a named source** (the
   winner had EPA/UN/IBM; the losers had ≤1). This is the strongest GEO citation signal.
2. **≥1 attributable quote:** a verbatim, sourced quotation (e.g. a NIST line) — Opus rewarded
   this heavily on the page that had it.
3. **Question-style H2s + a HowTo / answer-capsule block:** guarantee question-form H2s and a
   step-based HowTo section. These are the most AIO-extractable structures and the clearest
   gap on the lower-ranked pages.
4. **Local granularity:** push neighborhood/service-area specificity and named local
   institutions into the expanded `AUDIT_TARGET` blocks (this was A's biggest edge).
5. **Tone pass:** as a final sweep, neutralize promotional language and over-claims that
   slipped through the build (answers Opus's only objection to the otherwise-winning page).

### 5.4 For the deterministic CHECKER suite (cheapest, highest-confidence wins)

These are objective and belong in code, not prompts — they make the above rules *guaranteed*
rather than *hoped for*. Suggested order by value/risk:

1. **Stray-comment gate** *(trivial, zero-risk):* fail on any HTML comment that isn't the
   `AUDIT_TARGET` marker or required schema. Catches Page B's leftover prompt comments.
2. **Contact/phone gate:** fail if no `tel:`/phone present; GMB pages additionally require the
   bottom map embed. (Confirm the no-GMB → HQ-number rule from 5.1.)
3. **Promotional-tone gate:** a regex checker (same shape as the em-dash ban) for all-caps
   promo spans / "FREE!!!"-style copy.
4. **Sourced-stat / question-H2 soft counters:** count attributed stats and question-form H2s;
   warn (or fail after audit) below the floor. Pairs with the audit-phase rules in 5.3.
5. **Named-org guard:** extend `checkEntityConsistency` to flag organization names that appear
   on the page but are **absent from the research brief** (catches ExxonMobil-style fabrication).

Items **1–3 are the cheap, near-zero-risk batch** and would have caught the three most
embarrassing concrete defects in this round (leftover comments, missing phone, shouty promo).

### 5.5 "Do we need to change anything, or is this fine and you'll never get 100%?"

Both are true, and they are not in tension:

- **Yes, change a few things** — but only the **objective** gaps above. They're deterministic,
  cheap, and they fix defects that *every* future page would otherwise risk.
- **No, you will never get 100%, and you shouldn't chase it.** Here's why, grounded in this round:
  - **The judges disagree on philosophy.** Depth-maximalism vs. trust/citation discipline pull
    in opposite directions (rich promo copy vs. restrained hedged copy). You cannot max both
    judges simultaneously — pleasing Grok/Gemini can cost you Opus, and vice-versa.
  - **Scores compress** (everything landed 73–93). "100" isn't a real point on a subjective
    rubric that each model weights differently.
  - **The measurement itself is noisy** (5 judges not 6, one judge didn't actually search,
    single page/city).

  The correct target is therefore **not a perfect score** — it's: *eliminate the objective,
  deterministic defects (§5.1, §5.4) and guarantee the consensus quality signals (§5.3), then
  accept the residual depth-vs-trust disagreement as taste, not a bug.* Do that and you'd have a
  page that wins 4/5 judges **and** answers the fifth judge's only objection — about as close to
  "unbeatable" as a subjective panel allows.

---

## Appendix A — Raw per-judge verdict lines

**Grok 4.3** — *Page A dominates through superior specificity, scannability, and local relevance; C offers conversion advantages while B trails on substance.*
- #1 A (93): Deepest local entities, extractable facts, and E-E-A-T
- #2 C (82): Strong conversion + solid structure but less granular coverage
- #3 B (77): Generic phrasing and thinner local/entity depth

**Gemini 3.1 Pro** — *Page A dominates through topical depth, hyper-local entity saturation, and extractable AIO structures. C has superior conversion UX and clever GEO verbatim quotes, but A's data grid and neighboring-city coverage make it the organic heavyweight.*
- #1 A (91): Unmatched hyper-local entity depth, scannable AIO structures, overcomes lacking a phone number
- #2 C (88): Excellent GEO quoting and click-to-call B2B UX, but short of A's community coverage
- #3 B (81): Sloppy execution with leftover HTML prompt comments, generic local filler, no phone number

**Opus 4.8** — *A and B nearly tied; B wins by being most citation-worthy and trust-safe (answer-first H2s, verifiable quote, sourced stat, non-promotional). A close second on depth. C trails on unverifiable named clients + promotional tone.*
- #1 B (88): Best AIO answer-capsule structure + cleanest GEO alignment (verifiable NIST quote, sourced 2022 stat, non-promotional)
- #2 A (87): Deepest content and richest local/entity coverage, but louder promotional "ABSOLUTELY FREE" tone and minor over-claims cost the top spot
- #3 C (73): Has a real phone NAP and good NIST quote, but repeated unverifiable named-client claims (ExxonMobil) + promotional tone create E-E-A-T/GEO risk; also thinnest content

**GPT-5.5** — *Page A is strongest: fullest local, topical, and commercial-intent coverage. B safer and cleaner but less powerful. C has useful conversion elements but too generic and claim-risky.*
- #1 A (87): Strongest localization, deepest topical coverage, most AIO-ready structure, though needs source/proof cleanup
- #2 B (82): Most credible and restrained, strong AIO formatting, but less locally rich and comprehensive
- #3 C (74): Good phone CTA and core keywords, but weakest local depth and riskiest unsupported claims

**Sonnet 4.6** — *Page A wins decisively via three sourced statistics (EPA/UN/IBM), eight named Billings institutions, five question-based H2s, a four-step HowTo, neighborhood specificity, and a unique Montana EPR insight. B and C tie for second at 75.*
- #1 A (87): Dominates on depth, local entity density, sourced stats, question-H2 AIO structure, unique Montana EPR insight, neighborhood granularity — despite lacking a phone number
- #2 B (75): Best meta structure and internal linking, restrained language, but only one sourced stat and no How-It-Works section limit AIO/GEO extractability
- #3 C (75): Unique phone number and verbatim NIST quote, but weakest service-area granularity, fewest named institutions, poorest question-H2 density, thinnest local context

**GPT-5.5 Pro** — ERROR: OpenAI rate-limited this tier off our key (two attempts). No verdict.
