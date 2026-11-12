import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, type AuthUser } from "@/lib/auth";
import { billingAccessResponse, planFeatureResponse } from "@/lib/billing/response";
import { isCampusAdminRole } from "@/lib/roles";
import { batchRemarkSchema, remarkRequestSchema } from "@/lib/validators/schemas";
import { isLockedStatus } from "@/lib/academic/report-cards";
import {
  AICreditError,
  consumeAICreditAndLog,
  ensureAICreditsAvailable,
  getAIModel,
  generateRemark,
} from "@/lib/ai/openai";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// SKAI-1842: one batch request drafts at most BATCH_CHUNK_SIZE pupils, BATCH_CONCURRENCY at a time, and returns
// nextCursor so the client asks for the rest. A class no longer has to finish inside a single request.
export const maxDuration = 60;
const BATCH_CHUNK_SIZE = 20;
const BATCH_CONCURRENCY = 4;

type RemarkMarks = Array<{ subject: string; obtained: number; total: number; grade: string }>;

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function canGenerateRemarks(role: string) {
  return role === "TEACHER" || role === "PRINCIPAL" || role === "SUPER_ADMIN" || isCampusAdminRole(role);
}

function errorResponse(error: unknown, fallback = "AI remark generation failed") {
  if (error instanceof AICreditError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  const status = (error as Error & { status?: number }).status || 503;
  return Response.json({ error: status === 400 || status === 403 || status === 404 || status === 409 ? (error as Error).message : "The AI service is unavailable right now. You can continue editing manually." }, { status });
}

async function getScopedExam(examId: string, user: AuthUser) {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, campus: { schoolId: user.schoolId } },
    include: { class: { select: { id: true, name: true, section: true } } },
  });

  if (!exam) {
    const error = new Error("Exam not found");
    (error as Error & { status?: number }).status = 404;
    throw error;
  }

  if (user.campusId && exam.campusId !== user.campusId) {
    const error = new Error("Exam is outside your campus");
    (error as Error & { status?: number }).status = 403;
    throw error;
  }

  if (!exam.isLocked && !isLockedStatus(exam.status)) {
    const error = new Error("Generate report remarks after exam lock");
    (error as Error & { status?: number }).status = 409;
    throw error;
  }

  return exam;
}

async function ensureTeacherCanAccessExam(user: AuthUser, exam: Awaited<ReturnType<typeof getScopedExam>>) {
  if (user.role !== "TEACHER") return;

  const assignedSubjects = await prisma.subject.count({
    where: {
      campusId: exam.campusId,
      classId: exam.classId,
      teacherId: user.userId,
      campus: { schoolId: user.schoolId },
    },
  });

  if (assignedSubjects === 0) {
    const error = new Error("Teacher is not assigned to this exam class");
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
}

async function getStudentMarks({
  user,
  campusId,
  studentId,
  examId,
}: {
  user: AuthUser;
  campusId: string;
  studentId: string;
  examId: string;
}) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, campusId, campus: { schoolId: user.schoolId } },
  });
  if (!student) {
    const error = new Error("Student not found");
    (error as Error & { status?: number }).status = 404;
    throw error;
  }

  const marks = await prisma.mark.findMany({
    where: {
      studentId,
      examId,
      campusId,
      campus: { schoolId: user.schoolId },
      ...(user.role === "TEACHER" ? { subject: { teacherId: user.userId } } : {}),
    },
    include: { subject: { select: { name: true, totalMarks: true } } },
    orderBy: { subject: { name: "asc" } },
  });

  const formatted = marks.map((mark) => ({
    subject: mark.subject.name,
    obtained: mark.marksObtained,
    total: mark.subject.totalMarks,
    grade: mark.grade || "",
  }));

  if (formatted.length === 0) {
    const error = new Error("No marks found for student");
    (error as Error & { status?: number }).status = 409;
    throw error;
  }

  return { student, marks: formatted };
}

