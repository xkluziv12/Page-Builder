export interface CheckResult {
  id: string;
  label: string;
  severity: "error" | "warning" | "info";
  passed: boolean;
  message: string;
  details?: string[];
}

export interface LinkAuditIssue {
  checkId: string;
  label: string;
  detail: string;
}

export interface LinkAuditResult {
  passed: boolean;
  errorCount: number;
  offendingLinks: LinkAuditIssue[];
  checks: CheckResult[];
}

export interface CheckerReport {
  passed: boolean;
  errorCount: number;
  warningCount: number;
  wordCount: number;
  ranAt: string | null;
  checks: CheckResult[];
  linkAudit: LinkAuditResult;
}

export interface ResearchBrief {
  summary?: string | null;
  entities?: Array<Record<string, unknown>>;
  sources?: string[];
  [key: string]: unknown;
}

export interface PhaseTiming {
  phase: string;
  ms: number;
  summary: string;
  errorCount: number;
  warningCount: number;
  wordCount: number;
}

export interface TokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}

export interface ModelScores {
  audit: number;
  structure: number;
  schema: number;
  links: number;
  wordCount: number;
  speed: number;
  htmlMatch: number;
  /** Headline visual score: rendered-screenshot verdict when available, else token proxy. */
  visualMatch: number;
  /** Perceptual pixel-diff similarity of the rendered screenshots, or null. */
  visualPixel: number | null;
  /** Vision-LLM "how close does it look" rating (0-100), or null if unavailable. */
  visualLlm: number | null;
  /** Legacy design-token proxy, kept for transparency. */
  visualTokens: number;
  composite: number;
}

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  inputUsd: number;
  outputUsd: number;
  totalUsd: number;
  pricePerMInput: number;
  pricePerMOutput: number;
  basis: string;
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
  /**
   * Resolved reasoning-effort setting for this run ("low"/"medium"/"high",
   * "provider-default", "not-applicable", or "not-supported"). Null/absent for
   * historical results recorded before this field existed — render as "unknown".
   */
  effort?: string | null;
  /** Relative path (under public/) to this model's rendered screenshot. */
  screenshot: string | null;
  /** USD cost for the run — MEASURED from real token usage when available, else a
   * character-based estimate. `costEstimate.basis` states which. */
  costEstimate?: CostEstimate | null;
  /** Real provider-reported token usage summed across all turns, when captured. */
  usage?: TokenUsage | null;
  /** Relative path (under public/) to this model's full per-turn transcript file. */
  transcriptPath?: string | null;
}

export interface ScenarioResult {
  id: string;
  label: string;
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
  /** Relative path (under public/) to the real reference page screenshot. */
  referenceScreenshot: string | null;
}
