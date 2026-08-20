/**
 * Post-publish QC types. These checks run on the DASHBOARD (Replit) against the
 * LIVE city URL after a page is published — never through the Joomla task agent.
 * The schema.org and Google Rich Results validators do NOT flag duplicate schema
 * blocks, conflicting `@id`s, or malformed JSON-LD, so that integrity scan lives
 * here alongside a GTmetrix speed / Core Web Vitals check.
 */

/** Pass/fail thresholds for the GTmetrix speed check. */
export const QC_THRESHOLDS = {
  /** Performance score (0-100) below this fails. */
  performanceScoreMin: 85,
  /** Largest Contentful Paint above this (milliseconds) fails. */
  lcpMaxMs: 2500,
} as const;

/**
 * Page-level singleton schema.org types — each should appear at most once per
 * page. A second occurrence (e.g. two LocalBusiness blocks) is what the public
 * validators silently ignore, so we flag it. Genuinely repeatable types
 * (Service, Question, Offer, ListItem, …) are intentionally NOT in this set.
 */
export const SINGLETON_SCHEMA_TYPES = [
  "LocalBusiness",
  "Organization",
  "Corporation",
  "WebSite",
  "WebPage",
  "BreadcrumbList",
  "FAQPage",
  "Article",
  "BlogPosting",
  "NewsArticle",
] as const;

export interface GtmetrixMetrics {
  /** GTmetrix Performance score, 0-100. */
  performanceScore: number | null;
  /** GTmetrix Structure score, 0-100. */
  structureScore: number | null;
  /** Largest Contentful Paint, milliseconds. */
  lcp: number | null;
  /** Total Blocking Time, milliseconds. */
  tbt: number | null;
  /** Cumulative Layout Shift, unitless. */
  cls: number | null;
  /** Time To First Byte, milliseconds. */
  ttfb: number | null;
  /** Fully-loaded time, milliseconds. */
  fullyLoadedTime: number | null;
  /** Human-viewable GTmetrix report URL. */
  reportUrl: string | null;
}

export interface GtmetrixCheck {
  /** Whether the GTmetrix test actually completed and produced metrics. */
  ran: boolean;
  /** Whether the metrics cleared the thresholds. False whenever `ran` is false. */
  passed: boolean;
  metrics: GtmetrixMetrics | null;
  /** Threshold failures (e.g. "Performance score 71 < 85"). */
  failReasons: string[];
  /** Transport / API error, when the test could not be run. */
  error: string | null;
}

export interface JsonLdBlock {
  /** Zero-based position of this `<script type="application/ld+json">` block. */
  index: number;
  /** Whether the block parsed as valid JSON. */
  valid: boolean;
  /** Every `@type` found in the block (flattened across `@graph` nodes). */
  types: string[];
  /** Every `@id` defined on a typed node in the block. */
  ids: string[];
  /** Parse error message when the block is invalid JSON. */
  error: string | null;
}

export interface JsonLdScan {
  /** Whether the live HTML was fetched and parsed. */
  ran: boolean;
  /** True when there are no duplicate singleton types, id conflicts, or bad JSON. */
  passed: boolean;
  /** Number of `<script type="application/ld+json">` blocks found. */
  blockCount: number;
  blocks: JsonLdBlock[];
  /** Singleton `@type` values that appeared on more than one node. */
  duplicateTypes: string[];
  /** `@id` values defined on more than one typed node. */
  conflictingIds: string[];
  /** Indexes of blocks that failed to parse as JSON. */
  invalidBlockIndexes: number[];
  /** Human-readable findings (duplicates, conflicts, parse failures, notes). */
  issues: string[];
  /** Fetch / transport error, when the live HTML could not be retrieved. */
  error: string | null;
}

export interface QcReport {
  /** The live URL the QC ran against. */
  url: string;
  /** ISO timestamp when the QC completed. */
  ranAt: string;
  /** Overall pass: both checks ran AND both passed. */
  passed: boolean;
  gtmetrix: GtmetrixCheck;
  jsonLd: JsonLdScan;
}
