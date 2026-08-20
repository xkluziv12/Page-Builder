/**
 * Canonical work-log helpers shared by the API server, the importer, and the
 * Google Sheets sync. Keeping the natural-key normalization and the snapshot
 * delta math here means every path that writes the work-log keys pages the same
 * way (so re-logging upserts instead of duplicating) and every reader computes
 * trends identically.
 */

export type WorkLogCompany = "STS" | "DCD" | "TechnoCycle";
export type WorkLogPageType = "city" | "service" | "hub" | "spoke" | "blog";
export type WorkLogStatus = "done" | "in_progress" | "not_started";
export type WorkLogSource = "old-tool" | "mission-control" | "import";

/**
 * Normalize a URL into the stable natural key used to de-duplicate work-log
 * rows. Lower-cases the host + path, drops the protocol, query string, hash,
 * `www.`, default ports, a trailing slash, and a trailing `index.*`. Returns a
 * `host/path` string, or "" when the input has no usable host/path (the caller
 * must reject an empty key — a page with no URL cannot be a natural-keyed row).
 *
 * Inputs may be bare ("stselectronicrecyclinginc.com/foo") or full URLs; both
 * normalize to the same key so the old tools, Mission Control, and the importer
 * never produce divergent keys for the same page.
 */
export function normalizeWorkLogUrl(rawUrl: string): string {
  const trimmed = (rawUrl ?? "").trim();
  if (!trimmed) return "";
  let host = "";
  let path = "";
  try {
    const u = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    host = u.hostname.toLowerCase().replace(/^www\./, "");
    path = u.pathname;
  } catch {
    // Not a parseable URL: treat the whole string as a path-only key.
    const noProto = trimmed.replace(/^[a-z]+:\/\//i, "");
    const slash = noProto.indexOf("/");
    if (slash >= 0) {
      host = noProto.slice(0, slash).toLowerCase().replace(/^www\./, "");
      path = noProto.slice(slash);
    } else {
      host = noProto.toLowerCase().replace(/^www\./, "");
      path = "";
    }
    path = path.split(/[?#]/)[0] ?? "";
  }
  path = path
    .toLowerCase()
    .replace(/\/index\.(html?|php|aspx?)$/i, "/")
    .replace(/\.(html?|php|aspx?)$/i, "")
    .replace(/\/+$/, "");
  const key = `${host}${path}`;
  return key.replace(/\/+$/, "");
}

/** One tracked keyword position at a point in time. */
export interface KeywordPosition {
  keyword: string;
  position: number | null;
}

/** A minimal snapshot shape for delta math (subset of the DB row). */
export interface SnapshotLike {
  snapshotDate: string | Date;
  impressions: number | null;
  clicks: number | null;
  avgPosition: number | null;
  keywords: KeywordPosition[];
}

/** Movement of a single tracked keyword between two snapshots. */
export interface KeywordMovement {
  keyword: string;
  previous: number | null;
  latest: number | null;
  /**
   * Position improvement (previous - latest). Positive = moved UP the SERP
   * (good); negative = dropped. Null when either side is missing.
   */
  delta: number | null;
}

/**
 * Latest-vs-previous SEO deltas for a page. `impressionsPctChange` is null when
 * there is no comparable previous value (first snapshot, or previous was 0/null)
 * so the UI can show "—" rather than a misleading ∞%. Keyword movement is keyed
 * off the latest snapshot's tracked keywords.
 */
export interface SeoDelta {
  latestDate: string | null;
  previousDate: string | null;
  latestImpressions: number | null;
  previousImpressions: number | null;
  impressionsPctChange: number | null;
  latestClicks: number | null;
  latestAvgPosition: number | null;
  keywordMovement: KeywordMovement[];
}

function toIso(d: string | Date): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

/**
 * Compute the latest-vs-previous delta from an unordered list of snapshots for a
 * single page. Returns null when there are no snapshots at all. Sorting happens
 * here so callers can pass rows straight from the DB in any order.
 */
export function computeSeoDelta(snapshots: SnapshotLike[]): SeoDelta | null {
  if (!snapshots || snapshots.length === 0) return null;
  const sorted = [...snapshots].sort(
    (a, b) => new Date(toIso(b.snapshotDate)).getTime() - new Date(toIso(a.snapshotDate)).getTime(),
  );
  const latest = sorted[0]!;
  const previous = sorted[1] ?? null;

  let impressionsPctChange: number | null = null;
  if (
    previous &&
    typeof previous.impressions === "number" &&
    previous.impressions > 0 &&
    typeof latest.impressions === "number"
  ) {
    impressionsPctChange =
      ((latest.impressions - previous.impressions) / previous.impressions) * 100;
  }

  const prevByKeyword = new Map<string, number | null>();
  for (const k of previous?.keywords ?? []) {
    prevByKeyword.set(k.keyword.toLowerCase(), k.position);
  }
  const keywordMovement: KeywordMovement[] = (latest.keywords ?? []).map((k) => {
    const prev = prevByKeyword.has(k.keyword.toLowerCase())
      ? prevByKeyword.get(k.keyword.toLowerCase())!
      : null;
    const delta =
      typeof prev === "number" && typeof k.position === "number" ? prev - k.position : null;
    return { keyword: k.keyword, previous: prev, latest: k.position, delta };
  });

  return {
    latestDate: toIso(latest.snapshotDate),
    previousDate: previous ? toIso(previous.snapshotDate) : null,
    latestImpressions: latest.impressions,
    previousImpressions: previous?.impressions ?? null,
    impressionsPctChange:
      impressionsPctChange === null ? null : Math.round(impressionsPctChange * 10) / 10,
    latestClicks: latest.clicks,
    latestAvgPosition: latest.avgPosition,
    keywordMovement,
  };
}

/**
 * Best-effort page-type inference from a URL slug + niche, for rows that don't
 * carry an explicit type (e.g. historical import). Returns "blog" for blog
 * paths, otherwise defaults to "city" (the dominant STS local-page type).
 */
export function inferPageType(rawUrl: string): WorkLogPageType {
  const lower = (rawUrl ?? "").toLowerCase();
  if (/\/blog|\/news|\/article/.test(lower)) return "blog";
  if (/hub/.test(lower)) return "hub";
  if (/\/services?\//.test(lower)) return "service";
  return "city";
}
