import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  mcSeoSnapshotTable,
  mcWorkLogTable,
  type McSeoSnapshot,
  type McWorkLog,
} from "@workspace/db";
import {
  BASE_DOMAIN,
  computeSeoDelta,
  inferPageType,
  normalizeWorkLogUrl,
  type KeywordPosition,
  type SeoDelta,
} from "@workspace/mc-core";

/**
 * The canonical work-log runtime: every path that records "this page/blog is
 * done" (old static VA tools, the Mission Control pipeline, the historical
 * import) funnels through {@link upsertWorkLog}, and every reader (master grid,
 * Google Sheets mirror) reads through {@link listWorkLog}. Natural-keying on the
 * normalized URL is what makes re-logging idempotent instead of duplicative.
 */

/** Serialize a snapshot row to the SeoSnapshot API shape. */
export function serializeSnapshot(row: McSeoSnapshot): Record<string, unknown> {
  return {
    id: row.id,
    workLogId: row.workLogId,
    normalizedUrl: row.normalizedUrl,
    snapshotDate: row.snapshotDate?.toISOString?.() ?? null,
    source: row.source,
    impressions: row.impressions,
    clicks: row.clicks,
    avgPosition: row.avgPosition,
    keywords: row.keywords ?? [],
    createdAt: row.createdAt?.toISOString?.() ?? null,
  };
}

/** Serialize a work-log row (+ optional computed SEO delta) to the API shape. */
export function serializeWorkLog(
  row: McWorkLog,
  seoDelta: SeoDelta | null = null,
): Record<string, unknown> {
  return {
    id: row.id,
    normalizedUrl: row.normalizedUrl,
    company: row.company,
    city: row.city,
    state: row.state,
    pageName: row.pageName,
    oldUrl: row.oldUrl,
    newUrl: row.newUrl,
    pageType: row.pageType,
    tier: row.tier,
    vaName: row.vaName,
    source: row.source,
    status: row.status,
    inSitemap: row.inSitemap,
    runId: row.runId,
    dateCompleted: row.dateCompleted?.toISOString?.() ?? null,
    notes: row.notes,
    createdAt: row.createdAt?.toISOString?.() ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
    seoDelta,
  };
}

/** Loose input shape accepted by the upsert (mirrors the OpenAPI WorkLogInput). */
export interface WorkLogUpsertInput {
  company?: string;
  city?: string;
  state?: string;
  pageName?: string;
  oldUrl?: string | null;
  newUrl?: string;
  pageType?: string;
  tier?: string | null;
  vaName?: string;
  source?: string;
  status?: string;
  runId?: number | null;
  dateCompleted?: string | null;
  notes?: string | null;
}

/** Error thrown when an upsert payload has no usable natural-key URL. */
export class WorkLogValidationError extends Error {}

function coalesceUrl(input: WorkLogUpsertInput): string {
  return (input.newUrl ?? "").trim() || (input.oldUrl ?? "").trim();
}

/**
 * Upsert a work-log row, natural-keyed by the normalized URL. Re-logging the
 * same page UPDATES the existing row (preserving createdAt) instead of inserting
 * a duplicate. Throws {@link WorkLogValidationError} when no usable URL is
 * present — a natural-keyed row cannot exist without one (fail loud, never write
 * a keyless ghost row).
 */
