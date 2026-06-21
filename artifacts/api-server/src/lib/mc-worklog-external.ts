import { db, mcWorkLogTable } from "@workspace/db";
import { normalizeWorkLogUrl } from "@workspace/mc-core";
import { logger } from "./logger";
import {
  listWorkLog,
  recordSnapshot,
  upsertWorkLog,
  type WorkLogUpsertInput,
} from "./mc-worklog";

/**
 * External-dependency seams for the work-log: the one-time historical import, the
 * monthly Google Search Console pull, and the one-way Google Sheets mirror. The
 * two Google paths are gated and fail loud when their credentials/connection are
 * not configured — a silent no-op would let an operator believe the sheet/SEO
 * data is fresh when it never synced.
 */

/** A raw legacy row from the master spreadsheet (free-form keys). */
export type RawImportRow = Record<string, unknown>;

export interface ImportFlag {
  reason: string;
  row: RawImportRow;
}

export interface ImportResult {
  total: number;
  imported: number;
  updated: number;
  flagged: ImportFlag[];
}

/** Lower-case + collapse a header key so "New URL", "new_url", "newurl" all match. */
function canonKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Pull the first present value among a set of candidate header spellings. */
function pick(row: RawImportRow, candidates: string[]): string | undefined {
  const map = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) map.set(canonKey(k), v);
  for (const c of candidates) {
    const v = map.get(canonKey(c));
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return undefined;
}

const COMPANY_ALIASES: Record<string, "STS" | "DCD" | "TechnoCycle"> = {
  sts: "STS",
  dcd: "DCD",
  technocycle: "TechnoCycle",
  techno: "TechnoCycle",
};

function normalizeCompany(raw: string | undefined, fallback: "STS" | "DCD" | "TechnoCycle") {
  if (!raw) return fallback;
  return COMPANY_ALIASES[canonKey(raw)] ?? fallback;
}

function normalizeStatus(raw: string | undefined): "done" | "in_progress" | "not_started" {
  const c = raw ? canonKey(raw) : "";
  if (["done", "complete", "completed", "live", "published", "yes", "x", "true"].includes(c)) {
    return "done";
  }
  if (["inprogress", "wip", "started", "building", "draft"].includes(c)) return "in_progress";
  return "not_started";
}

/**
 * Map and de-duplicate messy legacy rows into the canonical work-log. Each row
 * that yields a usable URL is upserted (dedupe by normalized URL); rows with no
 * usable URL are FLAGGED for manual review rather than dropped, so nothing is
 * silently lost.
 */
export async function importWorkLog(
  rows: RawImportRow[],
  defaultCompany: "STS" | "DCD" | "TechnoCycle" = "STS",
): Promise<ImportResult> {
  const flagged: ImportFlag[] = [];
  let imported = 0;
  let updated = 0;
  const seen = new Set<string>();

  for (const row of rows) {
    const newUrl = pick(row, ["new url", "newurl", "url", "live url", "final url", "page url"]);
    const oldUrl = pick(row, ["old url", "oldurl", "original url", "previous url"]);
    const keyUrl = newUrl ?? oldUrl;
    const normalized = keyUrl ? normalizeWorkLogUrl(keyUrl) : "";
    if (!normalized) {
      flagged.push({ reason: "No usable URL (new/old) to form a natural key.", row });
      continue;
    }

    const input: WorkLogUpsertInput = {
      company: normalizeCompany(pick(row, ["company", "brand", "site"]), defaultCompany),
      city: pick(row, ["city", "town", "location"]) ?? "",
      state: pick(row, ["state", "st", "region"]) ?? "",
      pageName: pick(row, ["page name", "pagename", "title", "name", "page"]) ?? "",
      oldUrl: oldUrl ?? null,
      newUrl: newUrl ?? oldUrl ?? "",
      pageType: pick(row, ["page type", "pagetype", "type", "category"]),
      tier: pick(row, ["tier", "priority"]) ?? null,
      vaName: pick(row, ["va", "va name", "vaname", "assigned", "owner", "author"]) ?? "",
      source: "import",
      status: normalizeStatus(pick(row, ["status", "state of work", "progress", "done"])),
      notes: pick(row, ["notes", "comment", "comments", "remarks"]) ?? null,
    };

    const dateRaw = pick(row, ["date completed", "datecompleted", "date", "completed", "published date"]);
    if (dateRaw) {
      const parsed = new Date(dateRaw);
      if (!Number.isNaN(parsed.getTime())) input.dateCompleted = parsed.toISOString();
      else flagged.push({ reason: `Unparseable date "${dateRaw}" — imported without a completion date.`, row });
    }

    const wasSeenBefore = seen.has(normalized);
    await upsertWorkLog(input);
    if (wasSeenBefore) updated++;
    else {
      seen.add(normalized);
      imported++;
    }
  }

  return { total: rows.length, imported, updated, flagged };
}

