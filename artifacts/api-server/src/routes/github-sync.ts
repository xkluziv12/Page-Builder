import { Router, type IRouter } from "express";
import {
  getGitHubSyncStatus,
  runGitHubSyncNow,
} from "../lib/github-mirror-scheduler";

const router: IRouter = Router();

// Outbound GitHub mirror status (read-only, ungated — exposes no secrets;
// follows the same convention as /prompts/sync/status).
router.get("/github-sync/status", (_req, res): void => {
  res.json(getGitHubSyncStatus());
});

// Manual "sync now" trigger. Runs a full mirror pass immediately and returns
// the summary; 502 when the push failed so callers can't mistake it for success.
router.post("/github-sync/now", async (req, res): Promise<void> => {
  req.log.info("Manual GitHub sync triggered");
  const summary = await runGitHubSyncNow();
  res.status(summary.ok ? 200 : 502).json(summary);
});

export default router;
