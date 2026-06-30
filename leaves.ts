import { Router } from "express";
import { db } from "@workspace/db";
import { leavesTable, employeesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  ListLeavesQueryParams,
  CreateLeaveBody,
  UpdateLeaveBody,
  UpdateLeaveParams,
  DeleteLeaveParams,
  GetLeaveParams,
} from "@workspace/api-zod";

const router = Router();

async function enrichLeave(leave: typeof leavesTable.$inferSelect) {
  const [empRows, approverRows] = await Promise.all([
    db.select({ full_name: employeesTable.full_name }).from(employeesTable).where(eq(employeesTable.id, leave.employee_id)).limit(1),
    leave.approved_by
      ? db.select({ full_name: employeesTable.full_name }).from(employeesTable).where(eq(employeesTable.id, leave.approved_by)).limit(1)
      : Promise.resolve([]),
  ]);

  return {
    ...leave,
    employee_name: empRows[0]?.full_name ?? null,
    approver_name: (approverRows as Array<{ full_name: string }>)[0]?.full_name ?? null,
  };
}

router.get("/leaves", async (req, res) => {
  const parsed = ListLeavesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }

  const { employee_id, status } = parsed.data;
  const conditions = [];
  if (employee_id != null) conditions.push(eq(leavesTable.employee_id, employee_id));
  if (status) conditions.push(eq(leavesTable.status, status));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db.select().from(leavesTable).where(whereClause).orderBy(leavesTable.created_at);
  const enriched = await Promise.all(rows.map(enrichLeave));

  res.json(enriched);
});

router.post("/leaves", async (req, res) => {
  const parsed = CreateLeaveBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const [inserted] = await db.insert(leavesTable).values(parsed.data).returning();
  const enriched = await enrichLeave(inserted);
  res.status(201).json(enriched);
});

router.get("/leaves/:id", async (req, res) => {
  const parsed = GetLeaveParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const rows = await db.select().from(leavesTable).where(eq(leavesTable.id, parsed.data.id)).limit(1);
  if (!rows[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const enriched = await enrichLeave(rows[0]);
  res.json(enriched);
});

router.patch("/leaves/:id", async (req, res) => {
  const paramParsed = UpdateLeaveParams.safeParse({ id: Number(req.params.id) });
  if (!paramParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const bodyParsed = UpdateLeaveBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(bodyParsed.data)) {
    if (v !== null && v !== undefined) updates[k] = v;
  }

  const [updated] = await db
    .update(leavesTable)
    .set(updates)
    .where(eq(leavesTable.id, paramParsed.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const enriched = await enrichLeave(updated);
  res.json(enriched);
});

router.delete("/leaves/:id", async (req, res) => {
  const parsed = DeleteLeaveParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  await db.delete(leavesTable).where(eq(leavesTable.id, parsed.data.id));
  res.status(204).send();
});

export default router;
