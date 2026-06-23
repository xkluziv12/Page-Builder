import type { RunContext } from "@workspace/mc-core";

/**
 * Faithful port of the per-phase "mini prompts" the VA copies out of the old
 * No-GMB checklist tool (`artifacts/page-terminal/public/tools/no-gmb.html`,
 * `copyPrompt()`), forced alongside the master prompt at each step.
 *
 * In the manual workflow the master prompt (Page Builder / SEO Audit) is an
 * UPLOADED FILE and the VA pastes one of these mini prompts into chat. Here the
 * master prompt is the engine `system` message (the uploaded-file equivalent)
 * and the mini prompt is the `user` message (what the VA pastes). The shared
 * research/context block is embedded inline (the harness equivalent of the
 * uploaded "STS SEO Data" file).
 *
 * Two faithful adaptations, applied IDENTICALLY to every model (so the
 * comparison stays apples-to-apples — no per-model special-casing):
 *  - The chat-UI "CREATE AS ARTIFACT, never paste code in chat" rule has no API
 *    equivalent, so it is translated to its INTENT: "return ONLY the complete
 *    HTML document, no commentary." That is the rule that suppresses narration.
 *  - The Claude-only model-check ("state which Claude model you are / if Opus
 *    STOP") is a UI safety guard, nonsensical for the other models, and is
 *    dropped uniformly.
 *
 * The intro's session-wide RULES are folded into each step because the harness
 * is stateless (one-shot per phase) — there is no persistent chat to carry them.
 */

/** The "forced execution" prefix the old tool stamps on every mini prompt. */
const FORCE_PREFIX =
  "CRITICAL SYSTEM INSTRUCTION: Execute ALL steps exhaustively. Do NOT summarize. Do NOT skip any section. Do NOT take shortcuts. Complete every single requirement. Stop and alert if errors occur.\n\n";

/** Session-wide rules from the intro sequence, carried into every step. */
const SESSION_RULES = [
  "SESSION RULES (follow for every step):",
  "1. Follow ALL instructions exactly — no shortcuts, no summarizing, no skipping steps",
  "2. Execute EVERY instruction completely before stopping",
  "3. Keep it TIGHT — essentials only, no fluff or excessive explanation",
  "4. Read the provided context/research thoroughly before proceeding",
  "5. Do NOT hallucinate — if a fact is missing, omit it rather than invent it",
  "6. ALL OUTPUT → return the COMPLETE HTML document ONLY (a single file starting with <!DOCTYPE html> and ending with </html>). NEVER include commentary, narration, summaries, checklists, or markdown around it.",
].join("\n");

const RULE = "═══════════════════════════════════";

/** Build mini prompt — the old tool's `intro` rules + `build` task, forced. */
export function noGmbBuildUser(ctx: RunContext, context: string): string {
  const loc = ctx.state ? `${ctx.city}, ${ctx.state}` : ctx.city;
  return `${FORCE_PREFIX}TASK: Build Landing Page for ${loc} — ${ctx.niche}

${RULE}
TARGET: ${loc}
NICHE: ${ctx.niche}
${RULE}

${SESSION_RULES}

⚠️ NO GMB BUILD:
This city has no Google Business listing. Do NOT include or invent a street address, local phone number, business hours, CID, or Google Maps embed/CID link. Schema is generated separately (no CID, no street address) — this is otherwise a standard landing page.

EXECUTION INSTRUCTIONS:
1. Use the Master Page Builder logic (the system prompt) — follow EVERY step
2. Apply the Master Design strictly — NO deviations
3. Hero section MUST have city "${ctx.city}" + niche "${ctx.niche}" in H1, form on RIGHT
4. Mobile responsive — images must NOT squeeze text
5. Do NOT include Schema yet (built separately — no CID, no GMB address)
6. Do NOT include a footer NAP block (no local address/phone for this city)
7. Facility mentions: say "serving ${ctx.city} from our 600,000 sq ft facility" — NOT "our ${ctx.city} facility"
8. Include 3-4 internal links from the existing-URL / sacred-link context in content sections (rows 4+, NOT hero)

${RULE}
CONTEXT / RESEARCH DATA — build from this:
${RULE}
${context}

⚠️ CRITICAL OUTPUT REQUIREMENT:
Return ONLY the complete HTML document — a single file beginning with <!DOCTYPE html> and ending with </html>. No commentary before or after.

BEGIN BUILD NOW. No lengthy explanations.`;
}

/**
 * Audit mini prompt — the old tool's `seo` task with the `seo-verify`
 * compliance checklist folded in (so the checklist is honored without adding a
 * separate phase), forced.
 */
export function noGmbAuditUser(
  ctx: RunContext,
  context: string,
  currentHtml: string,
): string {
  return `${FORCE_PREFIX}TASK: FULL SEO AUDIT

${SESSION_RULES}

CRITICAL RULES:
- Execute EVERY SINGLE STEP in the Master SEO Audit (the system prompt)
- Do NOT skip any optimization
- The first 2 rows (Hero section) = MINOR tweaks only, no major changes
- STRIP/REMOVE all existing Schema (rebuilt separately)
- Verify emails = mailto:recycle@stsrecycle.com
- NO GMB: do NOT add or invent a street address, local phone, hours, or CID
- Verify 3-4 internal links exist in content sections (rows 4+, NOT hero)

Complete the ENTIRE audit. Do not stop early. Do not summarize.

${RULE}
COMPLIANCE CHECKLIST — verify each before output
${RULE}
TECHNICAL:
- Meta title present, 50-60 chars, includes city + niche
- Meta description present, 150-160 chars, compelling CTA
- ONE H1 only, contains city name
- H2-H6 logical hierarchy, no skipped levels
- All images have descriptive alt tags
- Internal links functional, no placeholders
LOCAL SEO:
- City mentioned in the first 100 words
- Email is mailto:recycle@stsrecycle.com
NO GMB:
- No street address / local phone / hours / CID / Google Maps CID link anywhere

${RULE}
CONTEXT:
${RULE}
${context}

${RULE}
CURRENT HTML:
${RULE}
${currentHtml}

⚠️ CRITICAL OUTPUT REQUIREMENT:
Output ONLY the full corrected, optimized HTML document (WITHOUT schema) — a single file beginning with <!DOCTYPE html> and ending with </html>. No commentary, no summary, no markdown. No lengthy explanations.`;
}
