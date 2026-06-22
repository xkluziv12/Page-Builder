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
  /** Design-language closeness to the real page: colors/CSS vars/fonts/classes. */
  visualMatch: number;
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
  notes: string[];
  models: ModelResult[];
}
