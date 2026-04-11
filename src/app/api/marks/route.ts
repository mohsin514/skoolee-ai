// ─────────────────────────────────────────────────────────────────
// Diagram 3 — Marks APIs
// POST /api/marks        — Teacher bulk submits marks
// GET  /api/marks?examId= — Get all marks for an exam
// ─────────────────────────────────────────────────────────────────
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, calculateGrade } from "@/lib/auth";
import { bulkMarksSchema } from "@/lib/validators/schemas";

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "TEACHER" && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    return Response.json({ error: "Only teachers can enter marks" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = bulkMarksSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { examId, campusId, entries } = parsed.data;

  // Verify exam is not locked
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) return Response.json({ error: "Exam not found" }, { status: 404 });
  if (exam.isLocked) return Response.json({ error: "Exam is locked — marks cannot be edited" }, { status: 403 });

  // Upsert each mark entry
  const results = await Promise.all(
    entries.map(async (entry) => {
      const subject = await prisma.subject.findUnique({ where: { id: entry.subjectId } });
      const grade = calculateGrade(entry.marksObtained, subject?.totalMarks || 100);

      return prisma.mark.upsert({
        where: {
          examId_studentId_subjectId: {
            examId,
            studentId: entry.studentId,
            subjectId: entry.subjectId,
          },
        },
        update: { marksObtained: entry.marksObtained, grade, enteredBy: user.userId },
        create: {
          campusId,
          examId,
          studentId: entry.studentId,
          subjectId: entry.subjectId,
          marksObtained: entry.marksObtained,
          grade,
          enteredBy: user.userId,
        },
      });
    })
  );

  return Response.json({ success: true, count: results.length });
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const examId = searchParams.get("examId");
  const campusId = searchParams.get("campusId") || user.campusId;

  if (!examId) return Response.json({ error: "examId required" }, { status: 400 });

  const marks = await prisma.mark.findMany({
    where: { examId, campusId: campusId || undefined },
    include: {
      student: { select: { fullName: true, rollNo: true } },
      subject: { select: { name: true, totalMarks: true } },
    },
    orderBy: [{ student: { rollNo: "asc" } }, { subject: { name: "asc" } }],
  });

  return Response.json({ success: true, marks });
}
