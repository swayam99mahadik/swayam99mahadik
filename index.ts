import { Router, type IRouter } from "express";
import healthRouter from "./health";
import employeesRouter from "./employees";
import departmentsRouter from "./departments";
import attendanceRouter from "./attendance";
import leavesRouter from "./leaves";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(employeesRouter);
router.use(departmentsRouter);
router.use(attendanceRouter);
router.use(leavesRouter);
router.use(dashboardRouter);

export default router;
