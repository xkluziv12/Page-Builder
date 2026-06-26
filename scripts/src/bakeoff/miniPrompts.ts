/**
 * VERBATIM port of the per-phase prompts the VA copies out of the No-GMB
 * checklist tool (`artifacts/page-terminal/public/tools/no-gmb.html`,
 * `copyPrompt()` — cases intro, build, rebuild, verify-links, seo, seo-verify,
 * schema, meta). These strings are the harness's source of truth; do NOT
 * paraphrase them. The only fields filled in are the same ones the tool fills:
 * city, state, url, niche, pageName, the Hub+Spoke handoff, and the rebuild
 * issue. Every other character matches the tool output byte-for-byte.
 *
 * In the real workflow these are pasted into a Claude.ai chat where the Master
 * Page Builder / Master Design / SEO Audit files are UPLOADED. The harness has
 * no file-attachment surface, so the conversation driver inlines the real
 * uploaded files (committed fixtures) into the chat turns; the prompt text below
 * is unchanged.
 */

export interface PromptVars {
  city: string;
  state: string;
  url: string;
  niche: string;
  pageName: string;
  /** The Hub+Spoke internal-linking handoff text (empty string when none). */
  hubSpoke: string;
}

/** The "forced execution" prefix the tool stamps on most mini prompts. */
export const FORCE_PREFIX =
  "CRITICAL SYSTEM INSTRUCTION: Execute ALL steps exhaustively. Do NOT summarize. Do NOT skip any section. Do NOT take shortcuts. Complete every single requirement. Stop and alert if errors occur.\n\n";

/**
 * The ONE medium-translation the harness applies, IDENTICALLY for every model,
 * to the turns that must yield a page. The verbatim prompts tell the model to
 * "create an artifact" and "never paste code in chat" — but this is an API
 * session with no artifact/canvas surface, so the faithful translation of that
 * instruction is "emit the complete HTML inline in a fenced block." Without it a
 * model that obeys the artifact rule literally says "the artifact is being
 * created" and emits no HTML. This is a uniform medium shim, NOT per-model
 * special-casing, so the comparison stays apples-to-apples.
 */
export const ARTIFACT_TO_INLINE =
  "\n\n[API EXECUTION NOTE — applies to every model identically: this is an API " +
  "session with NO artifact / canvas / preview surface. Wherever the instructions " +
  'above say "create an artifact" or "never paste code in chat", instead output the ' +
  "COMPLETE, FINAL HTML document INLINE in a single ```html fenced code block " +
  "(full <!DOCTYPE html> … </html>), with no commentary before or after it. Do NOT " +
  "say an artifact is being created and do NOT refer to a previous build — actually " +
  "emit the entire HTML document here, in this message.]";

/**
 * The verify-turn counterpart of `ARTIFACT_TO_INLINE`. The seo-verify and
 * verify-links turns are REPORT-primary (HTML is optional, emitted only if the
 * model changed the page) and MUST end with an explicit ✅/❌ verdict the harness
 * gates on. The plain `ARTIFACT_TO_INLINE` shim forbids any commentary, which
 * would suppress that verdict — so these turns use this variant instead: it
 * still translates "artifact" → inline HTML, but explicitly preserves the report
 * AND the required verdict line. Uniform across all models (no special-casing).
 */
export const ARTIFACT_TO_INLINE_OPTIONAL =
  "\n\n[API EXECUTION NOTE — applies to every model identically: this is an API " +
  "session with NO artifact / canvas / preview surface. Wherever the instructions " +
  'above say to "create" or "update" an artifact, instead include any updated HTML ' +
  "INLINE in a single ```html fenced code block (the full <!DOCTYPE html> … </html> " +
  "document). Still produce your full report and END your reply with the explicit " +
  "✅/❌ VERDICT line the instructions specify — do NOT omit the verdict.]";

