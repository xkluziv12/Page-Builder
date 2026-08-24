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

/**
 * The verified Google Business Profile NAP the GMB-build prompts weave into the
 * page (contact, call buttons, footer, on-page verify). Supplied by the operator
 * for a real run; absent (`null`) for the faithful No-GMB path. When present, the
 * build/seo/verify prompts USE this real data instead of the No-GMB HQ-backup
 * constraints — never invented, always operator-supplied.
 */
export interface PromptGmb {
  businessName: string;
  street: string;
  zip: string;
  phone: string;
  hours: string;
  cid: string;
  gmbUrl: string;
}

export interface PromptVars {
  city: string;
  state: string;
  url: string;
  niche: string;
  pageName: string;
  /** The Hub+Spoke internal-linking handoff text (empty string when none). */
  hubSpoke: string;
  /**
   * The verified GMB block when this is a GMB build, or null/undefined for the
   * faithful No-GMB path. When set, the build/seo/verify prompts switch to the
   * GMB-aware branches (use the real NAP); when absent they stay byte-identical
   * to the verbatim No-GMB tool prompts.
   */
  gmb?: PromptGmb | null;
}

/** The "forced execution" prefix the tool stamps on most mini prompts. */
export const FORCE_PREFIX =
  "CRITICAL SYSTEM INSTRUCTION: Execute ALL steps exhaustively. Do NOT summarize. Do NOT skip any section. Do NOT take shortcuts. Complete every single requirement. Stop and alert if errors occur.\n\n";

/**
 * The STS HQ main line — the SINGLE source of truth for the No-GMB backup phone.
 *
 * Bake-off ONLY. In a No-GMB build there is no verified local phone, so instead
 * of telling models to ship a page with NO phone at all (a negative,
 * input-starved framing that pushed at least one model to treat the absent
 * phone/address as "required inputs missing" and refuse to build), the harness
 * falls back to this HQ main line for call buttons, on-page contact, and the
 * schema `telephone`. It is a hardcoded backup that applies ONLY in the No-GMB
 * case; the GMB scenario keeps its own GMB phone. Production (`lib/mc-core`, the
 * shipped `no-gmb.html` tool) is untouched.
 */
export const HQ_PHONE = "844-699-2913";
/** The same number as a working `tel:` href for call buttons. */
export const HQ_PHONE_TEL = "tel:+18446992913";

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
 * Intro-turn neutralizer for the source tool's Claude-DESKTOP chrome, applied
 * IDENTICALLY to every model (same class of uniform shim as `ARTIFACT_TO_INLINE`
 * / `SCHEMA_TO_INLINE`). The verbatim intro was authored for a VA driving Claude
 * Sonnet 4.6 in the Claude desktop app, so it ends with steps that only make
 * sense there and are actively Claude-4.6-specific:
 *   - "rename this chat", "upload these files" (no chat-title / upload surface on
 *     the API — the files are already inlined below), and
 *   - a MODEL-IDENTITY gate that orders the model to declare it is a Claude model
 *     and, if it is "Opus", to reply ONLY "🚫 WRONG MODEL … Switch to Sonnet 4.6"
 *     and STOP. A non-Claude model that follows this literally HARD-STOPS the run
 *     before it ever builds (observed: Grok emitted the WRONG MODEL stop).
 * That gate measures "are you Claude Sonnet 4.6", not build quality, so it biases
 * the whole comparison toward Sonnet 4.6. This note neutralizes ONLY that
 * medium/identity chrome — uniformly, for every model — while leaving all the
 * actual build rules intact. It is NOT per-model coaxing.
 */
export const INTRO_NEUTRALIZE =
  "\n\n[API EXECUTION NOTE — applies to every model identically: this is a " +
  "headless API session, NOT the Claude desktop app. There is no chat title to " +
  "rename and no file-upload surface — the required files (STS SEO Data, Master " +
  "Page Builder, Master Design Tier 2) are already provided INLINE below, so treat " +
  "them as uploaded. The 'MODEL CHECK' step is legacy chrome from a Claude-only " +
  "workflow: DISREGARD it entirely. Do NOT state which model you are, do NOT emit " +
  'the "🚫 WRONG MODEL" stop, and do NOT stop for any model-identity reason — ' +
  "whichever model you are, you are the correct model for this run. Acknowledge " +
  "the session rules briefly and proceed. All other build rules above remain fully " +
  "in force.]";

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