export class NotConfiguredError extends Error {}

export interface GscPullResult {
  ok: boolean;
  pagesChecked: number;
  snapshotsRecorded: number;
  ranAt: string;
}

/**
 * Read Google Search Console credentials from the environment. There is no
 * Replit integration for GSC, so this relies on operator-provided secrets. When
 * any required value is missing the caller fails loud rather than pretending the
 * monthly SEO pull happened.
 */
function gscCredsFromEnv(): { siteUrl: string; apiKey: string } | null {
  const siteUrl = process.env.GSC_SITE_URL?.trim();
  const apiKey = process.env.GSC_API_KEY?.trim() || process.env.GOOGLE_SEARCH_CONSOLE_TOKEN?.trim();
  if (!siteUrl || !apiKey) return null;
  return { siteUrl, apiKey };
}

/**
 * Whether Google Search Console credentials are present. Used by the monthly
 * scheduler to stay quiet (rather than throw) until an operator configures GSC.
 */
export function isGscConfigured(): boolean {
  return gscCredsFromEnv() !== null;
}

/**
 * Pull dated SEO snapshots from Google Search Console for every tracked page and
 * record one snapshot row each. Gated: throws {@link NotConfiguredError} when
 * GSC credentials are not set so the route can return a clear 400 instead of a
 * silent empty pull.
 */
export async function pullSearchConsole(): Promise<GscPullResult> {
  const creds = gscCredsFromEnv();
  if (!creds) {
    throw new NotConfiguredError(
      "Google Search Console is not configured. Set GSC_SITE_URL and GSC_API_KEY (there is no Replit GSC integration) to enable the monthly SEO snapshot pull.",
    );
  }

  const rows = await db.select().from(mcWorkLogTable);
  let snapshotsRecorded = 0;
  const ranAt = new Date().toISOString();

  // GSC Search Analytics query, one page at a time, recording a dated snapshot.
  for (const row of rows) {
    const pageUrl = row.newUrl || row.oldUrl;
    if (!pageUrl) continue;
    const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
      creds.siteUrl,
    )}/searchAnalytics/query`;
    const today = new Date();
    const start = new Date(today.getTime() - 28 * 24 * 60 * 60 * 1000);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${creds.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        startDate: start.toISOString().slice(0, 10),
        endDate: today.toISOString().slice(0, 10),
        dimensions: ["query"],
        dimensionFilterGroups: [
          { filters: [{ dimension: "page", operator: "equals", expression: pageUrl }] },
        ],
        rowLimit: 5,
      }),
    });
    if (!res.ok) {
      throw new Error(`Google Search Console query failed for ${pageUrl}: HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      rows?: { keys?: string[]; clicks?: number; impressions?: number; position?: number }[];
    };
    const gscRows = data.rows ?? [];
    const impressions = gscRows.reduce((s, r) => s + (r.impressions ?? 0), 0);
    const clicks = gscRows.reduce((s, r) => s + (r.clicks ?? 0), 0);
    const avgPosition =
      gscRows.length > 0 ? gscRows.reduce((s, r) => s + (r.position ?? 0), 0) / gscRows.length : null;
    const keywords = gscRows.map((r) => ({
      keyword: r.keys?.[0] ?? "",
      position: typeof r.position === "number" ? Math.round(r.position * 10) / 10 : null,
    }));
    await recordSnapshot(row.id, row.normalizedUrl, {
      source: "gsc-monthly",
      impressions,
      clicks,
      avgPosition,
      keywords,
    });
    snapshotsRecorded++;
  }

  return { ok: true, pagesChecked: rows.length, snapshotsRecorded, ranAt };
}

export interface SheetsSyncResult {
  ok: boolean;
  spreadsheetId: string;
  spreadsheetUrl: string | null;
  tabs: string[];
  rowCount: number;
  syncedAt: string;
}

/** The serialized work-log shape (from {@link listWorkLog}) the sheet consumes. */
interface SheetSourceRow {
  normalizedUrl: string;
  company: string;
  city: string;
  state: string;
  pageName: string;
  oldUrl: string | null;
  newUrl: string | null;
  pageType: string;
  tier: string | null;
  vaName: string;
  status: string;
  inSitemap: boolean | null;
  dateCompleted: string | null;
  source: string;
  seoDelta: {
    latestImpressions: number | null;
    impressionsPctChange: number | null;
    latestClicks: number | null;
    latestAvgPosition: number | null;
    latestDate: string | null;
    keywordMovement: {
      keyword: string;
      previous: number | null;
      latest: number | null;
      delta: number | null;
    }[];
  } | null;
}

