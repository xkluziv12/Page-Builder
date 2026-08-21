import type Anthropic from "@anthropic-ai/sdk";
import type { HostnameResolver, SeoCompetitor, SeoCredentials } from "../seo";

/** What the caller asks for: a target page URL and an optional county. */
export interface MetaResearchInput {
  /** Full http(s) URL of the page being rebuilt. */
  url: string;
  /** Optional county (the VA may know it); enables the "free pickup" line. */
  county?: string | null;
}

/** Injected backends — keeps the engine free of env/client wiring (testable). */
export interface MetaResearchDeps {
  anthropic: Anthropic;
  creds: SeoCredentials;
  /** Optional fetch override (tests). */
  fetchImpl?: typeof fetch;
  /** Optional DNS resolver override (tests). */
  resolveHostname?: HostnameResolver;
  /** Optional Anthropic model override. */
  model?: string;
}

export type NicheConfidence = "high" | "medium" | "low";

/**
 * Research-backed meta for a single No-GMB page. Every field is grounded in a
 * LIVE fetch of the page plus the LIVE SERP for the detected niche — not a static
 * template. The deterministic generator in the tool remains the instant fallback.
 */
export interface MetaResearchResult {
  url: string;
  /** Resolved target city. */
  city: string;
  /** USPS 2-letter state (uppercase). */
  state: string;
  /** Full state name. */
  stateName: string;
  /** County, when supplied. */
  county: string | null;
  /** The ACTUAL niche, detected from page CONTENT (not the URL/title). */
  detectedNiche: string;
  /** Specific services the model found on the page. */
  services: string[];
  /** Model confidence in the detected niche. */
  nicheConfidence: NicheConfidence;
  /** One-sentence justification for the detected niche. */
  nicheReasoning: string;
  /** Final Browser Page Title (paste verbatim). */
  browserPageTitle: string;
  /** Final Meta Description (paste verbatim). */
  metaDescription: string;
  /** Final keywords, comma-joined (paste verbatim). */
  keywords: string;
  /** The same keywords as an array. */
  keywordList: string[];
  /** Why this meta should beat the ranking competitors. */
  rationale: string;
  /** Competitor titles currently ranking for the niche + city. */
  competitors: SeoCompetitor[];
  /** "People also ask" questions surfaced by the SERP. */
  peopleAlsoAsk: string[];
  /** Related searches / keywords surfaced by the SERP. */
  relatedKeywords: string[];
  /** Competition bucket from the SEO intel. */
  competition: string;
  /** Whether the page content corroborated the resolved location. */
  locationVerified: boolean;
  /** Whether city/state came from the URL slug or the page content. */
  locationSource: "url" | "page";
  /** Which providers contributed (e.g. ["serpapi"]). */
  sources: string[];
  /** ISO timestamp the research ran. */
  fetchedAt: string;
}
