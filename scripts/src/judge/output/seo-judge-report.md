# Cross-Model SEO / AIO / GEO Judging Round

_Generated 2026-06-24T14:36:55.599Z_

Six judge models each researched the live web (Reddit / forums / Google), then ran a full SEO + AIO + GEO audit of three **blind** pages and ranked them.

## The pages under test (blind labels)

| Label | Actual model |
| --- | --- |
| **Page A** | Sonnet 4.6 (`claude-sonnet-4-6`) |
| **Page B** | GPT-5.5 (`gpt-5.5`) |
| **Page C** | Gemini 3.1 Pro (`gemini-3.1-pro-preview`) |

## How each judge ranked the pages

| Judge | Web search | Page A | Page B | Page C | Winner |
| --- | :---: | :---: | :---: | :---: | :---: |
| **Grok 4.3** | ✓ | 🥇#1 (93) | 🥉#3 (77) | 🥈#2 (82) | Page A (Sonnet 4.6) |
| **Gemini 3.1 Pro** | ✗ | 🥇#1 (91) | 🥉#3 (81) | 🥈#2 (88) | Page A (Sonnet 4.6) |
| **Opus 4.8** | ✓ | 🥈#2 (87) | 🥇#1 (88) | 🥉#3 (73) | Page B (GPT-5.5) |
| **GPT-5.5** | ✓ | 🥇#1 (87) | 🥈#2 (82) | 🥉#3 (74) | Page A (Sonnet 4.6) |
| **GPT-5.5 Pro** | — | ERROR | ERROR | ERROR | — |
| **Sonnet 4.6** | ✓ | 🥇#1 (87) | 🥈#2 (75) | 🥉#3 (75) | Page A (Sonnet 4.6) |

## Consensus

| Page | Model | Avg rank | #1 votes |
| --- | --- | :---: | :---: |
| Page A | Sonnet 4.6 | 1.20 | 4/5 |
| Page B | GPT-5.5 | 2.20 | 1/5 |
| Page C | Gemini 3.1 Pro | 2.60 | 0/5 |

## Full audits

### Grok 4.3 `grok-4.3`

_web search: yes · 19s_

**Summary:** Page A dominates through superior specificity, scannability, and local relevance that align with 2025-2026 AIO/GEO and local SEO priorities; C offers conversion advantages while B trails on substance.