/** Compact "kw: prev→latest (▲n)" summary of the top tracked-keyword moves. */
function formatKeywordMovement(delta: SheetSourceRow["seoDelta"]): string {
  if (!delta?.keywordMovement?.length) return "";
  return delta.keywordMovement
    .slice(0, 3)
    .map((k) => {
      const arrow =
        k.delta === null ? "" : k.delta > 0 ? ` (▲${k.delta})` : k.delta < 0 ? ` (▼${Math.abs(k.delta)})` : " (—)";
      return `${k.keyword}: ${k.previous ?? "—"}→${k.latest ?? "—"}${arrow}`;
    })
    .join("; ");
}

/**
 * Build the standardized tab payloads (Pages, Blogs, Sitemap Status, By VA,
 * Monthly) from the canonical work-log. Reads through {@link listWorkLog} so each
 * row carries its latest-vs-previous SEO delta, and the Pages/Blogs/Monthly tabs
 * surface impressions, % change, keyword movement, and last-checked date — the
 * columns marketing needs for monthly check-ins.
 */
export async function buildSheetTabs(): Promise<{
  tabs: Record<string, (string | number | null)[][]>;
  rowCount: number;
}> {
  const rows = (await listWorkLog()) as unknown as SheetSourceRow[];

  const header = [
    "Company",
    "City",
    "State",
    "Page Name",
    "Old URL",
    "New URL",
    "Type",
    "Tier",
    "VA",
    "Status",
    "In Sitemap",
    "Date Completed",
    "Source",
    "Latest Impressions",
    "Impressions %Change",
    "Latest Clicks",
    "Avg Position",
    "Keyword Movement",
    "Last Checked",
  ];
  const toRow = (r: SheetSourceRow): (string | number | null)[] => [
    r.company,
    r.city,
    r.state,
    r.pageName,
    r.oldUrl ?? "",
    r.newUrl ?? "",
    r.pageType,
    r.tier ?? "",
    r.vaName,
    r.status,
    r.inSitemap === null ? "" : r.inSitemap ? "yes" : "no",
    r.dateCompleted ? r.dateCompleted.slice(0, 10) : "",
    r.source,
    r.seoDelta?.latestImpressions ?? "",
    r.seoDelta?.impressionsPctChange ?? "",
    r.seoDelta?.latestClicks ?? "",
    r.seoDelta?.latestAvgPosition ?? "",
    formatKeywordMovement(r.seoDelta),
    r.seoDelta?.latestDate ? r.seoDelta.latestDate.slice(0, 10) : "",
  ];

  const pages = rows.filter((r) => r.pageType !== "blog");
  const blogs = rows.filter((r) => r.pageType === "blog");

  const byVaCounts = new Map<string, number>();
  for (const r of rows) byVaCounts.set(r.vaName || "(unassigned)", (byVaCounts.get(r.vaName || "(unassigned)") ?? 0) + 1);

  const byMonth = new Map<string, { count: number; impressions: number }>();
  for (const r of rows) {
    if (!r.dateCompleted) continue;
    const key = r.dateCompleted.slice(0, 7);
    const cur = byMonth.get(key) ?? { count: 0, impressions: 0 };
    cur.count += 1;
    cur.impressions += r.seoDelta?.latestImpressions ?? 0;
    byMonth.set(key, cur);
  }

  const tabs: Record<string, (string | number | null)[][]> = {
    Pages: [header, ...pages.map(toRow)],
    Blogs: [header, ...blogs.map(toRow)],
    "Sitemap Status": [
      ["Normalized URL", "Status", "In Sitemap"],
      ...rows.map((r) => [
        r.normalizedUrl,
        r.status,
        r.inSitemap === null ? "unchecked" : r.inSitemap ? "live" : "not-live",
      ]),
    ],
    "By VA": [["VA", "Pages/Blogs"], ...[...byVaCounts.entries()].map(([va, n]) => [va, n])],
    Monthly: [
      ["Month", "Completed", "Latest Impressions"],
      ...[...byMonth.entries()].sort().map(([m, v]) => [m, v.count, v.impressions]),
    ],
  };

  return { tabs, rowCount: rows.length };
}

/**
 * Push the canonical work-log out to the configured Google Sheet (one-way: the
 * app is the source of truth, the sheet is a read-mirror). Gated: throws
 * {@link NotConfiguredError} when the Google Sheets connection or target sheet
 * id is not configured, so the route returns a clear 400 rather than silently
 * "succeeding" without writing anything.
 */
