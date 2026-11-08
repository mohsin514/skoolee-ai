import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/scope";
import { withParentScope } from "@/lib/parent/resolve-child";
import { AccessDenied } from "@/lib/auth/policy";
import { publishedPapersForClasses } from "@/lib/academic/datesheet-publication";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    return await withParentScope(req, async ({ studentId, permissions, schoolId }) => {
    if (!permissions.learningRecords) throw new AccessDenied("exam schedule");
    const student = await prisma.student.findFirst({ where: { id: studentId! }, select: { classId: true } });
    const classId = student?.classId;
    if (!classId) {
      return Response.json({ success: true, data: null });
    }

    const exams = await prisma.exam.findMany({
      // Never show families an exam the office is still drafting. Formal
      // session papers come only from the published datesheet (SKO-413).
      where: { classId, status: { not: "DRAFT" }, sessionId: null },
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

    const published = await publishedPapersForClasses(schoolId, [classId]);
    const publishedExams = published.length ? await prisma.exam.findMany({ where: { id: { in: [...new Set(published.map(p => p.examId))] } },
      select: { id: true, title: true, term: true, academicYear: true, classId: true, class: { select: { name: true, section: true } } } }) : [];
    for (const p of published) byExam[p.examId] = [...(byExam[p.examId] || []), { id: p.scheduleId, examId: p.examId, date: p.date, datesheetVersion: p.version,
      subject: { id: p.subjectId, name: p.subjectName }, periodDefinition: p.startTime && p.endTime ? { startTime: p.startTime, endTime: p.endTime } : null,
      room: p.rooms[0] ? { id: p.rooms[0].roomId, roomNumber: p.rooms.map(r => r.roomNumber).join(", ") } : null }];
    const allExams = [...exams, ...publishedExams.map(e => ({ ...e, status: "PUBLISHED_DATESHEET" }))];
    return Response.json({ success: true, data: { exams: allExams, schedules: byExam } });
    });
  } catch (error) {
    return errorResponse(error, "[parent/exam-datesheet] GET failed");
  }
}
