import { Router, type IRouter } from "express";
import githubSyncRouter from "./github-sync";
import healthRouter from "./health";
import mcRouter from "./mc";
import mcWorkLogRouter from "./mc-worklog";
import promptsRouter from "./prompts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(githubSyncRouter);
router.use(mcRouter);
router.use(mcWorkLogRouter);
router.use(promptsRouter);

export default router;