export async function upsertWorkLog(input: WorkLogUpsertInput): Promise<McWorkLog> {
  const keyUrl = coalesceUrl(input);
  const normalizedUrl = normalizeWorkLogUrl(keyUrl);
  if (!normalizedUrl) {
    throw new WorkLogValidationError(
      "A usable page URL (newUrl or oldUrl) is required — it forms the work-log's natural key.",
    );
  }

  const dateCompleted =
    input.dateCompleted === null
      ? null
      : input.dateCompleted
        ? new Date(input.dateCompleted)
        : undefined;

  const values = {
    normalizedUrl,
    company: input.company ?? "STS",
    city: input.city ?? "",
    state: input.state ?? "",
    pageName: input.pageName ?? "",
    oldUrl: input.oldUrl ?? null,
    newUrl: input.newUrl ?? null,
    pageType: input.pageType ?? inferPageType(keyUrl),
    tier: input.tier ?? null,
    vaName: input.vaName ?? "",
    source: input.source ?? "old-tool",
    status: input.status ?? "done",
    runId: input.runId ?? null,
    dateCompleted: dateCompleted ?? null,
    notes: input.notes ?? null,
  };

  // Only overwrite columns the caller actually provided, so a later partial
  // re-log (e.g. the old tool re-posting just a status) never blanks out fields
  // an earlier richer write populated.
  const setOnConflict: Record<string, unknown> = { updatedAt: new Date() };
  if (input.company !== undefined) setOnConflict.company = values.company;
  if (input.city !== undefined) setOnConflict.city = values.city;
  if (input.state !== undefined) setOnConflict.state = values.state;
  if (input.pageName !== undefined) setOnConflict.pageName = values.pageName;
  if (input.oldUrl !== undefined) setOnConflict.oldUrl = values.oldUrl;
  if (input.newUrl !== undefined) setOnConflict.newUrl = values.newUrl;
  if (input.pageType !== undefined) setOnConflict.pageType = values.pageType;
  if (input.tier !== undefined) setOnConflict.tier = values.tier;
  if (input.vaName !== undefined) setOnConflict.vaName = values.vaName;
  if (input.source !== undefined) setOnConflict.source = values.source;
  if (input.status !== undefined) setOnConflict.status = values.status;
  if (input.runId !== undefined) setOnConflict.runId = values.runId;
  if (dateCompleted !== undefined) setOnConflict.dateCompleted = dateCompleted;
  if (input.notes !== undefined) setOnConflict.notes = values.notes;

  const [row] = await db
    .insert(mcWorkLogTable)
    .values(values)
    .onConflictDoUpdate({
      target: mcWorkLogTable.normalizedUrl,
      set: setOnConflict,
    })
    .returning();
  return row!;
}

export interface WorkLogFilters {
  company?: string;
  vaName?: string;
  status?: string;
  pageType?: string;
  /** Completion month, format YYYY-MM. */
  month?: string;
}

/**
 * List work-log rows (filtered) with each row's latest-vs-previous SEO delta
 * embedded. Snapshots are fetched in one batched query and grouped in-memory so
 * the grid renders from a single round-trip.
 */
export async function listWorkLog(
  filters: WorkLogFilters = {},
): Promise<Record<string, unknown>[]> {
  const conditions = [];
  if (filters.company) conditions.push(eq(mcWorkLogTable.company, filters.company));
  if (filters.vaName) conditions.push(eq(mcWorkLogTable.vaName, filters.vaName));
  if (filters.status) conditions.push(eq(mcWorkLogTable.status, filters.status));
  if (filters.pageType) conditions.push(eq(mcWorkLogTable.pageType, filters.pageType));
  if (filters.month && /^\d{4}-\d{2}$/.test(filters.month)) {
    conditions.push(
      sql`to_char(${mcWorkLogTable.dateCompleted}, 'YYYY-MM') = ${filters.month}`,
    );
  }

  const rows = await db
    .select()
    .from(mcWorkLogTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(mcWorkLogTable.updatedAt));

  if (rows.length === 0) return [];

  const urls = [...new Set(rows.map((r) => r.normalizedUrl))];
  const snapshots = await db
    .select()
    .from(mcSeoSnapshotTable)
    .where(inArray(mcSeoSnapshotTable.normalizedUrl, urls));

  const byUrl = new Map<string, McSeoSnapshot[]>();
  for (const s of snapshots) {
    const list = byUrl.get(s.normalizedUrl) ?? [];
    list.push(s);
    byUrl.set(s.normalizedUrl, list);
  }

  return rows.map((row) => {
    const snaps = byUrl.get(row.normalizedUrl) ?? [];
    const delta = computeSeoDelta(
      snaps.map((s) => ({
        snapshotDate: s.snapshotDate,
        impressions: s.impressions,
        clicks: s.clicks,
        avgPosition: s.avgPosition,
        keywords: s.keywords ?? [],
      })),
    );
    return serializeWorkLog(row, delta);
  });
}

/** Fetch the dated snapshot history for a page (newest first). */
export async function listSnapshots(workLogId: number): Promise<McSeoSnapshot[]> {
  return db
    .select()
    .from(mcSeoSnapshotTable)
    .where(eq(mcSeoSnapshotTable.workLogId, workLogId))
    .orderBy(desc(mcSeoSnapshotTable.snapshotDate));
}

export interface SnapshotInput {
  source?: string;
  snapshotDate?: Date;
  impressions?: number | null;
  clicks?: number | null;
  avgPosition?: number | null;
  keywords?: KeywordPosition[];
}

