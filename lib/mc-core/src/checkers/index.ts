import type {
  CheckResult,
  CheckerReport,
  Classification,
  JoomlaMeta,
  LinkAuditIssue,
  LinkAuditResult,
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
import { parseSchema } from "../schema/generator";

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
  /**
   * The run's verified Google CID. This is the GMB vs No-GMB signal: present =>
   * the page is a Google Business Profile page; absent => a No-GMB page. Drives
   * the schema-rules checker.
   */
  verifiedCid?: string | null;
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

/**
 * 3b. Placeholder / empty link hrefs. An anchor whose href is empty (`href=""`),
 * a bare fragment (`href="#"`), or a `javascript:` stub is a dead link that
 * looks like navigation but goes nowhere. These slip past the registry checker
 * (they are not internal links) so they get their own gate.
 */
export function checkPlaceholderLinks(html: string): CheckResult {
  // Note: this regex uses `*` (not `+`) so it also captures empty href values,
  // which extractHrefs intentionally skips.
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']*)["']/gi;
  const bad: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = (m[1] ?? "").trim();
    if (raw === "") {
      bad.push('empty href (href="")');
    } else if (raw === "#") {
      bad.push('bare fragment (href="#")');
    } else if (/^javascript:/i.test(raw)) {
      bad.push(`javascript: stub (${raw})`);
    }
  }
  if (bad.length === 0) {
    return pass(
      "placeholder-links",
      "No placeholder links",
      "No empty or placeholder href values found.",
    );
  }
  return fail(
    "placeholder-links",
    "No placeholder links",
    "error",
    `${bad.length} placeholder/empty link href(s) found. Give each link a real destination or remove it.`,
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

/** URLs that indicate a Google Business Profile / Google Maps listing. */
function isMapsUrl(url: string): boolean {
  return /(?:google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps|\bg\.page\b)/i.test(
    url,
  );
}

interface SchemaWalk {
  keys: Set<string>;
  sameAs: string[];
  /** Concrete CID values found: `cid` property values + `?cid=`/`&cid=` URL params. */
  cidValues: Set<string>;
}

/** Collect every string leaf under a node (for sameAs values, which may nest). */
function collectStrings(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const n of node) collectStrings(n, out);
  } else if (typeof node === "string") {
    out.push(node);
  } else if (node && typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) collectStrings(v, out);
  }
}

/** Pull every `?cid=<digits>` / `&cid=<digits>` value out of a URL-ish string. */
function extractCidParams(s: string, out: Set<string>): void {
  const re = /[?&]cid=(\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) out.add(m[1]!);
}

/**
 * Recursively index a parsed JSON-LD object. Records lowercased keys (for
 * forbidden-field detection), sameAs values, and — crucially for GMB — the
 * concrete CID *values* found in `cid` properties and `cid=` URL params, so the
 * GMB check can require the exact verified CID rather than mere key presence.
 */
function walkSchema(node: unknown, acc: SchemaWalk): void {
  if (Array.isArray(node)) {
    for (const item of node) walkSchema(item, acc);
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const lk = k.toLowerCase();
      acc.keys.add(lk);
      if (lk === "sameas") collectStrings(v, acc.sameAs);
      if (lk === "cid" && (typeof v === "string" || typeof v === "number")) {
        acc.cidValues.add(String(v).trim());
      }
      walkSchema(v, acc);
    }
    return;
  }
  if (typeof node === "string") extractCidParams(node, acc.cidValues);
}

/**
 * 14. GMB vs No-GMB JSON-LD schema rules. `verifiedCid` is the GMB signal: a run
 * WITH a verified CID is a Google Business Profile page whose schema must carry
 * that CID; a run WITHOUT one is a No-GMB page whose schema must not leak any
 * location-identity signals (a CID, street address, postal code, phone, map
 * link, or ratings/reviews). This gates the AI-produced schema deterministically
 * without a page-type enum or variant refactor. It reports/gates only; it never
 * rewrites the schema. Reuses the shared `parseSchema` helper.
 */