/**
 * The schema-turn counterpart of `ARTIFACT_TO_INLINE`. The Master Schema
 * Generator (uploaded as the `Schema Generator` file) is an interactive,
 * chat-UI document: it tells the operator to "output schema.txt file + meta data
 * in chat boxes" and contains HARD STOPs that pause to ask a human to verify a
 * Google CID before continuing. Headless, there is no file surface and no human
 * to answer — so, IDENTICALLY for every model, we translate those medium-bound
 * directives into: emit ONLY the JSON-LD wrapped in a single
 * `<script type="application/ld+json">…</script>` block, never pause to ask, and
 * use the values present in this conversation (or omit them) rather than halting.
 * A uniform medium shim, NOT per-model special-casing.
 */
export const SCHEMA_TO_INLINE =
  "\n\n[API EXECUTION NOTE — applies to every model identically: this is an API " +
  "session with NO file / chat-box / canvas surface and NO human available to " +
  "answer mid-run. The uploaded Schema Generator describes a chat-UI workflow " +
  '(it says to output a "schema.txt file" and "meta data in chat boxes", and it ' +
  "contains HARD STOPs that ask a person to verify a Google CID). Do NOT pause, " +
  "do NOT ask any question, and do NOT stop to request verification — proceed " +
  "non-interactively using ONLY the data already in this conversation (research " +
  "brief, the current HTML, and the build context above); if a value such as a " +
  "CID, street address, phone, or coordinates is not present here, OMIT it rather " +
  "than inventing it or halting. Your ENTIRE reply must be exactly ONE " +
  '<script type="application/ld+json"> … </script> block — it MUST start with ' +
  "`<script` and end with `</script>`, contain valid JSON-LD, and include NO " +
  "prose, no meta-data boxes, no markdown fences, and no commentary before or " +
  "after it.]";

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

${
    v.gmb
      ? `✅ GMB BUILD — VERIFIED GOOGLE BUSINESS PROFILE:
This page has a verified Google Business listing. Use this REAL location data as the page's contact info (call buttons, on-page contact, footer), wiring the phone as a working tel: link. Do NOT invent any value beyond what is given here:
- Business name: ${v.gmb.businessName}
- Address: ${v.gmb.street}, ${v.city}, ${v.state} ${v.gmb.zip}
- Phone: ${v.gmb.phone}
- Hours: ${v.gmb.hours}
Schema (the verified CID + full PostalAddress + geo) is generated separately in Phase 4 — do NOT add JSON-LD here. This is otherwise a standard landing page.`
      : `⚠️ NO GMB BUILD:
This city has no Google Business listing — but PROCEED NORMALLY and build the full landing page. For the call buttons and on-page contact, use the STS HQ main line ${HQ_PHONE} as the backup phone, wired as a working tel: link (${HQ_PHONE_TEL}). Do NOT invent a LOCAL phone number, street address, business hours, CID, or Google Maps embed/CID link for this city. Schema is generated separately in Phase 4 (telephone = the HQ backup line; no CID, no street address) — this is otherwise a standard landing page.`
  }
