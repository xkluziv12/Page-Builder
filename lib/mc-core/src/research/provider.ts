import type { ResearchBrief } from "../types";

/** The locality + track a research brief is requested for. */
export interface ResearchInput {
  city: string;
  state: string;
  niche: string;
  track: string;
  blogTopic?: string | null;
  verifiedCid?: string | null;
}

/**
 * The research seam. The pipeline depends ONLY on this interface — it never
 * imports a concrete research client (n8n webhook, Perplexity, etc.). This
 * mirrors the {@link AIEngine} seam: swapping the research backend is a wiring
 * change, not a pipeline change.
 */
export interface ResearchProvider {
  readonly name: string;
  research(input: ResearchInput): Promise<ResearchBrief>;
}
