// ===========================================
// CRUD /api/students
// ===========================================

import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getTenantForUser, withTenant, tenantExec } from "@/lib/db/tenant";
import { studentSchema, bulkStudentSchema } from "@/lib/validators/schemas";
import { z } from "zod";

// GET — List all students (with optional class filter)
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenant = await getTenantForUser(userId);
    if (!tenant) {
      return Response.json({ error: "No tenant" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");
    const status = searchParams.get("status") || "ACTIVE";
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = (page - 1) * limit;

    let whereClause = `WHERE status = $1`;
    const params: unknown[] = [status];
    let paramIdx = 2;

    if (classId) {
      whereClause += ` AND class_id = $${paramIdx}`;
      params.push(classId);
      paramIdx++;
    }

    if (search) {
      whereClause += ` AND (first_name ILIKE $${paramIdx} OR last_name ILIKE $${paramIdx} OR registration_no ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    const students = await withTenant(tenant.schemaName, async (query) => {
      return query(
        `SELECT * FROM students ${whereClause} ORDER BY first_name ASC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, limit, offset]
      );
    });

    return Response.json({ success: true, data: students });
  } catch (error) {
    console.error("[students] GET error:", error);
    return Response.json({ error: "Failed to fetch students" }, { status: 500 });
  }
}

// POST — Create a student (or bulk create)
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

    // Check if bulk or single
    if (body.students) {
      const parsed = bulkStudentSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json(
          { error: parsed.error.flatten() },
          { status: 400 }
        );
      }

      for (const s of parsed.data.students) {
        await withTenant(tenant.schemaName, async () => {
          return tenantExec(
            `INSERT INTO students (registration_no, first_name, last_name, date_of_birth, gender, guardian_name, guardian_phone, guardian_email, guardian_whatsapp, address, class_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              s.registrationNo, s.firstName, s.lastName,
              s.dateOfBirth || null, s.gender || null,
              s.guardianName || null, s.guardianPhone || null,
              s.guardianEmail || null, s.guardianWhatsapp || null,
              s.address || null, s.classId || null,
            ]
          );
        });
      }

      return Response.json({
        success: true,
        message: `${parsed.data.students.length} students created`,
      });
    }

    // Single student
    const parsed = studentSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const s = parsed.data;
    const result = await withTenant(tenant.schemaName, async (query) => {
      return query(
        `INSERT INTO students (registration_no, first_name, last_name, date_of_birth, gender, guardian_name, guardian_phone, guardian_email, guardian_whatsapp, address, class_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          s.registrationNo, s.firstName, s.lastName,
          s.dateOfBirth || null, s.gender || null,
          s.guardianName || null, s.guardianPhone || null,
          s.guardianEmail || null, s.guardianWhatsapp || null,
          s.address || null, s.classId || null,
        ]
      );
    });

    return Response.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    console.error("[students] POST error:", error);
    return Response.json({ error: "Failed to create student" }, { status: 500 });
  }
}