export function checkSchemaRules(
  schema: string | null | undefined,
  verifiedCid: string | null | undefined,
): CheckResult {
  if (!schema || !schema.trim()) {
    return pass("schema-rules", "Schema GMB rules", "No schema provided yet; skipped.");
  }
  const parsed = parseSchema(schema);
  if (!parsed) {
    // Validity is enforced upstream (the schema phase falls back to the
    // deterministic generator on unparseable engine output), so a non-JSON
    // schema is out of scope for this rule check.
    return pass(
      "schema-rules",
      "Schema GMB rules",
      "Schema is not parseable JSON-LD; GMB rule checks skipped (validity handled elsewhere).",
    );
  }
  const acc: SchemaWalk = { keys: new Set(), sameAs: [], cidValues: new Set() };
  walkSchema(parsed, acc);

  const cid = verifiedCid?.trim() || null;
  // A CID is only "present" when a concrete value was found in a `cid` property
  // or a `cid=` URL param — a bare `cid` key with no value, or CID-looking
  // digits buried in unrelated copy, do not count.
  const hasCid = acc.cidValues.size > 0;

  if (cid) {
    // GMB page: the schema must carry the EXACT verified CID, not just any CID.
    if (acc.cidValues.has(cid)) {
      return pass(
        "schema-rules",
        "Schema GMB rules",
        "GMB page: schema carries the verified Google CID.",
      );
    }
    const found = [...acc.cidValues];
    const detail =
      found.length > 0
        ? `schema carries CID(s) [${found.join(", ")}] but not the verified CID "${cid}"`
        : `verified CID "${cid}" not found in schema`;
    return fail(
      "schema-rules",
      "Schema GMB rules",
      "error",
      "GMB page (verified CID present) but the schema is missing the verified Google CID. Add the correct CID so the page resolves to the verified Business Profile.",
      [detail],
    );
  }

  // No-GMB page: the schema must not leak Google Business Profile signals.
  const offending: string[] = [];
  if (hasCid) offending.push("contains a Google CID");
  if (acc.keys.has("streetaddress")) offending.push("contains streetAddress");
  if (acc.keys.has("postalcode")) offending.push("contains postalCode");
  if (acc.keys.has("telephone")) offending.push("contains telephone");
  if (acc.keys.has("hasmap")) offending.push("contains hasMap");
  if (acc.sameAs.some(isMapsUrl)) offending.push("contains a Google Maps sameAs link");
  if (acc.keys.has("aggregaterating")) offending.push("contains aggregateRating");
  if (acc.keys.has("review") || acc.keys.has("reviews")) offending.push("contains review(s)");

  if (offending.length === 0) {
    return pass(
      "schema-rules",
      "Schema GMB rules",
      "No-GMB page: schema is free of CID, address, phone, map, and rating signals.",
    );
  }
  return fail(
    "schema-rules",
    "Schema GMB rules",
    "error",
    "No-GMB page: schema contains forbidden Google Business Profile signals. Remove them so the page does not claim a verified listing it does not have.",
    offending,
  );
}

/**
 * 15. GMB schema completeness. A GMB page (one WITH a verified CID) must carry
 * the local-business essentials a Google Business Profile page needs:
 * `telephone`, a street address, and opening hours
 * (`openingHoursSpecification`, or a bare `openingHours`). This complements
 * {@link checkSchemaRules} — that rule guards the *identity* (the exact CID and
 * the No-GMB leak ban); this one guards *completeness* of the GMB local-business
 * fields. It fires ONLY for GMB pages (verifiedCid present); a No-GMB page has
 * no such fields by design and is skipped. Reports/gates only; never rewrites.
 */
