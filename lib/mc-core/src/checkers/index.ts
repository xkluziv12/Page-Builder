import type {
  CheckResult,
  CheckerReport,
  Classification,
  JoomlaMeta,
  PageType,
  Track,
  UrlRegistry,
} from "../types";
import {
  CERT_RULES,
  KNOWN_REDIRECTS,
  WORD_COUNT_CEILINGS,
  buildForbiddenFacilityPhrases,
  facilityRewrite,
  mergedAllowedUrls,
  normalizeUrl,
} from "../registry";
import { extractHrefs, extractImgSrcs, stripTags, wordCount } from "./text";
import { computeStructuralHash } from "./structural-hash";

export interface CheckerInput {
  html: string;
  registry: UrlRegistry;
  pageType?: PageType;
  track?: Track;
  classification?: Classification;
  /** Target city, used for city-specific facility-language patterns. */
  city?: string | null;
  /** Word-count floor is only enforced after the audit phase has run. */
  afterAudit?: boolean;
  schema?: string | null;
  joomlaMeta?: JoomlaMeta | null;
  businessName?: string;
  /** Researched entities from the brief, used for entity-consistency checks. */
  entities?: Record<string, unknown>[];
  /** Hash of the design-bible skeleton this page should conform to. */
  designBibleHash?: string | null;
  /**
   * Computed structural hash of the current page. When omitted, runCheckers
   * computes it from the HTML so the design-bible drift gate is always live.
   */
  currentBibleHash?: string | null;
  /**
   * Approved icon-class allowlist (e.g. the bible's SVG/icon-font set). When
   * provided, icon classes outside this set are flagged.
   */
  approvedIconClasses?: string[];
  /** String substitutions to verify (assert-after-replace). */
  replacements?: Replacement[];
}

/** A single string substitution to verify with assert-after-replace. */
export interface Replacement {
  label?: string;
  oldString: string;
  newString: string;
}

/** The soft-target marker the Page Builder leaves for the SEO audit to fill. */
export const AUDIT_TARGET_MARKER = "<!-- AUDIT_TARGET -->";

function pass(id: string, label: string, message: string): CheckResult {
  return { id, label, severity: "info", passed: true, message, details: [] };
}

function fail(
  id: string,
  label: string,
  severity: "error" | "warning",
  message: string,
  details: string[] = [],
): CheckResult {
  return { id, label, severity, passed: false, message, details };
}

/** 1. Em-dash / en-dash ban. */
export function checkEmDash(html: string): CheckResult {
  const text = stripTags(html);
  const matches = text.match(/[—–]/g) ?? [];
  if (matches.length === 0) {
    return pass("em-dash", "Em-dash ban", "No em-dashes or en-dashes found.");
  }
  return fail(
    "em-dash",
    "Em-dash ban",
    "error",
    `Found ${matches.length} forbidden dash character(s). Replace em/en dashes with commas, periods, or "and".`,
    [`${matches.length} occurrence(s) of — or –`],
  );
}

/**
 * 2. Every image src must be an absolute HTTPS URL AND a member of the verified
 * image library. Root-relative paths are the confirmed Joomla silent-fail bug,
 * and inventing/normalizing image URLs outside the library is forbidden. The two
 * known path exceptions (`datacenter-286386_1280`, `/images/2017/desk-4308230`)
 * are encoded directly in the library URLs, so membership covers them.
 */
