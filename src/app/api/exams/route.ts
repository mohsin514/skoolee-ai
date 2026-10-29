import { validateStoredExamSchedules } from "@/lib/academic/exam-bookings";
import { withExamSchedulingWrite } from "@/lib/academic/exam-scheduling-write";
import { ApiError, canLeadAcademics } from "@/lib/api/scope";
import { reviewExam, publishExam } from "@/lib/academic/report-versions";
import { assertSharedModuleRead } from "@/lib/api/scope";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, type AuthUser } from "@/lib/auth";
import { diffExamDetails, examDetailsEditSchema, isExamDetailsEdit } from "@/lib/exams/edit-details";
import { studentScope } from "@/lib/auth/policy";
import { billingAccessResponse } from "@/lib/billing/response";
import { isCampusAdminRole } from "@/lib/roles";
import { examSchema, examStatusSchema } from "@/lib/validators/schemas";
import { writeAuditEvent } from "@/lib/audit-events";
import { assertPermission } from "@/lib/permissions";
import { createExamCommand, defaultExamType } from "@/lib/exams/create-command";
import {
  canManageExamType,
  isOfficeRole,
  TERM_EXAM_DENIED_MESSAGE,
} from "@/lib/academic/exam-permissions";

/**
 * assertPermission throws an Error carrying a 403. Without this the caller sees
 * a bare 500 "Operation failed" and has no idea it was a permissions problem.
 */
function permissionAwareError(error: unknown) {
  const status = (error as { status?: number })?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return Response.json(
      { error: (error as Error).message || "Insufficient permissions" },
      { status },
    );
  }
  return Response.json({ error: "Operation failed" }, { status: 500 });
}

/** Who may create or move exams. Scheduling stays with the campus office and teachers; the group admin
 *  reads results but no longer runs campus exams (§7.6, G31). */
function canManageExams(role: string) {
  return role === "PRINCIPAL" || role === "TEACHER" || isCampusAdminRole(role);
}

