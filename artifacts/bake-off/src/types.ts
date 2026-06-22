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

export interface ModelScores {
  audit: number;
  structure: number;
  schema: number;
  links: number;
  wordCount: number;
  speed: number;
  htmlMatch: number;
  visualMatch: number;
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
