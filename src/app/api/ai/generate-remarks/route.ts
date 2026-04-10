// ===========================================
// POST /api/ai/generate-remarks
// ===========================================
// Generates AI-powered report card remarks
// for a student, deducts AI credits, and
// stores the result in the tenant schema.

import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getTenantForUser, withTenant, tenantExec } from "@/lib/db/tenant";
import { generateRemark } from "@/lib/ai/openai";

const requestSchema = z.object({
  studentId: z.string().min(1),
  subjectId: z.string().min(1),
  examId: z.string().min(1),
  marks: z.number().min(0),
  maxMarks: z.number().min(1),
  language: z.enum(["en", "ur", "both"]).default("both"),
  tone: z.enum(["formal", "encouraging", "constructive"]).default("formal"),
});

export async function POST(req: NextRequest) {
  try {
    // ── Auth ────────────────────────────────────────────
    const { userId } = await auth();
    if (!userId) {
      return Response.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const tenant = await getTenantForUser(userId);
    if (!tenant) {
      return Response.json(
        { success: false, error: "No tenant found for user" },
        { status: 403 }
      );
    }

    // ── Validate input ──────────────────────────────────
    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { success: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { studentId, subjectId, examId, marks, maxMarks, language, tone } =
      parsed.data;

    // ── Check AI credit limit ───────────────────────────
    const tenantRecord = await prisma.tenant.findUnique({
      where: { id: tenant.id },
    });
    if (!tenantRecord) {
      return Response.json(
        { success: false, error: "Tenant not found" },
        { status: 404 }
      );
    }
    if (tenantRecord.aiCreditsUsed >= tenantRecord.aiCreditsLimit) {
      return Response.json(
        {
          success: false,
          error: "AI credit limit reached. Please upgrade your plan.",
        },
        { status: 429 }
      );
    }

    // ── Fetch student name from tenant schema ───────────
    const studentRows = await withTenant(tenant.schemaName, async (query) => {
      return query<Array<{ first_name: string; last_name: string }>>(
        `SELECT first_name, last_name FROM students WHERE id = $1`,
        [studentId]
      );
    });
    const studentName =
      Array.isArray(studentRows) && studentRows.length > 0
        ? `${studentRows[0].first_name} ${studentRows[0].last_name}`
        : "Student";

    // ── Fetch subject name ──────────────────────────────
    const subjectRows = await withTenant(tenant.schemaName, async (query) => {
      return query<Array<{ name: string }>>(
        `SELECT name FROM subjects WHERE id = $1`,
        [subjectId]
      );
    });
    const subjectName =
      Array.isArray(subjectRows) && subjectRows.length > 0
        ? subjectRows[0].name
        : "Subject";

    // ── Generate AI remark ──────────────────────────────
    const percentage = (marks / maxMarks) * 100;
    const grade =
      percentage >= 90
        ? "A+"
        : percentage >= 80
          ? "A"
          : percentage >= 70
            ? "B"
            : percentage >= 60
              ? "C"
              : percentage >= 50
                ? "D"
                : "F";

    const result = await generateRemark({
      studentName,
      className: "Class",
      subjects: [
        {
          name: subjectName,
          marksObtained: marks,
          maxMarks,
          grade,
        },
      ],
      language,
      tone,
    });

    // ── Store remark in tenant schema ───────────────────
    await withTenant(tenant.schemaName, async () => {
      return tenantExec(
        `UPDATE marks
         SET ai_remark_en = $1, ai_remark_ur = $2, grade = $3, updated_at = NOW()
         WHERE student_id = $4 AND subject_id = $5 AND exam_id = $6`,
        [
          result.remarkEn || null,
          result.remarkUr || null,
          grade,
          studentId,
          subjectId,
          examId,
        ]
      );
    });

    // ── Deduct AI credits ───────────────────────────────
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { aiCreditsUsed: { increment: 1 } },
    });

    // ── Log usage ───────────────────────────────────────
    await prisma.aIUsageLog.create({
      data: {
        tenantId: tenant.id,
        action: "generate_remark",
        tokensUsed: result.tokensUsed,
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      },
    });

    return Response.json({
      success: true,
      data: {
        remarkEn: result.remarkEn,
        remarkUr: result.remarkUr,
        tokensUsed: result.tokensUsed,
        creditsRemaining:
          tenantRecord.aiCreditsLimit - tenantRecord.aiCreditsUsed - 1,
      },
    });
  } catch (error) {
    console.error("[AI/generate-remarks] Error:", error);
    return Response.json(
      {
        success: false,
        error: "Failed to generate remark",
      },
      { status: 500 }
    );
  }
}
