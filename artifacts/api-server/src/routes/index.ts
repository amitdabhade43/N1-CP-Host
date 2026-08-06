import { Router } from "express";
import type { IRouter } from "express";
import healthRouter from "./health.js";
import instancesRouter from "./instances.js";
import actionsRouter from "./actions.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/instances", instancesRouter);
router.use("/actions/:instanceId", actionsRouter);

export default router;
