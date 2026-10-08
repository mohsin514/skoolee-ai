import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/scope";
import { withParentScope } from "@/lib/parent/resolve-child";
import { AccessDenied } from "@/lib/auth/policy";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    return await withParentScope(req, async ({ studentId, permissions }) => {
    if (!permissions.learningRecords) throw new AccessDenied("exam schedule");
    const student = await prisma.student.findFirst({ where: { id: studentId! }, select: { classId: true } });
    const classId = student?.classId;
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
    });
  } catch (error) {
    return errorResponse(error, "[parent/exam-datesheet] GET failed");
  }
}
