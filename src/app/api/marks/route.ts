// ===========================================
// CRUD /api/marks
// ===========================================

import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getTenantForUser, withTenant, tenantExec } from "@/lib/db/tenant";
import { bulkMarksSchema, markEntrySchema } from "@/lib/validators/schemas";
import { calculateGrade } from "@/lib/utils";

// GET — Get marks for a class/exam/subject combination
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
    const examId = searchParams.get("examId");
    const subjectId = searchParams.get("subjectId");
    const classId = searchParams.get("classId");

    if (!examId) {
      return Response.json({ error: "examId is required" }, { status: 400 });
    }

    let query = `
      SELECT m.*, s.first_name, s.last_name, s.registration_no
      FROM marks m
      JOIN students s ON s.id = m.student_id
      WHERE m.exam_id = $1
    `;
    const params: unknown[] = [examId];
    let idx = 2;

    if (subjectId) {
      query += ` AND m.subject_id = $${idx}`;
      params.push(subjectId);
      idx++;
    }

    if (classId) {
      query += ` AND s.class_id = $${idx}`;
      params.push(classId);
    }

    query += ` ORDER BY s.first_name ASC`;

    const marks = await withTenant(tenant.schemaName, async (q) => {
      return q(query, params);
    });

    return Response.json({ success: true, data: marks });
  } catch (error) {
    console.error("[marks] GET error:", error);
    return Response.json({ error: "Failed to fetch marks" }, { status: 500 });
  }
}

// POST — Save marks (single or bulk)
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

    // Bulk marks
    if (body.marks) {
      const parsed = bulkMarksSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json(
          { error: parsed.error.flatten() },
          { status: 400 }
        );
      }

      let saved = 0;
      for (const m of parsed.data.marks) {
        const pct = (m.marksObtained / m.maxMarks) * 100;
        const grade = calculateGrade(pct);

        await withTenant(tenant.schemaName, async () => {
          return tenantExec(
            `INSERT INTO marks (student_id, subject_id, exam_id, marks_obtained, max_marks, grade, entered_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (student_id, subject_id, exam_id)
             DO UPDATE SET marks_obtained = $4, max_marks = $5, grade = $6, entered_by = $7, updated_at = NOW()`,
            [m.studentId, m.subjectId, m.examId, m.marksObtained, m.maxMarks, grade, userId]
          );
        });
        saved++;
      }

      return Response.json({
        success: true,
        message: `${saved} marks saved`,
      });
    }

    // Single mark
    const parsed = markEntrySchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const m = parsed.data;
    const pct = (m.marksObtained / m.maxMarks) * 100;
    const grade = calculateGrade(pct);

    const result = await withTenant(tenant.schemaName, async (query) => {
      return query(
        `INSERT INTO marks (student_id, subject_id, exam_id, marks_obtained, max_marks, grade, entered_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (student_id, subject_id, exam_id)
         DO UPDATE SET marks_obtained = $4, max_marks = $5, grade = $6, entered_by = $7, updated_at = NOW()
         RETURNING *`,
        [m.studentId, m.subjectId, m.examId, m.marksObtained, m.maxMarks, grade, userId]
      );
    });

    return Response.json({ success: true, data: result });
  } catch (error) {
    console.error("[marks] POST error:", error);
    return Response.json({ error: "Failed to save marks" }, { status: 500 });
  }
}