/** intro — name the chat, upload files, session rules, model check. */
export function introPrompt(v: PromptVars): string {
  const chatName = `${v.city} ${v.niche}`;
  return `FIRST: Name this chat "${chatName}"

Click the chat title at the top and rename it to: "${chatName}"

═══════════════════════════════════
📁 REQUIRED FILES — UPLOAD THESE NOW
═══════════════════════════════════
Before proceeding, upload these files from the Claude Project:
1. 📄 STS SEO Data 2026
2. 📄 Master Page Builder
3. 📄 Master Design (Tier 2)

OPTIONAL (for service-specific pages):
4. 📄 New Design (Tier 1) — for tier 1 pages
5. 📄 Service Design (Tier 3/4) — for tier 3/4 pages

⚠️ DO NOT PROCEED until required files are uploaded.

═══════════════════════════════════
SYSTEM INSTRUCTIONS
═══════════════════════════════════

You are building a landing page for STS Electronic Recycling. This is a NO GMB build — this city has no Google Business listing. Do NOT invent or include a street address, local phone, business hours, or CID. The page IS a full landing page (schema included), just without a GMB street address and without a CID. Schema is generated separately in Phase 4 (no CID, no street address).

RULES FOR THIS ENTIRE SESSION:
1. Follow ALL instructions exactly — no shortcuts, no summarizing, no skipping steps
2. Execute EVERY prompt completely before asking questions
3. Keep responses TIGHT — essentials only, no fluff or excessive explanations
4. When given documents/files, read them thoroughly before proceeding
5. Do NOT hallucinate — if unsure, ask
6. Maintain consistency across all prompts in this session
7. ALL HTML/CODE OUTPUT → CREATE AS ARTIFACT (visual preview), NEVER paste code in chat

TARGET: ${v.city}${v.state ? ", " + v.state : ""}
NICHE: ${v.niche}
URL: ${v.url}

Confirm you've named the chat "${chatName}", uploaded the files, and understand these rules.

⚠️ IMPORTANT MODEL CHECK:
Before responding, state which Claude model you are (e.g. "I am Claude Sonnet 4.6").
If you are Claude OPUS — STOP IMMEDIATELY. Do NOT proceed. Reply ONLY with:
"🚫 WRONG MODEL — I am Opus. Switch to Sonnet 4.6 before continuing."

If you are Sonnet 4.6, reply: "Chat named. Files received. Sonnet 4.6 confirmed. Ready."

No lengthy explanations.`;
}

/** build — the main page build, with the Hub+Spoke linking section. */
export function buildPrompt(v: PromptVars): string {
  const hubSpokeSection = v.hubSpoke
    ? `
═══════════════════════════════════
INTERNAL LINKING STRATEGY (Hub+Spoke)
═══════════════════════════════════
${v.hubSpoke}

LINKING INSTRUCTIONS:
- Add 3-4 internal links per page in content sections (rows 4+, NOT hero)
- Use full HTTPS URLs from the handoff above
- Reference local context (institutions, employers) in anchor text
- Links open in same tab (no target="_blank")
═══════════════════════════════════
`
    : "";

  return `${FORCE_PREFIX}TASK: Build Landing Page for ${v.city}${v.state ? ", " + v.state : ""} — ${v.niche}

═══════════════════════════════════
TARGET URL: ${v.url}
NICHE: ${v.niche}
═══════════════════════════════════

⚠️ NO GMB BUILD:
This city has no Google Business listing. Do NOT include or invent a street address, local phone number, business hours, CID, or Google Maps embed/CID link. Do NOT invent an address. Schema is generated separately in Phase 4 (no CID, no street address) — this is otherwise a standard landing page.
${hubSpokeSection}
EXECUTION INSTRUCTIONS:
1. Use Master Page Builder logic - follow EVERY step
2. Apply Master Design (Tier 2) strictly - NO deviations
3. Hero section MUST have city "${v.city}" + niche "${v.niche}" in H1, form on RIGHT
4. Mobile responsive - images must NOT squeeze text
5. Do NOT include Schema yet (built separately in Phase 4 — no CID, no GMB address)
6. Do NOT include a footer NAP block (no local address/phone for this city)
7. Facility mentions: Say "serving ${v.city} from our 600,000 sq ft facility" — NOT "our ${v.city} facility"
${v.hubSpoke ? "8. Include 3-4 internal links from Hub+Spoke handoff in rows 4+ (NOT hero)" : ""}

⚠️ CRITICAL OUTPUT REQUIREMENT:
CREATE AN ARTIFACT with the complete HTML code. Do NOT paste code in chat.
The artifact must be viewable/previewable. Name it: "${v.city}-${v.niche.replace(/\s+/g, "-").toLowerCase()}.html"

BEGIN BUILD NOW. No lengthy explanations.`;
}

