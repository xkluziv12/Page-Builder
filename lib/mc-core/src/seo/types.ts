import type { Classification, Competition } from "../types";

/** Credentials needed to gather live SEO intelligence. */
export interface SeoCredentials {
  /** SerpAPI key (live SERP scrape). */
  serpApiKey: string;
  /** DataForSEO API login (email/login). Optional — enriches keyword metrics. */
  dataForSeoLogin?: string | null;
  /** DataForSEO API password. Optional — enriches keyword metrics. */
  dataForSeoPassword?: string | null;
}

/** A keyword with whatever metrics we could resolve for it. */
export interface SeoKeyword {
  keyword: string;
  /** Monthly search volume, when known (DataForSEO). */
  searchVolume: number | null;
  /** Keyword difficulty 0-100, when known (DataForSEO). */
  difficulty: number | null;
  /** Paid competition label, when known (DataForSEO: LOW/MEDIUM/HIGH). */
  competition: string | null;
}

/** A single organic competitor surfaced from the live SERP. */
export interface SeoCompetitor {
  title: string;
  link: string;
  position: number | null;
}

/**
 * Live SEO intelligence for a single target page. This replaces the quarterly
 * "SEO Data 2026" spreadsheet that VAs used to upload to Claude by hand: it is
 * pulled per-URL at run-create time from SerpAPI (live SERP) and, when
 * configured, DataForSEO (keyword volume/difficulty).
 */
export interface SeoIntel {
  /** The query used against the SERP, e.g. "electronics recycling Austin TX". */
  query: string;
  /** The geo location string used, e.g. "Austin, Texas, United States". */
  location: string;
  /** Derived competition bucket the pipeline consumes. */
  competition: Competition;
  /** 0-100 heuristic score behind the bucket (for transparency). */
  competitionScore: number;
  /** Primary keyword with metrics, when DataForSEO resolved one. */
  primaryKeyword: SeoKeyword | null;
  /** Related/secondary keywords (DataForSEO related + SERP related searches). */
  relatedKeywords: SeoKeyword[];
  /** Top organic competitors from the live SERP. */
  topCompetitors: SeoCompetitor[];
  /** How many local-pack (map) results appeared. */
  localPackCount: number;
  /** How many paid ads appeared above/below organic. */
  adsCount: number;
  /** "People also ask" questions — content gaps to cover. */
  peopleAlsoAsk: string[];
  /** ISO timestamp the intel was gathered. */
  fetchedAt: string;
  /** Which providers contributed, e.g. ["serpapi", "dataforseo"]. */
  sources: string[];
}

/** A city/state location signal extracted from a fetched page. */
export interface ExtractedLocation {
  /** Locality (city), title-cased, or null when only a region was found. */
  city: string | null;
  /** USPS 2-letter abbreviation (uppercase), or null when unresolved. */
  state: string | null;
}

/** Outcome of fetching the target URL, used to derive classification. */
export interface TargetPageProbe {
  /** Whether the URL resolved to a live page with a body. */
  exists: boolean;
  /** HTTP status, when a response came back. */
  status: number | null;
  /** Approximate visible word count of the page body. */
  wordCount: number;
  /** A bounded-fetch failure that the dashboard should show to the operator. */
  error?: string;
  /**
   * City/state signals scraped from the page body (JSON-LD PostalAddress and
   * "City, ST ZIP" text). Used to confirm/correct the URL-parsed location so
   * same-named cities in different states are not confused.
   */
  locations?: ExtractedLocation[];
}

export type { Classification, Competition };
