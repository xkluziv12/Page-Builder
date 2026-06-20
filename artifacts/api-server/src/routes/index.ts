import { Router, type IRouter } from "express";
import healthRouter from "./health";
import mcRouter from "./mc";

const router: IRouter = Router();

router.use(healthRouter);
router.use(mcRouter);

export default router;