export async function syncSheets(): Promise<SheetsSyncResult> {
  const spreadsheetId = process.env.WORKLOG_SHEET_ID?.trim();
  if (!spreadsheetId) {
    throw new NotConfiguredError(
      "Google Sheets sync is not configured. Connect the Google Sheets integration and set WORKLOG_SHEET_ID to the target spreadsheet id to enable the one-way mirror.",
    );
  }
  const accessToken = await getGoogleSheetsAccessToken();
  if (!accessToken) {
    throw new NotConfiguredError(
      "The Google Sheets integration is not connected. Add the Google Sheets connection so the work-log can be mirrored to the sheet.",
    );
  }

  const { tabs, rowCount } = await buildSheetTabs();
  const tabNames = Object.keys(tabs);

  // Ensure each tab exists, then overwrite its contents (clear + write). The app
  // owns the sheet shape, so a full rewrite keeps the mirror exact.
  await ensureSheetTabs(spreadsheetId, accessToken, tabNames);
  for (const [name, values] of Object.entries(tabs)) {
    await clearSheetTab(spreadsheetId, accessToken, name);
    await writeSheetTab(spreadsheetId, accessToken, name, values);
  }

  return {
    ok: true,
    spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    tabs: tabNames,
    rowCount,
    syncedAt: new Date().toISOString(),
  };
}

/**
 * Fire the one-way Sheets mirror after a completion without blocking the caller.
 * The spec requires the sheet to refresh live after EVERY completion on both the
 * old static tools and the Mission Control pipeline, but a sheet rewrite must
 * never fail or slow the underlying upsert. So this swallows the
 * "not configured" case quietly (the mirror is simply off until connected) and
 * logs any real sync failure loudly without propagating it. Call as
 * fire-and-forget: `void triggerSheetsSyncBestEffort()`.
 */
export async function triggerSheetsSyncBestEffort(): Promise<void> {
  try {
    const result = await syncSheets();
    logger.info(
      { tabs: result.tabs, rowCount: result.rowCount },
      "Work-log mirrored to Google Sheet",
    );
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      logger.debug({ reason: err.message }, "Sheets sync skipped (not configured)");
      return;
    }
    logger.error({ err }, "Best-effort Google Sheets sync failed");
  }
}

/**
 * Resolve a Google access token for the Sheets API from the Replit connection
 * settings. Returns null when no connection is configured (caller fails loud).
 */
async function getGoogleSheetsAccessToken(): Promise<string | null> {
  const direct = process.env.GOOGLE_SHEETS_ACCESS_TOKEN?.trim();
  if (direct) return direct;

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xToken =
    process.env.REPL_IDENTITY ?? process.env.WEB_REPL_RENEWAL ?? process.env.REPLIT_IDENTITY_TOKEN;
  if (!hostname || !xToken) return null;
  try {
    const res = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=google-sheet`,
      { headers: { accept: "application/json", x_replit_token: xToken } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      items?: { settings?: { access_token?: string; oauth?: { credentials?: { access_token?: string } } } }[];
    };
    const item = data.items?.[0];
    return (
      item?.settings?.access_token ??
      item?.settings?.oauth?.credentials?.access_token ??
      null
    );
  } catch {
    return null;
  }
}

async function ensureSheetTabs(
  spreadsheetId: string,
  accessToken: string,
  tabNames: string[],
): Promise<void> {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (!metaRes.ok) {
    throw new Error(`Could not read spreadsheet ${spreadsheetId}: HTTP ${metaRes.status}`);
  }
  const meta = (await metaRes.json()) as { sheets?: { properties?: { title?: string } }[] };
  const existing = new Set((meta.sheets ?? []).map((s) => s.properties?.title));
  const missing = tabNames.filter((t) => !existing.has(t));
  if (missing.length === 0) return;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Could not create missing sheet tabs: HTTP ${res.status}`);
  }
}

async function clearSheetTab(
  spreadsheetId: string,
  accessToken: string,
  tab: string,
): Promise<void> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      tab,
    )}:clear`,
    { method: "POST", headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw new Error(`Could not clear sheet tab "${tab}": HTTP ${res.status}`);
  }
}

async function writeSheetTab(
  spreadsheetId: string,
  accessToken: string,
  tab: string,
  values: (string | number | null)[][],
): Promise<void> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      tab,
    )}!A1?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ values }),
    },
  );
  if (!res.ok) {
    throw new Error(`Could not write sheet tab "${tab}": HTTP ${res.status}`);
  }
}