**Research notes**  
Current 2025-2026 best practices (drawn from Google Search Central, Search Engine Journal, Search Engine Land, Reddit r/SEO, and practitioner reports): Normal SEO fundamentals still dominate AI Overviews (Gary Illyes confirmation that AIO uses the same ranking systems). Prioritize E-E-A-T, unique/non-commodity content, semantic HTML, scannable structures (question-based H2/H3, bullets, short paragraphs, TL;DR/FAQ blocks), statistics/named sources/authoritative claims for citation-worthiness, and local signals (specific entities, service areas, NAP, compliance). Structured data helps but is identical here. Avoid gimmicks like llms.txt. Local pages win with hyper-specific city references, certifications, process transparency, and conversion paths. AIO/GEO favor extractable factual chunks and comprehensive topical coverage over generic filler.[[1]](https://www.reddit.com/r/SEO/comments/1m9k0kg/google_confirms_normal_seo_works_for_ai_overviews/)[[2]](https://www.searchenginejournal.com/googles-new-ai-search-guide-calls-aeo-and-geo-still-seo/575026/)[[3]](https://www.progress.com/blogs/seo-and-geo-guide)

**Page A Audit**  
**Technical SEO (92/100)**: Strong title/meta with primary keywords + local + certs; logical single H1, clear H2/H3 hierarchy; semantic HTML evident; good alt text with local keywords; canonical present; preload/resource hints; responsive via media queries and grid classes. Minor bloat from repeated inline styles but clean overall.  
**On-page SEO (90/100)**: Excellent keyword targeting ("electronics recycling Billings MT", R2/NAID specifics) with intent match; deep topical coverage without stuffing; strong internal linking to service pages.  
**Content quality & E-E-A-T (94/100)**: Highly specific, original-feeling copy with real local entities, certifications, processes, and compliance details; zero generic filler; strong trust signals (R2v3, NAID AAA, NIST, HIPAA references).  
**Entity & topical coverage (95/100)**: Exceptional — names Billings Clinic, St. Vincent, Yellowstone County, MSU Billings, BLM, specific neighborhoods (Heights, West End, etc.), service areas, and related concepts (HIPAA 45 CFR, downstream tracking).  
**AIO readiness (93/100)**: Outstanding scannability — hero features list, process steps (numbered), FAQ cards, clear definitional blocks, concise factual statements.  
**GEO readiness (92/100)**: Strong statistics (600k sq ft, 2.7M tons e-waste, IBM breach cost), named sources/processes, authoritative claims, verbatim-liftable chunks (e.g., certification explanations, service areas).  
**Local SEO (96/100)**: Hyper-local — city-specific hero, service areas grid (primary/nearby/regional), "About Billings" section with population/economy details, free pickup in Yellowstone County.  
**UX & conversion (91/100)**: Clear hierarchy, prominent CTAs (Schedule Free Pickup, email), trust elements (certs, process), mobile-responsive. Minor form placeholder.  

**Overall score: 93/100**  
**Top strengths**: Depth, specificity, local entity density, extractability.  
**Top weaknesses**: Slightly heavy inline styles.

**Page B Audit**  
**Technical SEO (85/100)**: Solid title/meta (good but less specific than A); logical headings; semantic elements; alts present; responsive. Fewer preload hints.  
**On-page SEO (78/100)**: Good keyword use but shallower; broader "business e-waste" focus; solid internal links but less targeted.  
**Content quality & E-E-A-T (75/100)**: More generic phrasing ("qualifying volumes," "audit documentation support"); fewer concrete local examples or unique details.  
**Entity & topical coverage (72/100)**: Mentions Billings Clinic/MSU Billings/Yellowstone County but far less granular than A (no specific neighborhoods or extended entities).  
**AIO readiness (80/100)**: Scannable with cards/FAQs but fewer numbered processes or crisp factual blocks.  
**GEO readiness (70/100)**: Some stats (Global E-waste Monitor) and cert mentions, but fewer authoritative claims or liftable specifics.  
**Local SEO (78/100)**: Covers Billings/Yellowstone County and some areas; "About Billings" section present but shorter and less detailed.  
**UX & conversion (82/100)**: Clear CTAs and cards; responsive; slightly less polished hierarchy.  

**Overall score: 77/100**  
**Top strengths**: Clean structure, core cert mentions.  
**Top weaknesses**: Generic language, thinner local/entity depth, lower citation-worthiness.

**Page C Audit**  
**Technical SEO (88/100)**: Strong title/meta with phone number; good hierarchy; semantic; alts; responsive. Includes phone CTA in hero.  
**On-page SEO (82/100)**: Solid keywords with ITAD/HIPAA emphasis; good coverage but some repetition of generic phrases.  
**Content quality & E-E-A-T (80/100)**: Specific on certifications/processes and some locals (Billings Clinic, ExxonMobil, MSU Billings) but more templated feel than A.  
**Entity & topical coverage (78/100)**: Good mentions of key organizations and counties but less neighborhood/service-area granularity than A.  
**AIO readiness (85/100)**: Strong FAQs, stats grid, question-based sections; extractable elements present.  
**GEO readiness (78/100)**: Includes stats (IBM breach cost, EPA e-waste) and compliance details; authoritative but less varied sources than A.  
**Local SEO (82/100)**: Solid local focus with service area lists and "About Billings"; phone number adds trust/conversion signal.  
**UX & conversion (89/100)**: Excellent — prominent phone CTA, dual contact options, clean grids.  

**Overall score: 82/100**  
**Top strengths**: Phone visibility, stats emphasis, conversion focus.  
**Top weaknesses**: Less exhaustive entity/service-area detail; slightly more generic in places.

**Head-to-head**  
Page A wins decisively on depth, local entity density, extractability for AIO/GEO, and E-E-A-T signals — exactly what current best practices reward for local service pages. Page C is a strong second with better conversion elements (phone CTA) and solid structure but thinner coverage. Page B lags due to generic language and reduced specificity, making it least likely to earn citations or strong local relevance. The decisive factors are A’s superior topical/entity completeness, scannable factual chunks, and hyper-local service-area detail versus the others’ more abbreviated treatment.  

```json
{
  "ranking": [
    { "page": "A", "rank": 1, "overall": 93, "verdict": "Deepest local entities, extractable facts, and E-E-A-T" },
    { "page": "C", "rank": 2, "overall": 82, "verdict": "Strong conversion + solid structure but less granular coverage" },
    { "page": "B", "rank": 3, "overall": 77, "verdict": "Generic phrasing and thinner local/entity depth" }
  ],
  "winner": "A",
  "summary": "Page A dominates through superior specificity, scannability, and local relevance that align with 2025-2026 AIO/GEO and local SEO priorities; C offers conversion advantages while B trails on substance."
}
```

---

### Gemini 3.1 Pro `gemini-3.1-pro-preview`

_web search: no · 90s_

**Summary:** Page A dominates through sheer topical depth, hyper-local entity saturation, and highly extractable structures for AI Overviews. While Page C implements superior conversion UX and clever GEO verbatim quotes, Page A's 'By the Numbers' data grid and neighboring city coverage make it the undisputed organic heavyweight.

### 1. RESEARCH NOTES: 2025–2026 SEO, AIO & GEO LANDSCAPE

Before diving into the code, here is the reality of the SERPs right now based on the latest 2025–2026 data from SEO forums, Google Search Central, and recent AIO/GEO studies:

*   **AIO (AI Overview) Optimization**: Position 1 CTR drops by nearly 60% when a Google AI Overview is present. To get cited in the AIO, you don't just need organic rankings; you need **scannable, synthesized factual chunks**. AI models bypass marketing fluff and look for clear headings, bulleted lists, FAQ schemas, and direct definitional answers (e.g., AEO - Answer Engine Optimization).
*   **GEO (Generative Engine Optimization)**: ChatGPT, Perplexity, and Gemini rely on *Citation Authority* and *Freshness* rather than traditional backlinks. The #1 way to get cited by an LLM is to include authoritative statistics (e.g., "According to the EPA..."), verbatim industry standards, and unique data structures. LLMs love extracting exact methodologies and data grids.
*   **Local SEO in 2025**: Simply putting "[City] Electronics Recycling" in the H1 isn't enough. The algorithms map real-world entities. We are looking for hyper-local relevance: mentions of specific local hospitals, regional corridors, neighboring counties, and distinct neighborhoods. Furthermore, NAP (Name, Address, Phone) and real conversion friction (or lack thereof) are paramount for both local pack rankings and trust signals.

With this mandate, here is the ruthless audit of Pages A, B, and C.

---

### 2. FULL RUTHLESS AUDIT

#### **PAGE A**
**The Verdict:** An absolute powerhouse of local entity coverage and AIO-extractable formatting, though slightly hindered by old-school keyword stuffing and a missing phone number.

*   **Technical SEO (82/100)**: Clean CSS grid structure with responsive breakpoints (`@media(max-width:968px)`). However, the image alt text is horribly keyword-stuffed: `alt="Billings Montana electronics recycling IT asset disposition laptop computer Yellowstone County"`. This is a 2010 tactic. 
*   **On-page SEO (92/100)**: Massive depth (2600 words) with perfect intent match. Headings are structurally flawless, guiding the user from general services to specific equipment, compliance, and local coverage. 
*   **Content Quality & E-E-A-T (92/100)**: Expertly weaves complex compliance standards (HIPAA 45 CFR 164.312, DoD 5220.22-M) into the copy. It proves expertise rather than just claiming it. 
*   **Entity & Topical Coverage (96/100)**: Flawless. It maps out the local ecosystem beautifully by naming real-world entities: *Billings Clinic, St. Vincent Healthcare, Montana State University Billings, Rocky Mountain College, BLM, USFS*.
*   **AIO Readiness (95/100)**: Built for Google AI Overviews. The 4-step process using `<div class="process-step">` and the clear, distinct `<div class="faq-card">` blocks are perfectly structured for an AI to parse, summarize, and cite.
*   **GEO Readiness (90/100)**: High citation-worthiness. It embeds concrete stats: *"According to the EPA, approximately 2.7 million tons..."* and *"IBM's Cost of a Data Breach Report, the average breach costs $4.88 million."* LLMs will eat this up.
*   **Local SEO (88/100)**: The "Billings by the Numbers" grid (`180K+ METRO POPULATION`) and the exhaustive list of regional areas (*South Side, West End, Heights, Lockwood, Rimrock, Laurel, Hardin, Columbus*) creates an impenetrable local relevance web. *Penalty:* There is no phone number! A local service page without a `tel:` link is a massive oversight.
*   **UX & Conversion (92/100)**: The massive `ABSOLUTELY FREE` banner is a phenomenal conversion hook. The floating quote card and visual hierarchy keep the user scrolling.
*   **OVERALL SCORE: 91/100**
    *   *Strengths:* Unmatched local entity saturation; brilliant AIO-friendly HTML structures.
    *   *Weaknesses:* Keyword-stuffed alt text; lack of a click-to-call phone number.

#### **PAGE B**
**The Verdict:** A distinctly sloppy, mid-tier page that relies on generic filler and accidentally exposes its AI-generated roots in the source code.

*   **Technical SEO (72/100)**: The code is littered with leftover prompt/generation artifacts. Seven different times in the HTML, we see `<!-- AUDIT_TARGET -->` sitting in the middle of paragraphs. This is an embarrassing footprint that screams "unreviewed AI content." 
*   **On-page SEO (84/100)**: Competent, but uninspired. The headings are standard, but the content depth drops off compared to A.
*   **Content Quality & E-E-A-T (85/100)**: It covers the basics (R2v3, NAID AAA) but relies on generic B2B speak. 
*   **Entity & Topical Coverage (82/100)**: Much thinner. It mentions "Billings Clinic" and "Montana State University," but fails to build the dense web of surrounding municipalities that Page A achieved.
*   **AIO Readiness (88/100)**: One major redeeming quality: it breaks down NIST 800-88 into the exact media sanitization categories *"Clear, Purge, and Destroy."* This is an excellent definitional chunk for Google AI Overviews. 
*   **GEO Readiness (86/100)**: Features the *"Global E-waste Monitor, 62 million tonnes"* stat, which is good for LLM retrieval, but the surrounding text lacks the punchy authority of A and C.
*   **Local SEO (78/100)**: Weak. The "Billings Market Drivers" section uses generic filler like `MT LARGEST CITY` and `I-90 REGIONAL CORRIDOR`. It feels like a template where the city name was just swapped in. Again, no phone number.
*   **UX & Conversion (80/100)**: Visually bland compared to A. Standard buttons, standard layout. Nothing pushes the user over the edge to convert.
*   **OVERALL SCORE: 81/100**
    *   *Strengths:* Good definitional text for NIST standards ("Clear, Purge, Destroy").
    *   *Weaknesses:* Leftover `<!-- AUDIT_TARGET -->` dev comments; generic local signals; no phone number.

#### **PAGE C**
**The Verdict:** A highly polished, B2B-optimized landing page with the best UX and GEO-specific quotes, though slightly lacking in deep local neighborhood relevance.

*   **Technical SEO (88/100)**: Very clean. Alt text is balanced (`alt="Billings electronics recycling and IT asset disposition services"`). Best of all, it properly integrates `<a href="tel:844-699-2913">` links.
*   **On-page SEO (87/100)**: Tightly woven targeting aimed squarely at "Corporate IT Directors." The intent is hyper-focused on enterprise/B2B compliance.
*   **Content Quality & E-E-A-T (91/100)**: Exceptional enterprise tone. It frames recycling as a risk-mitigation strategy, which perfectly aligns with the target demographic.
*   **Entity & Topical Coverage (86/100)**: Brings in strong corporate entities like *ExxonMobil*, alongside the medical/educational institutions. However, it lacks the deep, 15+ city/county local neighborhood spread seen in Page A.
*   **AIO Readiness (85/100)**: The structure is solid, but the FAQ section is a bit brief. It lacks the highly scannable step-by-step UI elements of Page A.
*   **GEO Readiness (94/100)**: The best of the bunch for LLM citations. It directly quotes the federal standard verbatim: *"...render data recovery 'infeasible using state of the art laboratory techniques.'"* ChatGPT and Perplexity prioritize exact-match definitions from authoritative frameworks. This is LLM bait.
*   **Local SEO (86/100)**: It lacks the exhaustive regional breakdown of Page A, but it makes up ground by actually including a phone number—a critical NAP ranking factor and local trust signal. 
*   **UX & Conversion (92/100)**: The absolute best for user friction. The click-to-call phone number is right in the hero (`hero-cta-btns`) and the footer. The B2B messaging drives immediate action.
*   **OVERALL SCORE: 88/100**
    *   *Strengths:* Verbatim GEO quote hooks; excellent click-to-call UX; strong enterprise entities.
    *   *Weaknesses:* Local geographic coverage is thinner than Page A.

---

### 3. HEAD-TO-HEAD RANKING

**1st Place: PAGE A**
Page A wins because it understands the assignment of modern Local SEO and AIO. While it critically forgot a phone number, its sheer dominance in mapping the local knowledge graph (mentioning precise hospitals, universities, local government branches, and 10+ surrounding municipalities) makes it hyper-relevant to Google's local algorithms. Furthermore, its scannable structures—the 4-step process and the "By the Numbers" data grid—are the exact formats Google AI Overviews extract for zero-click summaries.

**2nd Place: PAGE C**
Page C is a very close second and arguably the best page for pure UX/Conversion. By including a click-to-call phone number and targeting corporate IT directors with exact verbatim quotes of federal NIST standards, it is heavily optimized for Perplexity/ChatGPT (GEO). However, it falls just short of Page A because its local geographic footprint is significantly thinner.

**3rd Place: PAGE B**
Page B is the clear loser. It is sloppy. Leaving `<!-- AUDIT_TARGET -->` comments littered throughout the HTML is a technical red flag. Beyond that, its local SEO strategy relies on generic templated filler ("I-90 REGIONAL CORRIDOR") rather than the deep, researched community integration demonstrated by Page A.

```json
{
  "ranking": [
    { "page": "A", "rank": 1, "overall": 91, "verdict": "Unmatched hyper-local entity depth and highly scannable AIO structures overcome the lack of a phone number." },
    { "page": "C", "rank": 2, "overall": 88, "verdict": "Excellent GEO quoting and click-to-call B2B UX, but falls short of A's exhaustive local community coverage." },
    { "page": "B", "rank": 3, "overall": 81, "verdict": "Sloppy execution with leftover HTML prompt comments, generic local filler, and no phone number." }
  ],
  "winner": "A",
  "summary": "Page A dominates through sheer topical depth, hyper-local entity saturation, and highly extractable structures for AI Overviews. While Page C implements superior conversion UX and clever GEO verbatim quotes, Page A's 'By the Numbers' data grid and neighboring city coverage make it the undisputed organic heavyweight."
}
```

---

### Opus 4.8 `claude-opus-4-8`

_web search: yes · 116s_

**Summary:** A and B are both excellent and nearly tied; B wins by being the most citation-worthy and trust-safe — answer-first H2s, a verifiable quotation and sourced statistic, and disciplined non-promotional, accurately-hedged claims that match what AI engines and Google's 2026 enforcement now reward. A is a very close second on raw depth and local-entity richness. C trails clearly because it repeatedly asserts unverifiable named clients and leans promotional, both of which undercut E-E-A-T and AI citation likelihood.

I'll research current SEO/AIO/GEO best practices first, then audit each page rigorously.
I have rich, current research. One more targeted search on a critical differentiator — accuracy/fabrication risk in local SEO and E-E-A-T, since one page has factual concerns.
I now have everything I need. Here is my full audit.

---

# SEO / AIO / GEO Audit — STS Electronic Recycling, Billings MT (Pages A, B, C)

## 1. Research Notes — What's Actually Working Right Now (2025–2026)

A synthesis of the most respected current signals informing this audit:

**On GEO / answer-engine citation:**
- The Princeton/IIT-Delhi GEO study (KDD 2024) remains the empirical bedrock: 
the strongest lifts came from quotations (+41%), statistics (+32%), and citations (+30%), plus fluency optimization (+28%)
. Keyword stuffing performed poorly in generative contexts.
- Promotional tone is actively penalized by LLMs. 
According to Semrush, Q&A formatting boosts AI citation rates by 25.45%, while promotional tone reduces them by 26.19%
, and 
phrases like "absolutely essential," "the best choice," and "act now" are GEO killers.

- Lead with extractable answers. 
Answer Capsules (40-60 word direct answers below H2 headings) are the fastest entry point
, and 
44.2% of all LLM citations come from the first 30% of text (the intro), 31.1% from the middle, and 24.7% from the conclusion.

- Declarative, encyclopedic phrasing wins. 
Remove subjective phrases like "I think," "We believe," and "In our opinion." Objective, declarative sentences lower perplexity and increase the likelihood of your text being selected for the final output.

- Crawlability of raw HTML text matters: 
many AI crawlers like GPTBot prioritize speed over rendering complex JavaScript. If your FAQ is injected via client-side JavaScript, an AI crawler might see an empty page. Ensure the text payload is available in the raw HTML.


**On Google AI Overviews:**
- Google is explicit: 
the best practices for SEO continue to be relevant because generative AI features on Google Search are rooted in core Search ranking and quality systems.
 There are 
no additional technical requirements
 and 
you don't need to create new machine readable files, AI text files, or markup to appear in these features.

- Structure + freshness drive AIO inclusion. 
A clear, detailed summary at the start of each article should directly answer the main search query. Content with clear formatting and structured data, including FAQs, has better chances of appearing in AI Overviews.
 And 
content under 3 months old is 3x more likely to be cited in AI answers.

- For local service queries specifically, AIOs trigger far less: 
AIOs only show on about 7% of all local queries. This aligns with trends finding local SEO relatively safe from AI updates.
 But where AI local packs do appear, consistency and review depth matter.

**On E-E-A-T, trust & the fabrication risk (decisive for this audit):**
- Google has sharpened enforcement of fake trust signals. 
Google now flags fake E-E-A-T practices like false bios and business claims. Deceptive intent (not just false info) can lead to a quality downgrade. Misleading buttons and bait-and-switch titles may trigger penalties.
 
Fabricated bios, fake reviews, or forced links tend to unravel as Google cross-checks signals across the web. Once trust is broken, recovery is hard.

- For local YMYL-adjacent service pages, claiming named clients you may not actually serve (e.g., naming a specific large enterprise as a customer) is exactly the kind of unverifiable business claim that creates risk. 
Google's evaluation of E-E-A-T extends well beyond page content. It considers whether your claims, references, and identity align with what is already known and verifiable across the web.

- Local 2026 enforcement rewards authenticity over keyword density: 
this enforcement, tied to the March 2026 Core Update, demands a shift from keyword stuffing to authentic reviews and structured data.


**Key implication for this niche:** These are B2B local ITAD/e-waste landing pages. The winner must combine (a) clean extractable structure with answer-first H2s, (b) verifiable statistics with named sources, (c) strong local entity coverage, (d) NO promotional fluff, and critically (e) NO fabricated/unverifiable claims (e.g., naming specific enterprises as clients, or an outdated `<meta name="keywords">` tag signaling dated tactics). I'll weight trust/accuracy heavily given current enforcement.

---

## 2. Per-Page Audits

### PAGE A

**Technical SEO — 82/100**
- Title is keyword-rich but borderline stuffed/long: `Electronics Recycling Billings MT | R2 Certified | Free Pickup | STS` — four pipe-separated segments, likely truncating in SERPs.
- **Legacy red flag:** carries a `<meta name="keywords">` tag with 8 stuffed phrases. This tag is ignored by Google and is a dated-tactic signal; it adds bloat and, per current guidance, signals keyword-first thinking.
- Single clean `<h1>`, logical `<h2>`/`<h3>`/`<h4>` hierarchy throughout. Good semantic flow.
- Solid head hygiene: `preconnect`, async font/CSS loading, `canonical`, descriptive `alt` text on all images (e.g., "Billings Montana electronics recycling IT asset disposition laptop computer Yellowstone County"), `loading="lazy"`.
- Heavy inline-CSS bloat and very large single-file page; the hero form is `{loadposition city-hero-form}` (Joomla module — server-rendered, fine for crawlers).
- Mobile responsive media queries are comprehensive.

**On-Page SEO — 90/100**
- Best keyword/intent coverage of the three: targets "electronics recycling Billings," "ITAD," "hard drive destruction," "data destruction Yellowstone County," "near me." Longest at ~2,600 words with strongest topical depth.
- Excellent internal linking to service pages (computer/laptop/server recycling, hard drive shredding, certificate of destruction, NAID, ITAD).
- Minor repetition of "R2v3 certified / Yellowstone County / 48 hours" but not stuffed to harmful levels.

**Content Quality & E-E-A-T — 80/100**
- Strong specificity: NIST 800-88, HIPAA 45 CFR 164.312, R2v3:2020, DoD 5220.22-M, BAAs, serial-number CoDs. This is genuine domain expertise that reads as experienced.
- **Accuracy concern:** names "Billings Clinic and St. Vincent Healthcare," "Montana State University Billings," "Rocky Mountain College," "BLM and USFS field offices" as the institutional landscape — but phrases them mostly as *categories of clients/generators* ("organizations like," "systems require") rather than asserting they ARE current customers. This is the safer framing. The "frequently recommended by compliance officers" line is a soft puffery risk.
- Uses real statistics with attribution (EPA 2.7M tons; IBM $4.88M breach; UN Global E-waste Monitor 17.4%).

**Entity & Topical Coverage — 92/100**
- Richest entity set: neighborhoods (Heights, West End, South Side, Lockwood, Rimrock), nearby towns (Laurel, Hardin, Columbus, Red Lodge, Roundup, Huntley), counties (Yellowstone, Carbon, Big Horn, Stillwater), region (eastern MT, northern WY), institutions, compliance frameworks. Best semantic completeness.

**AIO Readiness — 88/100**
- Multiple question-formatted H2s ("What Electronics Can Be Recycled in Billings?", "How Does Electronics Recycling Protect Data in Billings?", "Is My Data Safe During Billings Electronics Recycling?", "How Does Electronics Recycling Work in Billings?") — strong query-fan-out coverage.
- A bolded summary intro block ("STS Electronic Recycling provides R2v3 certified...") functions as an answer capsule near the top — aligns with the intro-citation weighting.
- Dedicated FAQ with 4 Q&As; numbered process steps; scannable cards.

**GEO Readiness — 85/100**
- Good fact density and named-source statistics (EPA, IBM, UN). Declarative, mostly non-promotional in the body.
- Weakness: the "ABSOLUTELY FREE" banner in 72px caps is exactly the promotional tone shown to depress citation rates.

**Local SEO — 90/100**
- Best local proof: "Billings by the Numbers" stat block (metro pop, hospital systems, universities), full service-area matrix (Primary/Nearby/Regional), "About Billings" entity paragraph. Strong "near me" handling. No NAP phone, though (email + contact page only) — a conversion/local gap.

**UX & Conversion — 86/100**
- Clear hierarchy, repeated CTAs, trust badges, process steps. The "ABSOLUTELY FREE" shouting is a tone misstep but conversion-oriented.

**OVERALL A — 87/100**
- **Strengths:** Deepest content, best entity/local coverage, strongest AIO question structure, safest factual framing.
- **Weaknesses:** Legacy `meta keywords` tag, occasionally over-claimed ("frequently recommended"), promotional "ABSOLUTELY FREE" block, no phone NAP.

---

### PAGE B

**Technical SEO — 86/100**
- Cleanest, most modern title: `Billings Electronics Recycling | R2v3 Certified | STS` — concise, correct length, brand last.
- **Also carries a `<meta name="keywords">` tag** (dated-tactic signal) — same minor demerit as A.
- Single `<h1>`, logical heading order, semantic structure good. `alt` text present and descriptive. Async assets, canonical present.
- CSS references `.floating-card iframe` but hero uses `{loadposition}` (Joomla module, server-side) — consistent and crawlable.
- Slightly lighter/cleaner markup than A.

**On-Page SEO — 83/100**
- ~2,555 words. Good coverage but pitched more generically ("business e-waste," "qualifying volumes"). Targets the head terms well and adds a strong **Related Services** cluster (ITAD, hard drive destruction, CoD, data center decommissioning, corporate data security, healthcare IT, HIPAA destruction, government data destruction) — best internal-linking topical hub of the three.
- Slightly less local-keyword saturation than A, which is arguably healthier post-2026.

**Content Quality & E-E-A-T — 88/100 (highest)**
- **Most careful, defensible claims.** Consistently uses hedged, honest phrasing: "Pickup is free for qualifying volumes," "STS engagements with healthcare systems typically involve...", names institutions as *the local landscape* and *example environments* rather than asserting hard customer relationships. This aligns precisely with current anti-fabrication enforcement.
- Cites NIST SP 800-88's actual sanitization categories ("Clear, Purge, and Destroy") — a verifiable, encyclopedic, quotable fact.
- Uses a properly attributed, current statistic: 
+32% from statistics
-style move — "According to the Global E-waste Monitor, 62 million tonnes of e-waste were generated worldwide in 2022" (accurate and recent).

**Entity & Topical Coverage — 84/100**
- Strong: neighborhoods, counties, corridors (I-90, I-94, US-87, King Ave W, Shiloh Rd, Rimrocks), regulatory frameworks (HIPAA, GLBA, FERPA, NIST). Slightly less dense on named institutions/towns than A, but adds transport-corridor entities A lacks.

**AIO Readiness — 90/100 (highest)**
- Heavily question-driven H2s phrased as real user queries: "Who Provides Certified Electronics Recycling in Billings?", "What Electronics Can Billings Organizations Recycle?", "How Does Certified Recycling Protect Billings Data?" — plus inline bolded mini-Q&As ("How does electronics recycling work for Billings organizations?").
- The "Who Provides..." subtitle is a near-perfect 40–60-word answer capsule containing the entity, service, certifications, and a sourced statistic — extremely extractable for AI Overviews / ChatGPT.
- 4-item FAQ + Related Services list.

**GEO Readiness — 89/100 (highest)**
- Best balance: declarative, low-perplexity prose; verifiable NIST quotation; sourced statistic; minimal promotional language. This is the page most aligned with the quotation+statistic+citation triad that the GEO research rewards. Avoids the "ABSOLUTELY FREE" type tone entirely.

**Local SEO — 82/100**
- Good coverage matrix (Billings/Regional/Corridors) and an "About Billings" paragraph, but the stat block is more abstract ("MT largest city," "I-90," "B2B," "R2v3") and less concretely local than A's population/hospitals/universities figures. No phone NAP (email-only). The final "service request" panel is a static placeholder, not a live form.

**UX & Conversion — 83/100**
- Clean, professional, honest. Slightly weaker conversion punch than A/C (no phone, email-led, placeholder form box), but trust-forward.

**OVERALL B — 88/100**
- **Strengths:** Best E-E-A-T/accuracy, best AIO answer-capsule structure, best GEO alignment (quote+stat, non-promotional), strongest related-services internal hub, recent verifiable statistic.
- **Weaknesses:** Legacy keywords meta, weaker concrete local stats than A, no phone NAP, placeholder form, slightly more generic positioning.

---

### PAGE C

**Technical SEO — 80/100**
- Title good: `Electronics Recycling Billings MT | R2 Certified ITAD | STS`. **Carries `meta keywords`** too.
- **Best NAP signal of the three:** includes a real phone number `(844) 699-2913` in the meta description, hero `tel:` CTA, and footer — the only page with a clickable phone. This is a genuine local/conversion advantage.
- Single `<h1>`, logical hierarchy, descriptive alt text, async assets, canonical present. Defines a `.stats-section` class but excludes the stats bar (unused CSS — minor bloat).

**On-Page SEO — 79/100**
- Shortest at ~2,405 words; thinner topical depth. Good service-link clusters and a Related Services section, but less comprehensive than A/B.
- Some keyword/intent coverage good ("electronics recycling near me," ITAD, hard drive destruction).

**Content Quality & E-E-A-T — 58/100 (lowest — decisive)**
- **Critical fabrication/accuracy risk.** Page C repeatedly and explicitly names **ExxonMobil** as a client/served entity: "we securely process equipment from computers to servers for major employers like ExxonMobil," "Our team works with major regional energy producers like ExxonMobil," and "for Billings organizations including ExxonMobil, Billings Clinic, and Montana State University Billings." Asserting a named multinational as a customer is precisely the kind of **unverifiable business claim** that current enforcement targets — 
Google now flags fake E-E-A-T practices like false bios and business claims, and deceptive intent can lead to a quality downgrade.
 If untrue, this is a serious trust liability, and 
fabricated claims tend to unravel as Google cross-checks signals across the web; once trust is broken, recovery is hard.

- More promotional/superlative tone ("with absolute security," "the accountability enterprise clients demand," "comprehensive industry credentials," "robust operational frameworks") — exactly the language shown to **reduce** AI citation rates by ~26%.
- It does include one genuinely strong, quotable GEO element: the NIST SP 800-88 phrasing that sanitization render recovery "infeasible using state of the art laboratory techniques." That's a good extractable fact — but it's outweighed by the trust problems.

**Entity & Topical Coverage — 74/100**
- Decent frameworks (HIPAA, FERPA, NIST, DoD) and institutions, but the named-client fabrication contaminates entity quality, and the service-area section is the vaguest ("Downtown Commercial District," "Regional Medical Campuses," "Industrial Corridors") — fewer concrete local entities than A or B.

**AIO Readiness — 80/100**
- Has question H2s ("What Electronics Can Be Recycled in Billings?", "Is My Data Safe During Electronics Recycling?", "How does the recycling process work?") and a 4-item FAQ. Solid but slightly fewer distinct query-fan-out angles than B, and no strong top-of-page answer capsule (the hero subtitle is promotional, not factual).

**GEO Readiness — 70/100**
- The NIST quotation helps, but the promotional tone and unverifiable named-client claims work directly against citation-worthiness. LLMs (and Perplexity's citation logic) favor neutral, verifiable, encyclopedic claims; assertions about ExxonMobil being a client are unverifiable and risky to cite.

**Local SEO — 80/100**
- The phone number is a real plus (best contact/conversion path, supports local trust). But the service-area detail is the weakest/most generic, lowering local relevance.

**UX & Conversion — 85/100**
- Strong, clean, phone + email + contact CTAs; phone-forward is excellent for a B2B service buyer. Best conversion path of the three.

**OVERALL C — 73/100**
- **Strengths:** Real phone NAP (best conversion/local contact), good NIST quotation, clean design, decent FAQ.
- **Weaknesses:** Repeated unverifiable named-client claims (ExxonMobil) = significant E-E-A-T/trust risk; most promotional tone (hurts GEO); thinnest content; vaguest service areas.

---

## 3. Head-to-Head — What Separated Them

**A vs B (the close race for #1):** Both are excellent, comprehensive, and nearly tied. A has the **deeper content, richer concrete local stats (population/hospitals/universities), and the broadest entity/town coverage** — classic SEO strength. B has the **best answer-first AIO structure, the cleanest GEO alignment (a verifiable NIST quotation + a properly sourced 2022 e-waste statistic + consistently non-promotional, hedged claims), and the best related-services internal hub.** Given that the current frontier is being *cited* by AI engines — where quotations, statistics, declarative tone, and accuracy dominate — and given Google's intensified enforcement against unverifiable claims and promotional puffery, **B's discipline edges A.** B never overstates a client relationship, avoids A's "ABSOLUTELY FREE" promotional shout, and its lead subtitle is a textbook extractable answer capsule. A's lingering "frequently recommended by compliance officers" puffery and the louder promotional banner are small but real GEO drags. It's razor-thin (88 vs 87), but B's citation-worthiness and trust-safety win the new game.

**Why C is third (clearly):** C is well-built and uniquely includes a real phone number (its best asset), but it commits the cardinal current-era sin: **repeatedly naming ExxonMobil as a client/served organization** alongside other named institutions presented as customers. In a 2026 environment where Google explicitly flags false business claims and downgrades deceptive intent, and where LLMs penalize promotional tone, C carries both the highest trust risk and the most promotional language — on top of being the thinnest and vaguest on local specifics. Those factors decisively separate it from A and B.

**Shared issues:** All three carry the obsolete `<meta name="keywords">` tag (harmless but dated) and lack a fully visible NAP block (C is best here with a phone). None of these moved the ranking as much as content depth, AIO/GEO structure, and—above all—factual trustworthiness.

```json
{
  "ranking": [
    { "page": "B", "rank": 1, "overall": 88, "verdict": "Best AIO answer-capsule structure + cleanest GEO alignment (verifiable NIST quote, sourced 2022 stat, non-promotional, carefully hedged honest claims)." },
    { "page": "A", "rank": 2, "overall": 87, "verdict": "Deepest content and richest local/entity coverage with strong question-H2s, but louder promotional 'ABSOLUTELY FREE' tone and minor over-claims cost it the top spot." },
    { "page": "C", "rank": 3, "overall": 73, "verdict": "Has a real phone NAP and a good NIST quote, but repeated unverifiable named-client claims (ExxonMobil) plus promotional tone create real E-E-A-T/GEO risk; also thinnest content." }
  ],
  "winner": "B",
  "summary": "A and B are both excellent and nearly tied; B wins by being the most citation-worthy and trust-safe — answer-first H2s, a verifiable quotation and sourced statistic, and disciplined non-promotional, accurately-hedged claims that match what AI engines and Google's 2026 enforcement now reward. A is a very close second on raw depth and local-entity richness. C trails clearly because it repeatedly asserts unverifiable named clients and leans promotional, both of which undercut E-E-A-T and AI citation likelihood."
}
```

---

### GPT-5.5 `gpt-5.5`

_web search: yes · 142s_

**Summary:** Page A is the strongest SEO+AIO+GEO page because it gives the fullest local, topical, and commercial-intent coverage for Billings electronics recycling. Page B is safer and cleaner but less powerful; Page C has useful conversion elements but is too generic and claim-risky to beat the others.

## 1. Research notes — current SEO / AIO / GEO signals used for judging

**Framework used:** I judged these pages as local B2B service landing pages competing for queries like **“electronics recycling Billings MT,” “computer recycling Billings,” “ITAD Billings,” “hard drive destruction Billings,” “R2 certified electronics recycling Billings,”** and adjacent AI-search prompts such as **“Who provides certified electronics recycling in Billings?”** or **“How do Billings businesses dispose of old computers securely?”**

Current best-practice themes I weighted heavily:

1. **Foundational SEO still matters for AI Overviews.** Google’s own guidance says generative AI features in Search are rooted in core Search ranking and quality systems, so crawlability, relevance, helpful content, technical structure, and classic ranking fundamentals still matter. ([developers.google.com](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide))  
2. **Helpful, people-first, experience-rich content is still the baseline.** Google specifically asks whether content demonstrates first-hand expertise, depth of knowledge, a clear audience, and whether a visitor would leave feeling they accomplished their goal. ([developers.google.com](https://developers.google.com/search/docs/fundamentals/creating-helpful-content))  
3. **Avoid search-engine-first / mass-location-page patterns.** Local service pages need unique local value, not just templated city swaps, keyword repetition, or thin “service area” text. Google warns against content created mainly to attract search traffic or produced through extensive automation without added value. ([developers.google.com](https://developers.google.com/search/docs/fundamentals/creating-helpful-content))  
4. **AI-search visibility rewards extractable, evidence-rich chunks.** A 2026 GEO citation study found high-influence AI-cited pages tend to be longer, more structured, semantically aligned, and rich in extractable evidence such as definitions, numerical facts, comparisons, and procedural steps. ([arxiv.org](https://arxiv.org/abs/2604.25707))  
5. **AIO/GEO does not require special “AI schema.”** Google explicitly says there is no special schema.org markup required for generative AI Search and warns against overfocusing on structured data, though structured data should still match visible content and support rich-result eligibility. ([developers.google.com](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide))  
6. **Structured data consistency still matters, but it is not a differentiator here.** Google’s LocalBusiness guidance says structured data can communicate hours, departments, reviews, and local business details, but in this audit the downstream JSON-LD is intentionally identical across pages, so I did **not** score schema presence/absence as a differentiator. ([developers.google.com](https://developers.google.com/search/docs/appearance/structured-data/local-business))  
7. **Local SEO pages need genuine local relevance.** Current practitioner discussion still emphasizes service + location specificity, GBP/local-citation alignment, real service-area clarity, and avoiding thin city pages; Reddit local SEO practitioners continue to flag weak city pages and backlink/location relevance issues as common problems. ([reddit.com](https://www.reddit.com/r/localseo/comments/1tqamke/local_service_business_lost_nearly_all_organic/))  
8. **AI Overview citations are related to—but not identical with—organic rankings.** Ahrefs’ 2025–2026 AIO research indicates ranking visibility helps but does not fully determine AI Overview citations; pages also need coverage across fan-out queries, topic completeness, and citation-worthy content. ([ahrefs.com](https://ahrefs.com/blog/search-rankings-ai-citations/?utm_source=openai))  
9. **Answer-first formatting helps AIO/GEO.** Practitioner GEO checklists emphasize question-led sections, direct 2–3 sentence answers, FAQs, definitions, comparisons, internal links, and “liftable” factual sentences. ([reddit.com](https://www.reddit.com/r/GEO_optimization/comments/1n9ycqu/stepbystep_guide_to_generative_engine/))  
10. **Multimodal / UX readiness matters.** Google recommends supporting textual content with high-quality images and keeping Business Profile information current for AI-search success, while also preserving snippet/indexing controls. ([developers.google.com](https://developers.google.com/search/blog/2025/05/succeeding-in-ai-search))  

**Scoring weights used for the overall score:**

| Dimension | Weight |
|---|---:|
| Technical SEO | 15% |
| On-page SEO | 15% |
| Content quality & E-E-A-T | 15% |
| Entity & topical coverage | 10% |
| AIO readiness | 10% |
| GEO readiness | 10% |
| Local SEO | 15% |
| UX & conversion | 10% |

---

# 2. Page A audit

## Page A scorecard

| Dimension | Score |
|---|---:|
| Technical SEO | **82** |
| On-page SEO | **90** |
| Content quality & E-E-A-T | **82** |
| Entity & topical coverage | **91** |
| AIO readiness | **90** |
| GEO readiness | **83** |
| Local SEO | **92** |
| UX & conversion | **87** |
| **Weighted overall** | **87 / 100** |

## Technical SEO — **82 / 100**

**Strengths**

- Strong, relevant title:  
  `Electronics Recycling Billings MT | R2 Certified | Free Pickup | STS`  
  This directly targets the primary local intent: **electronics recycling + Billings MT + certification + pickup**.
- Meta description is keyword-relevant and persuasive:  
  `R2 certified electronics recycling in Billings, MT. Free pickup throughout Yellowstone County. NAID AAA data destruction...`
- Correct viewport:  
  `<meta name="viewport" content="width=device-width, initial-scale=1.0">`
- Canonical present and clean:  
  `<link rel="canonical" href="https://www.stselectronicrecyclinginc.com/billings-mt">`
- Single visible H1 appears to be present:  
  `<h1>Billings <span class="accent">Electronics Recycling</span> — R2 Certified and Free Pickup</h1>`
- Responsive CSS exists with breakpoints for `max-width:1100px`, `968px`, and `640px`.
- Images use `loading="lazy"` after the hero, and alt text is present.

**Weaknesses**

- Meta description is long and may truncate; it is useful but crowded.
- Uses the obsolete / ignored `meta keywords`:  
  `<meta name="keywords" content="electronics recycling Billings MT, ...">`  
  Not harmful by itself, but it is a dated signal and adds no Google ranking value.
- Heavy inline CSS and many inline styles create bloat. The page includes large CSS blocks, Font Awesome, Google Fonts, multiple large remote images, and repeated inline card styling.
- Semantic HTML is weak. The page is almost entirely `<div>`-based; no `<main>`, `<section>`, `<article>`, `<address>`, or semantic service-area block.
- Alt text is present but sometimes keyword-stuffed, e.g.  
  `alt="Billings Montana electronics recycling IT asset disposition laptop computer Yellowstone County"`

**Technical verdict:** Strong crawl/index basics, strong title/canonical/viewport, but bloated and semantically over-div’d.

---

## On-page SEO — **90 / 100**

**Strengths**

- Excellent primary keyword alignment in H1, title, hero, headings, and body:
  - `Billings Electronics Recycling`
  - `R2 Certified`
  - `Free Pickup`
  - `Yellowstone County`
  - `IT asset disposition`
  - `hard drive destruction`
  - `NAID AAA`
- Strong local modifiers throughout:
  - `Billings`
  - `Yellowstone County`
  - `eastern Montana`
  - `northern Wyoming`
  - `Laurel`, `Hardin`, `Columbus`, `Red Lodge`, `Roundup`, `Huntley`
- Captures multiple search intents:
  - commercial: “schedule free pickup”
  - compliance: “NAID AAA data destruction”
  - informational: “What electronics can be recycled?”
  - local: “service areas”
  - enterprise: “ITAD”
- Good internal linking to relevant supporting pages:
  - `/it-asset-disposition-itad`
  - `/on-site-hard-drive-shredding`
  - `/certificate-of-destruction-services`
  - `/naid-certified-data-destruction`
  - equipment-specific recycling pages

**Weaknesses**

- Repetition gets aggressive. Phrases like **Billings**, **R2v3**, **NAID AAA**, **Yellowstone County**, and **Certificate of Destruction** appear repeatedly. It is not pure stuffing, but it is close to feeling machine-composed.
- Some headings are very SEO-shaped rather than user-natural:
  - `What Electronics Can Be Recycled in Billings?`
  - `How Does Electronics Recycling Protect Data in Billings?`
  - `Is My Data Safe During Billings Electronics Recycling?`
- URL implied by canonical `/billings-mt` is acceptable but not service-explicit. `/electronics-recycling-billings-mt` would be more self-descriptive, though not required.

**On-page verdict:** Best keyword-intent match of the three. It covers primary, secondary, and long-tail local queries thoroughly.

---

## Content quality & E-E-A-T — **82 / 100**

**Strengths**

- Strong service specificity:
  - `R2v3 certified electronics recycling`
  - `NAID AAA data destruction`
  - `NIST 800-88 compliant processes`
  - `serial-number-specific certificates`
  - `downstream material tracking`
  - `Business Associate Agreements`
- Good industry-specific content for healthcare, energy, government, education.
- Strong process description:
  1. Schedule free pickup  
  2. Secure transport  
  3. R2v3 certified processing  
  4. Certificate of Destruction
- Good E-E-A-T signals:
  - certifications
  - facility size
  - chain of custody
  - audit documentation
  - compliance frameworks
  - named local institutions

**Weaknesses / risk flags**

- Several claims need visible citations or proof on-page:
  - `600,000 sq ft certified facility`
  - `Certificate of Destruction Within 48 Hours`
  - `zero-landfill commitment`
  - `EPA, approximately 2.7 million tons...`
  - `IBM's Cost of a Data Breach Report... $4.88 million`
  - `UN Global E-waste Monitor reports that only 17.4%...`
- Potentially over-assertive trust language:
  - `Billings healthcare systems, energy firms, and government agencies trust STS`
  - `frequently recommended by compliance officers`
- Named institutions are useful for local relevance, but the wording can imply client relationships. For example:
  - `Billings Clinic and St. Vincent Healthcare generate significant volumes...`
  - `IT directors at Billings Clinic... prioritize...`
  This should be softened unless STS has permission/testimonials/case studies.
- Some regulatory phrasing is too confident:
  - `HIPAA 45 CFR 164.312 requirements... disposed devices must be rendered irretrievable`
  - `destruction that exceeds NIST 800-88 Rev. 2 standards`
  These need precision and sourcing.

**E-E-A-T verdict:** Most persuasive and expert-sounding page, but also the highest risk of unsupported claims. Add visible citations, certification badges linked to proof, facility photos, real testimonials, and case studies.

---

## Entity & topical coverage — **91 / 100**

**Covered entities / concepts**

- STS Electronic Recycling
- Billings, Montana
- Yellowstone County
- eastern Montana
- northern Wyoming
- Billings Clinic
- St. Vincent Healthcare
- Montana State University Billings
- Rocky Mountain College
- Billings Public Schools
- BLM
- USFS
- R2v3
- NAID AAA
- NIST 800-88
- HIPAA
- DoD 5220.22-M
- EPA
- IBM Cost of a Data Breach
- UN Global E-waste Monitor
- computers, laptops, servers, networking gear, printers, copiers, monitors, hard drives, mobile devices

**Strengths**

- Best semantic footprint of the three.
- Connects local industries to actual disposal needs.
- Strong service taxonomy through equipment lists and internal links.
- Excellent topical depth around compliance, data destruction, ITAD, and local institutional needs.

**Weaknesses**

- Some entities are not backed by citations or proof.
- Could add:
  - physical business NAP block
  - service eligibility details
  - accepted / not accepted equipment table
  - pricing or minimum pickup threshold
  - certification verification links
  - customer review snippets

**Entity verdict:** Strongest topical graph. The page gives search engines and LLMs many entity relationships to understand.

---

## AIO readiness — **90 / 100**

**Strengths**

- Excellent question-led sections:
  - `What Electronics Can Be Recycled in Billings?`
  - `How Does Electronics Recycling Protect Data in Billings?`
  - `Is My Data Safe During Billings Electronics Recycling?`
  - `How Does Electronics Recycling Work in Billings?`
  - FAQ questions
- Many direct-answer paragraphs are usable by AI Overviews.
- The four-step process is very extractable.
- FAQ section is relevant and commercial-intent aligned.
- The summary-style block near the top is strong:
  > `STS Electronic Recycling provides R2v3 certified electronics recycling and NAID AAA data destruction for Billings businesses...`

**Weaknesses**

- The page lacks a clean **TL;DR / Quick Answer** block near the top.
- Some answer blocks are too long and stuffed with multiple claims.
- AI Overviews may hesitate to quote unsupported statistics or claims if other pages cite sources more cleanly.

**AIO verdict:** Best AIO structure of the three. Add a 5-bullet “Quick Answer” and visible source citations to make it even stronger.

---

## GEO readiness — **83 / 100**

**Strengths**

- Many citation-worthy statements:
  - `STS provides R2v3 certified electronics recycling and NAID AAA data destruction...`
  - `Services include free scheduled pickup... serial-number-specific certificates... downstream material tracking...`
  - `Certificate of Destruction delivered within 48 hours...`
- Includes statistics and named sources:
  - EPA e-waste claim
  - IBM breach cost
  - UN Global E-waste Monitor
- Good procedural and definitional content for LLM absorption.

**Weaknesses**

- Statistics are not linked to sources in the HTML. For GEO, this is a major missed opportunity.
- Some claims are too promotional to be “lifted” neutrally.
- A few statements are risky because they sound like third-party endorsements without proof:
  - `frequently recommended by compliance officers`
  - `trusted by Billings' leading institutions`

**GEO verdict:** High potential, but weaker than it could be because the page does not visibly cite sources or present unique data tables.

---

## Local SEO — **92 / 100**

**Strengths**

- Best local targeting of all three.
- Strong city/county/neighborhood coverage:
  - `Downtown Billings`
  - `West End`
  - `South Side`
  - `Heights`
  - `Lockwood`
  - `Rimrock`
  - `Laurel`
  - `Hardin`
  - `Columbus`
  - `Red Lodge`
  - `Roundup`
  - `Huntley`
- Strong local industry alignment:
  - healthcare
  - energy
  - government
  - education
  - federal field offices
- Good “About Billings” section connecting local economy to electronics disposal demand.
- Strong commercial CTA for the city:
  - `Schedule Your Billings Pickup`
  - `Free pickup throughout Billings and Yellowstone County`

**Weaknesses**

- No visible NAP block.
- No embedded map or service radius explanation.
- No Google Business Profile / review references.
- “Free pickup throughout Yellowstone County” may be too broad if minimum volume applies.

**Local verdict:** Best local page. It feels like it was written specifically for Billings, not just city-swapped.

---

## UX & conversion — **87 / 100**

**Strengths**

- Strong hero CTA:
  - `Schedule Free Pickup`
  - `Email Us`
  - quote form position
- Multiple CTA sections throughout the page.
- Good trust cards and visual hierarchy.
- Strong final CTA:
  - `Ready to Recycle Electronics in Billings?`
- Email and schedule links are visible.
- Good scannability despite length.

**Weaknesses**

- No phone number visible.
- “ABSOLUTELY FREE” banner is aggressive and may create expectation mismatch.
- Very long page; strong for SEO, but conversion users may need shorter paths.
- Quote form placeholder `{loadposition city-hero-form}` is fine in CMS context but not useful in raw HTML unless rendered.

**UX verdict:** Strongest conversion architecture, though it should add phone, eligibility details, and reduce “free” overstatement.

---

## Page A top strengths

1. Best local specificity.
2. Best topical/entity depth.
3. Best AIO-style question structure.
4. Strongest internal linking and service coverage.
5. Strongest commercial intent match.

## Page A top weaknesses

1. Unsupported statistics and trust claims.
2. Slight keyword repetition / AI-generated feel.
3. Semantic HTML could be cleaner.
4. No visible NAP/reviews/certification proof.
5. “Free pickup” language may overpromise.

---

# 3. Page B audit

## Page B scorecard

| Dimension | Score |
|---|---:|
| Technical SEO | **80** |
| On-page SEO | **84** |
| Content quality & E-E-A-T | **80** |
| Entity & topical coverage | **84** |
| AIO readiness | **85** |
| GEO readiness | **78** |
| Local SEO | **82** |
| UX & conversion | **84** |
| **Weighted overall** | **82 / 100** |

## Technical SEO — **80 / 100**

**Strengths**

- Clean title:
  `Billings Electronics Recycling | R2v3 Certified | STS`
- Meta description is concise and commercially relevant:
  `Electronics recycling in Billings, MT with free pickup for qualifying volumes, R2v3 certified processing, secure data destruction. Request pickup today.`
- Good canonical:
  `<link rel="canonical" href="https://www.stselectronicrecyclinginc.com/billings-mt">`
- Single H1:
  `<h1>Billings <span class="accent">Electronics Recycling</span> for Businesses & Institutions</h1>`
- Responsive CSS and mobile breakpoints included.
- Images have alt attributes and lazy loading.
- Internal links are crawlable HTML anchors.

**Weaknesses**

- Still relies almost entirely on `<div>` wrappers, not semantic HTML.
- Uses `meta keywords`, which is obsolete.
- Heavy inline CSS and remote assets.
- Some raw HTML comments such as `<!-- AUDIT_TARGET -->` are visible to crawlers and unnecessary.
- CSS includes `.floating-card iframe`, but the form is actually `{loadposition city-hero-form}`. Not a major issue, but slightly inconsistent.

**Technical verdict:** Solid but not exceptional. Similar foundation to A, slightly less polished due to comments and less complete optimization.

---

## On-page SEO — **84 / 100**

**Strengths**

- Good primary query match:
  - `Billings Electronics Recycling`
  - `R2v3 Certified`
  - `secure data destruction`
  - `ITAD`
  - `hard drive destruction`
- Good intent coverage:
  - what can be recycled
  - how certified recycling protects data
  - pickup eligibility
  - audit documentation
  - what happens after pickup
- More restrained keyword usage than Page A.
- Strong internal link section:
  - `ITAD Services`
  - `Hard Drive Destruction`
  - `Certificate of Destruction`
  - `Data Center Decommissioning`
  - `Corporate Data Security Disposal`
  - `NAID Certified Data Destruction`

**Weaknesses**

- Title omits `MT`, `free pickup`, and `ITAD`, making it less long-tail-rich than A/C.
- The H1 targets businesses and institutions but does not mention `MT`, `R2`, or pickup.
- Some service pages linked in “Related Services” appear potentially fabricated or inconsistent with actual site architecture:
  - `/healthcare-it-disposal`
  - `/government-data-destruction`
  - `/hipaa-compliant-hard-drive-destruction`
  If these URLs exist, good; if not, broken links hurt.
- Less complete equipment coverage than A.

**On-page verdict:** Strong and clean, but less comprehensive and less locally aggressive than Page A.

---

## Content quality & E-E-A-T — **80 / 100**

**Strengths**

- Most cautious and credible tone of the three.
- Uses safer language:
  - `free pickup for qualifying volumes`
  - `NAID AAA Certified Data Destruction Available`
  - `support internal security reviews`
  - `help support HIPAA...`
- Strong compliance detail:
  > `NIST SP 800-88 uses the media sanitization categories "Clear, Purge, and Destroy."`
- Good explanation of data-bearing asset risk:
  > `Retired computers, servers, tablets, phones, copiers, and removable media can contain passwords, financial records, student data, patient data, and customer information.`
- Good practical FAQ.

**Weaknesses**

- Less persuasive than Page A because it is more generic.
- Fewer strong proof points.
- Mentions `According to the Global E-waste Monitor, 62 million tonnes...` but does not link or cite the source.
- Some phrases are vague:
  - `EPA Awareness`
  - `Data Security Support`
  - `Most qualifying projects can be planned quickly`
- Fewer direct business proof signals: no phone, no testimonials, no certification verification, no facility images beyond stock-style images.

**E-E-A-T verdict:** Safer and less overclaiming than A/C, but also less memorable and less authority-rich.

---

## Entity & topical coverage — **84 / 100**

**Covered entities / concepts**

- STS Electronic Recycling
- Billings
- Yellowstone County
- Billings Clinic
- Montana State University Billings
- Rocky Mountain College
- Billings Public Schools
- St. Vincent Healthcare
- R2v3
- NAID AAA
- NIST 800-88
- HIPAA
- GLBA
- FERPA
- Global E-waste Monitor
- I-90, I-94, US-87
- West End, Billings Heights, Downtown Billings, South Side, Lockwood, Laurel

**Strengths**

- Good entity coverage without as many risky endorsement implications as Page C.
- Strong compliance topical coverage with HIPAA, GLBA, FERPA, NIST, R2v3.
- Good related-service internal links.

**Weaknesses**

- Less deep local institutional commentary than Page A.
- Service-area section is good but less detailed than A.
- No “Billings by the numbers” specifics as useful as A’s population / hospitals / universities block.
- Missing some equipment/service entities Page A includes.

**Entity verdict:** Strong, balanced, and cleaner than C, but less complete than A.

---

## AIO readiness — **85 / 100**

**Strengths**

- Very good question-style headings:
  - `Who Provides Certified Electronics Recycling in Billings?`
  - `What Electronics Can Billings Organizations Recycle?`
  - `How Does Certified Recycling Protect Billings Data?`
  - `How does electronics recycling work for Billings organizations?`
- FAQ section is concise and likely extractable.
- The compliance paragraph is highly AIO-friendly:
  > `NIST SP 800-88 uses the media sanitization categories "Clear, Purge, and Destroy."`
- The “what happens after pickup” FAQ is useful for informational searches.

**Weaknesses**

- Does not have as strong of a top-of-page direct answer as A.
- Some answers are generic and could apply to any city.
- FAQ answers are useful but less locally dense than A’s.

**AIO verdict:** Very good answer-engine structure, second best overall.

---

## GEO readiness — **78 / 100**

**Strengths**

- Clean, neutral statements are more likely to be quoted than Page C’s sales-heavy language.
- Includes useful factual chunks:
  - `Clear, Purge, and Destroy`
  - `62 million tonnes of e-waste were generated worldwide in 2022`
  - service process descriptions
- Related service lists help entity mapping.

**Weaknesses**

- Only one external statistic, and it is not linked.
- Lacks unique data, tables, expert quotes, original proof, or citations.
- Less quotable specificity than A.
- Some claims are cautious to the point of being less citation-worthy:
  - `can provide`
  - `help support`
  - `typically expect`

**GEO verdict:** Clean and safe, but not as rich in citation-worthy facts as A.

---

## Local SEO — **82 / 100**

**Strengths**

- Good Billings and Yellowstone County targeting.
- Solid local service coverage:
  - Downtown Billings
  - West End
  - Billings Heights
  - South Side
  - Lockwood
  - Laurel
  - Yellowstone County
  - Eastern Montana
  - Northern Wyoming
- Good “About Billings” paragraph:
  > `Billings anchors a regional economy built on healthcare, energy, agriculture-related trade, education, retail, and public services.`
- Better “qualifying volumes” language than A.

**Weaknesses**

- Less local texture than A.
- No NAP block.
- No phone number.
- No review/testimonial/local proof.
- “Market Drivers” block uses abstract labels like `MT`, `I-90`, `B2B`, `R2v3` instead of user-friendly local facts.

**Local verdict:** Good local SEO page, but not as locally authoritative as A.

---

## UX & conversion — **84 / 100**

**Strengths**

- Clear CTAs:
  - `Schedule Free Pickup`
  - `Email STS`
  - `Request Pickup`
- Good “free for qualifying volumes” clarity.
- Related services section supports deeper navigation.
- Final CTA is clean and not overhyped.
- Good form-intent text at the bottom:
  > `Tell us what equipment you need recycled...`

**Weaknesses**

- No phone CTA.
- Less urgency than A.
- The final form area appears visually prepared but lacks the actual visible form in raw HTML.
- The page is somewhat less emotionally persuasive.

**UX verdict:** Clean, credible, and conversion-safe. It would benefit from a phone number, clearer minimum-volume criteria, and visible trust badges.

---

## Page B top strengths

1. Most credible / least overclaiming page.
2. Strong AIO question structure.
3. Good compliance language.
4. Good internal link architecture.
5. Clear “qualifying volumes” language.

## Page B top weaknesses

1. Less local depth than A.
2. Fewer proof points and statistics.
3. No phone number.
4. Some abstract/vague card language.
5. Less distinctive than A.

---

# 4. Page C audit

## Page C scorecard

| Dimension | Score |
|---|---:|
| Technical SEO | **78** |
| On-page SEO | **77** |
| Content quality & E-E-A-T | **69** |
| Entity & topical coverage | **75** |
| AIO readiness | **75** |
| GEO readiness | **70** |
| Local SEO | **70** |
| UX & conversion | **80** |
| **Weighted overall** | **74 / 100** |

## Technical SEO — **78 / 100**

**Strengths**

- Good title:
  `Electronics Recycling Billings MT | R2 Certified ITAD | STS`
- Good meta description with phone CTA:
  `Professional electronics recycling in Billings, MT. R2v3 certified processing, HIPAA compliant data destruction, and enterprise ITAD services. Call (844) 699-2913.`
- Canonical present:
  `<link rel="canonical" href="https://www.stselectronicrecyclinginc.com/billings-mt">`
- Single H1:
  `<h1>Certified <span class="accent">Electronics Recycling</span> in Billings, MT</h1>`
- Responsive CSS and lazy-loaded images.
- Phone links use `tel:`:
  `<a href="tel:844-699-2913"...>`

**Weaknesses**

- Same semantic HTML weakness as A/B: div-heavy, no `<main>`, `<section>`, `<address>`.
- Meta description says `HIPAA compliant data destruction`, which is a stronger legal/compliance claim than the page proves.
- Uses `meta keywords`.
- Heavy CSS/inline styling.
- Some heading hierarchy is less precise:
  - `Certified Electronics Recycling`
  - `Comprehensive Asset Solutions`
  - `Ready to Get Started?`
  These are less keyword/local-intent rich than A/B.
- Comment with page-builder metadata appears inside `<body>` rather than head; not harmful, but messy.

**Technical verdict:** Solid baseline but less refined. Phone markup is a UX win, but semantic structure and claim precision are weaker.

---

## On-page SEO — **77 / 100**

**Strengths**

- Good primary targeting in title and H1:
  - `Electronics Recycling Billings MT`
  - `R2 Certified ITAD`
- Includes important secondary terms:
  - `hard drive destruction`
  - `IT asset disposition`
  - `Yellowstone County`
  - `secure e-waste disposal`
  - `R2v3`
  - `NAID AAA`
- Good internal links:
  - ITAD
  - hard drive shredding
  - healthcare IT disposal
  - certificate of destruction
  - data center decommissioning
  - NAID AAA data destruction

**Weaknesses**

- Less service-area and pickup targeting than A/B.
- Hero does not mention free pickup or Yellowstone County.
- Page focuses more on generic “enterprise ITAD” than the exact local searcher need.
- Some anchor text is artificially rebranded:
  - `Enterprise Risk Mitigation`
  - `HIPAA Compliant Workflows`
  These are less clear than plain-language service anchors.
- Less complete FAQ coverage. It lacks a direct “Is pickup free?” FAQ and a detailed pickup-process FAQ.

**On-page verdict:** Good keyword targeting but less comprehensive and less local-service oriented than A/B.

---

## Content quality & E-E-A-T — **69 / 100**

**Strengths**

- Includes strong trust concepts:
  - R2v3
  - NAID AAA
  - NIST 800-88
  - HIPAA
  - FERPA
  - Certificates of Destruction
  - chain of custody
- Phone number improves business legitimacy.
- Uses recognized local entities:
  - Billings Clinic
  - St. Vincent Healthcare
  - Montana State University Billings
  - ExxonMobil

**Major weaknesses / risk flags**

- Page C has the most problematic implied-client language:
  > `Our team works with major regional energy producers like ExxonMobil...`  
  Unless this is a verifiable customer relationship with permission, this is a legal/trust risk.
- More overclaiming than B:
  - `HIPAA-compliant Data Destruction`
  - `destruction that exceeds NIST 800-88 standards`
  - `We execute destruction that exceeds these protocols for every data-bearing device`
  - `NAID AAA certified data erasure processes`
- Some phrasing sounds generic and sales-heavy:
  - `absolute security`
  - `robust operational frameworks`
  - `enterprise risk mitigation`
  - `periodic technology refreshes with strict data protection`
- Less practical detail than A/B. It has fewer specific steps, fewer service-area details, and fewer operational specifics.
- Statistics are unsupported:
  - `IBM's Cost of a Data Breach Report... $4.88 million`
  - `EPA estimates 2.7 million tons...`

**E-E-A-T verdict:** Contains trust keywords but weakest credibility. It needs proof, softer claims, and removal or substantiation of named-client implications.

---

## Entity & topical coverage — **75 / 100**

**Covered entities / concepts**

- STS Electronic Recycling
- Billings
- Yellowstone County
- Montana
- eastern Montana
- northern Wyoming
- Billings Clinic
- St. Vincent Healthcare
- ExxonMobil
- Montana State University Billings
- R2v3
- NAID AAA
- NIST SP 800-88
- HIPAA
- FERPA
- EPA
- IBM Cost of a Data Breach
- ITAD
- data center decommissioning
- hard drive shredding

**Strengths**

- Good high-level topical coverage.
- Strong compliance/entity vocabulary.
- Includes phone and related-service entities.

**Weaknesses**

- Local entity depth is thinner than A/B.
- No detailed neighborhood list like A/B.
- No colleges/government/BLM/USFS/Billings Public Schools coverage beyond broad mentions.
- Entity relationships are sometimes risky because they imply customers or partnerships.

**Entity verdict:** Good topic vocabulary, but less complete and less safely grounded.

---

## AIO readiness — **75 / 100**

**Strengths**

- Some answer-style headings:
  - `What Electronics Can Be Recycled in Billings?`
  - `Is My Data Safe During Electronics Recycling?`
  - `What certifications do you hold?`
  - `What areas do you serve?`
- FAQ section is concise.
- Includes a useful direct answer:
  > `STS Electronic Recycling provides R2v3 certified electronics recycling and NAID AAA data destruction for Billings organizations.`

**Weaknesses**

- Less question-led structure overall than A/B.
- Several headings are generic:
  - `Certified Electronics Recycling`
  - `Trusted by Billings' Essential Sectors`
  - `Comprehensive Asset Solutions`
- No clean top summary block.
- Less procedural detail; the recycling process is mentioned but not as clearly step-by-step as A.
- FAQ answers are broad and less locally specific.

**AIO verdict:** Adequate but behind A/B. It can answer some AI Overview queries, but it is less extractable and less complete.

---

## GEO readiness — **70 / 100**

**Strengths**

- Has some quotable statements around R2v3, NIST, and certificates.
- Includes recognizable source-like entities: IBM and EPA.
- Phone/contact data is useful for AI assistants answering “who can I call?”

**Weaknesses**

- Unsupported source claims.
- Too much promotional language.
- Potentially unsafe claims reduce citation-worthiness:
  - `absolute security`
  - `exceeds these protocols for every data-bearing device`
  - `works with... ExxonMobil`
- No original data, no tables, no visible citations, no expert quotes.
- Less structured evidence than A/B.

**GEO verdict:** Lowest GEO readiness. It has the vocabulary, but not the trustworthy evidence structure.

---

## Local SEO — **70 / 100**

**Strengths**

- Title and H1 include Billings MT.
- Mentions Yellowstone County.
- Mentions regional service:
  - eastern Montana
  - northern Wyoming
  - downtown commercial district
  - regional medical campuses
  - industrial corridors
- Phone number improves local conversion.

**Weaknesses**

- Much weaker neighborhood/service-area coverage than A/B.
- No specific list of suburbs/nearby towns like Laurel, Lockwood, Heights, West End, etc.
- “About Billings” is short and generic.
- No NAP block, map, reviews, GBP mention, or service eligibility details.
- Less clear whether free pickup is available.

**Local verdict:** It targets Billings, but it feels less like a true Billings service-area page than A or B.

---

## UX & conversion — **80 / 100**

**Strengths**

- Best phone visibility:
  - Hero phone CTA
  - Final phone CTA
  - Meta description phone CTA
- Email CTA is visible.
- Strong visual hierarchy.
- Related services section supports deeper navigation.
- Final CTA is simple.

**Weaknesses**

- CTA language is less compelling:
  - `Ready to Get Started?`
  - `Contact Our Team`
- Does not emphasize “free pickup” as clearly as A/B.
- The page gives fewer concrete reasons to convert now.
- The hero is broad:
  > `Professional IT asset disposition and secure data destruction serving Montana organizations`
  Good, but not as locally conversion-focused as A.

**UX verdict:** Phone number is a major plus, but overall conversion messaging is less specific.

---

## Page C top strengths

1. Best phone CTA visibility.
2. Strong title/H1.
3. Good compliance vocabulary.
4. Good internal links.
5. Solid enterprise positioning.

## Page C top weaknesses

1. Weakest local depth.
2. Risky named-client implication with ExxonMobil.
3. Most overclaim-prone compliance language.
4. Less AIO/GEO extractable than A/B.
5. More generic and salesy.

---

# 5. Head-to-head ranking

## Final ranking

| Rank | Page | Overall | Why |
|---:|---|---:|---|
| **1** | **A** | **87** | Strongest local relevance, deepest topical/entity coverage, best AIO structure, and strongest commercial intent match. |
| **2** | **B** | **82** | Most credible and restrained; good AIO and local SEO, but less complete and less locally rich than A. |
| **3** | **C** | **74** | Solid technical base and phone CTA, but weaker local depth, more generic copy, and riskier unsupported claims. |

## Decisive factors

### Why Page A wins

Page A is the strongest SEO/AIO/GEO asset because it gives Google and AI systems the most complete understanding of:

- what the service is,
- where it is offered,
- who it is for,
- what equipment is accepted,
- what certifications matter,
- what process the customer follows,
- what local industries need the service,
- and why Billings organizations should choose STS.

Its best passages are highly extractable, especially:

> `STS Electronic Recycling provides R2v3 certified electronics recycling and NAID AAA data destruction for Billings businesses, healthcare systems, and government agencies.`

And:

> `Services include free scheduled pickup throughout Yellowstone County, serial-number-specific certificates of destruction, and downstream material tracking through final processing.`

That is exactly the type of factual, answer-ready copy that can support classic rankings and AI Overviews.

**Main caveat:** Page A needs source links and proof. It is the best page, but also needs the most legal/claim hygiene.

---

### Why Page B is second

Page B is the safest page. It uses more careful phrasing:

> `free pickup for qualifying volumes`

and:

> `help support HIPAA 45 CFR §164.312, GLBA, FERPA, and internal security reviews`

This makes it more credible than A in some places. It also has excellent question-style headings and FAQs.

But it loses to A because it is less distinctive, less local, and less comprehensive. It feels more like a strong template page; A feels more like a deeply localized Billings page.

---

### Why Page C is third

Page C has a good title, H1, phone CTA, and core service vocabulary. But it falls behind because it is the least locally developed and the most prone to unverified claims.

The biggest issue is this line:

> `Our team works with major regional energy producers like ExxonMobil...`

That is a high-risk statement unless STS has permission and proof. It may help local/entity relevance superficially, but it weakens trust if unsupported.

Page C also uses more generic enterprise language and fewer concrete local service details, making it less competitive for local SEO and less likely to be cited by AI engines.

---

# 6. Recommended winning-page fixes before publishing Page A

If you publish Page A, I would make these changes first:

1. **Add visible source citations** for EPA, IBM, UN Global E-waste Monitor, NIST, HIPAA, and any certification claims.
2. **Add a top “Quick Answer” block**:
   - 5 bullets
   - service area
   - accepted equipment
   - certifications
   - pickup eligibility
   - documentation timeline
3. **Change “free pickup throughout Yellowstone County” to “free pickup for qualifying volumes”** unless every pickup is truly free.
4. **Remove or soften implied-client claims** unless permission exists.
   - Replace “trusted by Billings Clinic...” style language with “designed for healthcare organizations such as hospitals, clinics...”
5. **Add proof blocks**:
   - certification badge links
   - facility photos
   - real testimonial/review excerpts
   - NAP
   - phone number
   - service minimums
6. **Improve semantic HTML**:
   - wrap content in `<main>`
   - use `<section>` for major sections
   - use `<address>` for contact/NAP
   - use real lists/tables where appropriate
7. **Trim repetition** of `Billings`, `R2v3`, `NAID AAA`, and `Yellowstone County`.
8. **Add a comparison / eligibility table**:
   - accepted equipment
   - data destruction options
   - documentation provided
   - pickup requirements
9. **Add a “Not accepted / special handling” section** if applicable.
10. **Add a phone CTA** in hero and final CTA.

```json
{
  "ranking": [
    { "page": "A", "rank": 1, "overall": 87, "verdict": "Best overall: strongest Billings localization, deepest topical coverage, and most AIO-ready structure, though it needs source/proof cleanup." },
    { "page": "B", "rank": 2, "overall": 82, "verdict": "Most credible and restrained, with strong AIO formatting, but less locally rich and less comprehensive than Page A." },
    { "page": "C", "rank": 3, "overall": 74, "verdict": "Good phone CTA and core keywords, but weakest local depth and riskiest unsupported claim language." }
  ],
  "winner": "A",
  "summary": "Page A is the strongest SEO+AIO+GEO page because it gives the fullest local, topical, and commercial-intent coverage for Billings electronics recycling. Page B is safer and cleaner but less powerful; Page C has useful conversion elements but is too generic and claim-risky to beat the others."
}
```

---

### GPT-5.5 Pro `gpt-5.5-pro`

_web search: no · 351s_

> **ERROR:** gpt-5.5-pro background run ended as failed: Rate limit reached for gpt-5.5-pro in organization org-ttqzRNl52RzEaTNynCMugu6n on tokens per min (TPM): Limit 1000000, Used 938365, Requested 92554. Please try again in 1.855s. Visit https://platform.openai.com/account/rate-limits to learn more.

### Sonnet 4.6 `claude-sonnet-4-6`

_web search: yes · 367s_

**Summary:** Page A wins decisively across SEO, AIO, and GEO dimensions through its combination of three sourced statistics (EPA, UN, IBM), eight named Billings institutions, five question-based H2s, a four-step HowTo process section, neighborhood-level service area specificity, and a unique local regulatory insight about Montana's EPR law — all of which are exactly the signals that drive organic rankings, AI Overview passage extraction, and LLM citation selection in 2025-2026. Pages B and C are essentially tied for second at 75 points, with B holding advantages in meta structure and internal linking while C holds a meaningful phone-number conversion advantage and a uniquely citable NIST direct quotation. The 12-point gap between A and B/C reflects structural differences in content depth, entity density, and extractable specificity that cannot be closed by formatting or CTA adjustments alone.

I'll research current SEO/AIO/GEO best practices before judging, then conduct the full audit.
I now have comprehensive research data. Let me conduct the full, detailed audit.

---

# 🔍 FULL SEO / AIO / GEO AUDIT — Three Versions of the STS Billings MT Electronics Recycling Page

---

## RESEARCH NOTES


The real levers for AI Overview inclusion are a top-10 organic ranking as the entry ticket, clean answer blocks, question-based headings, originality, and technical crawlability.



AI Overview coverage expanded to 48% of all tracked queries by early 2026, up from 31% in February 2025, with growth accelerating through mid-2025 and crossing 40% in June.



44.2% of all LLM citations come from the first 30% of text (the intro), 31.1% from the middle, and 24.7% from the conclusion — making front-loaded answer content critical.



Including specific facts, numbers, percentages, and data points increases the probability of content being cited in generative searches, as confirmed by Princeton/University of Delhi GEO research showing that statistics, citations, and quotations can boost visibility by over 40% across queries.



The foundational GEO study validated: +41% visibility from quotations, +32% from statistics, +30% from citations, +28% from fluency optimization.



According to Semrush, promotional language reduces AI citation rates by 26.19%.



Google AI Overviews cite passages, not entire pages. The system extracts small sections that independently answer the query clearly. Passage-level extractability is one of the most important AIO concepts.



Pages that delay the answer behind storytelling, long introductions, or marketing language often lose extraction opportunities even when they rank strongly in organic search.



Key AIO optimization steps include a 50–70 word TL;DR up top, building clusters to grow topical authority, strengthening E-E-A-T signals, implementing FAQ/HowTo schema markup, refreshing data, and tightening internal link architecture.



Two tools to differentiate local geotargeted pages: Personalization (content specifically tailored to that location, clearly written by someone who knows it well) and Uniqueness (content that is different from page to page).



Structure pages to break up content and make it easier to optimize for zero-click and rich results, using header tags, and use structured data and concise, helpful content to increase chances of showing up for knowledge graphs, People Also Ask sections, and other rich results.



Multi-location AIO depends on location-specific pages and location-specific Google Business Profiles. A generic homepage cannot be cited for "[service] in [city]" queries — per-location depth is required.



If your NAP/contact information is inconsistent across platforms, AI agents get confused and will not cite you if they are not sure the information is correct.



AI engines scan the top of your page first when constructing answers. Lead every article with a 2 to 4-sentence direct response to the primary question. This inverted-pyramid structure is the single highest-leverage formatting change you can make for GEO.



If your business serves multiple areas, you need dedicated landing pages for each one — even without a physical office there. The key is making sure each page has 100% unique content.



H1 should combine service and location naturally. Location signals must not be buried further down the page; early contextual clarity improves user confidence and supports search engine topical understanding.


**Additional key signals informing my judgments:**
- Title tag optimal length: 50–60 characters; meta description: 150–160 characters (SalesHive, SEO Inventor, Straight North)
- Phone number in the CTA section is a critical local trust/conversion signal; NAP consistency is foundational
- E-E-A-T signals: author attribution, specific named local entities, verifiable stats with sourced citations
- FAQ sections formatted as Q&A are high-value for both People Also Ask and AI extraction
- Promotional language and generic filler actively hurt GEO citability
- GEO citation formula: direct claim + supporting statistic + named source + verifiable entity = maximum extractability

---

---

# PAGE A — FULL AUDIT

## Technical SEO

**Evidence:**

- **Title tag:** `"Electronics Recycling Billings MT | R2 Certified | Free Pickup | STS"` — 62 characters (slightly over ideal 50–60), but all meaningful. Primary keyword ("electronics recycling Billings MT") leads. Certification and USP modifiers included. Brand "STS" present. **Strong.**
- **Meta description:** `"R2 certified electronics recycling in Billings, MT. Free pickup throughout Yellowstone County. NAID AAA data destruction for healthcare, energy, and government. 600,000 sq ft certified facility."` — 199 characters. This is over the 155–160 character display limit, meaning it will be truncated in SERPs, though Google will often pull it. The content is dense with locally relevant keywords and USPs. **Good content, slightly long.**
- **Meta keywords tag:** Present with 8 geo-modified keywords. This is a vestigial signal (Google ignores it), but it does no harm and signals intent.
- **Viewport:** `width=device-width, initial-scale=1.0` — correct.
- **Canonical:** `https://www.stselectronicrecyclinginc.com/billings-mt` — clean, present.
- **`lang="en"`:** Present.
- **H1:** `"Billings Electronics Recycling — R2 Certified and Free Pickup"` — single H1, service + location + USPs. Strong on-page signal. The em dash is slightly unusual but fine semantically.
- **H2s:** Multiple H2s throughout — "Billings' Certified Electronics Recycling Partner," "What Electronics Can Be Recycled in Billings?," "R2v3 and NAID AAA Certified for Billings," "Is My Data Safe During Billings Electronics Recycling?," "Trusted by Billings' Leading Institutions," "How Does Electronics Recycling Work in Billings?," "Why Choose STS for Billings E-Waste Management?," "Common Questions," "Service Areas and About Billings," "Ready to Recycle Electronics in Billings?" — **logical, geo-modified H2 hierarchy, largely question-based — excellent for AIO.**
- **H3s/H4s:** Used appropriately for sub-items (service links, process steps, FAQ cards, certifications). No heading skipping observed.
- **Image alt text:** Descriptive and geo-specific: e.g., `"Billings Montana electronics recycling IT asset disposition laptop computer Yellowstone County"` — strong local alt text. Three images total. Uses `loading="lazy"` on all sub-images. **Good.**
- **Inline CSS:** Heavy inline CSS (~600+ lines) — no external style sheet. This increases page HTML weight and is a mild negative for performance, but it's a CMS-generated page with preload optimization and font smoothing. The CSS is well-structured.
- **Font loading:** Uses `rel="preload"` with `onload` swap for Inter and Font Awesome — good performance pattern.
- **Responsive CSS:** Full `@media` breakpoints at 1100px, 968px, 640px. **Mobile-friendly.**
- **CMS template artifact:** `{loadposition city-hero-form}` — this is a Joomla/CMS template tag that will be replaced server-side. Not an issue for the live page.
- **Page weight/bloat:** Substantial inline CSS. No external JS. Grid layouts used inline. Medium-heavy page but controlled. No render-blocking scripts observable in `<head>`.
- **Author meta:** `<meta name="author" content="Mark Domnenko">` — minor positive E-E-A-T signal.

**Score: 82/100** — Very strong heading hierarchy and meta structure; slightly long title and meta description; heavy inline CSS; no phone number displayed in markup (GBP/local schema handled separately per instructions).

---

## On-Page SEO

**Evidence:**

- **Primary keyword:** "electronics recycling Billings MT" / "Billings electronics recycling" — appears in title, H1, multiple H2s, hero body copy, section headers, and inline text. Well-distributed, not stuffed.
- **Secondary keywords covered:** `e-waste recycling Billings`, `computer recycling Billings`, `hard drive destruction Billings MT`, `ITAD Billings Montana`, `R2 certified recycling Billings`, `free electronics pickup Billings`, `data destruction Yellowstone County`, `NAID AAA` — all organically integrated into headers and body.
- **Keyword intent:** Dual intent — commercial ("free pickup," "schedule") and informational ("how does electronics recycling work"). Both are addressed.
- **"Near me" pattern:** Explicitly addressed in FAQ: `"Organizations searching for electronics recycling near me throughout Billings and Yellowstone County find STS provides same-week scheduled pickup in the Heights, West End, South Side, and Lockwood areas"` — this is very strong for local AIO and voice search. **Excellent.**
- **Content depth:** ~2,600 words (per template comment). Comprehensive coverage of: services, certifications, compliance frameworks (HIPAA 45 CFR 164.312, NIST 800-88, R2v3:2020, DoD 5220.22-M), industries, process, service areas, local context, FAQ, CTA.
- **Internal linking:** 15+ anchor-linked internal links to specific service pages. **Strong.**
- **External statistics cited:** EPA ("approximately 2.7 million tons of electronic waste reach U.S. landfills annually"), UN Global E-waste Monitor ("only 17.4% of electronic waste is properly recycled worldwide"), IBM Cost of a Data Breach Report ("average breach costs $4.88 million"). **Three statistics with source attribution — strong GEO signal.**
- **Topical cannibalization:** Not observed. Each section addresses a distinct subtopic.
- **Keyword density:** Natural throughout. No stuffing detected.

**Score: 90/100** — One of the strongest on-page profiles of the three. The explicit "near me" coverage, geo-modified H2s, rich secondary keyword integration, and sourced statistics are standouts.

---

## Content Quality & E-E-A-T

**Evidence:**

- **Named local entities:** Billings Clinic, St. Vincent Healthcare, Montana State University Billings, Rocky Mountain College, Yellowstone County government, Billings Public Schools, BLM field offices, USFS field offices — **8 named local institutional entities.** This is the densest local entity set of all three pages.
- **Experience signals:** "Billings healthcare systems and government agencies trust STS for certified electronics recycling" — claims trust but no specific testimonials or named contacts. The author meta tag (Mark Domnenko) is present but not displayed on-page.
- **Expertise signals:** Detailed references to HIPAA 45 CFR 164.312, NIST 800-88 Rev. 2, R2v3:2020 standards, DoD 5220.22-M, OMB reporting cycles, Business Associate Agreements — specific compliance regulatory citations demonstrate domain expertise. **Strong.**
- **Authoritativeness:** Three sourced statistics (EPA, UN Global E-waste Monitor, IBM). While these are not linked inline in the body text (only paraphrased), they are attributed. Could be stronger with hyperlinked citations.
- **Trust signals:** R2v3 certified, NAID AAA certified, 600,000 sq ft facility, Certificate of Destruction within 48 hours, zero-landfill policy — **concrete, verifiable claims.**
- **Specificity vs. generic filler:** Very specific — "HIPAA 45 CFR 164.312 requirements," "NIST 800-88 Rev. 2 standards," "serial-number-specific certificates," "downstream tracking to R2v3 certified smelters," "same-week scheduling," "within 48 hours." Minimal generic filler.
- **Originality:** Montana state law context ("Montana has no state-mandated extended producer responsibility law for electronics, meaning there is no subsidized drop-off infrastructure") — **unique, locally specific insight not commonly found on competitor pages.** Strong E-E-A-T differentiator.

**Score: 88/100** — Very strong expertise and specificity signals; excellent named local entities; the lack of inline cited hyperlinks for the statistics and absence of on-page author bio prevents a higher score.

---

## Entity & Topical Coverage

**Evidence:**

- **Service entities:** Electronics recycling, ITAD, hard drive destruction/shredding, Certificate of Destruction, data center equipment recycling, networking equipment recycling, NAID AAA data destruction — comprehensive.
- **Compliance entities:** HIPAA, NIST 800-88, R2v3, NAID AAA, DoD 5220.22-M, EPA, OMB, BAA (Business Associate Agreement) — 7 compliance frameworks named. **Best compliance entity coverage of all three pages.**
- **Local place entities:** Billings, Yellowstone County, Laurel, Hardin, Columbus, Red Lodge, Roundup, Huntley, Carbon County, Big Horn County, Stillwater County, Eastern Montana, Northern Wyoming, South Side, West End, Heights, Lockwood, Rimrock, Downtown Billings, I-90 (implied via "eastern Montana"), BLM, USFS.
- **Named institutions:** 8 (see above). **Best of all three.**
- **Industry entities:** Healthcare, energy/refining, government, education, agriculture — 5 sector categories.
- **Statistical entities:** 3 external sourced statistics (EPA, UN, IBM).
- **Topic cluster coverage:** Why Choose → What Equipment → Certifications → Data Security → Industries → Process (How It Works) → FAQ → Service Areas → Local Context → CTA — **most complete topical scaffold of all three pages.**

**Score: 92/100** — Best topical and entity coverage across all three pages. The missing element is a phone number entity, which is present in Page C but absent here.

---

## AIO Readiness

**Evidence:**

- **Question-based H2s:** 5 of 10 H2s are direct questions ("What Electronics Can Be Recycled in Billings?", "How Does Electronics Recycling Work in Billings?", "Is My Data Safe During Billings Electronics Recycling?") — directly maps to Google's People Also Ask patterns. **Strong.**
- **FAQ section:** 4 FAQ cards with explicit Q&A format. Questions are geo-specific and compliance-specific. Answers are 100–150 words each — within the optimal passage-extraction range identified in research.
- **TL;DR/summary block:** The blue callout box early in the Why Choose section provides a compact summary paragraph: `"STS Electronic Recycling provides R2v3 certified electronics recycling and NAID AAA data destruction for Billings businesses, healthcare systems, and government agencies. Services include free scheduled pickup throughout Yellowstone County, serial-number-specific certificates of destruction, and downstream material tracking through final processing."` — **This is a near-perfect AIO extraction target — it's ~50 words, factual, and entity-dense.**
- **Concise factual statements:** Numerous. E.g., "Certificate of Destruction delivered within 48 hours of processing," "NIST 800-88 compliant processes," "R2v3:2020 certification standards require downstream tracking through final processing at certified smelters."
- **Numbered process steps:** 4-step process section — ideal for How-To extraction.
- **Definitional clarity:** The compliance box explains HIPAA requirements, NIST mandates, and R2v3 standards clearly enough for Google to extract definitional content.
- **Stats placement:** One EPA stat appears in the "Why Choose" body copy section — within the first 30% of the page, which research confirms is where ~44% of LLM citations originate. **Excellent placement.**

**Score: 88/100** — One of the strongest AIO-optimized structures across all three pages. The lack of a single 50–70 word TL;DR at the very top of the page (before the hero features list) is the main gap.

---

## GEO Readiness

**Evidence:**

- **Statistics with attribution:** 3 statistics with source attribution:
  1. EPA: "approximately 2.7 million tons of electronic waste reach U.S. landfills annually"
  2. UN Global E-waste Monitor: "only 17.4% of electronic waste is properly recycled worldwide"
  3. IBM Cost of a Data Breach Report: "average breach costs $4.88 million"
- **Named authoritative sources:** EPA, UN Global E-waste Monitor, IBM — credible third-party citations. These are exactly the type of "verifiable claims" that boost LLM citation rates by 30–40% per the Princeton/Georgia Tech GEO research.
- **Montana-specific unique insight:** "Montana has no state-mandated extended producer responsibility law for electronics" — this is a unique, locally verifiable data point unlikely to be found elsewhere.
- **Quoted regulatory language:** "HIPAA 45 CFR 164.312 requirements," "R2v3:2020 certification standards," "NIST 800-88 Rev. 2" — precision technical terms that LLMs recognize as authoritative.
- **Extractable factual chunks:** "Certificate of Destruction within 48 hours," "600,000 sq ft R2v3 certified facility," "NAID AAA certified data destruction" — self-contained, verifiable.
- **Promotional language check:** Copy is professional but not overly promotional. Some phrases like "Absolutely FREE" in the CTA banner are promotional but are confined to a separate section rather than the main content.
- **Missing inline source hyperlinks:** The statistics are attributed in text but not hyperlinked to the source documents — this is a minor GEO weakness (linked citations rank higher per the GEO research).

**Score: 84/100** — Best GEO profile of all three pages due to three sourced statistics, unique local regulatory insight, and extractable factual chunks. Linked citations would improve this further.

---

## Local SEO

**Evidence:**

- **City/region targeting:** "Billings" appears ~35+ times throughout page. "Yellowstone County" appears ~15+ times. County-level service areas listed (Carbon, Big Horn, Stillwater, eastern MT, northern WY).
- **Service area listing:** Granular — Downtown Billings, West End, South Side, Heights, Lockwood, Rimrock (primary); Laurel, Hardin, Columbus, Red Lodge, Roundup, Huntley (nearby); regional counties and states.
- **Named local employers/institutions:** 8 named Billings institutions (see Entity section). These function as local proximity/relevance signals.
- **Local regulatory context:** Montana EPR law absence is unique and locally relevant. BLM/USFS federal field offices mentioned specifically.
- **NAP signals:** Email (recycle@stsrecycle.com) present. **Notably absent: phone number.** Page C includes a phone number (844-699-2913); Page A does not. This is a meaningful local SEO gap.
- **Contact/conversion:** Two CTAs to the contact/schedule page + email. No phone number visible. This reduces click-to-call options.
- **"Near me" optimization:** Explicitly addressed in FAQ with neighborhood-level granularity.
- **Local statistics:** Metro population figures ("roughly 180,000 to 200,000 residents") — good local context.

**Score: 86/100** — Strongest local entity density and service area specificity of all three pages. The missing phone number is the primary weakness.

---

## UX & Conversion

**Evidence:**

- **Visual hierarchy:** Hero → Why Choose → Equipment → Certifications → Data Security → Industries → Process → Coverage → FAQ → Service Areas → Free CTA Banner → Final CTA. Logical flow from trust signals to specifics to conversion.
- **CTAs:** Multiple CTAs (hero, why-choose, equipment section, certifications, process, desk image section, CTA banner, final CTA). Anchored to schedule page and email. **Strong frequency.**
- **CTA clarity:** "Schedule Free Pickup," "Get Free Quote," "Email Our Team" — clear action language.
- **Readability:** Inter typeface, 16–19px base body, 1.7–1.8 line height. Good readability.
- **Trust elements:** Certifications (R2v3, NAID AAA, NIST 800-88, DoD 5220.22-M, HIPAA), 600K sq ft facility, zero-landfill, 48-hour certificate delivery, zero-landfill policy — well distributed.
- **Friction:** Only 2 contact methods (schedule page + email). No phone = reduced conversion pathway compared to Page C.
- **Visual design signals:** Card-based layout, icon use, process steps, stats bar at CTA — professional design patterns.
- **ABSOLUTELY FREE banner:** The "ABSOLUTELY FREE" large CTA section is visually impactful for B2C/SMB conversion but the all-caps styling could read as aggressive. Minor concern.

**Score: 84/100**

---

### PAGE A — OVERALL SCORE CALCULATION

| Dimension | Weight | Score | Weighted |
|---|---|---|---|
| Technical SEO | 12% | 82 | 9.84 |
| On-Page SEO | 18% | 90 | 16.20 |
| Content Quality & E-E-A-T | 15% | 88 | 13.20 |
| Entity & Topical Coverage | 12% | 92 | 11.04 |
| AIO Readiness | 13% | 88 | 11.44 |
| GEO Readiness | 10% | 84 | 8.40 |
| Local SEO | 12% | 86 | 10.32 |
| UX & Conversion | 8% | 84 | 6.72 |

**PAGE A OVERALL: 87.2 / 100**

**Top Strengths:**
1. Most complete topical scaffold of all three pages — 10 H2-anchored sections with logical progression
2. Highest named local entity count (8 Billings institutions) + deepest service area granularity
3. Three sourced statistics (EPA, UN, IBM) — best GEO extractability profile
4. Unique local regulatory insight (Montana EPR law) — not found in competitors
5. Question-based H2 hierarchy + FAQ cards optimized for AIO passage extraction
6. Near-me keyword explicitly addressed with neighborhood-level specificity in FAQ

**Top Weaknesses:**
1. No phone number anywhere in the page markup — significant local conversion and NAP gap
2. Meta description slightly over 160 characters
3. Statistics not hyperlinked to source URLs — minor GEO gap
4. No visible on-page author bio (author meta only)

---

---

# PAGE B — FULL AUDIT

## Technical SEO

**Evidence:**

- **Title tag:** `"Billings Electronics Recycling | R2v3 Certified | STS"` — 52 characters. **Optimal length.** Primary keyword leads. "R2v3" is more specific than "R2 Certified" (Page A). Brand present. Clean.
- **Meta description:** `"Electronics recycling in Billings, MT with free pickup for qualifying volumes, R2v3 certified processing, secure data destruction. Request pickup today."` — 153 characters. **Optimal.** Includes a CTA ("Request pickup today"). Well-written. **Best meta description of all three.**
- **Canonical:** Present, correct.
- **H1:** `"Billings Electronics Recycling for Businesses & Institutions"` — service + location + audience qualifier. Good but less USP-loaded than Page A's H1. The `&` character (rather than "and") is acceptable but slightly informal.
- **H2s:** "Who Provides Certified Electronics Recycling in Billings?" / "What Electronics Can Billings Organizations Recycle?" / "How Does Certified Recycling Protect Billings Data?" / "Electronics Recycling for Billings Industries" / "Protect Data Before Devices Leave Your Control" / "Common Questions" / "Service Areas & About Billings" / "Related Recycling & Data Security Services" / "Ready to Recycle Electronics Responsibly?" — Question-based and geo-modified. **Good, though "Protect Data Before Devices Leave Your Control" is not a question and is less AIO-optimized.**
- **H3/H4s:** Used for card titles, FAQ cards. Generally sound.
- **Images:** Alt text is less geo-specific than Page A. Example: `"Billings electronics recycling for laptops computers and office equipment"` — functional but lower entity density than Page A.
- **`loading="lazy"`:** Present on images.
- **Responsive CSS:** Same breakpoints as Page A. Mobile-friendly.
- **Meta keywords:** Present.
- **Author meta:** Present.
- **No `meta name="keywords"` items unique:** Similar keyword list to Page A.
- **Font/preload strategy:** Same as Page A (preload + onload swap).
- **One notable difference from Page A:** No `<link rel="preconnect">` for fonts.googleapis.com or cdnjs.cloudflare.com — minor performance difference vs. Page A.
- **Page weight:** Slightly leaner than Page A (2,555 words vs 2,600). Less inline CSS content overall.
- **CTA section anomaly:** The final CTA section contains an embedded content block (`<div style="padding:40px;color:var(--gray-900);background:#f8fafc...">`) with descriptive text instead of an actual form placeholder — this reads as a placeholder/description, not a live form. This could be a UX gap in the live page.

**Score: 79/100** — Good meta structure with optimal title/description length; slightly weaker alt text; missing preconnect hints; the ambiguous final CTA form-description block is a concern.

---

## On-Page SEO

**Evidence:**

- **Primary keyword coverage:** "Billings electronics recycling" / "electronics recycling Billings MT" — appears in title, H1, H2s, body. Well-distributed.
- **Question-based H2s:** 3 of 9 H2s are explicit questions. This is solid but fewer than Page A.
- **Near-me pattern:** Addressed within the certifications section: `"Organizations searching for electronics recycling near me throughout Billings find STS provides scheduled pickup in the West End, Billings Heights, Downtown Billings, and Yellowstone County locations."` — present, but phrasing is less specific ("Billings Heights" vs. "Heights, Lockwood, Rimrock" naming pattern in Page A).
- **Keyword targeting specificity:** Page B's copy is slightly more hedged/qualified — "free pickup for qualifying volumes," "NAID AAA certified data destruction available," "workflows help Billings organizations support" — these softer, hedged constructions are good for accuracy but slightly less assertive for search intent signals.
- **Internal linking:** 13+ internal links to service pages. Good. Includes data center decommissioning link (not in Page A's main equipment list).
- **"Related Services" section:** Unique section that adds 10 additional service links — "Healthcare IT Disposal," "HIPAA Compliant Hard Drive Destruction," "Government Data Destruction," "Corporate Data Security Disposal" — **best secondary internal linking of all three pages.**
- **Statistics cited:** Only 1 statistic with attribution: "According to the Global E-waste Monitor, 62 million tonnes of e-waste were generated worldwide in 2022." — **just one, placed in the subtitle of a section, which is weak.**
- **NIST compliance terminology:** `"NIST SP 800-88 uses the media sanitization categories 'Clear, Purge, and Destroy.'"` — technically precise, good for expert audience and AIO extraction.
- **Keyword hedging weakness:** Phrases like "can provide," "help support HIPAA," "workflows help Billings organizations support" — these qualification patterns reduce definitional clarity and AIO extractability.

**Score: 78/100** — Good structural keyword placement; weakened by hedged language patterns, fewer question H2s, and only one sourced statistic. The Related Services section is a unique positive.

---

## Content Quality & E-E-A-T

**Evidence:**

- **Named local entities:** Billings Clinic, St. Vincent Healthcare, Montana State University Billings, Rocky Mountain College, Billings Public Schools — 5 named institutions (vs. 8 in Page A).
- **Expertise signals:** Cites HIPAA, NIST 800-88, R2v3:2020, GLBA, FERPA — notably adds GLBA and FERPA which Page A lacks. This wider compliance frame is good. However, the explanations are less detailed than Page A.
- **Language hedging as an E-E-A-T concern:** Phrases like "STS workflows help Billings organizations support HIPAA 45 CFR §164.312" (Page B) vs. "STS provides NAID AAA certified destruction meeting this standard" (Page A) — Page B's hedging reads as less confident expertise, which can reduce LLM citation selection.
- **Specificity:** Lower than Page A. For example, the "About Billings" section is just 3 sentences, compared to Page A's richer paragraph with specific regulatory context, university names, and the UN Global E-waste Monitor stat.
- **Unique insight:** Less present. "Its distance from larger markets makes year-round certified electronic asset disposal valuable" — decent local context but less specific than Page A's Montana EPR law observation.
- **Trust signals:** Same certifications mentioned. No phone number. Email present.

**Score: 75/100** — Adequate E-E-A-T signals but diluted by hedged language patterns, fewer named entities, and a thinner "About Billings" section.

---

## Entity & Topical Coverage

**Evidence:**

- **Service entities:** Good coverage including data center decommissioning and corporate data security disposal — slightly wider service entity list than Page A due to Related Services section.
- **Compliance entities:** HIPAA, NIST 800-88, R2v3, NAID AAA, GLBA, FERPA, EPA — 7 frameworks. Same count as Page A but GLBA/FERPA added while some details removed.
- **Local place entities:** Billings, Yellowstone County, Carbon County, Big Horn County, Stillwater County, Eastern Montana, Northern Wyoming, I-90, I-94, US-87, King Avenue West, Shiloh Road, Rimrocks Area — **unique addition of highway corridors (I-90, I-94, US-87) and named roads.** Interesting but these are less semantically meaningful than named institutions.
- **Named institutions:** 5 (vs. 8 in Page A). **Weaker.**
- **Statistics:** 1 (UN Global E-waste Monitor). **Weaker than Page A (3).**
- **Topic cluster coverage:** Hero → Why Choose → Equipment → Certifications → Industries → Data Security → FAQ → Service Areas → Related Services → CTA. **9 major sections vs. Page A's 10.** Missing: explicit "How It Works" process section.

**Score: 77/100** — Good but thinner entity and statistical depth vs. Page A. Highway corridor detail is interesting but doesn't compensate for fewer named institutions.

---

## AIO Readiness

**Evidence:**

- **Question H2s:** 3 question-based H2s out of 9. Fewer than Page A. "Protect Data Before Devices Leave Your Control" is not extractable as a question-answer unit.
- **TL;DR/summary block:** No dedicated summary box early in the page. The Why Choose section subtitle contains a long paragraph with a statistic but it's not formatted as a summary.
- **FAQ section:** 4 FAQ cards. Questions are: "What certifications do you hold?" / "Is pickup really free?" / "Do you provide audit documentation?" / "What happens to equipment after pickup?" — **"What happens to equipment after pickup?" is unique and process-explanatory, good for informational AIO extraction.** However, "Is pickup really free?" is answered vaguely: "Pickup is free for qualifying volumes and approved equipment loads" — less extractable than Page A's specific answer.
- **NIST quote:** `"NIST SP 800-88 uses the media sanitization categories 'Clear, Purge, and Destroy.'"` — technically precise and quotable for AIO.
- **How-It-Works section:** Page B lacks the numbered 4-step process section that Page A has — this is a missed AIO/HowTo optimization.
- **Statistics position:** The single statistic (Global E-waste Monitor) is placed in a section subtitle early in the page — within the first ~20% of content. Good placement, but it's only one statistic.
- **Hedged language:** "workflows help Billings organizations support HIPAA" — hedging reduces passage extractability per GEO research.

**Score: 72/100** — Decent question coverage but fewer question-H2s, no process/how-it-works section, hedged language, and only one sourced statistic limit AIO extraction quality.

---

## GEO Readiness

**Evidence:**

- **Statistics with attribution:** 1 statistic: "According to the Global E-waste Monitor, 62 million tonnes of e-waste were generated worldwide in 2022." — Single stat, no IBM or EPA equivalents.
- **Technical precision:** NIST 800-88 "Clear, Purge, Destroy" quote is a strong GEO signal — attributable to NIST SP 800-88 specification.
- **Named sources:** Only the Global E-waste Monitor mentioned as a named source in body copy.
- **Promotional language:** Generally restrained throughout — "scheduled pickups," "documentation helps," "STS will review the project." Less promotional than Page A's "ABSOLUTELY FREE" CTA. **This actually helps GEO per Semrush data (promotional language reduces AI citation rates).**
- **Extractable factual chunks:** "600,000 sq ft facility," "NAID AAA certified data destruction," "R2v3 certified processing" — standard. Fewer unique extractable claims than Page A.
- **Hedged claims:** The hedged language ("help support HIPAA") while reducing promotional tone also reduces GEO "precision" — AI systems cite confident, specific factual statements.
- **Missing Montana regulatory insight:** Page B has no equivalent to Page A's Montana EPR law observation.

**Score: 66/100** — Weakest GEO profile. Only one sourced statistic; hedged language reduces extractable precision; no unique local regulatory data.

---

## Local SEO

**Evidence:**

- **City/region mentions:** "Billings" appears ~25+ times. "Yellowstone County" ~10+ times. Good distribution.
- **Service area granularity:** Downtown Billings, West End, Billings Heights, South Side, Lockwood, Laurel (primary); Yellowstone County, Carbon County, Big Horn County, Stillwater County, Eastern Montana, Northern Wyoming (regional); plus highway corridors (I-90, I-94, US-87) and specific roads (King Avenue West, Shiloh Road). The highway/road additions are interesting local signals.
- **Named institutions:** 5 — lower than Page A.
- **NAP:** Email only. No phone number.
- **"Billings Market Drivers" stats panel:** MT (largest city), I-90 (regional corridor), B2B (institutional demand), R2v3 (certified processing) — abstract/brand-focused rather than community statistics. Weaker than Page A's "Billings by the Numbers" panel with population figures.
- **Local context paragraph:** Short — just one paragraph covering economy, metro population. Significantly thinner than Page A.

**Score: 77/100** — Adequate local targeting with some unique features (highway corridors), but thinner institutional entity density, absent phone number, and sparse local context paragraph.

---

## UX & Conversion

**Evidence:**

- **CTA frequency:** Multiple CTAs throughout. Two primary conversion paths (schedule page, email).
- **CTA language:** "Request Pickup" (slightly less compelling than "Schedule Free Pickup" in Page A); "Request electronics recycling service for your Billings business" — adequate.
- **Final CTA issue:** The embedded service description block at the bottom (`"Tell us what equipment you need recycled, how much volume is ready..."`) sits where a form embed would be but appears to describe what to tell STS rather than being an actual form or CTA. This could confuse users on the live page.
- **Trust elements:** Certifications listed, but the stats panel ("MT," "I-90," "B2B," "R2v3") is abstract and less impactful than numeric trust indicators.
- **Conversion friction:** No phone number adds friction. The "qualifying volumes" qualifier on free pickup (while accurate) may introduce hesitation for smaller prospects.
- **Readability:** Same Inter font, similar sizing. Good readability.
- **Content pacing:** The page flows well through the sections. The transition from Data Security to FAQ is logical.

**Score: 72/100** — The hedged language around "qualifying volumes" and the ambiguous final CTA block reduce conversion confidence vs. Page A.

---

### PAGE B — OVERALL SCORE CALCULATION

| Dimension | Weight | Score | Weighted |
|---|---|---|---|
| Technical SEO | 12% | 79 | 9.48 |
| On-Page SEO | 18% | 78 | 14.04 |
| Content Quality & E-E-A-T | 15% | 75 | 11.25 |
| Entity & Topical Coverage | 12% | 77 | 9.24 |
| AIO Readiness | 13% | 72 | 9.36 |
| GEO Readiness | 10% | 66 | 6.60 |
| Local SEO | 12% | 77 | 9.24 |
| UX & Conversion | 8% | 72 | 5.76 |

**PAGE B OVERALL: 74.97 / 100 ≈ 75**

**Top Strengths:**
1. Best title tag length (52 chars) and best meta description (153 chars, includes CTA) of all three pages
2. Unique "Related Services" section with 10 additional internal links — best secondary link architecture
3. GLBA and FERPA added to compliance entities (unique additions)
4. Highway corridor/road names add hyperlocal geography signal
5. Restrained promotional language — best GEO-promotion balance for non-claimed sections
6. NIST "Clear, Purge, Destroy" technical quote — strong extractable GEO signal

**Top Weaknesses:**
1. Only one sourced statistic (Global E-waste Monitor) — major GEO weakness
2. Hedged/qualified language throughout reduces E-E-A-T assertiveness and AIO extractability
3. Fewer named Billings institutions (5 vs. 8) — reduced local entity depth
4. No How-It-Works/process section — missing HowTo AIO optimization
5. Ambiguous final CTA form-description block
6. No phone number; thinner About Billings local context

---

---

# PAGE C — FULL AUDIT

## Technical SEO

**Evidence:**

- **Title tag:** `"Electronics Recycling Billings MT | R2 Certified ITAD | STS"` — 59 characters. **Optimal range.** "Electronics Recycling Billings MT" leads. "R2 Certified ITAD" adds a secondary qualifier. Brand present.
- **Meta description:** `"Professional electronics recycling in Billings, MT. R2v3 certified processing, HIPAA compliant data destruction, and enterprise ITAD services. Call (844) 699-2913."` — 166 characters. Slightly over 160-char ideal, but **critically includes a phone number (844) 699-2913 as a conversion CTA.** This is a strong differentiator — the only page of the three with an inline phone number in the meta description.
- **Canonical:** Present, correct (`/billings-mt`).
- **H1:** `"Certified Electronics Recycling in Billings, MT"` — service + location, clean. However, less USP-loaded than Page A's H1. No certifications or "free pickup" signal in H1.
- **H2s:** "Why Choose Certified Electronics Recycling?" / "What Electronics Can Be Recycled in Billings?" / "Certified Electronics Recycling" (certifications section) / "Trusted by Billings' Essential Sectors" / "Is My Data Safe During Electronics Recycling?" / "Common Questions" / "Service Areas & About Billings" / "Comprehensive Asset Solutions" / "Ready to Get Started?" — 9 H2s. Note: "Why Choose Certified Electronics Recycling?" does NOT contain the word "Billings" — a local SEO gap. "Certified Electronics Recycling" (section header) repeats the exact H2 pattern of the H1, creating a minor hierarchy issue.
- **H3/H4s:** Standard usage. No major issues.
- **Images:** Alt text present but generic: `"Billings electronics recycling and IT asset disposition services"` — less entity-dense than Page A.
- **Phone number in CTAs:** `(844) 699-2913` — present in hero CTA, multiple sections, and final CTA grid. This is the only page with a visible phone number in the HTML. **Significant local SEO and conversion advantage.**
- **`loading="lazy"`:** Present on images.
- **Responsive CSS:** Same breakpoints. Mobile-friendly.
- **Font loading:** Same preload + onload swap.
- **Note: `<!-- PAGE_BUILDER_V3 -->` comment is inside `<body>` instead of `<head>` (it appears after `</style>` in `<head>` section but the entire comment block appears at the beginning of `<body>`).** This is not semantically incorrect but is slightly unusual placement.
- **Author meta:** Present.
- **Meta keywords:** Present (6 keywords, includes "secure e-waste disposal" as a non-geo term — slightly weaker than Page A's geo-modified keyword list).
- **Missing `<meta name="keywords">` geo-modification:** `"ITAD services Montana"` and `"R2 certified recycling MT"` are not city-specific. "electronics recycling Billings" is present. Less geo-focused than Page A's keyword tag.
- **Page weight:** Lightest of the three (~2,405 words).

**Score: 80/100** — Strong title tag and phone-number-in-meta-description; slightly generic alt text; H1 lacks USP modifiers; minor heading repetition issue.

---

## On-Page SEO

**Evidence:**

- **Primary keyword:** "electronics recycling Billings" / "electronics recycling in Billings, MT" — in title, H1, body. Good distribution.
- **H2 geo-modification gaps:** "Why Choose Certified Electronics Recycling?" has no "Billings" — this is the first major H2 and it's geo-deficient. Page A's equivalent H2 is "Billings' Certified Electronics Recycling Partner."
- **Near-me coverage:** Present: `"Organizations searching for electronics recycling near me throughout Billings find STS provides scheduled pickup in downtown commercial districts and all Yellowstone County locations."` — geographic specificity is less granular than Page A (no neighborhood names).
- **Named clients/ExxonMobil:** Page C specifically names ExxonMobil twice: `"we securely process equipment from computers to servers for major employers like ExxonMobil and Billings Clinic"` and in the Energy industry card. **This is a strong local entity signal** — naming an actual enterprise client (if accurate) is a significant E-E-A-T and local relevance differentiator.
- **IBM statistic:** Present and well-integrated: `"According to IBM's Cost of a Data Breach Report, the average breach costs $4.88 million."` — 1 sourced statistic with source name.
- **EPA statistic:** `"The EPA estimates 2.7 million tons of e-waste reach U.S. landfills annually."` — 1 sourced statistic with source name. 2 total statistics.
- **Content depth:** ~2,405 words — shortest of the three pages.
- **"FERPA compliance" mention:** `"Our solutions support FERPA compliance for institutions like Montana State University Billings"` — relevant compliance extension.
- **Hedged vs. direct language:** More direct than Page B but less specific than Page A. E.g., "STS delivers secure hardware disposal supporting HIPAA 45 CFR §164.312 requirements" (Page C) is clear. However, "designed to support compliance" and "supportive" (in the HIPAA compliance stat card) are slightly hedged.

**Score: 77/100** — Good keyword foundation, unique ExxonMobil client name, 2 sourced statistics; geo-deficient opening H2, less neighborhood-level granularity, shortest word count.

---

## Content Quality & E-E-A-T

**Evidence:**

- **Named local entities:** Billings Clinic, St. Vincent Healthcare, Montana State University Billings, ExxonMobil — **4 named institutions.** ExxonMobil is unique to Page C and is a high-authority entity. However, overall count (4) is lowest of all three pages.
- **ExxonMobil claim:** Naming ExxonMobil as a client is a bold E-E-A-T signal — IF it's accurate. If the relationship is genuine, this is the strongest single E-E-A-T claim in any of the three pages. If not verifiable/accurate, it creates E-E-A-T risk.
- **Expertise signals:** HIPAA 45 CFR §164.312, NIST SP 800-88 Rev. 2 quoted directly, FERPA, DoD standards — reasonable technical depth.
- **NIST SP 800-88 quote:** `"NIST SP 800-88 Rev. 2 sets the federal standard for media sanitization. The guidelines require that sanitization render data recovery 'infeasible using state of the art laboratory techniques'"` — **this is a direct, quotable excerpt from the NIST standard.** Excellent for LLM citation.
- **Authoritativeness:** 2 sourced statistics (EPA, IBM). Fewer than Page A (3).
- **Generic filler concern:** "Our logistics network covers organizations operating in Billings and across Yellowstone County. We routinely schedule professional collection services for enterprise clients located throughout the greater Montana commercial region." — this is generic and adds limited SEO or GEO value.
- **Content specificity:** Less specific than Page A in several areas. Service area section is vague (no neighborhood names listed). "About Billings" paragraph is brief (3 sentences).

**Score: 74/100** — ExxonMobil naming is a unique and potentially powerful E-E-A-T signal; overall fewer named entities and thinner local context than Page A; some generic filler present.

---

## Entity & Topical Coverage

**Evidence:**

- **Service entities:** Includes all standard services plus "Telecom Equipment Disposal" (listed as "corporate-data-security-disposal" anchor, slight label/URL mismatch), "Medical IT Equipment Recycling," "Enterprise Risk Mitigation" — interesting enterprise framing.
- **Compliance entities:** HIPAA, NIST SP 800-88 Rev. 2, R2v3, NAID AAA, DoD, FERPA — 6 frameworks. Fewer than Pages A or B (which both have 7).
- **Local place entities:** Billings, Yellowstone County, Downtown Billings, Eastern Montana, Northern Wyoming, "regional medical campuses," "Interstate 90" — limited neighborhood granularity. No county breakdown.
- **Named institutions:** 4 (lowest count).
- **ExxonMobil entity:** Unique high-authority entity — adds "energy" sector credibility specifically.
- **Statistics:** 2 (EPA, IBM) vs. 3 in Page A.
- **Topic cluster coverage:** Hero → Why Choose → Equipment → Certifications → Industries → Data Security → FAQ → Service Areas → Related Services → CTA. Similar to Page B. Missing: explicit How-It-Works/process section.
- **About Billings:** 3-sentence paragraph — thinnest of all three pages.

**Score: 72/100** — ExxonMobil entity and NIST quote are strengths; lowest named institution count, thinnest About Billings, missing How-It-Works section reduce topical completeness.

---

## AIO Readiness

**Evidence:**

- **Question H2s:** "What Electronics Can Be Recycled in Billings?", "Is My Data Safe During Electronics Recycling?" — 2 explicit question H2s (fewest of the three). "Why Choose Certified Electronics Recycling?" is a question but not geo-modified. "Certified Electronics Recycling" (section H2) is not a question.
- **FAQ section:** 4 FAQ cards. Questions: "What certifications do you hold?" / "What areas do you serve?" / "Is your data destruction HIPAA compliant?" / "Can you handle large-scale ITAD projects?" — The area service answer is notably vague: `"Our logistics network covers organizations operating in Billings and across Yellowstone County. We routinely schedule professional collection services for enterprise clients located throughout the greater Montana commercial region."` — this lacks the specific neighborhood-level granularity that makes Page A's same FAQ excellent for AIO extraction.
- **NIST quote:** `"NIST SP 800-88 Rev. 2...require that sanitization render data recovery 'infeasible using state of the art laboratory techniques'"` — **This is the most extractable, quotable technical passage of any of the three pages for AIO/GEO purposes.** An LLM can lift this verbatim.
- **No TL;DR or summary block:** No compact summary section early in the page.
- **No How-It-Works section:** Missing numbered process steps — HowTo AIO pattern absent.
- **Statistics placement:** The IBM stat appears in the Equipment section (middle portion of page). The EPA stat appears near the bottom (About Billings). Mid-to-bottom placement is less optimal for AIO extraction (44% of LLM citations come from the first 30% of text).
- **Promotional language check:** "Absolutely. We specialize in coordinating multi-site IT asset disposition assignments" — informal promotional language in FAQ.

**Score: 68/100** — The NIST direct quotation is a high-value AIO signal, but fewer question H2s, vague FAQ answers, poor statistics placement, and missing How-It-Works section limit overall AIO readiness.

---

## GEO Readiness

**Evidence:**

- **Statistics with attribution:** 2 statistics:
  1. IBM: "According to IBM's Cost of a Data Breach Report, the average breach costs $4.88 million."
  2. EPA: "The EPA estimates 2.7 million tons of e-waste reach U.S. landfills annually."
- **Direct quote from NIST:** `"render data recovery 'infeasible using state of the art laboratory techniques'"` — **verbatim regulatory language with identified source is the single highest-GEO-value phrase in any of the three pages.** Per the Princeton GEO research, quotations boost citation rates by ~41%.
- **Named authority sources:** IBM, EPA, NIST (implied by the standard citation) — 3 sources, same count as Page A but the NIST quote is more "citable" than Page A's paraphrased EPA/UN/IBM references.
- **ExxonMobil as an entity:** Naming a Fortune 500 as a client is a strong authority signal for LLMs — it's a recognizable, high-authority entity that helps establish credibility in AI training and retrieval contexts.
- **Promotional language concern:** "Absolutely" in FAQ; "absolute security" in card copy; "rigorous tracking" — some promotional language. Per Semrush, promotional language reduces AI citation rates by 26%.
- **Extractable precision:** The NIST quote aside, other content is less crisply extractable than Page A. Generic filler phrases dilute passage quality.
- **Missing Montana regulatory insight:** No equivalent unique local regulatory data.

**Score: 72/100** — The NIST direct quote is a unique, high-value GEO asset; ExxonMobil entity is strong; however fewer sourced statistics overall and some promotional language limit the score.

---

## Local SEO

**Evidence:**

- **Phone number:** `(844) 699-2913` — present in hero CTA, Why Choose section, certifications section, and final CTA grid. **This is the ONLY page with a phone number visible in the HTML.** This is a critical local SEO and conversion differentiator. Phone number in meta description is also unique.
- **City/region mentions:** "Billings" appears ~20+ times. Less dense than Pages A or B.
- **Service area specificity:** Very limited. The service area section uses bullet points: Yellowstone County, Downtown Commercial District, Regional Medical Campuses, Industrial Corridors — abstract categories rather than neighborhood names. No county breakdown (Carbon, Big Horn, Stillwater absent).
- **Named institutions:** 4 — lowest of all three. Missing: Rocky Mountain College, Billings Public Schools, BLM/USFS field offices, federal agency mentions.
- **"Near me" coverage:** Present but geographically vague.
- **About Billings:** `"Billings operates as Montana's largest commercial hub and medical center."` — 3 sentences. Lowest local context depth.
- **ExxonMobil local signal:** Naming ExxonMobil in Billings context is strong if accurate.

**Score: 76/100** — The phone number is a major local SEO advantage; however, the service area granularity is the weakest of all three pages, and the local entity density is lowest.

---

## UX & Conversion

**Evidence:**

- **Multiple phone CTAs:** `(844) 699-2913` appears in hero buttons, Why Choose buttons, and final CTA grid. **Best click-to-call setup of all three pages.**
- **CTA language:** "Schedule Secure Pickup" / "Call (844) 699-2913" / "Contact Our Team" / "Get A Free Quote" — varied but not as compelling as Page A's "Schedule Free Pickup" (which includes "free").
- **Conversion friction:** The phone number drastically reduces conversion friction. Users can call without navigating. **Clear advantage.**
- **Final CTA:** Clean two-column grid with phone link and email link — simple and effective.
- **Trust elements:** R2v3, NAID AAA, NIST, DoD, HIPAA, chain of custody — adequately distributed. Stats section with 600K, R2v3, Zero Landfill, Free Pickup would be present as a visual stats block, but this page doesn't include the large "stats bar" section (it's in sections_excluded for Page C per the comment).
- **Readability:** Same font/sizing. Good readability.
- **One UX concern:** "Ready to Get Started?" — the final CTA headline is generic and non-specific. Compare to Page A's "Ready to Recycle Electronics in Billings?" which is geo-specific.

**Score: 79/100** — The phone number is a clear UX and conversion advantage; CTA language and final CTA headline are slightly less compelling than Page A; service area vagueness may cause hesitation.

---

### PAGE C — OVERALL SCORE CALCULATION

| Dimension | Weight | Score | Weighted |
|---|---|---|---|
| Technical SEO | 12% | 80 | 9.60 |
| On-Page SEO | 18% | 77 | 13.86 |
| Content Quality & E-E-A-T | 15% | 74 | 11.10 |
| Entity & Topical Coverage | 12% | 72 | 8.64 |
| AIO Readiness | 13% | 68 | 8.84 |
| GEO Readiness | 10% | 72 | 7.20 |
| Local SEO | 12% | 76 | 9.12 |
| UX & Conversion | 8% | 79 | 6.32 |

**PAGE C OVERALL: 74.68 / 100 ≈ 75**

**Top Strengths:**
1. Only page with a phone number in the HTML — major local conversion and click-to-call advantage
2. Phone number in meta description — unique CTR and local signal
3. NIST SP 800-88 direct quotation — highest single GEO-extractability phrase of all three pages
4. ExxonMobil named as a client — unique high-authority local entity (if accurate)
5. FERPA compliance mention unique to this page
6. Optimal title tag length (59 chars)

**Top Weaknesses:**
1. Weakest service area granularity — no neighborhood names, no county breakdown
2. Fewest named Billings institutions (4) — lowest local entity density
3. Fewest question-based H2s (2–3) — weakest AIO heading structure
4. Thinnest "About Billings" section (3 sentences)
5. Statistics placed mid-to-bottom page — poor AIO position
6. No How-It-Works/process section
7. Some generic filler and mild promotional language

---

---

# 🏆 HEAD-TO-HEAD COMPARISON

## What Separated the Pages

### PAGE A vs. PAGE B — The Margin Was Decisive

The gap between A and B comes down to three factors that cascade across every dimension:

**1. Statistical depth and GEO readiness:** Page A deploys three sourced statistics (EPA, UN Global E-waste Monitor, IBM) with named attribution. Page B deploys one. Per the Princeton/Georgia Tech GEO research, statistics boost AI citation visibility by ~32%. Page A has 3× the citation fuel on this dimension alone.

**2. Named local entity density:** Page A names 8 local Billings institutions (Billings Clinic, St. Vincent Healthcare, MSU Billings, Rocky Mountain College, Yellowstone County government, Billings Public Schools, BLM, USFS). Page B names 5. In the local SEO and AIO context, 
multi-location AIO depends on location-specific pages with per-location depth.
 Named institutions are the most concrete form of local depth.

**3. Language precision vs. hedging:** Page B's copy consistently hedges: "help support," "workflows help Billings organizations support," "NAID AAA certified data destruction available," "can provide." Page A states directly: "STS provides NAID AAA certified destruction meeting this standard," "STS holds R2v3 and NAID AAA certification." Per the GEO research framework, clear declarative statements are significantly more extractable than hedged ones.

**4. AIO structural completeness:** Page A has a 4-step numbered How-It-Works section (HowTo pattern), 5 question H2s, 4 detailed FAQ cards with geo-specific answers, and an early summary callout block. Page B lacks the process section, has 3 question H2s, and the FAQ answers are sometimes vague.

**5. Unique content:** Page A's observation that "Montana has no state-mandated extended producer responsibility law for electronics" is unique, locally specific, and not findable on generic ITAD pages. This is exactly the kind of content that 
earns AI citation when other competing pages simply regurgitate information already found elsewhere.


---

### PAGE A vs. PAGE C — Different Strengths, One Clear Winner

The A vs. C comparison is more nuanced. Page C has a major conversion advantage (phone number) and a unique GEO asset (NIST direct quotation), while Page A has far superior topical breadth, local entity density, and statistical depth.

**Where Page C wins:**
- Phone number visibility (hero, multiple sections, final CTA, meta description) — critical local SEO signal and conversion path absent in Page A
- NIST SP 800-88 direct verbatim quote — the single most AIO/GEO-extractable passage in any of the three pages
- ExxonMobil named as a client — unique high-authority entity (if accurate)
- FERPA compliance mentioned

**Where Page A wins:**
- 3 sourced statistics vs. 2 in Page C
- 8 named local institutions vs. 4 in Page C
- Full neighborhood-level service area granularity vs. abstract categories in Page C
- 5 question H2s vs. 2 in Page C
- How-It-Works 4-step process section (HowTo pattern) — absent in Page C
- Unique Montana EPR law insight
- Richer About Billings section (local regulatory context)
- "Near me" explicitly addressed with neighborhood specificity

The phone number absence in Page A is a real weakness. However, the overall SEO, AIO, and GEO strength of Page A's topical coverage, entity density, and extractable content outweighs Page C's phone-number advantage in an aggregate evaluation. The phone number is primarily a conversion/UX signal, while the statistical, entity, and structural advantages of Page A affect ranking probability, AI Overview inclusion, and LLM citation simultaneously.

---

### PAGE B vs. PAGE C — Near-Tie, Page B Narrowly Ahead

Both pages score approximately 75. Page B's advantages:
- Better meta description (153 chars vs. 166 chars; Page B's is optimal, Page C's is slightly over)
- Related Services section with 10 internal links — best secondary link architecture
- GLBA compliance entity added
- Highway corridor local place entities
- Restrained promotional language

Page C's advantages:
- Phone number (major)
- NIST direct quote
- ExxonMobil entity
- Slightly tighter word count

The phone number ultimately gives Page C a slight edge in local SEO and conversion, while Page B holds advantages in meta structure, internal linking, and hedged but professional language. These are essentially equal in overall weighted score, with Page B marginally ahead at 74.97 vs. 74.68 — less than a point apart. For ranking purposes, Page B takes #2 and Page C takes #3, but this is the tightest gap in the audit.

---

## DECISIVE RANKING FACTORS SUMMARY

| Factor | Page A | Page B | Page C |
|---|---|---|---|
| Sourced statistics | 3 (EPA, UN, IBM) | 1 (UN) | 2 (EPA, IBM) |
| Named Billings institutions | 8 | 5 | 4 |
| Question H2s | 5 | 3 | 2-3 |
| How-It-Works section | ✅ 4-step | ❌ | ❌ |
| Phone number | ❌ | ❌ | ✅ |
| Near-me w/ neighborhood names | ✅ | Partial | ❌ |
| Montana EPR unique insight | ✅ | ❌ | ❌ |
| NIST direct quotation | ❌ | Partial | ✅ |
| Title tag length (optimal 50-60) | 62 chars | 52 chars ✅ | 59 chars ✅ |
| Meta description length (optimal) | 199 (over) | 153 ✅ | 166 (slightly over) |
| Service area granularity | High ✅ | Medium | Low |
| GEO extractability | High | Low-Medium | Medium |
| AIO structural completeness | Highest | Medium | Lowest |

**Final Rankings:**
1. **Page A — Rank 1 (Overall: 87)**
2. **Page B — Rank 2 (Overall: 75)**
3. **Page C — Rank 3 (Overall: 75)**

---

```json
{
  "ranking": [
    {
      "page": "A",
      "rank": 1,
      "overall": 87,
      "verdict": "Dominates on topical depth, local entity density (8 named institutions), three sourced statistics, question-H2 AIO structure, unique Montana EPR insight, and neighborhood-level service area granularity — the strongest all-around SEO, AIO, and GEO profile despite lacking a phone number."
    },
    {
      "page": "B",
      "rank": 2,
      "overall": 75,
      "verdict": "Best meta description and title tag length, unique Related Services internal link section, and restrained promotional language, but only one sourced statistic, hedged declarative language throughout, and no How-It-Works section significantly limit AIO and GEO extractability."
    },
    {
      "page": "C",
      "rank": 3,
      "overall": 75,
      "verdict": "Unique phone number across all CTAs and a verbatim NIST quote are strong assets, but the weakest service area granularity, fewest named institutions (4), poorest question-H2 density, and thinnest local context section make it the least complete SEO and AIO package of the three."
    }
  ],
  "winner": "A",
  "summary": "Page A wins decisively across SEO, AIO, and GEO dimensions through its combination of three sourced statistics (EPA, UN, IBM), eight named Billings institutions, five question-based H2s, a four-step HowTo process section, neighborhood-level service area specificity, and a unique local regulatory insight about Montana's EPR law — all of which are exactly the signals that drive organic rankings, AI Overview passage extraction, and LLM citation selection in 2025-2026. Pages B and C are essentially tied for second at 75 points, with B holding advantages in meta structure and internal linking while C holds a meaningful phone-number conversion advantage and a uniquely citable NIST direct quotation. The 12-point gap between A and B/C reflects structural differences in content depth, entity density, and extractable specificity that cannot be closed by formatting or CTA adjustments alone."
}
```

---