export function checkSchemaCompleteness(
  schema: string | null | undefined,
  verifiedCid: string | null | undefined,
): CheckResult {
  const cid = verifiedCid?.trim() || null;
  if (!cid) {
    // No-GMB page: completeness of GMB fields does not apply.
    return pass(
      "schema-completeness",
      "Schema GMB completeness",
      "No-GMB page (no verified CID); GMB completeness check skipped.",
    );
  }
  if (!schema || !schema.trim()) {
    return pass(
      "schema-completeness",
      "Schema GMB completeness",
      "No schema provided yet; skipped.",
    );
  }
  const parsed = parseSchema(schema);
  if (!parsed) {
    return pass(
      "schema-completeness",
      "Schema GMB completeness",
      "Schema is not parseable JSON-LD; completeness check skipped (validity handled elsewhere).",
    );
  }
  const acc: SchemaWalk = { keys: new Set(), sameAs: [], cidValues: new Set() };
  walkSchema(parsed, acc);

  const missing: string[] = [];
  if (!acc.keys.has("telephone")) missing.push("missing telephone");
  if (!acc.keys.has("streetaddress")) missing.push("missing streetAddress");
  if (!acc.keys.has("openinghoursspecification") && !acc.keys.has("openinghours")) {
    missing.push("missing openingHoursSpecification");
  }

  if (missing.length === 0) {
    return pass(
      "schema-completeness",
      "Schema GMB completeness",
      "GMB page: schema carries telephone, street address, and opening hours.",
    );
  }
  return fail(
    "schema-completeness",
    "Schema GMB completeness",
    "error",
    "GMB page (verified CID present) but the schema is missing required local-business fields. Add telephone, full street address, and openingHoursSpecification so the verified Business Profile resolves completely.",
    missing,
  );
}

/**
 * The checker IDs that constitute the link audit. These are carved out of the
 * full report so the dashboard can present links as their own pre-publish gate
 * and so a human override can excuse exactly these errors (and nothing else).
 */
export const LINK_CHECK_IDS = [
  "insecure-links",
  "placeholder-links",
  "known-redirects",
  "url-registry",
  "sacred-links",
] as const;

/** Derive the dedicated link-audit view from a set of completed checks. */
export function deriveLinkAudit(checks: CheckResult[]): LinkAuditResult {
  const ids = new Set<string>(LINK_CHECK_IDS);
  const linkChecks = checks.filter((c) => ids.has(c.id));
  const failing = linkChecks.filter((c) => !c.passed && c.severity === "error");
  const offendingLinks: LinkAuditIssue[] = [];
  for (const c of failing) {
    if (c.details.length === 0) {
      offendingLinks.push({ checkId: c.id, label: c.label, detail: c.message });
    } else {
      for (const d of c.details) {
        offendingLinks.push({ checkId: c.id, label: c.label, detail: d });
      }
    }
  }
  return {
    passed: failing.length === 0,
    errorCount: failing.length,
    offendingLinks,
    checks: linkChecks,
  };
}

/**
 * Count the checker errors that should block publish. Always counts non-link
 * errors. Link-audit errors are excused only when a human override is in effect,
 * so a recorded override lets a run past a failing link audit without disabling
 * the rest of the safety net.
 */
export function blockingErrorCount(
  report: CheckerReport,
  linkAuditOverridden: boolean,
): number {
  const linkIds = new Set<string>(LINK_CHECK_IDS);
  return report.checks.filter((c) => {
    if (c.passed || c.severity !== "error") return false;
    if (linkAuditOverridden && linkIds.has(c.id)) return false;
    return true;
  }).length;
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
    checkPlaceholderLinks(input.html),
    checkKnownRedirects(input.html),
    checkUrlRegistry(input.html, input.registry),
    checkSacredLinks(input.html, input.registry, track),
    ...checkWordCount(input.html, input.registry, pageType, afterAudit),
    checkFacilityLanguage(input.html, input.city),
    checkIcons(input.html, input.approvedIconClasses),
    checkCertScope(input.html),
    checkEntityConsistency(input.html, input.schema, input.businessName, input.entities),
    checkSchemaRules(input.schema, input.verifiedCid),
    checkSchemaCompleteness(input.schema, input.verifiedCid),
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
    linkAudit: deriveLinkAudit(checks),
  };
}
