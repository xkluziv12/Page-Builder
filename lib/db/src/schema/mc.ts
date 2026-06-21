import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Mission Control build runs. Most pipeline state lives on the run row as JSONB
 * (phases, research brief, checker report, joomla meta) so a single read
 * reconstructs the full MissionRun the dashboard renders.
 */
export const mcRunsTable = pgTable("mc_runs", {
  id: serial("id").primaryKey(),
  /** Name of the VA who created the run (DB tracking of who built each page). */
  vaName: text("va_name").notNull().default(""),
  /** The target page URL the run was created from (drives city/state/SEO derivation). */
  url: text("url"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  track: text("track").notNull().default("page"),
  engine: text("engine").notNull().default("claude"),
  status: text("status").notNull().default("draft"),
  currentPhase: text("current_phase").notNull().default("research"),
  classification: text("classification").notNull().default("NEW_BUILD"),
  niche: text("niche").notNull().default("general"),
  competition: text("competition").notNull().default("LOW"),
  pageType: text("page_type").notNull().default("SPOKE"),
  existingUrls: jsonb("existing_urls").$type<string[]>().notNull().default([]),
  handoff: text("handoff"),
  verifiedCid: text("verified_cid"),
  designBibleHash: text("design_bible_hash"),
  blogTopic: text("blog_topic"),
  researchBrief: jsonb("research_brief").$type<Record<string, unknown> | null>(),
  /** Live per-URL SEO intelligence (SerpAPI + DataForSEO); replaces the manual SEO sheet. */
  seoIntel: jsonb("seo_intel").$type<Record<string, unknown> | null>(),
  pageHtml: text("page_html"),
  generatedSchema: text("generated_schema"),
  joomlaMeta: jsonb("joomla_meta").$type<Record<string, unknown> | null>(),
  checkerReport: jsonb("checker_report").$type<Record<string, unknown> | null>(),
  linkAuditOverride: jsonb("link_audit_override").$type<Record<string, unknown> | null>(),
  phases: jsonb("phases").$type<Record<string, unknown>[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMcRunSchema = createInsertSchema(mcRunsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMcRun = z.infer<typeof insertMcRunSchema>;
export type McRun = typeof mcRunsTable.$inferSelect;

/** AI chat-edit history per run. */
export const mcChatMessagesTable = pgTable("mc_chat_messages", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMcChatMessageSchema = createInsertSchema(mcChatMessagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMcChatMessage = z.infer<typeof insertMcChatMessageSchema>;
export type McChatMessage = typeof mcChatMessagesTable.$inferSelect;

/** Page HTML/schema version history (edit trail). */
export const mcPageVersionsTable = pgTable("mc_page_versions", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull(),
  phase: text("phase").notNull(),
  html: text("html"),
  schema: text("schema"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMcPageVersionSchema = createInsertSchema(mcPageVersionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMcPageVersion = z.infer<typeof insertMcPageVersionSchema>;
export type McPageVersion = typeof mcPageVersionsTable.$inferSelect;

/**
 * Configurable safeguard registry. The source allowlist shipped empty, so the
 * checker suite validates against these DB-seeded rows (merged with defaults)
 * rather than a hard-coded list. `kind` is one of: sacred, image, industry,
 * allowlist.
 */
export const mcUrlRegistryTable = pgTable("mc_url_registry", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  label: text("label").notNull(),
  url: text("url").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMcUrlRegistrySchema = createInsertSchema(mcUrlRegistryTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMcUrlRegistry = z.infer<typeof insertMcUrlRegistrySchema>;
export type McUrlRegistry = typeof mcUrlRegistryTable.$inferSelect;

/**
 * Durable per-city post-publish QC record. Each run of the dashboard QC suite
 * (GTmetrix speed + JSON-LD duplicate/integrity scan against the LIVE URL)
 * inserts one row so the team keeps a permanent QC trail per city. The full
 * QcReport is stored as JSONB; the boolean columns are denormalized for quick
 * listing/filtering.
 */
export const mcQcResultsTable = pgTable("mc_qc_results", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  url: text("url").notNull(),
  passed: boolean("passed").notNull(),
  gtmetrixPassed: boolean("gtmetrix_passed"),
  jsonLdPassed: boolean("json_ld_passed"),
  report: jsonb("report").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMcQcResultSchema = createInsertSchema(mcQcResultsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMcQcResult = z.infer<typeof insertMcQcResultSchema>;
export type McQcResult = typeof mcQcResultsTable.$inferSelect;

/**
 * Canonical unified work-log / page registry. This is the ONE trustworthy view of
 * "which pages/blogs are done vs not done" that every path feeds into: the old
 * static VA tools (Page Terminal, No-GMB, Hub+Spoke, Blog Terminal), the new
 * Mission Control pipeline, and the one-time historical import all upsert here.
 *
 * The natural key is `normalizedUrl` (a stripped, lower-cased URL) enforced by a
 * unique index, so re-logging the same page UPDATES the row rather than creating
 * a duplicate. SEO history lives in the separate mc_seo_snapshot table (one row
 * per check) — never overwrite a single value on this row.
 */
export const mcWorkLogTable = pgTable(
  "mc_work_log",
  {
    id: serial("id").primaryKey(),
    /** Stable natural key: normalized (protocol/host/path-only, lower-cased) URL. */
    normalizedUrl: text("normalized_url").notNull(),
    /** Company the page belongs to: STS / DCD / TechnoCycle. */
    company: text("company").notNull().default("STS"),
    city: text("city").notNull().default(""),
    state: text("state").notNull().default(""),
    /** Human page/blog name (title or descriptive label). */
    pageName: text("page_name").notNull().default(""),
    /** The original/old URL before a rebuild, when known. */
    oldUrl: text("old_url"),
    /** The live/new URL or Joomla alias the work produced. */
    newUrl: text("new_url"),
    /** Page category: city / service / hub / spoke / blog. */
    pageType: text("page_type").notNull().default("city"),
    /** Optional priority tier (e.g. Tier 1 / 2 / 3). */
    tier: text("tier"),
    /** Who did the work (VA name). */
    vaName: text("va_name").notNull().default(""),
    /** Where the record came from: old-tool / mission-control / import. */
    source: text("source").notNull().default("old-tool"),
    /** Work status: done / in_progress / not_started. */
    status: text("status").notNull().default("done"),
    /** Whether the page is actually live in the production sitemap. Null = unchecked. */
    inSitemap: boolean("in_sitemap"),
    /** Link back to the Mission Control run when this came from the pipeline. */
    runId: integer("run_id"),
    /** When the work was completed (null when not yet done). */
    dateCompleted: timestamp("date_completed", { withTimezone: true }),
    /** Free-text notes (e.g. import-mapping warnings, manual annotations). */
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    normalizedUrlIdx: uniqueIndex("mc_work_log_normalized_url_idx").on(t.normalizedUrl),
  }),
);

export const insertMcWorkLogSchema = createInsertSchema(mcWorkLogTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMcWorkLog = z.infer<typeof insertMcWorkLogSchema>;
export type McWorkLog = typeof mcWorkLogTable.$inferSelect;

/**
 * Date-stamped SEO snapshot, keyed to a work-log page (one row per page per
 * check). History is preserved so monthly check-ins can compute trends
 * (impressions % change, keyword position movement) — never overwrite. Two
 * sources populate it: a "day-of" score captured on completion, and a scheduled
 * monthly Google Search Console pull.
 */
export const mcSeoSnapshotTable = pgTable("mc_seo_snapshot", {
  id: serial("id").primaryKey(),
  workLogId: integer("work_log_id").notNull(),
  /** Denormalized natural key so snapshots survive a work-log row rebuild. */
  normalizedUrl: text("normalized_url").notNull(),
  /** When this snapshot reflects (the data date, not necessarily insert time). */
  snapshotDate: timestamp("snapshot_date", { withTimezone: true }).notNull().defaultNow(),
  /** Where the snapshot came from: day-of / gsc-monthly. */
  source: text("source").notNull().default("day-of"),
  impressions: integer("impressions"),
  clicks: integer("clicks"),
  avgPosition: real("avg_position"),
  /** Top ~5 tracked keywords + positions: [{ keyword, position }]. */
  keywords: jsonb("keywords").$type<{ keyword: string; position: number | null }[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMcSeoSnapshotSchema = createInsertSchema(mcSeoSnapshotTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMcSeoSnapshot = z.infer<typeof insertMcSeoSnapshotSchema>;
export type McSeoSnapshot = typeof mcSeoSnapshotTable.$inferSelect;
