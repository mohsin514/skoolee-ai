// ===========================================
// CRUD /api/classes
// ===========================================

import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getTenantForUser, withTenant, tenantExec } from "@/lib/db/tenant";
import { classSchema } from "@/lib/validators/schemas";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenant = await getTenantForUser(userId);
    if (!tenant) {
      return Response.json({ error: "No tenant" }, { status: 403 });
    }

    const classes = await withTenant(tenant.schemaName, async (query) => {
      return query(
        `SELECT c.*, 
                (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id) as student_count
         FROM classes c 
         ORDER BY c.grade_level ASC, c.name ASC`
      );
    });

    return Response.json({ success: true, data: classes });
  } catch (error) {
    console.error("[classes] GET error:", error);
    return Response.json({ error: "Failed to fetch classes" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenant = await getTenantForUser(userId);
    if (!tenant) {
      return Response.json({ error: "No tenant" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = classSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const c = parsed.data;
    const result = await withTenant(tenant.schemaName, async (query) => {
      return query(
        `INSERT INTO classes (name, section, grade_level, academic_year, teacher_id, capacity)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [c.name, c.section || null, c.gradeLevel, c.academicYear, c.teacherId || null, c.capacity]
      );
    });

    return Response.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    console.error("[classes] POST error:", error);
    return Response.json({ error: "Failed to create class" }, { status: 500 });
  }
}
