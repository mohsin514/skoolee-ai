// ===========================================
// CRUD /api/subjects
// ===========================================

import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getTenantForUser, withTenant, tenantExec } from "@/lib/db/tenant";
import { subjectSchema } from "@/lib/validators/schemas";

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

    const subjects = await withTenant(tenant.schemaName, async (query) => {
      return query(`SELECT * FROM subjects ORDER BY name ASC`);
    });

    return Response.json({ success: true, data: subjects });
  } catch (error) {
    console.error("[subjects] GET error:", error);
    return Response.json({ error: "Failed to fetch subjects" }, { status: 500 });
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
    const parsed = subjectSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const s = parsed.data;
    const result = await withTenant(tenant.schemaName, async (query) => {
      return query(
        `INSERT INTO subjects (name, code, description, max_marks, passing_marks, is_optional)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [s.name, s.code, s.description || null, s.maxMarks, s.passingMarks, s.isOptional]
      );
    });

    return Response.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    console.error("[subjects] POST error:", error);
    return Response.json({ error: "Failed to create subject" }, { status: 500 });
  }
}