${hubSpokeSection}
EXECUTION INSTRUCTIONS:
1. Use Master Page Builder logic - follow EVERY step
2. Apply Master Design (Tier 2) strictly - NO deviations
3. Hero section MUST have city "${v.city}" + niche "${v.niche}" in H1, form on RIGHT
4. Mobile responsive - images must NOT squeeze text
5. Do NOT include Schema yet (built separately in Phase 4${v.gmb ? " — with the verified CID + address" : " — no CID, no GMB address"})
6. ${v.gmb ? `Footer/contact: use the verified GMB phone ${v.gmb.phone} (tel: link) and the GMB address ${v.gmb.street}, ${v.city}, ${v.state} ${v.gmb.zip} for this city` : `Footer/contact: use the STS HQ main line ${HQ_PHONE} (tel: link) for call buttons — do NOT add a local street address or invent a local-branch phone for this city`}
7. Facility mentions: Say "serving ${v.city} from our 200,000 sq ft facility" — NOT "our ${v.city} facility"
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
7. ${v.gmb ? `GMB: build normally; use the verified GMB phone ${v.gmb.phone} (tel: link) and address ${v.gmb.street}, ${v.city}, ${v.state} ${v.gmb.zip} for call buttons / contact; do NOT invent any value beyond the supplied GMB block` : `NO GMB: build normally; use the STS HQ main line ${HQ_PHONE} (tel: link) for call buttons; do NOT invent a local street address, local-branch phone, hours, or CID`}

⚠️ CRITICAL OUTPUT REQUIREMENT:
CREATE A NEW ARTIFACT with the complete rebuilt HTML code. Do NOT paste code in chat.
The artifact must be viewable/previewable. Replace the previous artifact.

DO NOT try to patch the old code. START FRESH. No lengthy explanations.`;
}

/** verify-links — closing link-integrity check. */
export function verifyLinksPrompt(v: PromptVars): string {
  return `${FORCE_PREFIX}TASK: VERIFY ALL LINKS

Scan the HTML and verify:

