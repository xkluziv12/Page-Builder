import type { SeoKeyword } from "./types";

export const DATAFORSEO_BASE = "https://api.dataforseo.com";

/** USA location code in the DataForSEO taxonomy. */
const USA_LOCATION_CODE = 2840;

interface DataForSeoOptions {
  login: string;
  password: string;
  /** Keywords to resolve; first is treated as primary. */
  keywords: string[];
  fetchImpl?: typeof fetch;
}

export interface DataForSeoResult {
  primaryKeyword: SeoKeyword | null;
  keywords: SeoKeyword[];
}

/**
 * Resolve search volume / difficulty / competition for keywords via DataForSEO
 * Labs keyword_overview. DataForSEO is an *enrichment* layer: callers should
 * treat a thrown error as "no keyword metrics" and continue with SERP-only
 * intel rather than failing the whole run. Parsing is defensive.
 */
export async function fetchKeywordMetrics(
  opts: DataForSeoOptions,
): Promise<DataForSeoResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const auth = Buffer.from(`${opts.login}:${opts.password}`).toString("base64");
  const res = await fetchImpl(
    `${DATAFORSEO_BASE}/v3/dataforseo_labs/google/keyword_overview/live`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          keywords: opts.keywords.slice(0, 20),
          language_code: "en",
          location_code: USA_LOCATION_CODE,
        },
      ]),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `DataForSEO request failed (${res.status} ${res.statusText}): ${body.slice(0, 300)}`,
    );
  }
  const data = (await res.json()) as Record<string, unknown>;
  const keywords = parseKeywordOverview(data);
  return { primaryKeyword: keywords[0] ?? null, keywords };
}

export function parseKeywordOverview(data: Record<string, unknown>): SeoKeyword[] {
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  const out: SeoKeyword[] = [];
  for (const task of tasks) {
    const result = (task as Record<string, unknown>)?.result;
    if (!Array.isArray(result)) continue;
    for (const r of result) {
      const items = (r as Record<string, unknown>)?.items;
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const row = item as Record<string, unknown>;
        const keyword = typeof row.keyword === "string" ? row.keyword : null;
        if (!keyword) continue;
        const info = (row.keyword_info as Record<string, unknown>) ?? {};
        const props = (row.keyword_properties as Record<string, unknown>) ?? {};
        out.push({
          keyword,
          searchVolume:
            typeof info.search_volume === "number" ? info.search_volume : null,
          difficulty:
            typeof props.keyword_difficulty === "number"
              ? props.keyword_difficulty
              : null,
          competition:
            typeof info.competition_level === "string"
              ? info.competition_level
              : null,
        });
      }
    }
  }
  return out;
}
