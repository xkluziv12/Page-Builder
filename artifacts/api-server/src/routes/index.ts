import { Router, type IRouter } from "express";
import healthRouter from "./health";
import mcRouter from "./mc";
import mcWorkLogRouter from "./mc-worklog";

const router: IRouter = Router();

router.use(healthRouter);
router.use(mcRouter);
router.use(mcWorkLogRouter);

export default router;
