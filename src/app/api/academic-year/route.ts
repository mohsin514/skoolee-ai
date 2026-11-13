import { applyEnrollment, dateOnly } from "@/lib/students/enrollment";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { notify } from "@/lib/notifications/in-app";
import {
  ApiError,
  assertStaffRole,
  canLeadAcademics,
  canManageAcademics,
  canManageCampusOps,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { getYearClosureReport } from "@/lib/academic/year-closure";
import { admissionNumberAllocator } from "@/lib/students/admission-number";
import { rosterStatusWhere } from "@/lib/students/roster-status";
import { writeAuditEvent } from "@/lib/audit-events";
import { lockTimetableCampus } from "@/lib/timetable/locking";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // SKAI-1768: campus-wide classes, class teachers and cohort counts are staff data; families use /parent and /student.
    assertStaffRole(user);
    const campusId = await resolveCampusId(user, req.nextUrl.searchParams.get("campusId"));

    const classes = await prisma.class.findMany({
      where: { campusId },
      select: {
        id: true,
        name: true,
        section: true,
        academicYear: true,
        status: true,
        classTeacherId: true,
        classTeacher: { select: { fullName: true } },
        // SKAI-1926: on-roll pupils only, like the roster and the year-end eligibility count.
        _count: { select: { students: { where: rosterStatusWhere(false) }, subjects: true, exams: true } },
      },
      orderBy: [{ academicYear: "desc" }, { name: "asc" }, { section: "asc" }],
    });

    const years = [...new Set(classes.map((c) => c.academicYear))].sort((a, b) => b - a);
    const classesByYear = years.map((year) => ({
      year,
      status: classes.filter((c) => c.academicYear === year).every((c) => c.status === "COMPLETED")
        ? "COMPLETED"
        : "ACTIVE",
      classes: classes.filter((c) => c.academicYear === year),
    }));

    return Response.json({ success: true, data: classesByYear });
  } catch (error) {
    return errorResponse(error, "[academic-year] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageAcademics(user)) throw new ApiError("Forbidden", 403);

    const body = await parseBody(req, jsonObjectBody);
    const { action, campusId: rawCampusId } = body;
    const campusId = await resolveCampusId(user, rawCampusId);
    // §0.3 rule 5: promotion batches are campus operations (§2.2 #30 "run batches": PR —, G23); closing a ready
    // year is the campus operator's or the academic lead's (§2.3 #70, §4.4b principal "Close year"), and only the
    // academic lead force-closes (G35, below).
    if ((action === "promote" || action === "bulk-promote") && !canManageCampusOps(user)) {
      throw new ApiError("Your campus admin runs promotion.", 403);
    }
    if (action === "close-year" && !canManageCampusOps(user) && !(await canLeadAcademics(user, campusId))) {
      throw new ApiError("Forbidden", 403);
    }

    if (action === "close-year") {
      const { academicYear, force } = body;
      if (!academicYear) throw new ApiError("academicYear is required", 400);
      const year = Number(academicYear);

      /**
       * This archives students into history and marks classes COMPLETED, so it
       * is subject to the same gate as ending the cycle. Without this an admin
       * could bypass the checklist entirely through the Academic Years screen.
       *
       * SKAI-1439: the checklist and the writes run in one serializable transaction holding the campus
       * lock, the same lock exam and timetable writes take, so a concurrent edit cannot slip in between.
       */
      const closed = await schoolAiTransaction(user, async (tx) => {
        await lockTimetableCampus(tx, user.schoolId, campusId);
        const closure = await getYearClosureReport(campusId, year, tx);
        if (!closure.canClose) {
          // G35: force-closing an unready year is the academic lead's call (SA removed) — the principal,
          // or a campus operator only while the campus has no principal.
          const leadsAcademics = Boolean(force) && await canLeadAcademics(user, campusId);
          if (!force || !leadsAcademics) {
            throw new ApiError(
              `Academic year ${academicYear} is not ready to close. ${closure.blockingReasons.join(" ")}`,
              409,
            );
          }
        }
        // A forced close overrides outstanding checklist items, so the academic lead must say why on the server too.
        const overrideReason = !closure.canClose ? String(body.reason ?? "").trim() : "";
        if (!closure.canClose && overrideReason.length < 10) {
          throw new ApiError("Give a reason of at least 10 characters to close a year with outstanding work.", 400);
        }

        const classes = await tx.class.findMany({
          where: { campusId, academicYear, status: "ACTIVE" },
          include: {
            students: {
              select: {
                id: true,
                rollNo: true,
                fullName: true,
                admissionNo: true,
                reportCards: {
                  where: { exam: { academicYear } },
                  select: { percentage: true, grade: true },
                  orderBy: { generatedAt: "desc" },
                  take: 1,
                },
              },
            },
          },
        });

        if (classes.length === 0) throw new ApiError("No active classes found for this year", 404);

        // SKAI-1680: one close per campus/year. The lock serialises simultaneous closes; claiming the classes
        // ACTIVE -> COMPLETED up front means a second close finds them gone, rolls back and never re-notifies.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`academic-year-close:${user.schoolId}:${campusId}:${academicYear}`}))`;
        const claimed = await tx.class.updateMany({ where: { id: { in: classes.map((cls) => cls.id) }, campusId, status: "ACTIVE" }, data: { status: "COMPLETED" } });
        if (claimed.count !== classes.length) throw new ApiError(`Academic year ${academicYear} was just closed in another session. Reload to see the closed year.`, 409);
        let nextAdmissionNo: (() => string) | undefined;
        for (const cls of classes) {
          for (const student of cls.students) {
            const latestReport = student.reportCards[0];
            await tx.studentClassHistory.upsert({
              where: {
                studentId_classId_academicYear: {
                  studentId: student.id,
                  classId: cls.id,
                  academicYear,
                },
              },
              create: {
                studentId: student.id,
                classId: cls.id,
                campusId,
                rollNo: student.rollNo,
                academicYear,
                status: "ACTIVE",
                finalGrade: latestReport?.grade || null,
                finalPercentage: latestReport?.percentage || null,
              },
              update: {
                finalGrade: latestReport?.grade || null,
                finalPercentage: latestReport?.percentage || null,
              },
            });

            if (!student.admissionNo) {
              nextAdmissionNo ??= await admissionNumberAllocator(tx, user.schoolId, academicYear);
              await tx.student.update({ where: { id: student.id }, data: { admissionNo: nextAdmissionNo() } });
            }
          }
        }

        // The academic cycle must end with its classes, or active-year gates stay open after "closed".
        await tx.academicCycle.updateMany({
          where: { campusId, academicYear, status: { not: "ENDED" } },
          data: { status: "ENDED" },
        });
        if (!closure.canClose) {
          await writeAuditEvent(tx, user, {
            table: "academic_years", recordId: `${campusId}:${academicYear}`, action: "UPDATE", campusId,
            after: { status: "CLOSED", forced: true, overrideReason: overrideReason.slice(0, 1000), overrideReasons: closure.blockingReasons.join(" ").slice(0, 1000) },
          });
        }

        return {
          closedClasses: classes.length,
          totalStudents: classes.reduce((sum, c) => sum + c.students.length, 0),
        };
      });

      notify("ACADEMIC_YEAR_CLOSED", {
        schoolId: user.schoolId,
        campusId,
        actorId: user.userId,
        actorName: user.fullName,
        year: academicYear,
      });

      return Response.json({
        success: true,
        message: `Closed ${closed.closedClasses} classes for academic year ${academicYear}`,
        closedClasses: closed.closedClasses,
        totalStudents: closed.totalStudents,
      });
    }

    if (action === "promote") {
      const { promotions } = body;
      if (!Array.isArray(promotions) || promotions.length === 0) {
        throw new ApiError("promotions array is required", 400);
      }

      let promoted = 0;
      await prisma.$transaction(async (tx) => {
        for (const promo of promotions) {
          const { studentId, targetClassId, newRollNo } = promo;
          if (!studentId || !targetClassId) throw new ApiError("studentId and targetClassId are required", 400);

          const student = await tx.student.findFirst({
            // SKAI-1401: promotions stay inside the caller school and campus.
            where: { id: studentId, schoolId: user.schoolId, campusId },
            select: { id: true, classId: true, rollNo: true, campusId: true, class: { select: { academicYear: true } } },
          });
          if (!student) throw new ApiError("Student not found", 404);

          const targetClass = await tx.class.findFirst({
            where: { id: targetClassId, schoolId: user.schoolId, campusId },
            select: { id: true, academicYear: true, name: true, section: true, campusId: true, status: true, capacity: true },
          });
          if (!targetClass) throw new ApiError("Class not found", 404);
          assertPromotionPlacement(targetClass, student.class.academicYear);
          if (targetClass.capacity != null) {
            const enrolled = await tx.student.count({ where: { classId: targetClass.id } });
            if (enrolled >= targetClass.capacity) throw new ApiError("Target class is full", 409);
          }

          await tx.studentClassHistory.upsert({
            where: {
              studentId_classId_academicYear: {
                studentId: student.id,
                classId: student.classId,
                academicYear: student.class.academicYear,
              },
            },
            create: {
              studentId: student.id,
              classId: student.classId,
              campusId: student.campusId,
              rollNo: student.rollNo,
              academicYear: student.class.academicYear,
              status: "PROMOTED",
              promotedToClassId: targetClassId,
            },
            update: {
              status: "PROMOTED",
              promotedToClassId: targetClassId,
            },
          });

          const rollNo = newRollNo || await generateRollNo(tx, targetClass);
          const enrollment = await tx.studentEnrollment.findFirst({ where: { studentId: studentId, status: "ACTIVE", endDate: null } });
          if (!enrollment) throw new ApiError("Current enrollment missing", 409);
          await applyEnrollment(tx, { studentId: studentId, fromId: enrollment.id, targetClassId: targetClassId,
            effectiveDate: dateOnly(body.effectiveDate || new Date().toISOString().slice(0,10)), rollNo, actorId: user.userId, reason: "Reviewed year-end promotion" });

          promoted++;
        }
      });

      return Response.json({ success: true, promoted, message: `Promoted ${promoted} students` });
    }

    if (action === "bulk-promote") {
      const { fromClassId, toClassId } = body;
      if (!fromClassId || !toClassId) throw new ApiError("fromClassId and toClassId required", 400);

      const fromClass = await prisma.class.findFirst({
        where: { id: fromClassId, schoolId: user.schoolId, campusId },
        select: { id: true, academicYear: true, campusId: true },
      });
      const toClass = await prisma.class.findFirst({
        where: { id: toClassId, schoolId: user.schoolId, campusId },
        select: { id: true, academicYear: true, name: true, section: true, campusId: true, status: true, capacity: true },
      });
      if (!fromClass || !toClass) throw new ApiError("Class not found", 404);
      assertPromotionPlacement(toClass, fromClass.academicYear);

      const students = await prisma.student.findMany({
        where: { classId: fromClassId, schoolId: user.schoolId, campusId },
        select: { id: true, rollNo: true, campusId: true },
        orderBy: { rollNo: "asc" },
      });

      if (students.length === 0) throw new ApiError("No students in source class", 400);
      if (toClass.capacity != null) {
        const enrolled = await prisma.student.count({ where: { classId: toClassId } });
        if (enrolled + students.length > toClass.capacity) throw new ApiError("Target class is full", 409);
      }

      let promoted = 0;
      await prisma.$transaction(async (tx) => {
        for (let i = 0; i < students.length; i++) {
          const student = students[i];

          await tx.studentClassHistory.upsert({
            where: {
              studentId_classId_academicYear: {
                studentId: student.id,
                classId: fromClassId,
                academicYear: fromClass.academicYear,
              },
            },
            create: {
              studentId: student.id,
              classId: fromClassId,
              campusId: student.campusId,
              rollNo: student.rollNo,
              academicYear: fromClass.academicYear,
              status: "PROMOTED",
              promotedToClassId: toClassId,
            },
            update: {
              status: "PROMOTED",
              promotedToClassId: toClassId,
            },
          });

          const rollNo = await generateRollNo(tx, toClass, i);
          const enrollment = await tx.studentEnrollment.findFirst({ where: { studentId: student.id, status: "ACTIVE", endDate: null } });
          if (!enrollment) throw new ApiError("Current enrollment missing", 409);
          await applyEnrollment(tx, { studentId: student.id, fromId: enrollment.id, targetClassId: toClassId,
            effectiveDate: dateOnly(body.effectiveDate || new Date().toISOString().slice(0,10)), rollNo, actorId: user.userId, reason: "Reviewed year-end promotion" });

          promoted++;
        }
      });

      notify("STUDENTS_PROMOTED", {
        schoolId: user.schoolId,
        campusId: toClass.campusId || user.campusId,
        actorId: user.userId,
        actorName: user.fullName,
        count: promoted,
        className: toClass.name,
        classId: toClass.id,
      });

      return Response.json({ success: true, promoted, message: `Promoted ${promoted} students from ${fromClassId} to ${toClassId}` });
    }

    throw new ApiError("Unknown action. Use: close-year, promote, bulk-promote", 400);
  } catch (error) {
    return errorResponse(error, "[academic-year] POST failed");
  }
}

async function generateRollNo(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  targetClass: { name: string; section: string | null; campusId: string; id: string },
  offset = 0
): Promise<string> {
  const abbrev = targetClass.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();
  const secChar = (targetClass.section || "A").charAt(0).toUpperCase();
  const prefix = `${abbrev}-${secChar}-`;

  const existingRolls = await tx.student.findMany({
    where: { classId: targetClass.id, rollNo: { startsWith: prefix } },
    select: { rollNo: true },
  });
  let maxNum = 0;
  for (const s of existingRolls) {
    const num = parseInt(s.rollNo.slice(prefix.length), 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  }
  const seqNum = maxNum + 1 + offset;
  return `${prefix}${String(seqNum).padStart(3, "0")}`;
}

// SKAI-1401: a promotion only lands in an active class of a later academic year.
function assertPromotionPlacement(target: { status: string; academicYear: number }, sourceYear: number) {
  if (target.status !== "ACTIVE") throw new ApiError("Target class is not active", 409);
  if (target.academicYear <= sourceYear) throw new ApiError("Target class must be in a later academic year", 409);
}
