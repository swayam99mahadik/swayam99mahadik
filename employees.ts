import { Router } from "express";
import { db } from "@workspace/db";
import { employeesTable, departmentsTable } from "@workspace/db";
import { eq, ilike, and, count, sql } from "drizzle-orm";
import {
  ListEmployeesQueryParams,
  CreateEmployeeBody,
  UpdateEmployeeBody,
  UpdateEmployeeParams,
  DeleteEmployeeParams,
  GetEmployeeParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/employees", async (req, res) => {
  const parsed = ListEmployeesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }

  const { department_id, status, search, page = 1, page_size = 20 } = parsed.data;
  const offset = ((page ?? 1) - 1) * (page_size ?? 20);

  const conditions = [];
  if (department_id != null) conditions.push(eq(employeesTable.department_id, department_id));
  if (status) conditions.push(eq(employeesTable.status, status));
  if (search) conditions.push(ilike(employeesTable.full_name, `%${search}%`));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [employees, totalResult] = await Promise.all([
    db
      .select({
        id: employeesTable.id,
        employee_id: employeesTable.employee_id,
        full_name: employeesTable.full_name,
        email: employeesTable.email,
        phone: employeesTable.phone,
        department_id: employeesTable.department_id,
        department_name: departmentsTable.name,
        designation: employeesTable.designation,
        salary: employeesTable.salary,
        joining_date: employeesTable.joining_date,
        status: employeesTable.status,
        created_at: employeesTable.created_at,
      })
      .from(employeesTable)
      .leftJoin(departmentsTable, eq(employeesTable.department_id, departmentsTable.id))
      .where(whereClause)
      .limit(page_size ?? 20)
      .offset(offset),
    db.select({ count: count() }).from(employeesTable).where(whereClause),
  ]);

  res.json({
    data: employees.map((e) => ({ ...e, salary: e.salary ? Number(e.salary) : null })),
    total: Number(totalResult[0]?.count ?? 0),
    page: page ?? 1,
    page_size: page_size ?? 20,
  });
});

router.post("/employees", async (req, res) => {
  const parsed = CreateEmployeeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const data = parsed.data;
  // Auto-generate employee_id if not provided
  if (!data.employee_id) {
    const countResult = await db.select({ count: count() }).from(employeesTable);
    const num = Number(countResult[0]?.count ?? 0) + 1;
    (data as typeof data & { employee_id: string }).employee_id = `EMP${String(num).padStart(3, "0")}`;
  }

  const [inserted] = await db
    .insert(employeesTable)
    .values({
      ...data,
      employee_id: data.employee_id ?? `EMP001`,
    })
    .returning();

  const dept = inserted.department_id
    ? await db.select().from(departmentsTable).where(eq(departmentsTable.id, inserted.department_id)).limit(1)
    : [];

  res.status(201).json({
    ...inserted,
    salary: inserted.salary ? Number(inserted.salary) : null,
    department_name: dept[0]?.name ?? null,
  });
});

router.get("/employees/:id", async (req, res) => {
  const parsed = GetEmployeeParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const rows = await db
    .select({
      id: employeesTable.id,
      employee_id: employeesTable.employee_id,
      full_name: employeesTable.full_name,
      email: employeesTable.email,
      phone: employeesTable.phone,
      department_id: employeesTable.department_id,
      department_name: departmentsTable.name,
      designation: employeesTable.designation,
      salary: employeesTable.salary,
      joining_date: employeesTable.joining_date,
      status: employeesTable.status,
      created_at: employeesTable.created_at,
    })
    .from(employeesTable)
    .leftJoin(departmentsTable, eq(employeesTable.department_id, departmentsTable.id))
    .where(eq(employeesTable.id, parsed.data.id))
    .limit(1);

  if (!rows[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const e = rows[0];
  res.json({ ...e, salary: e.salary ? Number(e.salary) : null });
});

router.patch("/employees/:id", async (req, res) => {
  const paramParsed = UpdateEmployeeParams.safeParse({ id: Number(req.params.id) });
  if (!paramParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const bodyParsed = UpdateEmployeeBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(bodyParsed.data)) {
    if (v !== null && v !== undefined) updates[k] = v;
  }

  const [updated] = await db
    .update(employeesTable)
    .set(updates)
    .where(eq(employeesTable.id, paramParsed.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const dept = updated.department_id
    ? await db.select().from(departmentsTable).where(eq(departmentsTable.id, updated.department_id)).limit(1)
    : [];

  res.json({
    ...updated,
    salary: updated.salary ? Number(updated.salary) : null,
    department_name: dept[0]?.name ?? null,
  });
});

router.delete("/employees/:id", async (req, res) => {
  const parsed = DeleteEmployeeParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  await db.delete(employeesTable).where(eq(employeesTable.id, parsed.data.id));
  res.status(204).send();
});

export default router;
