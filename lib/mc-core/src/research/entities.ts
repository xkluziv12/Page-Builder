import { fetchSerp } from "../seo/serpapi";
import { stateNameForAbbr } from "../seo/url";
import type { ResearchInput } from "./provider";

/** A function that gathers candidate local entities for a locality. */
export type EntityFetchFn = (input: ResearchInput) => Promise<Record<string, unknown>[]>;

/**
 * Build an {@link EntityFetchFn} backed by the already-wired SerpAPI client. It
 * returns the live organic competitors for the locality as entity seeds (name +
 * source link) for the synthesis step to ground against. The key is checked at
 * call time so a missing key fails the research phase loudly.
 */
export function createSerpEntities(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): EntityFetchFn {
  return async (input: ResearchInput): Promise<Record<string, unknown>[]> => {
    if (!apiKey || !apiKey.trim()) {
      throw new Error(
        "SERPAPI_API_KEY is not configured; cannot gather local entities for research.",
      );
    }
    const query = `${input.niche} ${input.city} ${input.state}`.replace(/\s+/g, " ").trim();
    const location = `${input.city}, ${stateNameForAbbr(input.state)}, United States`;
    const serp = await fetchSerp({ apiKey, query, location, fetchImpl });
    return serp.organic
      .filter((c) => c.title && c.link)
      .map((c) => ({ name: c.title, source: c.link }));
  };
}
