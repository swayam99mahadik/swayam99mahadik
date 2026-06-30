import { Router } from "express";
import { db } from "@workspace/db";
import { employeesTable, departmentsTable, attendanceTable, leavesTable } from "@workspace/db";
import { eq, count, sql, gte, and, lt } from "drizzle-orm";

const router = Router();

router.get("/dashboard/summary", async (_req, res) => {
  const now = new Date();
  const today = now.toISOString().split("T")[0]!;
  const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStart = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}-01`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0]!;

  const [
    totalEmpResult,
    activeEmpResult,
    totalDeptResult,
    todayAttendance,
    yesterdayAttendance,
    pendingLeavesResult,
    newHiresResult,
    lastMonthHiresResult,
    lastMonthEmpResult,
    onLeaveTodayResult,
  ] = await Promise.all([
    db.select({ count: count() }).from(employeesTable),
    db.select({ count: count() }).from(employeesTable).where(eq(employeesTable.status, "active")),
    db.select({ count: count() }).from(departmentsTable),
    db.select().from(attendanceTable).where(eq(attendanceTable.date, today)),
    db.select().from(attendanceTable).where(eq(attendanceTable.date, yesterdayStr)),
    db.select({ count: count() }).from(leavesTable).where(eq(leavesTable.status, "pending")),
    db.select({ count: count() }).from(employeesTable).where(gte(employeesTable.joining_date, thisMonthStart)),
    db.select({ count: count() }).from(employeesTable).where(
      and(gte(employeesTable.joining_date, lastMonthStart), lt(employeesTable.joining_date, thisMonthStart))
    ),
    db.select({ count: count() }).from(employeesTable).where(lt(employeesTable.joining_date, thisMonthStart)),
    db.select({ count: count() }).from(leavesTable).where(
      and(
        eq(leavesTable.status, "approved"),
        sql`${leavesTable.start_date} <= ${today}`,
        sql`${leavesTable.end_date} >= ${today}`
      )
    ),
  ]);

  const totalPresent = todayAttendance.filter((r) => r.status === "present").length;
  const totalToday = todayAttendance.length;
  const attendanceRate = totalToday > 0 ? Math.round((totalPresent / totalToday) * 100) : 0;

  const yPresent = yesterdayAttendance.filter((r) => r.status === "present").length;
  const yTotal = yesterdayAttendance.length;
  const yesterdayAttendanceRate = yTotal > 0 ? Math.round((yPresent / yTotal) * 100) : 0;

  const currentEmpCount = Number(totalEmpResult[0]?.count ?? 0);
  const lastMonthEmpCount = Number(lastMonthEmpResult[0]?.count ?? 0);
  const empGrowthPct = lastMonthEmpCount > 0
    ? Math.round(((currentEmpCount - lastMonthEmpCount) / lastMonthEmpCount) * 100)
    : 0;

  const newHires = Number(newHiresResult[0]?.count ?? 0);
  const lastMonthHires = Number(lastMonthHiresResult[0]?.count ?? 0);
  const hiresGrowthPct = lastMonthHires > 0
    ? Math.round(((newHires - lastMonthHires) / lastMonthHires) * 100)
    : newHires > 0 ? 100 : 0;

  res.json({
    total_employees: currentEmpCount,
    total_departments: Number(totalDeptResult[0]?.count ?? 0),
    attendance_rate_today: attendanceRate,
    pending_leaves: Number(pendingLeavesResult[0]?.count ?? 0),
    active_employees: Number(activeEmpResult[0]?.count ?? 0),
    new_hires_this_month: newHires,
    employee_growth_pct: empGrowthPct,
    hires_growth_pct: hiresGrowthPct,
    last_month_hires: lastMonthHires,
    on_leave_today: Number(onLeaveTodayResult[0]?.count ?? 0),
    yesterday_attendance_rate: yesterdayAttendanceRate,
  });
});

router.get("/dashboard/department-distribution", async (_req, res) => {
  const depts = await db.select().from(departmentsTable).orderBy(departmentsTable.name);
  const distribution = await Promise.all(
    depts.map(async (dept) => {
      const empCount = await db
        .select({ count: count() })
        .from(employeesTable)
        .where(eq(employeesTable.department_id, dept.id));
      return {
        department_name: dept.name,
        employee_count: Number(empCount[0]?.count ?? 0),
      };
    })
  );
  res.json(distribution);
});

router.get("/dashboard/attendance-trend", async (_req, res) => {
  const now = new Date();
  const days = 30;
  const trend = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0]!;
    const records = await db.select().from(attendanceTable).where(eq(attendanceTable.date, dateStr));
    trend.push({
      date: dateStr,
      present: records.filter((r) => r.status === "present").length,
      absent: records.filter((r) => r.status === "absent").length,
      late: records.filter((r) => r.status === "late").length,
    });
  }

  res.json(trend);
});

router.get("/dashboard/recent-activity", async (_req, res) => {
  const [recentEmployees, recentLeaves, recentAttendance] = await Promise.all([
    db.select().from(employeesTable).orderBy(sql`${employeesTable.created_at} DESC`).limit(5),
    db
      .select({
        id: leavesTable.id,
        status: leavesTable.status,
        leave_type: leavesTable.leave_type,
        created_at: leavesTable.created_at,
        employee_name: employeesTable.full_name,
      })
      .from(leavesTable)
      .leftJoin(employeesTable, eq(leavesTable.employee_id, employeesTable.id))
      .orderBy(sql`${leavesTable.created_at} DESC`)
      .limit(5),
    db
      .select({
        id: attendanceTable.id,
        status: attendanceTable.status,
        date: attendanceTable.date,
        created_at: attendanceTable.created_at,
        employee_name: employeesTable.full_name,
      })
      .from(attendanceTable)
      .leftJoin(employeesTable, eq(attendanceTable.employee_id, employeesTable.id))
      .orderBy(sql`${attendanceTable.created_at} DESC`)
      .limit(5),
  ]);

  const activities = [
    ...recentEmployees.map((e) => ({
      id: e.id,
      type: "employee_added",
      message: `${e.full_name} joined as ${e.designation}`,
      timestamp: e.created_at.toISOString(),
      employee_name: e.full_name,
    })),
    ...recentLeaves.map((l) => ({
      id: l.id + 10000,
      type: "leave_request",
      message: `${l.employee_name ?? "Unknown"} requested ${l.leave_type} leave — ${l.status}`,
      timestamp: l.created_at.toISOString(),
      employee_name: l.employee_name ?? null,
    })),
    ...recentAttendance.map((a) => ({
      id: a.id + 20000,
      type: "attendance_marked",
      message: `${a.employee_name ?? "Unknown"} marked ${a.status} on ${a.date}`,
      timestamp: a.created_at.toISOString(),
      employee_name: a.employee_name ?? null,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 12);

  res.json(activities);
});

export default router;