/** rebuild — full from-scratch rebuild when the design gate fails. */
export function rebuildPrompt(v: PromptVars, issue: string): string {
  return `${FORCE_PREFIX}TASK: COMPLETE REBUILD REQUIRED

THE ISSUE: ${issue}

INSTRUCTIONS:
1. DELETE your previous output completely
2. Re-read the Master Design (Tier 2) file
3. Rebuild the ENTIRE page from scratch
4. Fix the specific issue mentioned above
5. Ensure Hero has city in H1, form on RIGHT
6. Ensure mobile view works - no image squeeze
7. NO GMB: do not invent a street address, local phone, hours, or CID

⚠️ CRITICAL OUTPUT REQUIREMENT:
CREATE A NEW ARTIFACT with the complete rebuilt HTML code. Do NOT paste code in chat.
The artifact must be viewable/previewable. Replace the previous artifact.

DO NOT try to patch the old code. START FRESH. No lengthy explanations.`;
}

/** verify-links — closing link-integrity check. */
export function verifyLinksPrompt(): string {
  return `${FORCE_PREFIX}TASK: VERIFY ALL LINKS

Scan the HTML and verify:

1. ALL email links = mailto:recycle@stsrecycle.com
2. ALL contact/quote buttons = https://www.stselectronicrecyclinginc.com/CONTACT-STS-PAGE
3. NO made-up URLs (LLMs invent URLs!)
4. NO example.com or placeholder links
5. NO invented phone numbers or addresses (NO GMB build)

VERDICT:
If ALL links correct: ✅ LINKS VERIFIED — Proceed to next phase
If ANY issues found: ❌ LINKS FAILED — List issues above, fix and re-verify

No lengthy explanations.`;
}

/**
 * verify-links FIX — the corrective re-verify turn the harness sends when the
 * model's link verification returns ❌ LINKS FAILED. Uniform for every model; it
 * just asks the model to fix the issues IT listed and re-emit the verdict, the
 * same "fix and re-verify" loop the tool's own verify prompt describes.
 */
export function verifyLinksFixPrompt(): string {
  return `${FORCE_PREFIX}TASK: FIX LINK VERIFICATION FAILURES

Your link verification returned ❌ LINKS FAILED.

1. Fix EVERY link issue you listed above:
   - ALL email links = mailto:recycle@stsrecycle.com
   - ALL contact/quote buttons = https://www.stselectronicrecyclinginc.com/CONTACT-STS-PAGE
   - Remove any made-up / example.com / placeholder URLs
   - Remove any invented phone numbers or addresses (NO GMB build)
2. Re-scan ALL links in the corrected page.
3. End your reply with the FINAL VERDICT, exactly one of:
   ✅ LINKS VERIFIED — Proceed to next phase
   ❌ LINKS FAILED — <list the issues that still remain>

No lengthy explanations.`;
}