/** SKAI-1120: edit title / term / examType of a non-locked exam, audited. */
async function editExamDetails(user: AuthUser, body: unknown) {
  const parsed = examDetailsEditSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const edit = parsed.data;
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.exam.findFirst({ where: { id: edit.id, schoolId: user.schoolId } });
    if (!current) throw new ApiError("Exam not found", 404);
    if (user.campusId && current.campusId !== user.campusId) throw new ApiError("Exam is outside your campus", 403);
    if (!canManageExamType(user.role, current.examType)) throw new ApiError(TERM_EXAM_DENIED_MESSAGE, 403);
    if (edit.examType && !canManageExamType(user.role, edit.examType)) throw new ApiError(TERM_EXAM_DENIED_MESSAGE, 403);
    if (current.isLocked) throw new ApiError("Locked exams cannot be edited", 409);
    if (user.role === "TEACHER" && !await tx.class.findFirst({ where: { id: current.classId, schoolId: user.schoolId, campusId: current.campusId, OR: [{ classTeacherId: user.userId }, { subjects: { some: { teacherId: user.userId } } }] }, select: { id: true } })) {
      throw new ApiError("You are not assigned to this class", 403);
    }
    const diff = diffExamDetails(current, edit);
    if (!diff.changed) return current;
    // Guarded on isLocked so a lock that lands between read and write still wins.
    const result = await tx.exam.updateMany({ where: { id: current.id, schoolId: user.schoolId, isLocked: false }, data: diff.after });
    if (result.count !== 1) throw new ApiError("Locked exams cannot be edited", 409);
    await writeAuditEvent(tx, user, { table: "exams", recordId: current.id, action: "UPDATE", campusId: current.campusId, before: diff.before, after: diff.after });
    return tx.exam.findFirst({ where: { id: current.id, schoolId: user.schoolId } });
  });
  return Response.json({ success: true, exam: updated });
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    await assertSharedModuleRead(user, "exams");
    const billingBlocked = await billingAccessResponse(user.schoolId);
    if (billingBlocked) return billingBlocked;

    const { searchParams } = new URL(req.url);
    const campusId = searchParams.get("campusId") || user.campusId;
    const classId = searchParams.get("classId");
    const status = searchParams.get("status");
    const sessionId = searchParams.get("sessionId");
    // Without this the year selector is decorative: every caller asking for
    // one year got every year's exams back, mixing a closed year's papers
    // into the active one.
    const rawYear = searchParams.get("academicYear");
    const academicYear = rawYear !== null && /^\d{4}$/.test(rawYear) ? Number(rawYear) : null;

    if (!campusId && user.role !== "SUPER_ADMIN") {
      return Response.json({ error: "campusId required" }, { status: 400 });
    }

    // Families only ever see their own class, and never a draft the office is
    // still preparing.
    let audienceScope: Record<string, unknown> = {};
    if (user.role === "STUDENT" || user.role === "PARENT") {
      // `studentId` narrows a family to one child (the date sheet follows the selected child); it can only narrow:
      // a child outside the guardian's own scope matches nothing.
      const studentId = user.role === "PARENT" ? searchParams.get("studentId") : null;
      const students = await prisma.student.findMany({
        where:
          user.role === "STUDENT"
            ? { studentUserId: user.userId }
            : { AND: [studentScope(user, "learningRecords"), ...(studentId ? [{ id: studentId }] : [])] },
        select: { classId: true },
      });
      const classIds = Array.from(new Set(students.map((s) => s.classId)));
      // No linked student record means nothing to show.
      if (classIds.length === 0) return Response.json({ success: true, exams: [] });
      // Teachers still need their own drafts, so this only applies to families.
      audienceScope = { classId: { in: classIds }, status: { not: "DRAFT" } };
    }

    // Teachers only see exams they can actually open. This mirrors the
    // visibility rule in /api/marks GET exactly — anything listed here but
    // rejected there becomes a dead card on the board ("This exam is not
    // assigned to you"), which is what a class-only filter produced: a
    // subject-specific English quiz sitting in a class where the teacher only
    // takes Maths.
    if (user.role === "TEACHER") {
      const taught = await prisma.subject.findMany({
        where: { teacherId: user.userId, campus: { schoolId: user.schoolId } },
        select: { classId: true },
      });
      const taughtClassIds = [...new Set(taught.map((s) => s.classId))];

      audienceScope = {
        OR: [
          // Class teachers own every exam in their class, whatever the subject.
          { class: { classTeacherId: user.userId } },
          // Subject-specific exam for a subject they teach.
          { subject: { teacherId: user.userId } },
          // Whole-class exam in a class they teach at least one subject in —
          // /api/marks will show them just their own subjects' rows.
          { subjectId: null, classId: { in: taughtClassIds } },
        ],
        // `audienceScope` is spread after the explicit `classId` filter below
        // and would otherwise drop it, so re-apply it here.
        ...(classId ? { classId } : {}),
      };
    }

    const exams = await prisma.exam.findMany({
      where: {
        campus: { schoolId: user.schoolId, ...(campusId ? { id: campusId } : {}) },
        ...(classId ? { classId } : {}),
        ...(status ? { status } : {}),
        ...(sessionId ? { sessionId } : {}),
        ...(academicYear !== null ? { academicYear } : {}),
        ...audienceScope,
      },
      include: {
        class: { select: { id: true, name: true, section: true, academicYear: true } },
        locker: { select: { fullName: true } },
        subject: { select: { id: true, name: true, totalMarks: true } },
        session: { select: { id: true, title: true, status: true } },
        _count: { select: { marks: true, reportCards: true, schedules: true } },
      },
      orderBy: [{ academicYear: "desc" }, { title: "asc" }],
    });

    return Response.json({ success: true, exams });
  } catch (error) {
    console.error("[exams] GET failed", error);
    return Response.json({ error: "Operation failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const billingBlocked = await billingAccessResponse(user.schoolId);
    if (billingBlocked) return billingBlocked;
    if (!canManageExams(user.role)) {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }
    await assertPermission(user, "exams", "add");

    const body = await req.json();
    const parsed = examSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    // Teachers own quizzes and class tests; term exams belong to the office (enforced in the command).
    const exam = await createExamCommand(user, {
      ...parsed.data,
      examType: body.examType || defaultExamType(user.role),
    });

    return Response.json({ success: true, exam }, { status: 201 });
  } catch (error) {
    console.error("[exams] POST failed", error);
    return permissionAwareError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const billingBlocked = await billingAccessResponse(user.schoolId);
    if (billingBlocked) return billingBlocked;
    if (!canManageExams(user.role)) {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }
    await assertPermission(user, "exams", "edit");

    const body = await req.json();
    if (isExamDetailsEdit(body)) return await editExamDetails(user, body);
    const parsed = examStatusSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const exam = await prisma.exam.findUnique({
      where: { id: parsed.data.id },
      include: { _count: { select: { marks: true, reportCards: true } } },
    });

    if (!exam) return Response.json({ error: "Exam not found" }, { status: 404 });
    if (user.campusId && exam.campusId !== user.campusId) {
      return Response.json({ error: "Exam is outside your campus" }, { status: 403 });
    }

    // A teacher may only move their own quizzes and class tests along.
    if (!canManageExamType(user.role, exam.examType)) {
      return Response.json({ error: TERM_EXAM_DENIED_MESSAGE }, { status: 403 });
    }

    const target = parsed.data.status;
    // G31 (C7): review and publish are the academic lead's decisions regardless of exam type — the
    // principal, or a campus operator only while the campus has no principal. Checked here in the route
    // handler; exam-permissions.ts stays pure because client components import it [K-I3].
    if ((target === "PRINCIPAL_REVIEWED" || target === "PUBLISHED") && !(isOfficeRole(user.role) && await canLeadAcademics(user, exam.campusId))) {
      return Response.json(
        { error: "Results are reviewed and published by your principal." },
        { status: 403 },
      );
    }
    if (exam.isLocked && (target === "DRAFT" || target === "ACTIVE" || target === "MARKS_ENTRY")) {
      return Response.json({ error: "Locked exams cannot return to editable states" }, { status: 409 });
    }
    if (target === "DRAFT" && exam._count.marks > 0) {
      return Response.json({ error: "Exams with marks cannot return to draft" }, { status: 409 });
    }
    if (target === "PRINCIPAL_REVIEWED" && !exam.isLocked) {
      return Response.json({ error: "Only locked exams can be reviewed" }, { status: 409 });
    }
    if (target === "PUBLISHED" && exam.status !== "PRINCIPAL_REVIEWED") {
      return Response.json({ error: "Principal review is required before publishing" }, { status: 409 });
    }

    if (target === "PRINCIPAL_REVIEWED" || target === "PUBLISHED") {
      await assertPermission(user, "reports", "edit");
      const auditTransition = (tx: Parameters<typeof writeAuditEvent>[0], before: { status: string }, after: { status: string; versions?: number }) =>
        writeAuditEvent(tx, user, { table: "exams", recordId: exam.id, action: target === "PRINCIPAL_REVIEWED" ? "APPROVE" : "UPDATE", campusId: exam.campusId, before, after: { status: after.status, ...(after.versions !== undefined ? { reportVersions: after.versions } : {}) } });
      if (target === "PRINCIPAL_REVIEWED") await reviewExam(exam.id, user.userId, auditTransition);
      else await publishExam(exam.id, user.userId, undefined, auditTransition);
      return Response.json({ success: true, exam: await prisma.exam.findUnique({ where: { id: exam.id } }) });
    }
    const updated = await withExamSchedulingWrite(user, exam.campusId, "edit", async tx => {
      const current = await tx.exam.findFirst({ where: { id: exam.id, schoolId: user.schoolId, campusId: exam.campusId }, include: { _count: { select: { marks: true } } } });
      if (!current) throw new ApiError("Exam not found", 404);
      if (!canManageExamType(user.role, current.examType)) throw new ApiError(TERM_EXAM_DENIED_MESSAGE, 403);
      if (current.isLocked) throw new ApiError("Locked exams cannot return to editable states", 409);
      if (target === "DRAFT" && current._count.marks > 0) throw new ApiError("Exams with marks cannot return to draft", 409);
      if (user.role === "TEACHER" && !await tx.class.findFirst({ where: { id: current.classId, schoolId: user.schoolId, campusId: current.campusId, OR: [{ classTeacherId: user.userId }, { subjects: { some: { teacherId: user.userId } } }] }, select: { id: true } })) throw new ApiError("You are not assigned to this class", 403);
    const now = new Date();
    const updated = await tx.exam.update({
      where: { id: parsed.data.id },
      data: {
        status: target,
        ...(target === "ACTIVE" ? { activatedAt: current.activatedAt || now } : {}),
        ...(target === "MARKS_ENTRY" ? { marksEntryAt: current.marksEntryAt || now } : {}),
      },
      include: {
        class: { select: { id: true, name: true, section: true, academicYear: true } },
        locker: { select: { fullName: true } },
        subject: { select: { id: true, name: true, totalMarks: true } },
        _count: { select: { marks: true, reportCards: true } },
      },
    });

      const schedules = await tx.examSchedule.findMany({ where: { schoolId: user.schoolId, campusId: current.campusId, examId: current.id }, select: { id: true } });
      await validateStoredExamSchedules(tx, { schoolId: user.schoolId, campusId: current.campusId }, schedules.map(item => item.id));
      await writeAuditEvent(tx, user, { table: "exams", recordId: current.id, action: "UPDATE", campusId: current.campusId, before: { status: current.status }, after: { status: updated.status } });
      return updated;
    }, true);
    return Response.json({ success: true, exam: updated });
  } catch (error) {
    console.error("[exams] PATCH failed", error);
    return permissionAwareError(error);
  }
}
