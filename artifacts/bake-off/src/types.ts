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

/**
 * Attribution for a single produced artifact — what actually produced it,
 * never inferred. Mirrors the shared vocabulary in
 * @workspace/mc-core (lib/mc-core/src/engine/provenance.ts); duplicated here
 * (not imported) since this viewer intentionally has no runtime dependency on
 * mc-core, matching this file's existing pattern of locally-defined shapes
 * shared with the generation harness. Absent on a ModelResult/TranscriptEntry
 * means "not recorded" — render that explicitly, never assume direct-api.
 */
export interface Provenance {
  sourceKind: string;
  provider: string | null;
  model: string | null;
  transport: string;
  requestedEngine: string | null;
  engineMode: string | null;
  phase: string | null;
  attempt: number | null;
  candidate: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  fallback: boolean;
  fallbackReason: string | null;
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
  /**
   * VARIANT id — unique within a scenario, and the key used in the detail-page
   * route. A cell run at an explicit reasoning effort is `<baseId>.<effort>`
   * (e.g. `gemini-flash.low`); a provider-default / control cell is the bare
   * base id, so ids recorded before variants existed still resolve.
   */
  id: string;
  /**
   * The model SLOT this variant belongs to (`gemini-flash` for
   * `gemini-flash.low`), so the catalog can group a family's effort variants
   * together. Absent on results recorded before variants existed — derive it
   * from the id, never guess an effort.
   */
  baseId?: string;
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
  /**
   * The effort level the OPERATOR asked for, or null when nothing was requested
   * (a provider-default / control cell). Recorded separately from `effort` so a
   * control run can never be read as a low/medium run. Absent on older results.
   */
  effortRequested?: string | null;
  /**
   * Whether the provider/tag exposes a REAL effort control at all. False means
   * this is a single provider-default control cell and no effort tier can be
   * claimed for it. Absent on older results — render as unknown, never assume.
   */
  effortSupported?: boolean;
  /** Relative path (under public/) to this model's rendered screenshot. */
  screenshot: string | null;
  /** USD cost for the run — MEASURED from real token usage when available, else a
   * character-based estimate. `costEstimate.basis` states which. */
  costEstimate?: CostEstimate | null;
  /** Real provider-reported token usage summed across all turns, when captured. */
  usage?: TokenUsage | null;
  /** Relative path (under public/) to this model's full per-turn transcript file. */
  transcriptPath?: string | null;
  /** Accepted attribution for this result. Absent = not recorded (never assume direct-api for old data). */
  provenance?: Provenance | null;
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
