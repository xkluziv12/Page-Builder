import { and, eq, gte } from "drizzle-orm";
import { db, mcSeoSnapshotTable } from "@workspace/db";
import { logger } from "./logger";
import { isGscConfigured, pullSearchConsole } from "./mc-worklog-external";

/**
 * Internal monthly SEO scheduler. The spec requires the dated Google Search
 * Console snapshots to be populated by a scheduled internal job (no n8n hop), a
 * few days into each month to respect GSC's ~2–3 day data lag. This runs a cheap
 * daily check inside the server process and fires the monthly GSC pull once per
 * calendar month, idempotently.
 *
 * It is deliberately self-correcting: rather than persisting "last run" state, it
 * asks the snapshot table whether a `gsc-monthly` snapshot already exists this
 * month. So a restart mid-month never double-pulls, and a server that was down on
 * the scheduled day still catches up on the next daily tick.
 */

const DAY_OF_MONTH = clampDay(Number(process.env.GSC_PULL_DAY_OF_MONTH ?? "3"));
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 60 * 1000;

function clampDay(n: number): number {
  if (!Number.isFinite(n)) return 3;
  return Math.min(28, Math.max(1, Math.trunc(n)));
}

/** Has a monthly GSC snapshot already been recorded in the current month? */
async function alreadyPulledThisMonth(): Promise<boolean> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = await db
    .select({ id: mcSeoSnapshotTable.id })
    .from(mcSeoSnapshotTable)
    .where(
      and(eq(mcSeoSnapshotTable.source, "gsc-monthly"), gte(mcSeoSnapshotTable.snapshotDate, monthStart)),
    )
    .limit(1);
  return rows.length > 0;
}

async function maybeRunMonthlyGsc(): Promise<void> {
  // Gated: stay quiet (don't throw) until GSC credentials are configured.
  if (!isGscConfigured()) return;
  if (new Date().getUTCDate() < DAY_OF_MONTH) return;
  if (await alreadyPulledThisMonth()) return;
  logger.info("Running scheduled monthly Google Search Console snapshot pull");
  const result = await pullSearchConsole();
  logger.info({ result }, "Scheduled monthly GSC pull complete");
}

/**
 * Start the daily scheduler tick. Timers are unref'd so they never hold the
 * process open during a restart/shutdown.
 */
export function startWorkLogScheduler(): void {
  const tick = () => {
    void maybeRunMonthlyGsc().catch((err) =>
      logger.error({ err }, "Scheduled monthly GSC pull failed"),
    );
  };
  const startupTimer = setTimeout(tick, STARTUP_DELAY_MS);
  startupTimer.unref?.();
  const interval = setInterval(tick, CHECK_INTERVAL_MS);
  interval.unref?.();
  logger.info({ dayOfMonth: DAY_OF_MONTH }, "Work-log monthly GSC scheduler started");
}