export function checkImagePaths(html: string, registry: UrlRegistry): CheckResult {
  const srcs = extractImgSrcs(html);
  const library = new Set(registry.imageLibrary.map((l) => normalizeUrl(l.url)));
  const notHttps = srcs.filter((s) => !/^https:\/\//i.test(s));
  const notInLibrary = srcs.filter(
    (s) => /^https:\/\//i.test(s) && !library.has(normalizeUrl(s)),
  );
  if (notHttps.length === 0 && notInLibrary.length === 0) {
    return pass(
      "image-library",
      "Verified library images",
      `All ${srcs.length} image(s) are absolute HTTPS URLs from the verified library.`,
    );
  }
  const details = [
    ...notHttps.map((s) => `not absolute HTTPS (root-relative/http images silently fail in Joomla): ${s}`),
    ...notInLibrary.map((s) => `not in the verified image library: ${s}`),
  ];
  return fail(
    "image-library",
    "Verified library images",
    "error",
    `${notHttps.length + notInLibrary.length} image(s) violate the verified-image rule (must be absolute HTTPS from the verified library; never invent or normalize image URLs).`,
    details,
  );
}

/** 3. No insecure http:// links anywhere. */
export function checkInsecureLinks(html: string): CheckResult {
  const hrefs = extractHrefs(html);
  const bad = hrefs.filter((h) => /^http:\/\//i.test(h));
  if (bad.length === 0) {
    return pass("insecure-links", "No insecure links", "No http:// links found.");
  }
  return fail(
    "insecure-links",
    "No insecure links",
    "error",
    `${bad.length} insecure http:// link(s) found.`,
    bad,
  );
}

/** 4. Known dead/redirected URLs are a hard failure. */
export function checkKnownRedirects(html: string): CheckResult {
  const found: string[] = [];
  for (const [bad, good] of Object.entries(KNOWN_REDIRECTS)) {
    if (html.toLowerCase().includes(normalizeUrl(bad))) {
      found.push(`${bad} -> use ${good}`);
    }
  }
  if (found.length === 0) {
    return pass(
      "known-redirects",
      "No dead/redirected URLs",
      "No known dead or redirected URLs present.",
    );
  }
  return fail(
    "known-redirects",
    "No dead/redirected URLs",
    "error",
    `${found.length} known dead/redirected URL(s) found. Replace with the corrected destination.`,
    found,
  );
}

/** 5. Internal links must resolve to the merged registry. */
export function checkUrlRegistry(html: string, registry: UrlRegistry): CheckResult {
  const allowed = mergedAllowedUrls(registry);
  const base = normalizeUrl(registry.baseDomain);
  const hrefs = extractHrefs(html);
  // Internal links come in two shapes: absolute (https://base/...) and
  // root-relative (/services). Root-relative links MUST be canonicalized
  // against the base domain so they are validated against the allowlist too —
  // otherwise an invented "/made-up-page" silently bypasses the registry gate.
  // Protocol-relative ("//cdn..."), anchors ("#"), mailto:/tel:, and external
  // absolute URLs are not internal and are left alone.
  const internal: string[] = [];
  for (const raw of hrefs) {
    const t = raw.trim();
    const n = normalizeUrl(t);
    if (n.startsWith(base)) {
      internal.push(n);
    } else if (t.startsWith("/") && !t.startsWith("//")) {
      internal.push(normalizeUrl(base + t));
    }
  }
  const unknown = internal.filter((h) => !allowed.has(h));
  if (unknown.length === 0) {
    return pass(
      "url-registry",
      "URL registry",
      `All ${internal.length} internal link(s) are in the approved registry.`,
    );
  }
  return fail(
    "url-registry",
    "URL registry",
    "error",
    `${unknown.length} internal link(s) are not in the approved registry. Invented or unverified STS URLs are a hard failure — add them to the registry only if they genuinely exist.`,
    [...new Set(unknown)],
  );
}

/** 6. All configured sacred links must be present (page track only). */
export function checkSacredLinks(html: string, registry: UrlRegistry, track: Track): CheckResult {
  if (track !== "page" || registry.sacredLinks.length === 0) {
    return pass(
      "sacred-links",
      "Sacred links present",
      "Sacred-link presence not required for this track.",
    );
  }
  const lower = html.toLowerCase();
  const missing = registry.sacredLinks.filter(
    (l) => !lower.includes(normalizeUrl(l.url)),
  );
  if (missing.length === 0) {
    return pass(
      "sacred-links",
      "Sacred links present",
      `All ${registry.sacredLinks.length} sacred equipment links present.`,
    );
  }
  return fail(
    "sacred-links",
    "Sacred links present",
    "error",
    `${missing.length} required sacred equipment link(s) are missing.`,
    missing.map((l) => `${l.label}: ${l.url}`),
  );
}

/** 7. Word count: floor (after audit) and soft ceiling by page type. */
export function checkWordCount(
  html: string,
  registry: UrlRegistry,
  pageType: PageType,
  afterAudit: boolean,
): CheckResult[] {
  const count = wordCount(html);
  const results: CheckResult[] = [];
  if (afterAudit && count < registry.wordCountFloor) {
    results.push(
      fail(
        "word-floor",
        "Word-count floor",
        "error",
        `Page has ${count} words, below the ${registry.wordCountFloor}-word floor.`,
        [`${count} / ${registry.wordCountFloor} words`],
      ),
    );
  } else {
    results.push(
      pass(
        "word-floor",
        "Word-count floor",
        afterAudit
          ? `Page has ${count} words (floor ${registry.wordCountFloor}).`
          : `Word-count floor is checked after the audit phase. Current: ${count} words.`,
      ),
    );
  }
  const ceiling = WORD_COUNT_CEILINGS[pageType];
  if (ceiling && count > ceiling) {
    results.push(
      fail(
        "word-ceiling",
        "Word-count ceiling",
        "warning",
        `Page has ${count} words, above the ${ceiling}-word ${pageType} ceiling.`,
        [`${count} / ${ceiling} words`],
      ),
    );
  } else {
    results.push(
      pass("word-ceiling", "Word-count ceiling", `Within the ${pageType} ceiling.`),
    );
  }
  return results;
}

/** 8. Forbidden "facility"/location language (city-aware). */
export function checkFacilityLanguage(html: string, city?: string | null): CheckResult {
  const text = stripTags(html).toLowerCase();
  const phrases = buildForbiddenFacilityPhrases(city);
  const found = phrases.filter((p) => text.includes(p.toLowerCase()));
  if (found.length === 0) {
    return pass(
      "facility-language",
      "Facility language",
      "No forbidden facility/location-ownership language found.",
    );
  }
  return fail(
    "facility-language",
    "Facility language",
    "error",
    `Forbidden facility/location language found. Rewrite using "${facilityRewrite(city)}".`,
    found,
  );
}

/**
 * 8b. Wrong icons. Emoji used as iconography (a recurring mistake — the bible
 * mandates a specific SVG/icon set, never emoji) is always flagged. When an
 * approved icon-class allowlist is supplied, icon-font classes outside it are
 * flagged too.
 */
export function checkIcons(html: string, approvedIconClasses?: string[]): CheckResult {
  const text = stripTags(html);
  // Emoji / pictographic ranges commonly pasted in place of the real icon set.
  const emojiRe =
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F000}-\u{1F0FF}]/gu;
  const emoji = [...new Set(text.match(emojiRe) ?? [])];

  const offendingClasses: string[] = [];
  if (approvedIconClasses && approvedIconClasses.length > 0) {
    const allowed = new Set(approvedIconClasses.map((c) => c.toLowerCase()));
    const re = /class\s*=\s*["']([^"']*\b(?:fa|fas|far|fab|icon|bi|material-icons)[^"']*)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const cls = m[1]!.trim().toLowerCase();
      if (![...allowed].some((a) => cls.includes(a))) offendingClasses.push(cls);
    }
  }

  if (emoji.length === 0 && offendingClasses.length === 0) {
    return pass("icons", "Correct icon set", "No emoji or off-set icons found.");
  }
  const details = [
    ...emoji.map((e) => `emoji used as icon: ${e} (use the bible's SVG icon set instead)`),
    ...[...new Set(offendingClasses)].map((c) => `icon class not in approved set: ${c}`),
  ];
  return fail(
    "icons",
    "Correct icon set",
    "error",
    "Wrong icons: emoji or off-set icon classes found. Pages must use the design bible's approved icon set, never emoji.",
    details,
  );
}

