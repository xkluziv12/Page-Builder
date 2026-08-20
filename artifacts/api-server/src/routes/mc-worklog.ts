import { Router, type IRouter } from "express";
import {
  WorkLogValidationError,
  listSnapshots,
  listWorkLog,
  reconcileSitemap,
  serializeSnapshot,
  serializeWorkLog,
  upsertWorkLog,
  type WorkLogFilters,
} from "../lib/mc-worklog";
import {
  NotConfiguredError,
  importWorkLog,
  pullSearchConsole,
  syncSheets,
  triggerSheetsSyncBestEffort,
  type RawImportRow,
} from "../lib/mc-worklog-external";

const router: IRouter = Router();

function qpString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// GET /mc/work-log — the canonical work-log (with embedded SEO delta), filtered.
router.get("/mc/work-log", async (req, res) => {
  const filters: WorkLogFilters = {
    company: qpString(req.query.company),
    vaName: qpString(req.query.vaName),
    status: qpString(req.query.status),
    pageType: qpString(req.query.pageType),
    month: qpString(req.query.month),
  };
  const rows = await listWorkLog(filters);
  res.json(rows);
});

// POST /mc/work-log — upsert a record (natural-keyed by normalized URL).
router.post("/mc/work-log", async (req, res) => {
  try {
    const row = await upsertWorkLog(req.body ?? {});
    // Mirror the completion out to the Google Sheet live (fire-and-forget so a
    // sheet write never blocks or fails the old-tool log POST).
    void triggerSheetsSyncBestEffort();
    res.json(serializeWorkLog(row));
  } catch (err) {
    if (err instanceof WorkLogValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "work-log upsert failed");
    res.status(500).json({ error: "Failed to upsert work-log record." });
  }
});

// GET /mc/work-log/:id/snapshots — dated SEO snapshot history for a page.
router.get("/mc/work-log/:id/snapshots", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "A numeric work-log id is required." });
    return;
  }
  const rows = await listSnapshots(id);
  res.json(rows.map(serializeSnapshot));
});

// POST /mc/work-log/import — one-time historical import.
router.post("/mc/work-log/import", async (req, res) => {
  const body = req.body ?? {};
  const rows: RawImportRow[] = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) {
    res.status(400).json({ error: "An array of legacy `rows` is required to import." });
    return;
  }
  const defaultCompany = ["STS", "DCD", "TechnoCycle"].includes(body.defaultCompany)
    ? body.defaultCompany
    : "STS";
  const result = await importWorkLog(rows, defaultCompany);
  // Refresh the sheet once after the bulk import (fire-and-forget).
  void triggerSheetsSyncBestEffort();
  res.json(result);
});

// GET /mc/sitemap-reconcile — reconcile the work-log against the live sitemap.
router.get("/mc/sitemap-reconcile", async (req, res) => {
  const persist = req.query.persist === "true" || req.query.persist === "1";
  try {
    const report = await reconcileSitemap(persist);
    res.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sitemap reconciliation failed.";
    req.log.warn({ err }, "sitemap reconcile failed");
    res.status(400).json({ error: message });
  }
});

// POST /mc/sheets/sync — one-way mirror of the work-log to the Google Sheet.
router.post("/mc/sheets/sync", async (req, res) => {
  try {
    const result = await syncSheets();
    res.json(result);
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      res.status(400).json({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : "Google Sheets sync failed.";
    req.log.error({ err }, "sheets sync failed");
    res.status(400).json({ error: message });
  }
});

// POST /mc/gsc/pull — pull dated SEO snapshots from Google Search Console.
router.post("/mc/gsc/pull", async (req, res) => {
  try {
    const result = await pullSearchConsole();
    res.json(result);
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      res.status(400).json({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : "Search Console pull failed.";
    req.log.error({ err }, "gsc pull failed");
    res.status(400).json({ error: message });
  }
});

export default router;
