import {
  TOKEN_ENV,
  computeLocalSnapshot,
  mirrorToGitHub,
  resolveMirrorConfig,
  type MirrorSummary,
} from "@workspace/github-sync";
import { logger } from "./logger";

/**
 * Background one-way GitHub mirror. Every tick it cheaply fingerprints the
 * tracked working tree; only when the fingerprint moved since the last clean
 * sync does it run a full mirror pass (blob diff + commit + ref update) to the
 * configured repo. The workspace is the source of truth; remote-only edits are
 * overwritten. Failures (missing token, GitHub errors) log loudly EVERY tick —
 * they never take the server down and never silently no-op.
 */

const DEFAULT_INTERVAL_MINUTES = 5;
const STARTUP_DELAY_MS = 30 * 1000;

function intervalMinutes(): number {
  const raw = Number(process.env.GITHUB_SYNC_INTERVAL_MINUTES ?? DEFAULT_INTERVAL_MINUTES);
  if (!Number.isFinite(raw)) return DEFAULT_INTERVAL_MINUTES;
  return Math.min(720, Math.max(1, Math.trunc(raw)));
}

export type GitHubSyncStatus = {
  enabled: boolean;
  repo: string;
  branch: string;
  intervalMinutes: number;
  syncing: boolean;
  lastCheckedAt: string | null;
  lastSyncAt: string | null;
  lastCommitSha: string | null;
  lastDetail: string | null;
  lastError: string | null;
};

const state = {
  enabled: false,
  syncing: false,
  lastCheckedAt: null as Date | null,
  lastSyncAt: null as Date | null,
  lastCommitSha: null as string | null,
  lastDetail: null as string | null,
  lastError: null as string | null,
};

/** Digest of the last snapshot known to match the remote — the cheap skip gate. */
let lastCleanDigest: string | null = null;

export function getGitHubSyncStatus(): GitHubSyncStatus {
  return {
    enabled: state.enabled,
    repo: process.env.GITHUB_SYNC_REPO?.trim() || "xkluziv12/page-terminal",
    branch: process.env.GITHUB_SYNC_BRANCH?.trim() || "main",
    intervalMinutes: intervalMinutes(),
    syncing: state.syncing,
    lastCheckedAt: state.lastCheckedAt?.toISOString() ?? null,
    lastSyncAt: state.lastSyncAt?.toISOString() ?? null,
    lastCommitSha: state.lastCommitSha,
    lastDetail: state.lastDetail,
    lastError: state.lastError,
  };
}

/**
 * Run one mirror pass now (manual trigger or scheduler tick). Mutex-guarded so
 * overlapping calls never race; the loser gets a "already running" summary.
 */
export async function runGitHubSyncNow(): Promise<MirrorSummary> {
  if (state.syncing) {
    return {
      ok: true,
      skipped: true,
      detail: "A GitHub sync is already in progress.",
      commitSha: state.lastCommitSha,
      added: 0,
      modified: 0,
      deleted: 0,
      digest: lastCleanDigest,
      errors: [],
    };
  }
  state.syncing = true;
  try {
    const summary = await mirrorToGitHub();
    state.lastCheckedAt = new Date();
    if (summary.ok) {
      state.lastError = null;
      state.lastDetail = summary.detail;
      if (summary.digest) lastCleanDigest = summary.digest;
      if (summary.commitSha) state.lastCommitSha = summary.commitSha;
      if (!summary.skipped) {
        state.lastSyncAt = new Date();
        logger.info(
          {
            commitSha: summary.commitSha,
            added: summary.added,
            modified: summary.modified,
            deleted: summary.deleted,
          },
          "GitHub auto-sync pushed a mirror commit",
        );
      } else if (!state.lastSyncAt) {
        // First clean check after boot with nothing to push still counts as "in sync".
        state.lastSyncAt = new Date();
      }
    } else {
      state.lastError = summary.detail;
      state.lastDetail = summary.detail;
      logger.error({ errors: summary.errors }, `GitHub auto-sync FAILED: ${summary.detail}`);
    }
    return summary;
  } finally {
    state.syncing = false;
  }
}

async function tick(): Promise<void> {
  if (state.syncing) return;

  // Fail loudly every tick when config is broken (missing token etc.).
  const config = await resolveMirrorConfig();
  if (!config.ok) {
    state.lastCheckedAt = new Date();
    state.lastError = config.detail;
    logger.error(`GitHub auto-sync cannot run: ${config.detail}`);
    return;
  }

  // Cheap local fingerprint: skip the GitHub round-trips when nothing moved.
  const snap = await computeLocalSnapshot(config.config.root);
  if (!snap.ok) {
    state.lastCheckedAt = new Date();
    state.lastError = snap.detail;
    logger.error(`GitHub auto-sync snapshot failed: ${snap.detail}`);
    return;
  }
  if (lastCleanDigest && snap.snapshot.digest === lastCleanDigest) {
    state.lastCheckedAt = new Date();
    return;
  }

  await runGitHubSyncNow();
}

/**
 * Start the mirror scheduler. Kill switch: GITHUB_SYNC_DISABLED=1.
 * Interval: GITHUB_SYNC_INTERVAL_MINUTES (default 5, clamped 1–720).
 * Timers are unref'd so they never hold the process open during shutdown.
 */
export function startGitHubMirrorScheduler(): void {
  if (process.env.GITHUB_SYNC_DISABLED === "1") {
    logger.warn("GitHub auto-sync is DISABLED via GITHUB_SYNC_DISABLED=1.");
    return;
  }
  state.enabled = true;
  if (!process.env[TOKEN_ENV]?.trim()) {
    logger.error(
      `GitHub auto-sync token missing at startup: the "${TOKEN_ENV}" secret is not set. The scheduler will keep checking and logging this every tick.`,
    );
  }
  const minutes = intervalMinutes();
  const run = () => {
    void tick().catch((err) => logger.error({ err }, "GitHub auto-sync tick crashed"));
  };
  const startupTimer = setTimeout(run, STARTUP_DELAY_MS);
  startupTimer.unref?.();
  const interval = setInterval(run, minutes * 60 * 1000);
  interval.unref?.();
  logger.info(
    { intervalMinutes: minutes, repo: getGitHubSyncStatus().repo, branch: getGitHubSyncStatus().branch },
    "GitHub auto-sync scheduler started",
  );
}