/** 9. Certification scope. */
export function checkCertScope(html: string): CheckResult {
  const violations: string[] = [];
  for (const rule of CERT_RULES) {
    if (rule.forbiddenPattern.test(html)) {
      violations.push(rule.message);
    }
  }
  if (violations.length === 0) {
    return pass("cert-scope", "Certification scope", "Certification claims are in scope.");
  }
  return fail(
    "cert-scope",
    "Certification scope",
    "error",
    "Out-of-scope certification claim(s) found.",
    violations,
  );
}

/** Pull a human entity name out of a loosely-typed research-brief entity. */
function entityName(e: Record<string, unknown>): string | null {
  for (const key of ["name", "entity", "organization", "org", "company", "title"]) {
    const v = e[key];
    if (typeof v === "string" && v.trim().length > 2) return v.trim();
  }
  return null;
}

/** Numeric count facts (employees / locations / years) carried by an entity. */
function entityCounts(e: Record<string, unknown>): { field: string; value: number }[] {
  const out: { field: string; value: number }[] = [];
  for (const [k, v] of Object.entries(e)) {
    if (!/count|employee|headcount|staff|location|year|founded/i.test(k)) continue;
    const n =
      typeof v === "number"
        ? v
        : typeof v === "string" && /^\d[\d,]*$/.test(v.trim())
          ? Number(v.replace(/,/g, ""))
          : null;
    if (n != null && Number.isFinite(n)) out.push({ field: k, value: n });
  }
  return out;
}

