import type { SeoCompetitor } from "./types";

export const SERPAPI_BASE = "https://serpapi.com/search.json";

export interface SerpResult {
  organic: SeoCompetitor[];
  localPackCount: number;
  adsCount: number;
  peopleAlsoAsk: string[];
  relatedSearches: string[];
}

interface SerpApiOptions {
  apiKey: string;
  query: string;
  location: string;
  fetchImpl?: typeof fetch;
}

/**
 * Fetch a live Google SERP via SerpAPI. Throws on transport / non-OK / API-error
 * responses so the caller fails loudly rather than building on missing SEO
 * intelligence. Response parsing is defensive — SerpAPI's shape is not ours to
 * control — but a hard failure is never swallowed.
 */
export async function fetchSerp(opts: SerpApiOptions): Promise<SerpResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    engine: "google",
    q: opts.query,
    location: opts.location,
    google_domain: "google.com",
    gl: "us",
    hl: "en",
    num: "20",
    api_key: opts.apiKey,
  });
  const res = await fetchImpl(`${SERPAPI_BASE}?${params.toString()}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `SerpAPI request failed (${res.status} ${res.statusText}): ${body.slice(0, 300)}`,
    );
  }
  const data = (await res.json()) as Record<string, unknown>;
  if (typeof data.error === "string") {
    throw new Error(`SerpAPI returned an error: ${data.error}`);
  }
  return parseSerp(data);
}

export function parseSerp(data: Record<string, unknown>): SerpResult {
  const organicRaw = Array.isArray(data.organic_results) ? data.organic_results : [];
  const organic: SeoCompetitor[] = organicRaw
    .slice(0, 10)
    .map((r) => {
      const row = r as Record<string, unknown>;
      return {
        title: typeof row.title === "string" ? row.title : "",
        link: typeof row.link === "string" ? row.link : "",
        position: typeof row.position === "number" ? row.position : null,
      };
    })
    .filter((c) => c.link);

  const local = data.local_results as Record<string, unknown> | unknown[] | undefined;
  let localPackCount = 0;
  if (Array.isArray(local)) {
    localPackCount = local.length;
  } else if (local && typeof local === "object" && Array.isArray((local as Record<string, unknown>).places)) {
    localPackCount = ((local as Record<string, unknown>).places as unknown[]).length;
  }

  const ads = data.ads;
  const adsCount = Array.isArray(ads) ? ads.length : 0;

  const paaRaw = Array.isArray(data.related_questions) ? data.related_questions : [];
  const peopleAlsoAsk = paaRaw
    .map((q) => {
      const row = q as Record<string, unknown>;
      return typeof row.question === "string" ? row.question : "";
    })
    .filter(Boolean);

  const relatedRaw = Array.isArray(data.related_searches) ? data.related_searches : [];
  const relatedSearches = relatedRaw
    .map((q) => {
      const row = q as Record<string, unknown>;
      return typeof row.query === "string" ? row.query : "";
    })
    .filter(Boolean);

  return { organic, localPackCount, adsCount, peopleAlsoAsk, relatedSearches };
}