/** seo — full SEO audit (uploads the Master SEO Audit file). */
export function seoPrompt(v: PromptVars): string {
  return `${FORCE_PREFIX}TASK: FULL SEO AUDIT

═══════════════════════════════════
📁 REQUIRED FILE — UPLOAD NOW
═══════════════════════════════════
Upload: 📄 Master SEO Audit
⚠️ DO NOT PROCEED until file is uploaded.
═══════════════════════════════════

CRITICAL RULES:
- Execute EVERY SINGLE STEP in the SEO Audit file
- Do NOT skip any optimization
- The first 2 rows (Hero section) = MINOR tweaks only, no major changes
- STRIP/REMOVE all existing Schema (rebuilt separately in Phase 4)
- Verify emails = mailto:recycle@stsrecycle.com
- NO GMB: do NOT add or invent a street address, local phone, hours, or CID
${v.hubSpoke ? "- Verify 3-4 internal links exist in content sections (rows 4+, NOT hero)" : ""}

Complete the ENTIRE audit. Do not stop early. Do not summarize.

Output the optimized HTML (without schema). No lengthy explanations.`;
}

/** seo-verify — compliance + modern-SEO verification audit. */
export function seoVerifyPrompt(v: PromptVars): string {
  const hubSpokeVerifySection = v.hubSpoke
    ? `
INTERNAL LINKING (Hub+Spoke):
☐ 3-4 internal links present in content sections (rows 4+)
☐ NO internal links in hero section
☐ All URLs match the Hub+Spoke handoff exactly
☐ Links use full HTTPS format
☐ Links open in same tab (no target="_blank")
☐ Local context referenced in anchor text where appropriate

HUB+SPOKE REFERENCE:
${v.hubSpoke}

`
    : "";

  return `${FORCE_PREFIX}TASK: SEO VERIFICATION AUDIT

This page has already gone through our Master SEO Audit.
Now verify compliance and check against modern standards.

════════════════════════════════════════════════════════
PART 1: MASTER SEO AUDIT COMPLIANCE CHECK
════════════════════════════════════════════════════════

Verify these items were executed from our SEO Audit:

TECHNICAL:
☐ Meta title: Present, 50-60 chars, includes city + niche
☐ Meta description: Present, 150-160 chars, compelling CTA
☐ H1: ONE only, contains city name
☐ H2-H6: Logical hierarchy, no skipped levels
☐ Image alt tags: All images have descriptive alts
☐ Internal links: Functional, no placeholders

LOCAL SEO:
☐ City mentioned in first 100 words
☐ Email is mailto:recycle@stsrecycle.com

════════════════════════════════════════════════════════
🔴 NO GMB CHECK
════════════════════════════════════════════════════════
This is a NO GMB build. Search the HTML for any invented local data.

WRONG (fix these):
❌ A street address for this city (including streetAddress in schema)
❌ A local phone number presented as this city's location
❌ Business hours for a local branch
❌ A CID anywhere (identifier "cid:...", hasMap, or sameAs Google Maps CID link)
❌ A Google Maps embed or CID link

NOTE: Schema itself is FINE and expected — only a CID or invented street address is wrong.

ACTION: If any invented local data found → REMOVE IT and output:
🔴 REMOVED: [show what was removed]

If clean → output:
✅ NO GMB: Clean (no invented local data)

════════════════════════════════════════════════════════
🔴 FACILITY LANGUAGE CHECK
════════════════════════════════════════════════════════
Search for "600,000 sq ft" or facility size claims.

WRONG:
❌ "from our 600,000 sq ft facility" (implies local)
❌ "our ${v.city} facility"

CORRECT:
✅ "serving ${v.city} from our 600,000 sq ft facility"

If incorrect → FIX and output: 🔴 ADJUSTED: [before/after]
If clean → output: ✅ Facility language: Clean

════════════════════════════════════════════════════════

${hubSpokeVerifySection}CLEANUP:
☐ Schema REMOVED (rebuilt in Phase 4 — no CID, no GMB address)
☐ No broken/placeholder links
☐ No lorem ipsum or [PLACEHOLDER] text

FLAG 1 - AUDIT COMPLIANCE:
✓ ALL STEPS FOLLOWED — or —
⚠️ INCOMPLETE — List what's missing

════════════════════════════════════════════════════════
PART 2: MODERN SEO STANDARDS (Web Search Required)
════════════════════════════════════════════════════════

Search the web for CURRENT (2025-2026) SEO best practices.

SEARCH THESE SOURCES:
• Google Search Central — latest algorithm updates
• Reddit r/SEO, r/bigseo, r/localseo — current trends
• AI SEO optimization techniques (2025+)
• Local/Geo SEO innovations
• E-E-A-T signals (Experience, Expertise, Authority, Trust)
• Core Web Vitals considerations for landing pages

Score this page against what you find.

MODERN SEO SCORE: __/100

QUICK WINS (max 3):
• [Actionable improvement]
• [Actionable improvement]
• [Actionable improvement]

FLAG 2 - MODERN COMPLIANCE:
✓ UP TO DATE — Follows current best practices — or —
⚠️ NEEDS ATTENTION — [Brief reason]

════════════════════════════════════════════════════════
FINAL VERDICT
════════════════════════════════════════════════════════

If ALL checks passed and no issues remain:
✅ SEO VERIFICATION PASSED — Proceed to Phase 4: Schema

If ANY issues need fixing:
❌ SEO VERIFICATION FAILED — Issues listed above must be fixed before proceeding

Output the updated HTML artifact if any changes were made.

Keep report SHORT and SCANNABLE. No lengthy explanations.`;
}