/** Map a count field to the page phrase keyword we can look for, if any. */
function countKeyword(field: string): string | null {
  const f = field.toLowerCase();
  if (f.includes("employee") || f.includes("headcount") || f.includes("staff")) return "employees";
  if (f.includes("location")) return "locations";
  if (f.includes("year")) return "years";
  return null;
}

/**
 * 10. Entity consistency between the page body, its schema, and the research
 * brief. Beyond the business brand name, every researched entity name must be
 * coherent across page and schema (present in one but not the other is a hard
 * mismatch), and any verified count fact (e.g. "120 employees") must not be
 * contradicted by a different figure in the page copy.
 */
export function checkEntityConsistency(
  html: string,
  schema: string | null | undefined,
  businessName?: string,
  entities?: Record<string, unknown>[],
): CheckResult {
  const briefEntities = entities ?? [];
  if (!schema || (!businessName && briefEntities.length === 0)) {
    return pass(
      "entity-consistency",
      "Entity consistency",
      "Schema or entity data not provided; skipped.",
    );
  }
  const lowerHtml = html.toLowerCase();
  const lowerSchema = schema.toLowerCase();
  const details: string[] = [];

  // 1. Name consistency. The business name must be in BOTH page and schema; any
  // other researched entity that appears in one must also appear in the other.
  const names = new Set<string>();
  if (businessName) names.add(businessName);
  for (const e of briefEntities) {
    const n = entityName(e);
    if (n) names.add(n);
  }
  for (const name of names) {
    const inPage = lowerHtml.includes(name.toLowerCase());
    const inSchema = lowerSchema.includes(name.toLowerCase());
    if (name === businessName) {
      if (!inPage) details.push(`"${name}" not found in page body`);
      if (!inSchema) details.push(`"${name}" not found in schema`);
    } else if (inPage !== inSchema) {
      details.push(
        inPage
          ? `Researched entity "${name}" is on the page but missing from the schema`
          : `Researched entity "${name}" is in the schema but missing from the page body`,
      );
    }
  }

  // 2. Count consistency. If the brief verified a count for an entity the page
  // mentions, the page must not state a different figure for the same fact.
  for (const e of briefEntities) {
    const n = entityName(e);
    if (!n || !lowerHtml.includes(n.toLowerCase())) continue;
    for (const { field, value } of entityCounts(e)) {
      const kw = countKeyword(field);
      if (!kw) continue;
      const m = html.match(new RegExp(`(\\d[\\d,]*)\\s*\\+?\\s*${kw}`, "i"));
      if (m && m[1]) {
        const pageVal = Number(m[1].replace(/,/g, ""));
        if (Number.isFinite(pageVal) && pageVal !== value) {
          details.push(
            `Entity "${n}": page states ${pageVal} ${kw} but the research brief verified ${value}.`,
          );
        }
      }
    }
  }

  if (details.length === 0) {
    return pass(
      "entity-consistency",
      "Entity consistency",
      `Entity names and counts are consistent across page, schema, and research brief (${names.size} name(s) checked).`,
    );
  }
  return fail(
    "entity-consistency",
    "Entity consistency",
    "error",
    "Entity mismatch between page body, schema, and/or research brief. Inconsistent entity names or contradicted counts are a hard failure.",
    [...new Set(details)],
  );
}

/** 11. Design-bible structural hash diff (assert-after-replace). */
export function checkBibleHash(
  expected: string | null | undefined,
  current: string | null | undefined,
): CheckResult {
  if (!expected) {
    return pass("bible-hash", "Design-bible hash", "No design-bible hash configured; skipped.");
  }
  if (!current) {
    return fail(
      "bible-hash",
      "Design-bible hash",
      "warning",
      "Design-bible hash configured but current page hash was not computed.",
    );
  }
  if (expected === current) {
    return pass(
      "bible-hash",
      "Design-bible hash",
      "Page structure matches the design bible.",
    );
  }
  return fail(
    "bible-hash",
    "Design-bible hash",
    "warning",
    "Page structure drifted from the design bible.",
    [`expected ${expected}`, `got ${current}`],
  );
}

