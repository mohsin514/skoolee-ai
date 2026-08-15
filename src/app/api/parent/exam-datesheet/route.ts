import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/scope";
import { resolveParentScope } from "@/lib/parent/resolve-child";

export const runtime = "nodejs";

async function resolveClassId(req: NextRequest): Promise<string | null> {
  const { studentId } = await resolveParentScope(req);
  if (!studentId) return null;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { classId: true },
  });
  return student?.classId || null;
}

export async function GET(req: NextRequest) {
  try {
    const classId = await resolveClassId(req);
    if (!classId) {
      return Response.json({ success: true, data: null });
    }

    const exams = await prisma.exam.findMany({
      // Never show families an exam the office is still drafting.
      where: { classId, status: { not: "DRAFT" } },
      select: {
        id: true,
        title: true,
        term: true,
        academicYear: true,
        status: true,
        classId: true,
        class: { select: { name: true, section: true } },
      },
      orderBy: [{ academicYear: "desc" }, { title: "asc" }],
    });

    const examIds = exams.map((e) => e.id);
    const schedules = examIds.length
      ? await prisma.examSchedule.findMany({
          where: { examId: { in: examIds } },
          include: {
            subject: { select: { id: true, name: true } },
            periodDefinition: { select: { periodNumber: true, startTime: true, endTime: true } },
            room: { select: { id: true, roomNumber: true } },
          },
          orderBy: [{ date: "asc" }, { periodDefinition: { periodNumber: "asc" } }],
        })
      : [];

    const byExam: Record<string, any[]> = {};
    for (const s of schedules) {
      byExam[s.examId] = [...(byExam[s.examId] || []), s];
    }

    return Response.json({ success: true, data: { exams, schedules: byExam } });
  } catch (error) {
    return errorResponse(error, "[parent/exam-datesheet] GET failed");
  }
}
