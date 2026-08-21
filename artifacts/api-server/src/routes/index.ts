import { Router, type IRouter } from "express";
import githubSyncRouter from "./github-sync";
import healthRouter from "./health";
import mcRouter from "./mc";
import mcWorkLogRouter from "./mc-worklog";
import { requireAdmin } from "../middlewares/adminAuth";
import promptsRouter from "./prompts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(githubSyncRouter);
// Prompt status and published-prompt reads are intentionally public. Mount
// before the router-wide Mission Control admin gate so it cannot intercept
// these safe prompt endpoints.
router.use(promptsRouter);
router.use(mcRouter);
router.use(requireAdmin, mcWorkLogRouter);

export default router;
