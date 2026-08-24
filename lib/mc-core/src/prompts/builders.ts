import type { RunContext } from "../types";
import { describeContext } from "../engine/context";
import { pageBuilderPrompt, schemaGeneratorPrompt, seoAuditPrompt } from "./editorialReview";

/**
 * The single source of truth for the per-phase prompt text that BOTH Mission
 * Control modes consume:
 *   - Dashboard mode sends `{ system, user }` to a model (via PromptCompletionEngine).
 *   - Replit mode renders the same text for a VA to copy-paste (via promptForPhase).
 *
 * Each builder branches on whether the run carries a verified Google Business
 * Profile ({@link RunContext.gmb}), mirroring the bake-off's GMB vs No-GMB split
 * and its fail-loud "never invent NAP/CID" rules — but the branching is additive:
 *
 *   - NO-GMB (ctx.gmb absent/null): the builder emits EXACTLY the text the
 *     Dashboard engines sent before this module existed — byte-for-byte. The
 *     No-GMB safety rules (never invent a local address/phone/CID, STS HQ line)
 *     already live in the Master prompt documents used as the `system`, so the
 *     faithful path needs no extra wrapper. {@link gmbBlock} returns "" here.
 *   - GMB-aware (ctx.gmb set): the builder appends a verified-NAP override block
 *     AFTER `describeContext`, instructing the model/VA to use the real local
 *     name/address/phone/hours/CID/map exactly and invent nothing beyond it.
 *
 * Appending only in the GMB branch is the same architecture the bake-off uses
 * (its `gmbContextSuffix` is added on top of the unchanged production
 * `describeContext`), which is what guarantees zero drift on the No-GMB path.
 */
export interface PromptText {
  /** The Master document (or "" for the self-contained verify prompt). */
  system: string;
  /** The fully-assembled user message: context + phase instruction. */
  user: string;
}

/** The phases that have a shared prompt builder. */
export type PromptPhase = "build" | "audit" | "schema" | "verify";

/**
 * The verified GMB block, phase-aware, appended after the shared context. Returns
 * "" when the run has no verified GMB profile — which is what keeps the No-GMB
 * path byte-for-byte identical to the legacy Dashboard prompts.
 */
function gmbBlock(ctx: RunContext, phase: PromptPhase): string {
  const g = ctx.gmb;
  if (!g) return "";
  const addr = `${g.street}, ${ctx.city}, ${ctx.state} ${g.zip}`;
  const geo = g.lat != null && g.lng != null ? `\n- Coordinates: ${g.lat}, ${g.lng}` : "";
  const county = g.county ? `\n- County: ${g.county}` : "";

  switch (phase) {
    case "build":
      return `\n\n[VERIFIED GOOGLE BUSINESS PROFILE — this page HAS a verified Google Business listing. Use this REAL location data as the page's contact info (call buttons, on-page contact, footer), wiring the phone as a working tel: link. Do NOT substitute the STS HQ line, do NOT omit the local address, and do NOT invent any value beyond what is given here:
- Business name: ${g.businessName}
- Address: ${addr}${county}
- Phone: ${g.phone}
- Hours: ${g.hours}
- Google CID: ${g.cid}
- Google Maps (?cid=): ${g.gmbUrl}${geo}
The verified CID, full PostalAddress, and geo belong in the schema phase — do NOT add JSON-LD in the build. This is otherwise a standard landing page.]`;

    case "audit":
      return `\n\n[VERIFIED GOOGLE BUSINESS PROFILE — keep the verified local NAP intact while auditing. The following data is verified and MUST be present and correct on the page; do NOT flag it as invented and do NOT replace it with the STS HQ line:
- Business name: ${g.businessName}
- Address: ${addr}
- Phone: ${g.phone} (tel: link on the call buttons)
- Hours: ${g.hours}
FIX or REMOVE any phone, street address, hours, or Google CID/Maps link that does NOT match this verified block. Invent nothing beyond it.]`;

    case "schema":
      return `\n\n[VERIFIED GOOGLE BUSINESS PROFILE — emit a GMB schema for this page using ONLY the verified data below; never invent a CID, address, phone, ratings, or coordinates:
- Business name: ${g.businessName}
- identifier (CID): ${g.cid}
- Google Maps (?cid=) for hasMap + sameAs: ${g.gmbUrl}
- Full PostalAddress: streetAddress "${g.street}", addressLocality "${ctx.city}", addressRegion "${ctx.state}", postalCode "${g.zip}", addressCountry "US"
- telephone: ${g.phone}${geo ? `\n- geo GeoCoordinates: ${g.lat}, ${g.lng}` : ""}
Include the verified CID identifier, the full street address + postal code, telephone${geo ? ", geo coordinates," : ""} and a hasMap/sameAs ?cid= URL — exactly what a GMB page's JSON-LD must carry.]`;

    case "verify":
      return `\n\n🟢 GMB CHECK — this page has a VERIFIED Google Business Profile. The following data is EXPECTED and must be present; do NOT treat it as invented:
✅ Business name: ${g.businessName}
✅ Address: ${addr}
✅ Phone: ${g.phone} (tel: link)
✅ Hours: ${g.hours}
WRONG (fix these): any phone OTHER than ${g.phone}; any street address OTHER than ${g.street}; invented neighborhoods/ratings/hours; a CID or Google Maps link that does NOT match ${g.cid}. If the verified NAP is missing, ADD it; if a value contradicts the verified block, FIX it.`;
  }
}