async function saveRemarkDraft({
  user,
  campusId,
  examId,
  studentId,
  studentName,
  marks,
  result,
  action,
}: {
  user: AuthUser;
  campusId: string;
  examId: string;
  studentId: string;
  studentName: string;
  marks: RemarkMarks;
  result: Awaited<ReturnType<typeof generateRemark>>;
  action: string;
}) {
  const output = {
    remarkEn: result.remarkEn,
    remarkUr: result.remarkUr,
  };

  return consumeAICreditAndLog(
    {
      schoolId: user.schoolId,
      campusId,
      userId: user.userId,
      feature: "generate_remarks",
      action,
      promptVersion: result.promptVersion,
      model: result.model,
      tokensUsed: result.tokensUsed,
      approvalStatus: "PENDING_REVIEW",
      output: jsonValue(output),
      metadata: jsonValue({ examId, studentId, marks }),
    },
    async (tx) => {
      const reportCard = await tx.reportCard.upsert({
        where: { studentId_examId: { studentId, examId } },
        update: {
          remarksEn: result.remarkEn,
          remarksUr: result.remarkUr,
          remarksApproved: false,
          approvedBy: null,
          approvedAt: null,
          pdfUrl: null,
          status: "GENERATED",
        },
        create: {
          campusId,
          studentId,
          examId,
          remarksEn: result.remarkEn,
          remarksUr: result.remarkUr,
          remarksApproved: false,
          status: "GENERATED",
        },
      });

      await tx.aIReviewItem.create({
        data: {
          schoolId: user.schoolId,
          campusId,
          userId: user.userId,
          feature: "generate_remarks",
          relatedType: "REPORT_CARD",
          relatedId: reportCard.id,
          title: `${studentName} report remark draft`,
          draft: jsonValue(output),
          status: "PENDING",
          promptVersion: result.promptVersion,
          model: result.model,
          tokensUsed: result.tokensUsed,
        },
      });

      await tx.aIInsight.create({
        data: {
          schoolId: user.schoolId,
          campusId,
          userId: user.userId,
          role: user.role,
          feature: "generate_remarks",
          action,
          title: `${studentName} report remark draft`,
          summary: result.remarkEn || result.remarkUr || "Report remark draft generated",
          output: jsonValue(output),
          promptVersion: result.promptVersion || "phase4-ai-v1",
          model: result.model || getAIModel(),
          tokensUsed: result.tokensUsed,
          approvalStatus: "PENDING_REVIEW",
        },
      });

      return reportCard;
    }
  );
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const billingBlocked = await billingAccessResponse(user.schoolId);
  if (billingBlocked) return billingBlocked;
  if (!canGenerateRemarks(user.role)) {
    return Response.json({ error: "AI remarks are not available for your role" }, { status: 403 });
  }
  // AI report-card remarks (drafting and Urdu translation) are a Flagship feature.
  const planBlocked = await planFeatureResponse(user, "aiRemarksEnabled");
  if (planBlocked) return planBlocked;

  try {
    const body = await parseBody(req, jsonObjectBody);
    const { batch, ...rest } = body;

    if (batch) {
      const parsed = batchRemarkSchema.safeParse(rest);
      if (!parsed.success) {
        return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
      }

      const { examId, language, tone } = parsed.data;
      const exam = await getScopedExam(examId, user);
      await ensureTeacherCanAccessExam(user, exam);
      const campusId = parsed.data.campusId || exam.campusId;

      if (campusId !== exam.campusId) {
        return Response.json({ error: "Campus does not match exam" }, { status: 400 });
      }

      const marks = await prisma.mark.findMany({
        where: {
          examId,
          campusId,
          campus: { schoolId: user.schoolId },
          ...(user.role === "TEACHER" ? { subject: { teacherId: user.userId } } : {}),
        },
        select: {
          studentId: true,
          marksObtained: true,
          grade: true,
          student: { select: { id: true, fullName: true } },
          subject: { select: { name: true, totalMarks: true } },
        },
        // studentId breaks rollNo ties so every cursor request sees the pupils in the same order.
        orderBy: [{ student: { rollNo: "asc" } }, { studentId: "asc" }, { subject: { name: "asc" } }],
      });

      const byStudent = marks.reduce((acc, mark) => {
        if (!acc[mark.studentId]) acc[mark.studentId] = { student: mark.student, marks: [] };
        acc[mark.studentId].marks.push({
          subject: mark.subject.name,
          obtained: mark.marksObtained,
          total: mark.subject.totalMarks,
          grade: mark.grade || "",
        });
        return acc;
      }, {} as Record<string, { student: (typeof marks)[0]["student"]; marks: RemarkMarks }>);

      const students = Object.values(byStudent);
      const cursor = parsed.data.cursor;
      const chunk = students.slice(cursor, cursor + BATCH_CHUNK_SIZE);
      // Credits are checked for this chunk only; drafts saved by earlier chunks are kept either way.
      await ensureAICreditsAvailable(user.schoolId, chunk.length);
      const className = [exam.class.name, exam.class.section].filter(Boolean).join(" - ");

      const outcomes = await mapWithConcurrency(chunk, BATCH_CONCURRENCY, async ({ student, marks: studentMarks }) => {
        try {
          const result = await generateRemark({
            studentName: student.fullName,
            className,
            subjects: studentMarks.map((mark) => ({
              name: mark.subject,
              marksObtained: mark.obtained,
              maxMarks: mark.total,
              grade: mark.grade,
            })),
            language,
            tone,
          });

          await saveRemarkDraft({
            user,
            campusId,
            examId,
            studentId: student.id,
            studentName: student.fullName,
            marks: studentMarks,
            result,
            action: "batch_remark",
          });
          return null;
        } catch {
          return {
            studentId: student.id,
            error: "The AI service is unavailable. Continue this draft manually.",
          };
        }
      });

      const failed = outcomes.filter((outcome): outcome is { studentId: string; error: string } => outcome !== null);
      const succeeded = chunk.length - failed.length;
      const processed = cursor + chunk.length;
      const nextCursor = processed < students.length ? processed : null;

      return Response.json({ success: true, total: students.length, processed, succeeded, failed, nextCursor });
    }

    const parsed = remarkRequestSchema.safeParse(rest);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const { studentId, examId, language, tone } = parsed.data;
    const exam = await getScopedExam(examId, user);
    await ensureTeacherCanAccessExam(user, exam);
    const campusId = parsed.data.campusId || exam.campusId;

    if (campusId !== exam.campusId) {
      return Response.json({ error: "Campus does not match exam" }, { status: 400 });
    }

    await ensureAICreditsAvailable(user.schoolId);

    const { student, marks } = await getStudentMarks({ user, campusId, studentId, examId });
    const result = await generateRemark({
      studentName: student.fullName,
      className: [exam.class.name, exam.class.section].filter(Boolean).join(" - "),
      subjects: marks.map((mark) => ({
        name: mark.subject,
        marksObtained: mark.obtained,
        maxMarks: mark.total,
        grade: mark.grade,
      })),
      language,
      tone,
    });

    await saveRemarkDraft({
      user,
      campusId,
      examId,
      studentId,
      studentName: student.fullName,
      marks,
      result,
      action: "single_remark",
    });

    return Response.json({ success: true, remarks: { en: result.remarkEn, ur: result.remarkUr } });
  } catch (error) {
    return errorResponse(error);
  }
}
