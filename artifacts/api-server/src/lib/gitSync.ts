import { eq, isNotNull } from "drizzle-orm";
import { db, promptsTable } from "@workspace/db";
import { getSourceHeadSha, readSourceFile } from "./github";
import { logger } from "./logger";

export type SyncSummary = {
  ok: boolean;
  sha: string | null;
  skipped: boolean;
  changed: { id: number; brand: string; slug: string; version: number }[];
  unchanged: number;
  errors: { path: string; detail: string }[];
  detail: string;
};

let lastSyncedSha: string | null = null;
let lastSyncedAt: Date | null = null;
let running = false;

export function getSyncStatus(): {
  lastSyncedSha: string | null;
  lastSyncedAt: string | null;
  sourceRepo: string | null;
} {
  return {
    lastSyncedSha,
    lastSyncedAt: lastSyncedAt ? lastSyncedAt.toISOString() : null,
    sourceRepo: process.env.GITHUB_SOURCE_REPO?.trim() || null,
  };
}

/**
 * Pull the read-only source-of-truth prompt files (GITHUB_SOURCE_REPO) into the
 * DB. For each prompt with a `gitSourcePath`, the source file's content becomes
 * both the editable `content` and the live `publishedContent` (so VAs see the
 * latest immediately), bumping the version when the text actually changed.
 *
 * Cheap by default: it first checks the source branch HEAD SHA and skips the
 * per-file fetch when nothing changed since the last successful sync. Pass
 * `force: true` (manual trigger / webhook) to fetch regardless.
 *
 * Never throws — returns a per-file status so a single bad file can't abort the
 * rest and nothing is silently swallowed.
 */
export async function syncFromGit(
  opts: { force?: boolean } = {},
): Promise<SyncSummary> {
  if (running) {
    return {
      ok: true,
      sha: lastSyncedSha,
      skipped: true,
      changed: [],
      unchanged: 0,
      errors: [],
      detail: "A sync is already in progress.",
    };
  }
  running = true;
  try {
    const head = await getSourceHeadSha();
    if (!head.ok) {
      return {
        ok: false,
        sha: lastSyncedSha,
        skipped: false,
        changed: [],
        unchanged: 0,
        errors: [{ path: "<HEAD>", detail: head.detail }],
        detail: head.detail,
      };
    }

    if (!opts.force && head.sha === lastSyncedSha) {
      return {
        ok: true,
        sha: head.sha,
        skipped: true,
        changed: [],
        unchanged: 0,
        errors: [],
        detail: "Source unchanged; nothing to sync.",
      };
    }

    const rows = await db
      .select()
      .from(promptsTable)
      .where(isNotNull(promptsTable.gitSourcePath));

    const changed: SyncSummary["changed"] = [];
    const errors: SyncSummary["errors"] = [];
    let unchanged = 0;

    for (const row of rows) {
      const path = row.gitSourcePath;
      if (!path) continue;
      const file = await readSourceFile(path);
      if (!file.ok) {
        errors.push({ path, detail: file.detail });
        continue;
      }
      if (file.content === row.content && file.content === row.publishedContent) {
        unchanged++;
        continue;
      }
      const nextVersion = row.version + 1;
      const [updated] = await db
        .update(promptsTable)
        .set({
          content: file.content,
          publishedContent: file.content,
          version: nextVersion,
          publishedVersion: nextVersion,
          updatedAt: new Date(),
          lastSyncedAt: new Date(),
        })
        .where(eq(promptsTable.id, row.id))
        .returning();
      if (updated) {
        changed.push({
          id: updated.id,
          brand: updated.brand,
          slug: updated.slug,
          version: updated.version,
        });
      }
    }

    // Only advance the synced SHA when every mapped file read cleanly, so a
    // transient read error doesn't get masked on the next (skipped) poll.
    if (errors.length === 0) {
      lastSyncedSha = head.sha;
      lastSyncedAt = new Date();
    }

    const detail = `Synced @${head.sha.slice(0, 7)}: ${changed.length} updated, ${unchanged} unchanged${
      errors.length ? `, ${errors.length} error(s)` : ""
    }.`;
    if (changed.length || errors.length) {
      logger.info(
        {
          sha: head.sha,
          changed: changed.length,
          unchanged,
          errors: errors.length,
        },
        "git prompt sync",
      );
    }
    return {
      ok: errors.length === 0,
      sha: head.sha,
      skipped: false,
      changed,
      unchanged,
      errors,
      detail,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unexpected sync error.";
    logger.error({ err }, "git prompt sync failed");
    return {
      ok: false,
      sha: lastSyncedSha,
      skipped: false,
      changed: [],
      unchanged: 0,
      errors: [{ path: "<sync>", detail }],
      detail,
    };
  } finally {
    running = false;
  }
}

/**
 * Start the background poller. Disabled (with a warning) when GITHUB_SOURCE_REPO
 * is unset. The interval is intentionally short so a push is reflected within
 * seconds; for true-instant, point a GitHub push webhook at
 * POST /api/prompts/sync/github.
 */
export function startGitSyncPoller(): void {
  const repo = process.env.GITHUB_SOURCE_REPO?.trim();
  if (!repo) {
    logger.warn(
      "GITHUB_SOURCE_REPO not set; git prompt auto-sync is disabled.",
    );
    return;
  }
  const raw = Number(process.env.GIT_SYNC_INTERVAL_MS ?? 10_000);
  const interval = Number.isFinite(raw) && raw >= 3_000 ? raw : 10_000;

  void syncFromGit({ force: true }).then((s) =>
    logger.info({ detail: s.detail }, "initial git prompt sync"),
  );
  setInterval(() => {
    void syncFromGit();
  }, interval);
  logger.info({ repo, interval }, "git prompt auto-sync poller started");
}
