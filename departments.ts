import { Router } from "express";
import { db } from "@workspace/db";
import { departmentsTable, employeesTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import {
  CreateDepartmentBody,
  UpdateDepartmentBody,
  UpdateDepartmentParams,
  DeleteDepartmentParams,
  GetDepartmentParams,
} from "@workspace/api-zod";

const router = Router();

async function enrichDepartment(dept: typeof departmentsTable.$inferSelect) {
  const [countResult, headRows] = await Promise.all([
    db.select({ count: count() }).from(employeesTable).where(eq(employeesTable.department_id, dept.id)),
    dept.head_employee_id
      ? db
          .select({ full_name: employeesTable.full_name })
          .from(employeesTable)
          .where(eq(employeesTable.id, dept.head_employee_id))
          .limit(1)
      : Promise.resolve([]),
  ]);

  return {
    ...dept,
    employee_count: Number(countResult[0]?.count ?? 0),
    head_name: (headRows as Array<{ full_name: string }>)[0]?.full_name ?? null,
  };
}

router.get("/departments", async (_req, res) => {
  const depts = await db.select().from(departmentsTable).orderBy(departmentsTable.name);
  const enriched = await Promise.all(depts.map(enrichDepartment));
  res.json(enriched);
});

router.post("/departments", async (req, res) => {
  const parsed = CreateDepartmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const [inserted] = await db.insert(departmentsTable).values(parsed.data).returning();
  const enriched = await enrichDepartment(inserted);
  res.status(201).json(enriched);
});

router.get("/departments/:id", async (req, res) => {
  const parsed = GetDepartmentParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const rows = await db.select().from(departmentsTable).where(eq(departmentsTable.id, parsed.data.id)).limit(1);
  if (!rows[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const enriched = await enrichDepartment(rows[0]);
  res.json(enriched);
});

router.patch("/departments/:id", async (req, res) => {
  const paramParsed = UpdateDepartmentParams.safeParse({ id: Number(req.params.id) });
  if (!paramParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const bodyParsed = UpdateDepartmentBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(bodyParsed.data)) {
    if (v !== null && v !== undefined) updates[k] = v;
  }

  const [updated] = await db
    .update(departmentsTable)
    .set(updates)
    .where(eq(departmentsTable.id, paramParsed.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const enriched = await enrichDepartment(updated);
  res.json(enriched);
});

router.delete("/departments/:id", async (req, res) => {
  const parsed = DeleteDepartmentParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  await db.delete(departmentsTable).where(eq(departmentsTable.id, parsed.data.id));
  res.status(204).send();
});

export default router;
