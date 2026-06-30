import { Router } from "express";
import { db } from "@workspace/db";
import { attendanceTable, employeesTable } from "@workspace/db";
import { eq, and, gte, lte, count, sql } from "drizzle-orm";
import {
  ListAttendanceQueryParams,
  CreateAttendanceBody,
  UpdateAttendanceBody,
  UpdateAttendanceParams,
  DeleteAttendanceParams,
  GetMonthlyAttendanceStatsQueryParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/attendance", async (req, res) => {
  const parsed = ListAttendanceQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }

  const { employee_id, date_from, date_to, status } = parsed.data;
  const conditions = [];
  if (employee_id != null) conditions.push(eq(attendanceTable.employee_id, employee_id));
  if (date_from) conditions.push(gte(attendanceTable.date, date_from));
  if (date_to) conditions.push(lte(attendanceTable.date, date_to));
  if (status) conditions.push(eq(attendanceTable.status, status));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: attendanceTable.id,
      employee_id: attendanceTable.employee_id,
      employee_name: employeesTable.full_name,
      date: attendanceTable.date,
      status: attendanceTable.status,
      check_in: attendanceTable.check_in,
      check_out: attendanceTable.check_out,
      notes: attendanceTable.notes,
      created_at: attendanceTable.created_at,
    })
    .from(attendanceTable)
    .leftJoin(employeesTable, eq(attendanceTable.employee_id, employeesTable.id))
    .where(whereClause)
    .orderBy(sql`${attendanceTable.date} DESC`);

  res.json(rows);
});

router.post("/attendance", async (req, res) => {
  const parsed = CreateAttendanceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const [inserted] = await db.insert(attendanceTable).values(parsed.data).returning();
  const emp = await db.select({ full_name: employeesTable.full_name }).from(employeesTable).where(eq(employeesTable.id, inserted.employee_id)).limit(1);

  res.status(201).json({ ...inserted, employee_name: emp[0]?.full_name ?? null });
});

router.patch("/attendance/:id", async (req, res) => {
  const paramParsed = UpdateAttendanceParams.safeParse({ id: Number(req.params.id) });
  if (!paramParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const bodyParsed = UpdateAttendanceBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(bodyParsed.data)) {
    if (v !== null && v !== undefined) updates[k] = v;
  }

  const [updated] = await db
    .update(attendanceTable)
    .set(updates)
    .where(eq(attendanceTable.id, paramParsed.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const emp = await db.select({ full_name: employeesTable.full_name }).from(employeesTable).where(eq(employeesTable.id, updated.employee_id)).limit(1);
  res.json({ ...updated, employee_name: emp[0]?.full_name ?? null });
});

router.delete("/attendance/:id", async (req, res) => {
  const parsed = DeleteAttendanceParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  await db.delete(attendanceTable).where(eq(attendanceTable.id, parsed.data.id));
  res.status(204).send();
});

router.get("/attendance/stats/monthly", async (req, res) => {
  const parsed = GetMonthlyAttendanceStatsQueryParams.safeParse({
    year: req.query.year ? Number(req.query.year) : undefined,
    month: req.query.month ? Number(req.query.month) : undefined,
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }

  const now = new Date();
  const year = parsed.data.year ?? now.getFullYear();
  const month = parsed.data.month ?? now.getMonth() + 1;

  const dateFrom = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const dateTo = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const records = await db
    .select()
    .from(attendanceTable)
    .where(and(gte(attendanceTable.date, dateFrom), lte(attendanceTable.date, dateTo)));

  const presentCount = records.filter((r) => r.status === "present").length;
  const absentCount = records.filter((r) => r.status === "absent").length;
  const lateCount = records.filter((r) => r.status === "late").length;
  const total = records.length;

  // Group by date
  const byDate: Record<string, { present: number; absent: number; late: number }> = {};
  for (const r of records) {
    const d = r.date;
    if (!byDate[d]) byDate[d] = { present: 0, absent: 0, late: 0 };
    if (r.status === "present") byDate[d].present++;
    else if (r.status === "absent") byDate[d].absent++;
    else if (r.status === "late") byDate[d].late++;
  }

  const dailyBreakdown = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));

  res.json({
    year,
    month,
    present_count: presentCount,
    absent_count: absentCount,
    late_count: lateCount,
    attendance_rate: total > 0 ? Math.round((presentCount / total) * 100) : 0,
    daily_breakdown: dailyBreakdown,
  });
});

export default router;
