import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const BRANDS = ["sts", "dcd", "technocycle"] as const;
export type Brand = (typeof BRANDS)[number];

export const promptsTable = pgTable(
  "prompts",
  {
    id: serial("id").primaryKey(),
    brand: text("brand").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    content: text("content").notNull().default(""),
    version: integer("version").notNull().default(0),
    publishedContent: text("published_content"),
    publishedVersion: integer("published_version"),
    driveFileId: text("drive_file_id"),
    // Path of the read-only source-of-truth file in GITHUB_SOURCE_REPO
    // (e.g. "sts-dcd/page-builder.md"). When set, auto-sync pulls this file's
    // content into the prompt. Null = not driven by git sync.
    gitSourcePath: text("git_source_path"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastPublishedAt: timestamp("last_published_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("prompts_brand_slug_unq").on(table.brand, table.slug)],
);

export const promptPublishesTable = pgTable("prompt_publishes", {
  id: serial("id").primaryKey(),
  promptId: integer("prompt_id")
    .notNull()
    .references(() => promptsTable.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  driveStatus: text("drive_status").notNull(),
  driveDetail: text("drive_detail"),
  driveFileId: text("drive_file_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertPromptSchema = createInsertSchema(promptsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastPublishedAt: true,
});
export type InsertPrompt = z.infer<typeof insertPromptSchema>;
export type Prompt = typeof promptsTable.$inferSelect;

export type PromptPublish = typeof promptPublishesTable.$inferSelect;