/**
 * BUILD — assemble the page-builder prompt. No-GMB output is byte-for-byte the
 * legacy `PromptCompletionEngine.buildPage` text; GMB runs append the verified
 * NAP block.
 */
export function buildPagePrompt(ctx: RunContext): PromptText {
  return {
    system: pageBuilderPrompt,
    user: `Build the page for the following job:\n\n${describeContext(ctx)}${gmbBlock(ctx, "build")}`,
  };
}

/**
 * AUDIT (SEO) — assemble the SEO-audit prompt. No-GMB output is byte-for-byte the
 * legacy `auditPage` text; GMB runs append the verified NAP block.
 */
export function auditPagePrompt(ctx: RunContext, currentHtml: string): PromptText {
  return {
    system: seoAuditPrompt,
    user: `Audit and improve the following page. Return the full corrected HTML.\n\nContext:\n${describeContext(
      ctx,
    )}${gmbBlock(ctx, "audit")}\n\nCurrent HTML:\n${currentHtml}`,
  };
}

/**
 * SCHEMA — assemble the schema-generator prompt. No-GMB output is byte-for-byte
 * the legacy `generateSchema` text; GMB runs append the verified CID + address
 * block so the JSON-LD can carry the identifier/PostalAddress/geo/?cid= map URL.
 */
export function schemaPrompt(ctx: RunContext, currentHtml: string): PromptText {
  return {
    system: schemaGeneratorPrompt,
    user: `Generate JSON-LD schema for the following page.\n\nContext:\n${describeContext(
      ctx,
    )}${gmbBlock(ctx, "schema")}\n\nPage HTML:\n${currentHtml}`,
  };
}

/**
 * VERIFY — a self-contained closing link + compliance check (no Master document,
 * so `system` is ""). This is additive: the legacy Dashboard pipeline had no
 * verify phase, so there is no byte-for-byte baseline to preserve. It mirrors the
 * bake-off's link/seo verification (GMB vs No-GMB branch, facility language,
 * explicit verdict) and is exposed via {@link promptForPhase} for Replit mode to
 * render. The branch text lives in {@link gmbBlock}.
 */
export function verifyPrompt(ctx: RunContext, currentHtml: string): PromptText {
  const noGmb = ctx.gmb
    ? ""
    : `\n\n🔴 NO GMB CHECK — this is a NO GMB build. It must NOT carry invented LOCAL data. WRONG (fix these): a street address for ${ctx.city} (including streetAddress in schema); a local-branch phone number presented as this city's own line; business hours for a local branch; a CID anywhere (identifier "cid:...", hasMap, or sameAs Google Maps CID link); a Google Maps embed/CID link. City + state targeting ONLY — never invent a local address, phone, hours, or CID.`;

  return {
    system: "",
    user: `Verify the following page before publish. Scan the HTML and check every link and compliance rule, then end with an explicit verdict.

LINK INTEGRITY:
1. ALL email links = mailto:recycle@stsrecycle.com
2. ALL contact/quote buttons = https://www.stselectronicrecyclinginc.com/CONTACT-STS-PAGE
3. NO made-up URLs, NO example.com, NO placeholder/empty hrefs

FACILITY LANGUAGE:
WRONG: "from our 200,000 sq ft facility" / "our ${ctx.city} facility"
CORRECT: "serving ${ctx.city} from our 200,000 sq ft facility"${gmbBlock(ctx, "verify")}${noGmb}

VERDICT:
If everything is correct: ✅ VERIFIED — Proceed to publish
If any issue is found: ❌ FAILED — list the issues, fix them, and re-verify

Context:
${describeContext(ctx)}

Current HTML:
${currentHtml}`,
  };
}

/**
 * Fetch the assembled prompt text for any phase WITHOUT sending it to a model —
 * the pure-function seam Replit mode uses to render a copy-paste prompt for a VA.
 * `currentHtml` is required for the audit/schema/verify phases (they operate on
 * an existing page) and ignored for build.
 */
export function promptForPhase(
  phase: PromptPhase,
  ctx: RunContext,
  currentHtml = "",
): PromptText {
  switch (phase) {
    case "build":
      return buildPagePrompt(ctx);
    case "audit":
      return auditPagePrompt(ctx, currentHtml);
    case "schema":
      return schemaPrompt(ctx, currentHtml);
    case "verify":
      return verifyPrompt(ctx, currentHtml);
    default: {
      const exhaustive: never = phase;
      throw new Error(`Unknown prompt phase: ${String(exhaustive)}`);
    }
  }
}
