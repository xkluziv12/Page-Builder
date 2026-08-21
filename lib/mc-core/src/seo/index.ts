import { deriveCompetition } from "./competition";
import { fetchKeywordMetrics } from "./dataforseo";
import { fetchSerp } from "./serpapi";
import { stateNameForAbbr } from "./url";
import type { SeoCredentials, SeoIntel, SeoKeyword } from "./types";

export * from "./types";
export {
  parseCityState,
  stateNameForAbbr,
  normalizeStateToAbbr,
  normalizeTargetUrl,
  isPrivateHostname,
  isPublicHostname,
  resolveHostname,
  fetchWithValidatedDns,
  fetchWithPageLimits,
  PageFetchLimitError,
  PAGE_FETCH_TIMEOUT_MS,
  PAGE_FETCH_MAX_BYTES,
} from "./url";
export type { ParsedLocation, HostnameResolver } from "./url";
export {
  deriveClassification,
  probeTargetPage,
  estimateWordCount,
  LIGHT_TOUCH_WORD_FLOOR,
} from "./classify";
export { extractLocations, cityNamesEquivalent } from "./location";
export { deriveCompetition } from "./competition";
export type { CompetitionSignals, CompetitionResult } from "./competition";
export { fetchSerp, parseSerp, SERPAPI_BASE } from "./serpapi";
export type { SerpResult } from "./serpapi";
export { fetchKeywordMetrics, parseKeywordOverview, DATAFORSEO_BASE } from "./dataforseo";
export type { DataForSeoResult } from "./dataforseo";

export interface SeoIntelInput {
  city: string;
  /** USPS 2-letter abbreviation. */
  state: string;
  niche: string;
  /** Optional injected fetch (tests). */
  fetchImpl?: typeof fetch;
}

/**
 * Gather live SEO intelligence for a target locality. SerpAPI is required and
 * fails loudly (this data replaces a previously-mandatory spreadsheet, so a
 * silent gap is worse than a hard stop). DataForSEO is best-effort enrichment:
 * if its credentials are missing or the call fails, we fall back to SERP-only
 * competition and surface which sources actually contributed.
 */
export async function fetchSeoIntel(
  input: SeoIntelInput,
  creds: SeoCredentials,
): Promise<SeoIntel> {
  if (!creds.serpApiKey) {
    throw new Error(
      "SerpAPI key is not configured (SERPAPI_API_KEY). Cannot gather the live SEO data that replaces the quarterly SEO spreadsheet.",
    );
  }
  const query = `${input.niche} ${input.city} ${input.state}`.replace(/\s+/g, " ").trim();
  const location = `${input.city}, ${stateNameForAbbr(input.state)}, United States`;
  const sources: string[] = [];

  const serp = await fetchSerp({
    apiKey: creds.serpApiKey,
    query,
    location,
    fetchImpl: input.fetchImpl,
  });
  sources.push("serpapi");

  let primaryKeyword: SeoKeyword | null = null;
  let relatedKeywords: SeoKeyword[] = [];
  let difficulty: number | null = null;

  if (creds.dataForSeoLogin && creds.dataForSeoPassword) {
    const keywordCandidates = [query, ...serp.relatedSearches].slice(0, 10);
    try {
      const dfs = await fetchKeywordMetrics({
        login: creds.dataForSeoLogin,
        password: creds.dataForSeoPassword,
        keywords: keywordCandidates,
        fetchImpl: input.fetchImpl,
      });
      primaryKeyword =
        dfs.keywords.find((k) => k.keyword.toLowerCase() === query.toLowerCase()) ??
        dfs.primaryKeyword;
      relatedKeywords = dfs.keywords.filter((k) => k !== primaryKeyword);
      difficulty = primaryKeyword?.difficulty ?? null;
      sources.push("dataforseo");
    } catch {
      // Enrichment failure is non-fatal: keep SERP-only intel.
    }
  }

  if (relatedKeywords.length === 0) {
    relatedKeywords = serp.relatedSearches.map((kw) => ({
      keyword: kw,
      searchVolume: null,
      difficulty: null,
      competition: null,
    }));
  }

  const { competition, score } = deriveCompetition({
    adsCount: serp.adsCount,
    localPackCount: serp.localPackCount,
    organicCount: serp.organic.length,
    difficulty,
  });

  return {
    query,
    location,
    competition,
    competitionScore: score,
    primaryKeyword,
    relatedKeywords,
    topCompetitors: serp.organic,
    localPackCount: serp.localPackCount,
    adsCount: serp.adsCount,
    peopleAlsoAsk: serp.peopleAlsoAsk,
    fetchedAt: new Date().toISOString(),
    sources,
  };
}
