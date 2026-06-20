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

export interface CheckerReport {
  passed: boolean;
  errorCount: number;
  warningCount: number;
  wordCount: number;
  ranAt: string;
  checks: CheckResult[];
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
  registry: UrlRegistry;
}
