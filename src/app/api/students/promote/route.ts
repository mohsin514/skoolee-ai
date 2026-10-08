import { applyEnrollment, dateOnly } from "@/lib/students/enrollment";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { notify } from "@/lib/notifications/in-app";
import {
  ApiError,
  canManageOperations,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";

// POST /api/students/promote
// body: {
//   fromClassId: string,
//   toClassId: string,
//   academicYear: number,           // outgoing year (history is keyed on it)
//   results: [{ studentId, outcome: "PASS"|"FAIL", finalGrade?, finalPercentage? }]
// }
//
// One transaction per batch: StudentClassHistory is upserted for the outgoing
// year (idempotent via the unique [studentId, classId, academicYear] key),
// passing students move to the destination class with a fresh roll number,
// timeline events are written, and original outstanding invoices are retained.

type PromoteResult = {
  studentId: string;
  outcome: "PASS" | "FAIL";
  finalGrade?: string | null;
  finalPercentage?: number | null;
};

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("You don't have permission to promote students", 403);

    const body = await req.json();
    const fromClassId = String(body.fromClassId ?? "");
    const toClassId = String(body.toClassId ?? "");
    const academicYear = Math.round(Number(body.academicYear));
    const results: PromoteResult[] = Array.isArray(body.results) ? body.results : [];

    if (!fromClassId || !toClassId) throw new ApiError("fromClassId and toClassId are required", 400);
    if (!Number.isFinite(academicYear) || academicYear <= 0) throw new ApiError("academicYear is required", 400);
    if (results.length === 0) throw new ApiError("results array is required", 400);
    for (const r of results) {
      if (!r.studentId) throw new ApiError("each result needs a studentId", 400);
      if (r.outcome !== "PASS" && r.outcome !== "FAIL") {
        throw new ApiError(`outcome must be PASS or FAIL (got ${r.outcome})`, 400);
      }
      if (r.finalPercentage !== undefined && r.finalPercentage !== null) {
        const pct = Number(r.finalPercentage);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new ApiError("finalPercentage must be 0-100", 400);
      }
    }

    const campusId = await resolveCampusId(user, body.campusId);

    const [fromClass, toClass] = await Promise.all([
      prisma.class.findFirst({ where: { id: fromClassId, campusId }, select: { id: true, academicYear: true, name: true, section: true, campusId: true } }),
      prisma.class.findFirst({ where: { id: toClassId, campusId }, select: { id: true, academicYear: true, name: true, section: true, campusId: true } }),
    ]);
    if (!fromClass) throw new ApiError("Source class not found", 404);
    if (!toClass) throw new ApiError("Destination class not found", 404);

    if (fromClass.academicYear !== academicYear) {
      throw new ApiError(`Source class belongs to ${fromClass.academicYear}, not ${academicYear}`, 400);
    }
    if (toClass.academicYear !== academicYear + 1) {
      throw new ApiError("Destination class must belong to the next academic year", 400);
    }
    if (fromClass.campusId !== toClass.campusId) {
      throw new ApiError("Source and destination classes must be in the same campus", 400);
    }

    const studentIds = results.map((r) => r.studentId);
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds }, classId: fromClassId, campusId },
      select: { id: true, fullName: true, rollNo: true, classId: true },
    });
    const studentsById = new Map(students.map((s) => [s.id, s]));

    const outcomeById = new Map(results.map((r) => [r.studentId, r]));
    const passingIds = results.filter((r) => r.outcome === "PASS").map((r) => r.studentId);
    const passingStudents = passingIds
      .map((id) => studentsById.get(id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s));

    if (passingStudents.length === 0) {
      throw new ApiError("No passing students to promote", 400);
    }

    // Fresh roll numbers for the destination, continuing the class's sequence.
    const prefix = `${toClass.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase()}-${(toClass.section || "A").charAt(0).toUpperCase()}-`;
    const existingRolls = await prisma.student.findMany({
      where: { campusId, rollNo: { startsWith: prefix } },
      select: { rollNo: true },
    });
    let maxNum = 0;
    for (const s of existingRolls) {
      const num = parseInt(s.rollNo.slice(prefix.length), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }

    // The original invoices remain collectible in their original enrollment and
    // currency. Promotion must not manufacture a second receivable or sum
    // amounts denominated in different currencies.
    const balances = await prisma.invoice.groupBy({
      by: ["currency"], where: { studentId: { in: passingIds }, balanceDue: { gt: 0 } }, _sum: { balanceDue: true },
    });
    const preservedBalances = balances.map(b => ({ currency: b.currency, minor: b._sum.balanceDue || 0 }));

    const promotedList: { id: string; fullName: string; rollNo: string }[] = [];
    let retainedCount = 0;

    await prisma.$transaction(
      async (tx) => {
        for (const r of results) {
          const student = studentsById.get(r.studentId);
          if (!student) continue;

          const passed = r.outcome === "PASS";
          const grade = r.finalGrade ? String(r.finalGrade) : null;
          const percentage = r.finalPercentage !== undefined && r.finalPercentage !== null ? Number(r.finalPercentage) : null;

          if (passed) {
            const newRoll = `${prefix}${String(maxNum + 1 + promotedList.length).padStart(3, "0")}`;
            await tx.studentClassHistory.upsert({
              where: {
                studentId_classId_academicYear: { studentId: student.id, classId: fromClassId, academicYear },
              },
              create: {
                studentId: student.id,
                classId: fromClassId,
                campusId,
                rollNo: student.rollNo,
                academicYear,
                status: "PROMOTED",
                finalGrade: grade,
                finalPercentage: percentage,
                promotedToClassId: toClassId,
              },
              update: {
                status: "PROMOTED",
                finalGrade: grade,
                finalPercentage: percentage,
                promotedToClassId: toClassId,
              },
            });

            const enrollment = await tx.studentEnrollment.findFirst({ where: { studentId: student.id, status: "ACTIVE", endDate: null } });
            if (!enrollment) throw new ApiError("Current enrollment missing", 409);
            await applyEnrollment(tx, { studentId: student.id, fromId: enrollment.id, targetClassId: toClassId,
              effectiveDate: dateOnly(body.effectiveDate || new Date().toISOString().slice(0,10)), rollNo: newRoll, actorId: user.userId, reason: "Reviewed year-end promotion" });

            await tx.studentTimelineEvent.create({
              data: {
                studentId: student.id,
                kind: "PROMOTED",
                title: `Promoted to ${toClass.name}${toClass.section ? ` - ${toClass.section}` : ""}`,
                detail: `Class ${toClass.name}${toClass.section ? ` - ${toClass.section}` : ""} · Roll ${newRoll}`,
                actorId: user.userId,
              },
            });

            promotedList.push({ id: student.id, fullName: student.fullName, rollNo: newRoll });
          } else {
            // Failure: stays in the same class (repeats). History records the outcome.
            await tx.studentClassHistory.upsert({
              where: {
                studentId_classId_academicYear: { studentId: student.id, classId: fromClassId, academicYear },
              },
              create: {
                studentId: student.id,
                classId: fromClassId,
                campusId,
                rollNo: student.rollNo,
                academicYear,
                status: "ACTIVE",
                finalGrade: grade,
                finalPercentage: percentage,
              },
              update: {
                status: "ACTIVE",
                finalGrade: grade,
                finalPercentage: percentage,
                promotedToClassId: null,
              },
            });

            await tx.studentTimelineEvent.create({
              data: {
                studentId: student.id,
                kind: "NOTE",
                title: "Retained — not promoted",
                detail: grade ? `Final grade ${grade}${percentage !== null ? ` · ${percentage}%` : ""}` : "Retained in the same class",
                actorId: user.userId,
              },
            });

            retainedCount++;
          }
        }
      },
      { timeout: 30000 }
    );

    notify("STUDENTS_PROMOTED", {
      schoolId: user.schoolId,
      campusId,
      actorId: user.userId,
      actorName: user.fullName,
      count: promotedList.length,
      className: toClass.name,
      classId: toClass.id,
    });

    return Response.json({
      success: true,
      promoted: promotedList.length,
      retained: retainedCount,
      preservedBalances,
      data: promotedList,
      message: `Promoted ${promotedList.length} students${retainedCount ? `, retained ${retainedCount}` : ""}. Existing invoices remain unchanged and collectible in their original currency.`,
    });
  } catch (error) {
    return errorResponse(error, "[students/promote] POST failed");
  }
}