/**
 * seo-verify FIX — the corrective re-verify turn the harness sends when the SEO
 * VERIFICATION AUDIT returns ❌ SEO VERIFICATION FAILED. Uniform for every model;
 * it asks the model to fix the issues IT listed, re-run the checklist, and re-emit
 * the final verdict — the "fix before proceeding" loop the verify prompt mandates.
 */
export function seoVerifyFixPrompt(): string {
  return `${FORCE_PREFIX}TASK: FIX SEO VERIFICATION FAILURES

Your SEO VERIFICATION AUDIT returned ❌ SEO VERIFICATION FAILED.

1. Apply EVERY fix for the issues you listed above — do not skip any.
2. Re-run the full verification checklist against the corrected page.
3. End your reply with the FINAL VERDICT, exactly one of:
   ✅ SEO VERIFICATION PASSED — Proceed to Phase 4: Schema
   ❌ SEO VERIFICATION FAILED — <list the issues that still remain>

No lengthy explanations.`;
}

/** schema — the tool's AI schema prompt. Retained verbatim for reference; the
 * harness generates schema DETERMINISTICALLY instead of sending this (no AI
 * turn), exactly as the tool's "Auto-Generate Schema" button does. */
export function schemaPrompt(v: PromptVars): string {
  return `${FORCE_PREFIX}TASK: GENERATE SCHEMA (JSON-LD) — NO GMB

═══════════════════════════════════
📁 REQUIRED FILE — UPLOAD NOW
═══════════════════════════════════
Upload: 📄 Schema Generator
⚠️ DO NOT PROCEED until file is uploaded.
═══════════════════════════════════

City: ${v.city}
State: ${v.state || "[STATE]"}
Niche: ${v.niche}
Website: https://www.stselectronicrecyclinginc.com

⚠️ NO GMB MODE — CRITICAL DIFFERENCES:
This city has NO Google Business listing. Generate schema EXACTLY like a standard build EXCEPT:
- NO CID anywhere — do NOT add an "identifier" with "cid:...", NO "hasMap", and NO "sameAs" Google Maps CID link (https://www.google.com/maps?cid=...)
- NO GMB street address — do NOT include "streetAddress" or a postal code. Do NOT invent an address.
- NO local phone number for this city.

REQUIREMENTS:
1. Type: LocalBusiness (or RecyclingCenter) / Organization
2. Use CITY + STATE targeting only — "address" may include addressLocality "${v.city}" and addressRegion "${v.state || "[STATE]"}" plus addressCountry "US", and/or "areaServed": "${v.city}, ${v.state || "[STATE]"}". NO streetAddress, NO postalCode.
3. Include "Electronic Recycling" in the name and description
4. Include the website URL
5. Wrap in <script type="application/ld+json"> tags
6. Do NOT include aggregateRating/reviews
7. Do NOT include any CID, identifier, hasMap, or Google Maps link

Output the complete schema script block. No lengthy explanations.`;
}
