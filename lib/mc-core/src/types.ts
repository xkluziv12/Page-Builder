import type { SeoIntel } from "./seo/types";

export type PhaseName = "research" | "build" | "audit" | "schema" | "publish";

export type Track = "page" | "blog";

export type EngineName = "claude" | "replit";

export type Classification = "NEW_BUILD" | "REVAMP" | "LIGHT_TOUCH";

export type Competition = "LOW" | "MEDIUM" | "HIGH";

export type PageType = "HUB" | "SPOKE" | "NATIONAL";

export type Severity = "error" | "warning" | "info";

export interface RegistryLink {
  label: string;
  url: string;
}

export interface CheckResult {
  id: string;
  label: string;
  severity: Severity;
  passed: boolean;
  message: string;
  details: string[];
}

/** A single offending link surfaced by the dedicated link audit. */
export interface LinkAuditIssue {
  /** The checker that flagged it (e.g. "insecure-links", "url-registry"). */
  checkId: string;
  /** Human label of the originating checker. */
  label: string;
  /** The specific offending link or message. */
  detail: string;
}

/**
 * A focused view of the link-related checkers, carved out of the full checker
 * report so the dashboard can present "links: clean / failed" as its own
 * pre-publish gate, separate from the rest of the checker output.
 */
export interface LinkAuditResult {
  passed: boolean;
  errorCount: number;
  offendingLinks: LinkAuditIssue[];
  /** The underlying link checks (pass + fail) for transparency. */
  checks: CheckResult[];
}

/** A recorded human decision to publish past a failing link audit. */
export interface LinkAuditOverride {
  /** Operator who applied the override. */
  by: string;
  /** ISO timestamp of when the override was applied. */
  at: string;
  /** Optional reason / justification. */
  reason: string | null;
}

export interface CheckerReport {
  passed: boolean;
  errorCount: number;
  warningCount: number;
  wordCount: number;
  ranAt: string;
  checks: CheckResult[];
  /** Dedicated link-audit view derived from the link-related checks. */
  linkAudit: LinkAuditResult;
}

export interface EntityFlag {
  name: string;
  field: string;
  issue: string;
  verified: boolean;
}

export interface ResearchBrief {
  summary: string | null;
  entities: Record<string, unknown>[];
  sources: string[];
  flags: EntityFlag[];
  raw: string | null;
}

export interface JoomlaMeta {
  title: string | null;
  description: string | null;
  keywords: string | null;
  alias: string | null;
}

/**
 * The merged, configurable safeguard registry. The APPROVED_URL_ALLOWLIST in the
 * source audit prompt shipped empty, so the registry is intentionally
 * data-driven: callers seed it (from defaults + DB + per-run handoff URLs) and
 * the checkers validate against the merged set rather than a hard-coded list.
 */
export interface UrlRegistry {
  baseDomain: string;
  sacredLinks: RegistryLink[];
  imageLibrary: RegistryLink[];
  industryLinks: RegistryLink[];
  allowlist: RegistryLink[];
  handoffUrls: string[];
  /**
   * Per-run URLs that already exist on the page being revamped/light-touched.
   * These are genuine, already-published internal links and must count as valid
   * for the URL-registry checker — otherwise REVAMP/LIGHT_TOUCH pages that keep
   * their existing internal links would hard-fail despite linking to real URLs.
   */
  existingUrls: string[];
  wordCountFloor: number;
}

export interface RunContext {
  city: string;
  state: string;
  track: Track;
  classification: Classification;
  competition: Competition;
  pageType: PageType;
  niche: string;
  existingUrls: string[];
  handoff: string | null;
  verifiedCid: string | null;
  designBibleHash: string | null;
  blogTopic: string | null;
  researchBrief: ResearchBrief | null;
  /**
   * Live SEO intelligence gathered per-URL (SerpAPI + DataForSEO). Replaces the
   * quarterly "SEO Data 2026" spreadsheet VAs used to upload by hand. Null until
   * gathered (or when intel could not be resolved).
   */
  seoIntel: SeoIntel | null;
  registry: UrlRegistry;
}