1. ALL email links = mailto:recycle@stsrecycle.com
2. ALL contact/quote buttons = https://www.stselectronicrecyclinginc.com/CONTACT-STS-PAGE
3. NO made-up URLs (LLMs invent URLs!)
4. NO example.com or placeholder links
5. ${v.gmb ? `The verified GMB phone ${v.gmb.phone} and address ${v.gmb.street}, ${v.city}, ${v.state} ${v.gmb.zip} ARE expected — KEEP them, do NOT treat them as invented. Flag any OTHER invented phone, street address, or placeholder URL.` : `NO invented LOCAL phone numbers or street addresses (NO GMB build) — but the STS HQ main line ${HQ_PHONE} (tel: link) IS the allowed backup phone: KEEP it, do NOT treat it as invented.`}

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
export function verifyLinksFixPrompt(v: PromptVars): string {
  return `${FORCE_PREFIX}TASK: FIX LINK VERIFICATION FAILURES

Your link verification returned ❌ LINKS FAILED.

1. Fix EVERY link issue you listed above:
   - ALL email links = mailto:recycle@stsrecycle.com
   - ALL contact/quote buttons = https://www.stselectronicrecyclinginc.com/CONTACT-STS-PAGE
   - Remove any made-up / example.com / placeholder URLs
   - ${v.gmb ? `Remove any invented phone numbers or street addresses OTHER than the verified GMB phone ${v.gmb.phone} and address ${v.gmb.street}, ${v.city}, ${v.state} ${v.gmb.zip} (KEEP those — they are the verified GMB data)` : `Remove any invented LOCAL phone numbers or street addresses (NO GMB build) — but KEEP the STS HQ main line ${HQ_PHONE} (the allowed backup phone)`}
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
- ${v.gmb ? `GMB: keep the verified GMB phone ${v.gmb.phone} on the call buttons (tel: link) and the GMB address ${v.gmb.street}, ${v.city}, ${v.state} ${v.gmb.zip}; do NOT add or invent any value beyond the supplied GMB block` : `NO GMB: keep the STS HQ main line ${HQ_PHONE} on the call buttons (tel: link); do NOT add or invent a local street address, local-branch phone, hours, or CID`}
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

SCOPE OF THIS AUDIT:
- Audit ONLY the current generated HTML already supplied in this conversation.
- Use web search ONLY to research general, current SEO practices; do NOT fetch,
  inspect, score, or require changes to the deployed target URL or any live CMS page.
- You can revise the supplied generated HTML, but you cannot publish it. Never fail
  this audit because a live page differs or needs deployment.

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

${
    v.gmb
      ? `════════════════════════════════════════════════════════
🟢 GMB CHECK
════════════════════════════════════════════════════════
This page has a VERIFIED Google Business Profile. It SHOULD use this real NAP for
the call buttons / contact / footer. Confirm the verified data is present and
correct, then flag any value that does NOT match the verified block.

VERIFIED (must be present, do NOT flag):
✅ Phone ${v.gmb.phone} on the call buttons / contact (tel: link)
✅ Address ${v.gmb.street}, ${v.city}, ${v.state} ${v.gmb.zip}
✅ Hours ${v.gmb.hours}

WRONG (fix these):
❌ Any phone number OTHER than the verified ${v.gmb.phone}
❌ Any street address OTHER than the verified ${v.gmb.street}
❌ Invented neighborhoods, ratings, or hours that contradict the verified block
❌ A CID or Google Maps link that does NOT match the verified profile

NOTE: The verified CID + full PostalAddress + geo belong in the Phase-4 schema, not invented inline here.

ACTION:
- If the verified phone/address is MISSING → ADD it and output:
  🟢 ADDED: verified GMB NAP wired to contact
- If any value contradicts the verified block → FIX IT and output:
  🟢 FIXED: [show before/after]

If clean and the verified NAP is present → output:
✅ GMB: Clean (verified NAP present, nothing invented)
`
      : `════════════════════════════════════════════════════════
🔴 NO GMB CHECK
════════════════════════════════════════════════════════
This is a NO GMB build. It SHOULD still have working call buttons that use the
STS HQ main line ${HQ_PHONE} as a tel: link — that HQ backup number is EXPECTED
and allowed, it is NOT invented local data. Confirm it is present and wired to the
call buttons. Then search the HTML for any invented LOCAL data.

EXPECTED (do NOT flag these):
✅ The STS HQ main line ${HQ_PHONE} on the call buttons / contact (tel: link)
✅ telephone "${HQ_PHONE}" in the schema

WRONG (fix these):
❌ A street address for this city (including streetAddress in schema)
❌ A LOCAL / local-branch phone number presented as this city's own line (any phone OTHER than the HQ backup ${HQ_PHONE})
❌ Business hours for a local branch
❌ A CID anywhere (identifier "cid:...", hasMap, or sameAs Google Maps CID link)
❌ A Google Maps embed or CID link

NOTE: Schema itself is FINE and expected — telephone "${HQ_PHONE}" is correct; only a CID, an invented street address, or a local-branch phone is wrong.

ACTION:
- If the HQ number ${HQ_PHONE} is MISSING from the call buttons → ADD it (tel: link) and output:
  🔴 ADDED: HQ backup phone wired to call buttons
- If any invented local data found → REMOVE IT and output:
  🔴 REMOVED: [show what was removed]

If clean and the HQ number is present → output:
✅ NO GMB: Clean (HQ backup phone present, no invented local data)
`
  }
════════════════════════════════════════════════════════
🔴 FACILITY LANGUAGE CHECK
════════════════════════════════════════════════════════
Search for "200,000 sq ft" or facility size claims.

WRONG:
❌ "from our 200,000 sq ft facility" (implies local)
❌ "our ${v.city} facility"

CORRECT:
✅ "serving ${v.city} from our 200,000 sq ft facility"

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
2. Re-run the full verification checklist against the corrected generated HTML in
   this conversation, not a deployed URL or CMS page.
3. End your reply with the FINAL VERDICT, exactly one of:
   ✅ SEO VERIFICATION PASSED — Proceed to Phase 4: Schema
   ❌ SEO VERIFICATION FAILED — <list the issues that still remain>

No lengthy explanations.`;
}

/** schema (No-GMB) — the Phase-4 schema turn. The harness SENDS this as a real
 * AI turn with the Master Schema Generator file inlined (see SCHEMA_TO_INLINE),
 * exactly like the SEO-audit turn uploads its master file — NOT the old
 * deterministic "Auto-Generate Schema" shortcut. The No-GMB overrides below sit
 * on top of the uploaded generator: city/state targeting only, no CID, no street
 * address, no local phone. */
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
- Telephone: use the STS HQ main line "${HQ_PHONE}" as the backup "telephone". Do NOT invent a LOCAL phone number for this city.