/** Record one dated SEO snapshot for a page (history is append-only). */
export async function recordSnapshot(
  workLogId: number,
  normalizedUrl: string,
  input: SnapshotInput,
): Promise<McSeoSnapshot> {
  const [row] = await db
    .insert(mcSeoSnapshotTable)
    .values({
      workLogId,
      normalizedUrl,
      source: input.source ?? "day-of",
      snapshotDate: input.snapshotDate ?? new Date(),
      impressions: input.impressions ?? null,
      clicks: input.clicks ?? null,
      avgPosition: input.avgPosition ?? null,
      keywords: input.keywords ?? [],
    })
    .returning();
  return row!;
}

/**
 * Fetch the live production sitemap.xml and return the set of normalized URLs it
 * advertises. Throws (fail loud) when the sitemap can't be fetched or has no
 * <loc> entries — a silently-empty sitemap would wrongly mark every tracked
 * page as "not live". Supports a sitemap index by following nested <loc>s one
 * level deep.
 */
export async function fetchSitemapUrls(
  sitemapUrl: string,
  depth = 0,
): Promise<{ raw: string[]; normalized: Set<string> }> {
  const res = await fetch(sitemapUrl, { headers: { "user-agent": "MissionControl-Sitemap/1.0" } });
  if (!res.ok) {
    throw new Error(`Could not fetch sitemap ${sitemapUrl}: HTTP ${res.status}`);
  }
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]!.trim());
  if (locs.length === 0) {
    throw new Error(`Sitemap ${sitemapUrl} contained no <loc> entries.`);
  }

  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  if (isIndex && depth === 0) {
    const raw: string[] = [];
    const normalized = new Set<string>();
    for (const child of locs.slice(0, 50)) {
      try {
        const nested = await fetchSitemapUrls(child, depth + 1);
        for (const u of nested.raw) raw.push(u);
        for (const n of nested.normalized) normalized.add(n);
      } catch {
        // A broken child sitemap shouldn't void the whole reconcile; skip it.
      }
    }
    if (normalized.size === 0) {
      throw new Error(`Sitemap index ${sitemapUrl} yielded no usable child URLs.`);
    }
    return { raw, normalized };
  }

  const normalized = new Set(locs.map((u) => normalizeWorkLogUrl(u)).filter(Boolean));
  return { raw: locs, normalized };
}

export interface SitemapReconciliation {
  sitemapUrl: string;
  ranAt: string;
  totalSitemap: number;
  totalTracked: number;
  live: number;
  trackedNotLive: number;
  liveNotTracked: number;
  persisted: boolean;
  pages: {
    normalizedUrl: string;
    status: "live" | "tracked-not-live" | "live-not-tracked";
    workLogId: number | null;
    pageName: string | null;
  }[];
}

/**
 * Reconcile the work-log against the live sitemap: which tracked pages are
 * actually live, which are tracked but missing, and which are live but untracked.
 * When `persist` is true, writes the in-sitemap flag back onto each work-log row.
 */
export async function reconcileSitemap(persist: boolean): Promise<SitemapReconciliation> {
  const sitemapUrl = `${BASE_DOMAIN.replace(/\/+$/, "")}/sitemap.xml`;
  const { normalized: liveSet } = await fetchSitemapUrls(sitemapUrl);

  const rows = await db.select().from(mcWorkLogTable);
  const trackedSet = new Set(rows.map((r) => r.normalizedUrl));

  const pages: SitemapReconciliation["pages"] = [];
  let live = 0;
  let trackedNotLive = 0;
  for (const row of rows) {
    const isLive = liveSet.has(row.normalizedUrl);
    if (isLive) live++;
    else trackedNotLive++;
    pages.push({
      normalizedUrl: row.normalizedUrl,
      status: isLive ? "live" : "tracked-not-live",
      workLogId: row.id,
      pageName: row.pageName || null,
    });
  }

  let liveNotTracked = 0;
  for (const url of liveSet) {
    if (!trackedSet.has(url)) {
      liveNotTracked++;
      pages.push({
        normalizedUrl: url,
        status: "live-not-tracked",
        workLogId: null,
        pageName: null,
      });
    }
  }

  if (persist) {
    for (const row of rows) {
      const isLive = liveSet.has(row.normalizedUrl);
      if (row.inSitemap !== isLive) {
        await db
          .update(mcWorkLogTable)
          .set({ inSitemap: isLive, updatedAt: new Date() })
          .where(eq(mcWorkLogTable.id, row.id));
      }
    }
  }

  return {
    sitemapUrl,
    ranAt: new Date().toISOString(),
    totalSitemap: liveSet.size,
    totalTracked: rows.length,
    live,
    trackedNotLive,
    liveNotTracked,
    persisted: persist,
    pages,
  };
}
