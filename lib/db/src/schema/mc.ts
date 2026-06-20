import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
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