/**
 * 12. `<!-- AUDIT_TARGET -->` soft-target count. The Page Builder must tag at
 * least 5 paragraphs (3 for LIGHT_TOUCH) for the SEO audit to expand. The count
 * is enforced BEFORE the audit phase; afterward the markers are consumed/filled,
 * so the count is informational.
 */
export function checkAuditTargets(
  html: string,
  classification: Classification,
  afterAudit: boolean,
): CheckResult {
  const min = classification === "LIGHT_TOUCH" ? 3 : 5;
  const count = html.split(AUDIT_TARGET_MARKER).length - 1;
  if (afterAudit) {
    return pass(
      "audit-targets",
      "Soft-target count",
      `Audit phase has run; ${count} unfilled soft-target marker(s) remain.`,
    );
  }
  if (count >= min) {
    return pass(
      "audit-targets",
      "Soft-target count",
      `${count} soft-target marker(s) present (minimum ${min} for ${classification}).`,
    );
  }
  return fail(
    "audit-targets",
    "Soft-target count",
    "error",
    `Only ${count} <!-- AUDIT_TARGET --> marker(s) found; the Page Builder must tag at least ${min} paragraphs (${classification}).`,
    [`${count} / ${min} required`],
  );
}

/**
 * 13. Assert-after-replace. Every string substitution must leave the new string
 * present AND the old string absent, so a silent replacement failure is caught
 * immediately instead of shipping a half-applied edit.
 */
export function checkAssertAfterReplace(
  html: string,
  replacements: Replacement[] = [],
): CheckResult {
  if (replacements.length === 0) {
    return pass(
      "assert-after-replace",
      "Assert-after-replace",
      "No string substitutions to verify.",
    );
  }
  const failures: string[] = [];
  for (const r of replacements) {
    const label = r.label ?? `"${r.oldString.slice(0, 30)}" -> "${r.newString.slice(0, 30)}"`;
    const newPresent = r.newString !== "" && html.includes(r.newString);
    const oldAbsent = r.oldString === "" || !html.includes(r.oldString);
    if (!newPresent) failures.push(`${label}: new string is NOT present after replace`);
    if (!oldAbsent) failures.push(`${label}: old string is STILL present after replace`);
  }
  if (failures.length === 0) {
    return pass(
      "assert-after-replace",
      "Assert-after-replace",
      `All ${replacements.length} substitution(s) verified (new present, old absent).`,
    );
  }
  return fail(
    "assert-after-replace",
    "Assert-after-replace",
    "error",
    "Silent replacement failure: a substitution did not fully apply. Every replace must leave the new string present and the old string absent.",
    failures,
  );
}

/** Run the full checker suite and assemble a structured report. */
export function runCheckers(input: CheckerInput): CheckerReport {
  const pageType: PageType = input.pageType ?? "SPOKE";
  const track: Track = input.track ?? "page";
  const classification: Classification = input.classification ?? "NEW_BUILD";
  const afterAudit = input.afterAudit ?? false;
  // Keep the design-bible drift gate live: when the caller does not pass a
  // precomputed current hash, derive it from the HTML so the comparison always
  // runs against the stored expected hash.
  const currentBibleHash = input.currentBibleHash ?? computeStructuralHash(input.html);
  const checks: CheckResult[] = [
    checkEmDash(input.html),
    checkImagePaths(input.html, input.registry),
    checkInsecureLinks(input.html),
    checkKnownRedirects(input.html),
    checkUrlRegistry(input.html, input.registry),
    checkSacredLinks(input.html, input.registry, track),
    ...checkWordCount(input.html, input.registry, pageType, afterAudit),
    checkFacilityLanguage(input.html, input.city),
    checkIcons(input.html, input.approvedIconClasses),
    checkCertScope(input.html),
    checkEntityConsistency(input.html, input.schema, input.businessName, input.entities),
    checkAuditTargets(input.html, classification, afterAudit),
    checkAssertAfterReplace(input.html, input.replacements ?? []),
    checkBibleHash(input.designBibleHash, currentBibleHash),
  ];

  const errorCount = checks.filter((c) => !c.passed && c.severity === "error").length;
  const warningCount = checks.filter((c) => !c.passed && c.severity === "warning").length;

  return {
    passed: errorCount === 0,
    errorCount,
    warningCount,
    wordCount: wordCount(input.html),
    ranAt: new Date().toISOString(),
    checks,
  };
}