REQUIREMENTS:
1. Type: LocalBusiness (or RecyclingCenter) / Organization
2. Use CITY + STATE targeting only — "address" may include addressLocality "${v.city}" and addressRegion "${v.state || "[STATE]"}" plus addressCountry "US", and/or "areaServed": "${v.city}, ${v.state || "[STATE]"}". NO streetAddress, NO postalCode.
3. Include "Electronic Recycling" in the name and description
4. Include the website URL
5. Include "telephone": "${HQ_PHONE}" (the HQ backup line)
6. Wrap in <script type="application/ld+json"> tags
7. Do NOT include aggregateRating/reviews
8. Do NOT include any CID, identifier, hasMap, or Google Maps link

Output the complete schema script block. No lengthy explanations.`;
}

/** The GMB inputs the GMB-scenario schema turn hands the model. Mirrors the
 * fields the GMB-enriched intro already supplies, so the schema turn can carry
 * the verified CID + full PostalAddress a HUB/GMB schema requires. */
export interface SchemaGmbInputs {
  cid: string;
  gmbUrl: string;
  businessName: string;
  street: string;
  zip: string;
  phone: string;
  lat: number;
  lng: number;
  /** Verified hours, one human line per open day (e.g. "Monday: 8:30 AM – 5:00 PM").
   * Empty when the GMB block carries no structured hours. */
  hoursLines?: string[];
}

/** schema (GMB-enriched) — the Phase-4 schema turn for the GMB scenario. Same
 * uploaded Master Schema Generator file + SCHEMA_TO_INLINE shim as the No-GMB
 * variant, but it hands the model the verified CID + full address block so the
 * emitted JSON-LD carries the identifier/PostalAddress/geo/?cid= map URL that a
 * GMB page must have. Kept symmetric with `schemaPrompt` — the ONLY difference is
 * the GMB data the scenario already established, not per-model special-casing. */
export function gmbSchemaPrompt(v: PromptVars, g: SchemaGmbInputs): string {
  return `${FORCE_PREFIX}TASK: GENERATE SCHEMA (JSON-LD) — GMB

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

✅ GMB MODE — verified Google Business Profile data for this page (use it exactly, do NOT invent anything beyond it):
- Business name: ${g.businessName}
- CID: ${g.cid}
- Google Maps URL (?cid=): ${g.gmbUrl}
- Street address: ${g.street}
- Postal code: ${g.zip}
- Phone: ${g.phone}
- Coordinates: ${g.lat}, ${g.lng}${
    g.hoursLines && g.hoursLines.length > 0
      ? `\n- Hours (use EXACTLY; closed days are omitted):\n${g.hoursLines.map((h) => `  • ${h}`).join("\n")}`
      : ""
  }

REQUIREMENTS:
1. Type: an array ["RecyclingCenter", "LocalBusiness"] (most-specific first)
2. identifier: "${g.cid}" (CID format exactly — do NOT use gMapsUrl)
3. Full PostalAddress: streetAddress "${g.street}", addressLocality "${v.city}", addressRegion "${v.state || "[STATE]"}", postalCode "${g.zip}", addressCountry "US"
4. telephone "${g.phone}", geo GeoCoordinates ${g.lat}/${g.lng}
5. hasMap and sameAs using the ?cid= URL above${
    g.hoursLines && g.hoursLines.length > 0
      ? `\n6. openingHoursSpecification: one OpeningHoursSpecification per open day above (dayOfWeek as https://schema.org/<Day>, opens/closes in 24h HH:MM; "Open 24 hours" → opens "00:00" closes "23:59"). Omit closed days.`
      : ""
  }
${g.hoursLines && g.hoursLines.length > 0 ? "7" : "6"}. Include "Electronic Recycling" in the name and description, and the website URL
${g.hoursLines && g.hoursLines.length > 0 ? "8" : "7"}. Do NOT include aggregateRating/reviews or individual reviews
${g.hoursLines && g.hoursLines.length > 0 ? "9" : "8"}. Do NOT invent neighborhoods, ratings, or any value not given above

Output the complete schema script block. No lengthy explanations.`;
}
