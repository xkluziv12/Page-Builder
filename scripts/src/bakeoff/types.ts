import type { CheckerReport, LinkAuditResult, ResearchBrief } from "@workspace/mc-core";

export interface PhaseTiming {
  phase: string;
  ms: number;
  summary: string;
  errorCount: number;
  warningCount: number;
  wordCount: number;
}

export interface ModelScores {
  /** Quality of the checker pass (errors/warnings on the final page). */
  audit: number;
  /** Design-skeleton completeness (structural signals present). */
  structure: number;
  /** JSON-LD validity + schema-rules checker. */
  schema: number;
  /** Link audit (sacred links, allowlist, insecure links). */
  links: number;
  /** Word count vs. the floor. */
  wordCount: number;
  /** Speed relative to the fastest successful model. */
  speed: number;
  /** Closeness to the real published page: tag structure + visible-text overlap. */
  htmlMatch: number;
  /**
   * Headline visual closeness to the real page (0-100). When screenshots are
   * available this is the rendered-image verdict (mean of pixel + vision-LLM);
   * otherwise it falls back to the design-token proxy.
   */
  visualMatch: number;
  /** Perceptual pixel-diff similarity of the rendered screenshots, or null. */
  visualPixel: number | null;
  /** Vision-LLM "how close does it look" rating (0-100), or null if unavailable. */
  visualLlm: number | null;
  /** Legacy design-token proxy (colors/CSS vars/fonts/classes) — kept for transparency. */
  visualTokens: number;
  /** Weighted overall (0-100). */
  composite: number;
}

export interface ModelResult {
  id: string;
  label: string;
  provider: string;
  model: string;
  status: "ok" | "error";
  error: string | null;
  research: ResearchBrief | null;
  html: string | null;
  schema: string | null;
  schemaValid: boolean;
  checkerReport: CheckerReport | null;
  linkAudit: LinkAuditResult | null;
  timings: PhaseTiming[];
  totalMs: number;
  scores: ModelScores | null;
  /** Relative path (under the viewer's public dir) to this model's rendered screenshot. */
  screenshot: string | null;
}

/**
 * One bake-off scenario: the same four models run against the SAME grounding,
 * differing only by the context they are handed. The "no-gmb" scenario uses the
 * exact production context (which omits an explicit page_url / GMB block); the
 * "gmb" scenario hands every model an identical enriched context (explicit
 * page_url + GMB data block). Keeping them as sibling scenarios — rather than
 * patching only OpenAI's prompt — preserves the apples-to-apples comparison.
 */
export interface ScenarioResult {
  id: string;
  label: string;
  /** One-line explanation of what context this scenario fed the models. */
  description: string;
  notes: string[];
  models: ModelResult[];
}

export interface BakeoffResults {
  ranAt: string;
  target: {
    url: string;
    city: string;
    state: string;
    niche: string;
    pageType: string;
    classification: string;
    competition: string;
  };
  grounding: { source: string; content: string };
  scenarios: ScenarioResult[];
  /** Relative path (under the viewer's public dir) to the real reference page screenshot. */
  referenceScreenshot: string | null;
}
